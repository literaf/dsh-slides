/**
 * Renders a {@link DeckSpec} to a `.pptx` file.
 *
 * The HTML deck is the better artifact — it presents offline, carries its
 * notes, and prints to PDF — but a co-author who wants to change one word
 * needs a file PowerPoint can open, and a conference that requires an upload
 * usually requires this one. So the same deck is emitted both ways from the
 * same model and the same runs, never from two divergent parses.
 * @module dsh-slides/pptx
 */

import PptxGenJSImport from 'pptxgenjs'
import type { DeckSpec, InlineRun, SlideSpec } from './deck.js'
import { inferLayout, parseInline } from './deck.js'
import type { Theme } from './themes.js'

/** Position and size of one placed object, in inches. */
type Box = { x: number; y: number; w: number; h: number }

/** The slide surface, narrowed to what this renderer places on it. */
interface PptxSlide {
  background: { color: string }
  addText(runs: { text: string; options: Record<string, unknown> }[], options: Box & Record<string, unknown>): void
  addShape(shape: string, options: Box & Record<string, unknown>): void
  addImage(options: Box & Record<string, unknown>): void
  addNotes(notes: string): void
}

/** The deck builder, narrowed the same way. */
interface PptxDeck {
  layout: string
  title: string
  author: string
  addSlide(): PptxSlide
  write(options: { outputType: 'nodebuffer' }): Promise<unknown>
}

/**
 * pptxgenjs ships CJS-flavoured declarations against an ESM runtime entry, so
 * NodeNext types the default import as the module namespace rather than the
 * class. The runtime value is the constructor; the structural types above are
 * what this module actually uses, which also keeps the renderer independent of
 * the package's own type surface.
 */
const PptxGenJS = PptxGenJSImport as unknown as new () => PptxDeck

/** 16:9 at PowerPoint's default width, in inches. */
const WIDTH = 10
const HEIGHT = 5.625
const MARGIN = 0.7

/** Strip the leading `#` PowerPoint does not take. */
function hex(color: string): string {
  return color.replace(/^#/, '').toUpperCase()
}

/** Turn parsed runs into pptxgenjs rich text. */
function richText(text: string, theme: Theme, base: Record<string, unknown>): { text: string; options: Record<string, unknown> }[] {
  return parseInline(text).map((run: InlineRun) => ({
    text: run.text,
    options: {
      ...base,
      ...(run.bold === true ? { bold: true } : {}),
      ...(run.italic === true ? { italic: true } : {}),
      // No inline code shading in pptx: a background run behaves differently
      // across PowerPoint versions, so code is set in a mono face instead.
      ...(run.code === true ? { fontFace: 'Consolas' } : {}),
    },
  }))
}

/** Add one slide for one {@link SlideSpec}. */
function addSlide(pptx: PptxDeck, slide: SlideSpec, theme: Theme): void {
  const target = pptx.addSlide()
  target.background = { color: hex(theme.background) }
  const layout = inferLayout(slide)
  const heading = { fontFace: theme.pptxFace.heading, color: hex(theme.text), bold: true }
  const body = { fontFace: theme.pptxFace.body, color: hex(theme.text) }
  const muted = { fontFace: theme.pptxFace.body, color: hex(theme.muted) }
  const width = WIDTH - MARGIN * 2

  switch (layout) {
    case 'title':
      target.addText(richText(slide.title ?? '', theme, { ...heading, fontSize: 40 }), { x: MARGIN, y: 1.9, w: width, h: 1.0 })
      if (slide.subtitle !== undefined) {
        target.addText(richText(slide.subtitle, theme, { ...muted, fontSize: 18 }), { x: MARGIN, y: 2.95, w: width, h: 0.5 })
      }
      target.addShape('rect', { x: MARGIN, y: 3.55, w: 1.2, h: 0.06, fill: { color: hex(theme.accent) } })
      break
    case 'section':
      target.addText(richText(slide.title ?? '', theme, { ...heading, color: hex(theme.accent), fontSize: 36 }), { x: MARGIN, y: 2.2, w: width, h: 0.9 })
      target.addShape('rect', { x: MARGIN, y: 3.15, w: 1.4, h: 0.07, fill: { color: hex(theme.accent) } })
      break
    case 'quote':
      target.addShape('rect', { x: MARGIN, y: 1.9, w: 0.08, h: 1.6, fill: { color: hex(theme.accent) } })
      target.addText(richText(slide.title ?? '', theme, { ...body, fontFace: theme.pptxFace.heading, fontSize: 26 }), { x: MARGIN + 0.35, y: 1.9, w: width - 0.35, h: 1.6, valign: 'middle' })
      if (slide.subtitle !== undefined) {
        target.addText(richText(`— ${slide.subtitle}`, theme, { ...muted, fontSize: 16 }), { x: MARGIN + 0.35, y: 3.6, w: width - 0.35, h: 0.4 })
      }
      break
    case 'image':
      addFigure(target, slide, theme, slide.title === undefined || slide.title.trim() === '' ? 0.7 : 1.5)
      if (slide.title !== undefined && slide.title.trim() !== '') {
        target.addText(richText(slide.title, theme, { ...heading, fontSize: 26 }), { x: MARGIN, y: 0.6, w: width, h: 0.7 })
      }
      break
    case 'bullets': {
      target.addText(richText(slide.title ?? '', theme, { ...heading, fontSize: 28 }), { x: MARGIN, y: 0.6, w: width, h: 0.8 })
      let top = 1.5
      if (slide.subtitle !== undefined) {
        target.addText(richText(slide.subtitle, theme, { ...muted, fontSize: 16 }), { x: MARGIN, y: 1.45, w: width, h: 0.4 })
        top = 2.0
      }
      const bullets = slide.bullets ?? []
      if (bullets.length > 0) {
        // One text box holding every bullet as its own paragraph. Separate
        // boxes per bullet let the marker render inconsistently and fixed the
        // line spacing to whatever the loop chose.
        const runs = bullets.flatMap((bullet, index) => {
          const paragraph = richText(bullet, theme, { ...body, fontSize: 18 })
          const first = paragraph[0]
          if (first !== undefined) first.options.bullet = { characterCode: '2022', indent: 18 }
          const last = paragraph[paragraph.length - 1]
          if (last !== undefined && index < bullets.length - 1) last.options.breakLine = true
          return paragraph
        })
        target.addText(runs, {
          x: MARGIN,
          y: top,
          w: slide.image === undefined ? width : width * 0.55,
          h: HEIGHT - top - 0.6,
          valign: 'top',
          lineSpacingMultiple: 1.5,
        })
      }
      if (slide.image !== undefined) {
        target.addImage({ ...imageSource(slide.image), x: MARGIN + width * 0.6, y: 1.5, w: width * 0.4, h: 2.8, sizing: { type: 'contain', w: width * 0.4, h: 2.8 } })
      }
      break
    }
  }

  if (slide.notes !== undefined && slide.notes.trim() !== '') target.addNotes(slide.notes)
}

/** Place a full-slide figure with its caption. */
function addFigure(target: PptxSlide, slide: SlideSpec, theme: Theme, top: number): void {
  const width = WIDTH - MARGIN * 2
  const hasCaption = slide.caption !== undefined && slide.caption.trim() !== ''
  const height = HEIGHT - top - (hasCaption ? 1.0 : 0.6)
  target.addImage({ ...imageSource(slide.image ?? ''), x: MARGIN, y: top, w: width, h: height, sizing: { type: 'contain', w: width, h: height } })
  if (hasCaption) {
    target.addText(richText(slide.caption ?? '', theme, { fontFace: theme.pptxFace.body, color: hex(theme.muted), fontSize: 14, align: 'center' }), {
      x: MARGIN, y: top + height + 0.15, w: width, h: 0.4,
    })
  }
}

/**
 * Tell pptxgenjs how to fetch an image.
 *
 * A `data:` URI is embedded directly; anything else is a link the file
 * resolves when it is opened, which is why the HTML deck's advice to embed
 * applies here too.
 * @param image - the slide's image reference.
 * @returns the `path` or `data` field pptxgenjs expects.
 */
export function imageSource(image: string): { data: string } | { path: string } {
  return image.startsWith('data:') ? { data: image } : { path: image }
}

/**
 * Render a deck to `.pptx` bytes.
 * @param deck - the validated deck.
 * @param theme - the resolved theme.
 * @returns the file's bytes.
 */
export async function renderDeckPptx(deck: DeckSpec, theme: Theme): Promise<Uint8Array> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.title = deck.title
  if (deck.author !== undefined) pptx.author = deck.author

  const opening: SlideSpec = {
    layout: 'title',
    title: deck.title,
    subtitle: [deck.subtitle, deck.author].filter((part) => part !== undefined && part !== '').join(' · ') || undefined,
  }
  for (const slide of [opening, ...deck.slides]) addSlide(pptx, slide, theme)

  const written = await pptx.write({ outputType: 'nodebuffer' })
  return new Uint8Array(written as ArrayBufferLike | Uint8Array as never)
}
