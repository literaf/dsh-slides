/**
 * dsh-slides: turn a structured outline into a presentation.
 *
 * The package is deliberately small. It renders decks; it does not try to
 * out-design a dedicated presentation tool, and it does not know anything
 * about where the content came from. Packages that do — `dsh-paper-slides`
 * for academic talks — compose beside it and drive `make_slides`.
 * @module dsh-slides
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-fs'
import { THEME_NAMES } from './themes.js'
import type { ThemeName } from './themes.js'
import { applySlideTools } from './tools.js'
import { buildGuidance } from './prompt.js'

export { DeckError, SLIDE_LAYOUTS, escapeHtml, inferLayout, parseInline, renderInline, slugify, validateDeck } from './deck.js'
export type { DeckSpec, InlineRun, SlideLayout, SlideSpec } from './deck.js'
export { THEMES, THEME_NAMES, resolveTheme } from './themes.js'
export type { Theme, ThemeName } from './themes.js'
export { renderDeckHtml } from './html.js'
export { imageSource, renderDeckPptx } from './pptx.js'
export { DECK_FORMATS, applySlideTools, deckPath, joinPath, themeCatalog } from './tools.js'
export type { DeckFormat, ToolOptions } from './tools.js'
export { buildGuidance } from './prompt.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'slides'

/** Services required before `apply` runs; `fs` is required by the tool and injected lazily. */
export const inject = ['tools', 'systemPrompt']

/** Plugin configuration. */
export interface Config {
  /** Directory decks are written to, relative to the workspace. */
  outputDir?: string
  /** Theme used when a call names none. */
  defaultTheme?: ThemeName
  /** Register the deck-writing guidance in the system prompt. */
  promptGuidance?: boolean
  /** Order of the guidance section within the assembled prompt. */
  promptOrder?: number
}

export const Config: Schema<Config> = Schema.object({
  outputDir: Schema.string().default('slides/').description('Directory decks are written to, relative to the workspace.'),
  defaultTheme: Schema.union([...THEME_NAMES]).default('plain').description('Theme used when a call names none.'),
  promptGuidance: Schema.boolean().default(true).description('Register the deck-writing guidance.'),
  promptOrder: Schema.number().default(150).description('Order of the guidance section.'),
})

/** Complete config after schemastery applies every default. */
type ResolvedConfig = Required<Config>

/**
 * Register the deck tool and its guidance.
 * @param ctx - plugin context with `tools` and `systemPrompt` ready.
 * @param config - schemastery-validated config with defaults applied.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  if (!Number.isFinite(resolved.promptOrder)) throw new Error('slides: promptOrder must be a finite number')

  // The tool writes files, so it exists only where a filesystem provider does.
  // Registering it without one would offer the model a call that always fails.
  // The guidance rides the same injection: with no tool there is nothing to
  // instruct, and an empty section is noise in every assembled prompt.
  ctx.inject(['fs'], (fsCtx) => {
    applySlideTools(fsCtx, { outputDir: resolved.outputDir, defaultTheme: resolved.defaultTheme })
    if (!resolved.promptGuidance) return
    fsCtx.systemPrompt.section({
      name: 'tool:slides',
      order: resolved.promptOrder,
      text: buildGuidance({ outputDir: resolved.outputDir }),
    })
  })
}
