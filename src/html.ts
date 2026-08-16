/**
 * Renders a {@link DeckSpec} to one self-contained HTML file.
 *
 * The output loads nothing: no stylesheet, no script, no font, no image host.
 * A deck is opened in a conference room on someone else's laptop, often
 * offline, and a talk that depends on a CDN is a talk that can fail. Images
 * are embedded by the caller as `data:` URIs for the same reason; an `http`
 * image is passed through but documented as a live dependency.
 * @module dsh-slides/html
 */

import type { DeckSpec, SlideSpec } from './deck.js'
import { escapeHtml, inferLayout, renderInline } from './deck.js'
import type { Theme } from './themes.js'

/** Stylesheet for one theme. Slides are a fixed 16:9 box scaled to the viewport. */
function stylesheet(theme: Theme): string {
  return `
:root {
  --bg: ${theme.background};
  --surface: ${theme.surface};
  --text: ${theme.text};
  --muted: ${theme.muted};
  --accent: ${theme.accent};
  --heading-font: ${theme.headingFont};
  --body-font: ${theme.bodyFont};
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; background: var(--bg); color: var(--text); font-family: var(--body-font); }
body { overflow: hidden; }
#stage { position: relative; width: 100vw; height: 100vh; display: grid; place-items: center; }
.slide {
  display: none;
  width: min(100vw, calc(100vh * 16 / 9));
  height: min(100vh, calc(100vw * 9 / 16));
  padding: 6vmin 8vmin;
  flex-direction: column;
  /* Optically centred: a bottom bias lifts the block above true centre, which
     keeps a three-bullet slide from floating and a six-bullet one from
     drifting down. */
  justify-content: center;
  padding-bottom: 12vmin;
  gap: 2.4vmin;
}
.slide.current { display: flex; }
h1, h2 { font-family: var(--heading-font); font-weight: 700; margin: 0; line-height: 1.15; letter-spacing: -0.01em; }
h1 { font-size: 6.4vmin; }
h2 { font-size: 5.2vmin; }
.subtitle { font-size: 3.2vmin; color: var(--muted); margin: 0; }
.author { font-size: 2.6vmin; color: var(--muted); margin: 0; }
ul { margin: 0; padding-left: 3.4vmin; display: flex; flex-direction: column; gap: 1.8vmin; }
li { font-size: 3.4vmin; line-height: 1.4; }
li::marker { color: var(--accent); }
code { background: var(--surface); padding: 0.1em 0.35em; border-radius: 0.25em; font-size: 0.9em; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
figure { margin: 0; display: flex; flex-direction: column; gap: 1.4vmin; align-items: center; min-height: 0; }
figure img { max-width: 100%; max-height: 62vmin; object-fit: contain; }
figcaption { font-size: 2.4vmin; color: var(--muted); text-align: center; }
.slide--bullets h2 { margin-bottom: 1.2vmin; }
.slide--bullets ul, .slide--bullets .subtitle { max-width: 82%; }
.slide--title h1 { font-size: 8vmin; }
.slide--section h2 { font-size: 7vmin; color: var(--accent); }
.slide--section::after { content: ''; display: block; width: 14vmin; height: 0.7vmin; background: var(--accent); }
blockquote { margin: 0; font-family: var(--heading-font); font-size: 4.6vmin; line-height: 1.35; border-left: 0.8vmin solid var(--accent); padding-left: 3vmin; }
.rule { width: 12vmin; height: 0.6vmin; background: var(--accent); }
#chrome { position: fixed; right: 2.4vmin; bottom: 2vmin; font-size: 2vmin; color: var(--muted); font-family: var(--body-font); }
#progress { position: fixed; left: 0; bottom: 0; height: 0.5vmin; background: var(--accent); transition: width 160ms ease; }
#notes {
  display: none; position: fixed; left: 0; right: 0; bottom: 0; max-height: 34vh; overflow: auto;
  padding: 2.4vmin 3vmin; background: var(--surface); color: var(--text);
  font-size: 2.2vmin; line-height: 1.5; white-space: pre-wrap; border-top: 0.3vmin solid var(--accent);
}
body.notes-open #notes { display: block; }
#help { position: fixed; left: 2.4vmin; bottom: 2vmin; font-size: 1.9vmin; color: var(--muted); }
@media print {
  @page { size: 297mm 167mm; margin: 0; }
  body { overflow: visible; }
  #stage { display: block; width: auto; height: auto; }
  .slide, .slide.current { display: flex !important; width: 297mm; height: 167mm; break-after: page; }
  #chrome, #progress, #notes, #help { display: none !important; }
}`
}

/** Render one slide element. */
function slideHtml(slide: SlideSpec, index: number): string {
  const layout = inferLayout(slide)
  const parts: string[] = []
  const title = slide.title === undefined ? '' : renderInline(slide.title)

  switch (layout) {
    case 'title':
      parts.push(`<h1>${title}</h1>`)
      if (slide.subtitle !== undefined) parts.push(`<p class="subtitle">${renderInline(slide.subtitle)}</p>`)
      parts.push('<div class="rule"></div>')
      break
    case 'section':
      parts.push(`<h2>${title}</h2>`)
      if (slide.subtitle !== undefined) parts.push(`<p class="subtitle">${renderInline(slide.subtitle)}</p>`)
      break
    case 'quote':
      parts.push(`<blockquote>${title}</blockquote>`)
      if (slide.subtitle !== undefined) parts.push(`<p class="subtitle">— ${renderInline(slide.subtitle)}</p>`)
      break
    case 'image':
      if (slide.title !== undefined && slide.title.trim() !== '') parts.push(`<h2>${title}</h2>`)
      parts.push(figureHtml(slide))
      break
    case 'bullets':
      parts.push(`<h2>${title}</h2>`)
      if (slide.subtitle !== undefined) parts.push(`<p class="subtitle">${renderInline(slide.subtitle)}</p>`)
      parts.push(`<ul>${(slide.bullets ?? []).map((b) => `<li>${renderInline(b)}</li>`).join('')}</ul>`)
      if (slide.image !== undefined) parts.push(figureHtml(slide))
      break
  }

  const notes = slide.notes === undefined ? '' : ` data-notes="${escapeHtml(slide.notes)}"`
  return `<section class="slide slide--${layout}" data-index="${index}"${notes}>${parts.join('')}</section>`
}

/** Render the image and its caption. */
function figureHtml(slide: SlideSpec): string {
  const alt = slide.caption ?? slide.title ?? ''
  const caption = slide.caption === undefined ? '' : `<figcaption>${renderInline(slide.caption)}</figcaption>`
  return `<figure><img src="${escapeHtml(slide.image ?? '')}" alt="${escapeHtml(alt)}">${caption}</figure>`
}

/** Deck navigation. Kept in one string so the output stays a single file. */
const SCRIPT = `
(function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var counter = document.getElementById('chrome');
  var progress = document.getElementById('progress');
  var notes = document.getElementById('notes');
  var current = 0;
  function show(next) {
    current = Math.max(0, Math.min(slides.length - 1, next));
    slides.forEach(function (slide, index) { slide.classList.toggle('current', index === current); });
    counter.textContent = (current + 1) + ' / ' + slides.length;
    progress.style.width = ((current + 1) / slides.length * 100) + '%';
    notes.textContent = slides[current].getAttribute('data-notes') || '';
    if (location.hash !== '#' + (current + 1)) history.replaceState(null, '', '#' + (current + 1));
  }
  document.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') { show(current + 1); event.preventDefault(); }
    else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { show(current - 1); event.preventDefault(); }
    else if (event.key === 'Home') { show(0); }
    else if (event.key === 'End') { show(slides.length - 1); }
    else if (event.key === 's' || event.key === 'S') { document.body.classList.toggle('notes-open'); }
    else if (event.key === 'f' || event.key === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }
  });
  document.addEventListener('click', function (event) { show(current + (event.clientX < window.innerWidth / 3 ? -1 : 1)); });
  show(parseInt((location.hash || '#1').slice(1), 10) - 1 || 0);
})();`

/**
 * Render a deck to a complete HTML document.
 * @param deck - the validated deck.
 * @param theme - the resolved theme.
 * @returns the whole file, loading no external resource.
 */
export function renderDeckHtml(deck: DeckSpec, theme: Theme): string {
  const opening: SlideSpec = {
    layout: 'title',
    title: deck.title,
    subtitle: [deck.subtitle, deck.author].filter((part) => part !== undefined && part !== '').join(' · ') || undefined,
  }
  const slides = [opening, ...deck.slides]
  return `<!doctype html>
<html lang="und">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(deck.title)}</title>
<style>${stylesheet(theme)}</style>
</head>
<body>
<div id="stage">${slides.map((slide, index) => slideHtml(slide, index)).join('\n')}</div>
<div id="progress"></div>
<div id="chrome"></div>
<div id="help">← → navigate · S notes · F fullscreen · Ctrl+P to PDF</div>
<div id="notes"></div>
<script>${SCRIPT}</script>
</body>
</html>
`
}
