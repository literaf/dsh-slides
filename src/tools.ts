/**
 * The `make_slides` tool: a deck spec in, one self-contained HTML file out.
 *
 * The file is written through `ctx.fs`, never `node:fs`, so a sandboxing
 * filesystem backend fences the write the same way it fences every other tool.
 * That is also why the tool exists only where a filesystem provider does.
 * @module dsh-slides/tools
 */

import { writeFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { DeckSpec, SlideSpec } from './deck.js'
import { DeckError, slugify, validateDeck } from './deck.js'
import { renderDeckHtml } from './html.js'
import { renderDeckPptx } from './pptx.js'
import { THEME_NAMES, THEMES, resolveTheme } from './themes.js'

/** A format `make_slides` can emit. */
export type DeckFormat = 'html' | 'pptx'

/** Every format, in the order they are written. */
export const DECK_FORMATS: readonly DeckFormat[] = ['html', 'pptx']

/** Settings the tool reads from the plugin config. */
export interface ToolOptions {
  /** Directory decks are written to, relative to the workspace. */
  readonly outputDir: string
  /** Theme used when the call names none. */
  readonly defaultTheme: string
}

/** One line per theme, so the model chooses from descriptions rather than names. */
export function themeCatalog(): string {
  return THEME_NAMES.map((name) => `${name} — ${THEMES[name].summary}`).join(' ')
}

/** Join a directory and a file name without depending on the host separator. */
export function joinPath(dir: string, file: string): string {
  const trimmed = dir.replace(/\/+$/, '')
  return trimmed === '' ? file : `${trimmed}/${file}`
}

/**
 * Decide where a deck is written.
 * @param requested - explicit `path` argument, if the caller gave one.
 * @param title - deck title, used to derive a filename.
 * @param outputDir - configured output directory.
 * @returns a workspace-relative path ending in `.html`.
 */
export function deckPath(requested: string | undefined, title: string, outputDir: string, format: DeckFormat = 'html'): string {
  const stem = requested !== undefined && requested.trim() !== ''
    ? requested.trim().replace(/\.(html|pptx)$/i, '')
    : joinPath(outputDir, slugify(title))
  return `${stem}.${format}`
}

/**
 * Write bytes to a path the filesystem service has agreed to.
 *
 * `ctx.fs` exposes text writes only, and a sandboxing backend fences exactly
 * those two mutations — `resolve` passes through untouched, so resolving a
 * path and writing to it directly would go straight around the fence. Writing
 * an empty file through the sanctioned `writeText` first makes the backend
 * apply its real policy (canonicalize, then contain) and throw
 * `FS_SANDBOX_DENIED` before any bytes exist; only a write it allowed is then
 * filled in.
 * @param ctx - context with `fs` available.
 * @param path - workspace-relative destination.
 * @param bytes - the file's contents.
 * @param signal - aborts the write.
 * @returns whether the file was created or replaced.
 */
async function writeBytes(ctx: Context, path: string, bytes: Uint8Array, signal: AbortSignal): Promise<'create' | 'update'> {
  const target = await ctx.fs.resolve(path, { signal })
  const outcome = await ctx.fs.writeText(target, '', undefined, signal)
  await writeFile(ctx.fs.processPath(target), bytes, { signal })
  return outcome.operation
}

/** Schema of one slide, shared by the parameter DSL. */
const SLIDE_PARAMETER = {
  type: 'object',
  additionalProperties: false,
  properties: {
    layout: {
      type: 'string',
      enum: ['title', 'section', 'bullets', 'image', 'quote'],
      description: 'Arrangement. Omit to infer: bullets present means "bullets", an image alone means "image", otherwise "section".',
    },
    title: { type: 'string', description: 'Headline. Required for every layout but "image".' },
    subtitle: { type: 'string', description: 'Secondary line. On a quote slide this is the attribution.' },
    bullets: {
      type: 'array',
      items: { type: 'string' },
      description: 'Points, one idea each. Supports **bold**, *italic* and `code`. Six or fewer reads from the back of a room.',
    },
    image: { type: 'string', description: 'Image URL, or a data: URI to keep the deck self-contained offline.' },
    caption: { type: 'string', description: 'Caption under the image.' },
    notes: { type: 'string', description: 'Speaker notes. Never shown on the slide; the presenter reveals them with S.' },
  },
} as const

/**
 * Register the deck tool.
 * @param ctx - a context with both `tools` and `fs` available.
 * @param options - output directory and default theme.
 */
export function applySlideTools(ctx: Context, options: ToolOptions): void {
  ctx.tools.register(defineTool({
    name: 'make_slides',
    description: `Write a presentation to one self-contained HTML file that opens in any browser, presents fullscreen, and prints to PDF with Ctrl+P. Loads nothing at presentation time, so it works offline. Give one idea per slide and put the talking to speaker notes rather than the slide. Themes: ${themeCatalog()}`,
    parameters: {
      title: { type: 'string', required: true, description: 'Deck title. Becomes the opening slide and the filename.' },
      slides: {
        type: 'array',
        required: true,
        items: SLIDE_PARAMETER,
        description: 'The slides, in order. An opening title slide is added automatically — do not repeat it here.',
      },
      subtitle: { type: 'string', description: 'Subtitle on the opening slide.' },
      author: { type: 'string', description: 'Presenter, shown on the opening slide.' },
      theme: { type: 'string', enum: [...THEME_NAMES], description: `Visual theme (default ${options.defaultTheme}).` },
      formats: {
        type: 'array',
        items: { type: 'string', enum: [...DECK_FORMATS] },
        description: 'Formats to write (default ["html"]). "html" presents offline and prints to PDF; add "pptx" when the user needs to edit it in PowerPoint or upload it.',
      },
      path: { type: 'string', description: `Output path without an extension, relative to the workspace. Defaults to ${options.outputDir}<title>.` },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          files: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                format: { type: 'string', required: true },
                bytes: { type: 'integer', required: true },
                operation: { type: 'string', required: true, description: '"create" or "update".' },
              },
            },
          },
          slides: { type: 'integer', required: true, description: 'Slide count, including the generated title slide.' },
          theme: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `${value.slides} slides, ${value.theme} theme.`,
          ...value.files.map((file) => `${file.operation === 'create' ? 'Wrote' : 'Updated'} ${file.path} (${(file.bytes / 1024).toFixed(0)} KB)`),
          value.files.some((file) => file.format === 'html')
            ? 'Open the HTML in a browser: arrow keys navigate, S shows speaker notes, F goes fullscreen, Ctrl+P prints to PDF.'
            : '',
        ].filter((line) => line !== '').join('\n'),
      }],
    },
    isConcurrencySafe: () => false,
    presentCall: (args) => ({
      card: 'generic',
      title: `Build deck "${args.title}"`,
      kind: 'edit',
      // Name the files up front so a capable UI can follow along to them.
      locations: (args.formats ?? ['html']).map((format) => ({ path: deckPath(args.path, args.title, options.outputDir, format as DeckFormat) })),
    }),
    async execute(args, exec) {
      const deck: DeckSpec = {
        title: args.title,
        subtitle: args.subtitle,
        author: args.author,
        slides: args.slides as readonly SlideSpec[],
      }
      validateDeck(deck)
      const themeName = args.theme ?? options.defaultTheme
      const theme = resolveTheme(themeName)
      const formats = (args.formats ?? ['html']) as DeckFormat[]
      const unknown = formats.filter((format) => !DECK_FORMATS.includes(format))
      if (unknown.length > 0) throw new Error(`unknown format ${unknown.join(', ')} (available: ${DECK_FORMATS.join(', ')})`)

      const files: { path: string; format: DeckFormat; bytes: number; operation: 'create' | 'update' }[] = []
      for (const format of DECK_FORMATS.filter((format) => formats.includes(format))) {
        const path = deckPath(args.path, deck.title, options.outputDir, format)
        if (format === 'html') {
          const html = renderDeckHtml(deck, theme)
          const target = await ctx.fs.resolve(path, { signal: exec.signal })
          const outcome = await ctx.fs.writeText(target, html, undefined, exec.signal)
          files.push({ path, format, bytes: Buffer.byteLength(html, 'utf8'), operation: outcome.operation })
        } else {
          const bytes = await renderDeckPptx(deck, theme)
          const operation = await writeBytes(ctx, path, bytes, exec.signal)
          files.push({ path, format, bytes: bytes.byteLength, operation })
        }
      }
      return { files, slides: deck.slides.length + 1, theme: themeName }
    },
  }))
}

export { DeckError }
