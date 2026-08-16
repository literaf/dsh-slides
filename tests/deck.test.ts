import { describe, expect, it } from 'vitest'
import {
  DeckError,
  THEMES,
  THEME_NAMES,
  deckPath,
  inferLayout,
  joinPath,
  renderDeckHtml,
  renderInline,
  resolveTheme,
  slugify,
  validateDeck,
} from '../src/index.js'
import type { DeckSpec } from '../src/index.js'

const DECK: DeckSpec = {
  title: 'Migration timing under a warming Arctic',
  subtitle: 'Group meeting',
  author: 'Z. R.',
  slides: [
    { layout: 'section', title: 'Question' },
    { title: 'What we know', bullets: ['Arrival dates advanced **11 days**', 'Breeding success did not follow'], notes: 'Lead with the mismatch.' },
    { layout: 'image', image: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', caption: 'Arrival vs. green-up' },
    { layout: 'quote', title: 'Timing is the whole story.', subtitle: 'Reviewer 2' },
  ],
}

describe('layout inference', () => {
  it('reads the layout off the fields when none is stated', () => {
    expect(inferLayout({ title: 'x', bullets: ['a'] })).toBe('bullets')
    expect(inferLayout({ image: 'x.png' })).toBe('image')
    expect(inferLayout({ title: 'x' })).toBe('section')
    // An explicit layout always wins, even against the fields present.
    expect(inferLayout({ title: 'x', bullets: ['a'], layout: 'quote' })).toBe('quote')
    // An image beside bullets is a side figure, not an image slide.
    expect(inferLayout({ title: 'x', bullets: ['a'], image: 'x.png' })).toBe('bullets')
  })
})

describe('validation', () => {
  it('accepts a complete deck', () => {
    expect(() => validateDeck(DECK)).not.toThrow()
  })

  it('names the offending slide by its 1-based position', () => {
    const bad: DeckSpec = { title: 'T', slides: [{ title: 'ok' }, { layout: 'bullets', title: 'no bullets' }] }
    expect(() => validateDeck(bad)).toThrow(/slide 2/)
  })

  it('rejects what cannot be rendered', () => {
    expect(() => validateDeck({ title: '  ', slides: [{ title: 'x' }] })).toThrow(DeckError)
    expect(() => validateDeck({ title: 'T', slides: [] })).toThrow(/at least one slide/)
    expect(() => validateDeck({ title: 'T', slides: [{ layout: 'image' }] })).toThrow(/needs an image/)
    expect(() => validateDeck({ title: 'T', slides: [{ layout: 'section' }] })).toThrow(/needs a title/)
    expect(() => validateDeck({ title: 'T', slides: [{ title: 'x', bullets: ['a', '  '] }] })).toThrow(/bullet is empty/)
  })
})

describe('filenames', () => {
  it('keeps non-ASCII titles readable instead of collapsing them', () => {
    expect(slugify('组会汇报 2026')).toBe('组会汇报-2026')
    expect(slugify('A/B test: results!')).toBe('ab-test-results')
    expect(slugify('  ***  ')).toBe('deck')
  })

  it('places the deck under the configured directory unless told otherwise', () => {
    expect(deckPath(undefined, 'My Talk', 'slides/')).toBe('slides/my-talk.html')
    expect(deckPath(undefined, 'My Talk', '')).toBe('my-talk.html')
    expect(deckPath('talks/kickoff', 'ignored', 'slides/')).toBe('talks/kickoff.html')
    expect(deckPath('talks/kickoff.html', 'ignored', 'slides/')).toBe('talks/kickoff.html')
    expect(joinPath('slides///', 'a.html')).toBe('slides/a.html')
  })
})

describe('inline formatting', () => {
  it('escapes before formatting, so content cannot inject markup', () => {
    expect(renderInline('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(renderInline('a & b')).toBe('a &amp; b')
    expect(renderInline('**bold** and *it* and `x`')).toBe('<strong>bold</strong> and <em>it</em> and <code>x</code>')
    // A bold run must not be mistaken for two italics.
    expect(renderInline('**both**')).not.toContain('<em>')
  })
})

describe('themes', () => {
  it('resolves every bundled theme and rejects the rest', () => {
    for (const name of THEME_NAMES) expect(resolveTheme(name).background).toMatch(/^#[0-9a-f]{6}$/)
    expect(() => resolveTheme('neon')).toThrow(/unknown theme "neon"/)
  })

  it('gives every theme a complete, distinct palette', () => {
    const backgrounds = new Set(THEME_NAMES.map((name) => THEMES[name].background))
    expect(backgrounds.size).toBe(THEME_NAMES.length)
    for (const name of THEME_NAMES) {
      const theme = THEMES[name]
      expect(theme.summary.length).toBeGreaterThan(30)
      // Font stacks name system faces only; a webfont that fails mid-talk is worse than none.
      expect(theme.headingFont).not.toMatch(/https?:|url\(/)
    }
  })
})

describe('html rendering', () => {
  const html = renderDeckHtml(DECK, resolveTheme('ink'))

  it('loads nothing from the network', () => {
    // Anything that would fetch at presentation time: external src/href, @import, url().
    expect(html).not.toMatch(/<link\b/i)
    expect(html).not.toMatch(/<script[^>]+src=/i)
    expect(html).not.toMatch(/@import/i)
    expect(html).not.toMatch(/url\(\s*['"]?https?:/i)
    // The only src in this deck is the caller's own data: URI.
    const externalSrc = [...html.matchAll(/src="([^"]*)"/g)].map((m) => m[1]).filter((s) => /^https?:/.test(s ?? ''))
    expect(externalSrc).toEqual([])
  })

  it('prepends a title slide and keeps the authored ones in order', () => {
    const slides = [...html.matchAll(/class="slide slide--(\w+)"/g)].map((m) => m[1])
    expect(slides).toEqual(['title', 'section', 'bullets', 'image', 'quote'])
    expect(html).toContain('<title>Migration timing under a warming Arctic</title>')
    expect(html).toContain('Group meeting · Z. R.')
  })

  it('carries speaker notes as data, never as visible slide content', () => {
    expect(html).toContain('data-notes="Lead with the mismatch."')
    // The notes panel is empty in the document and filled by the script on show.
    expect(html).toContain('<div id="notes"></div>')
  })

  it('escapes deck content into the document and its attributes', () => {
    const nasty = renderDeckHtml(
      { title: '"><script>x</script>', slides: [{ title: 'a', notes: 'say "hello" & <wave>' }] },
      resolveTheme('plain'),
    )
    expect(nasty).not.toContain('<script>x</script>')
    expect(nasty).toContain('data-notes="say &quot;hello&quot; &amp; &lt;wave&gt;"')
  })

  it('applies the theme tokens it was given', () => {
    expect(html).toContain(`--bg: ${THEMES.ink.background};`)
    expect(renderDeckHtml(DECK, resolveTheme('midnight'))).toContain(`--bg: ${THEMES.midnight.background};`)
  })

  it('prints one slide per page', () => {
    expect(html).toContain('@media print')
    expect(html).toContain('break-after: page')
  })
})
