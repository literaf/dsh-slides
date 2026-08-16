/**
 * Deck themes: a small set of complete, committed looks.
 *
 * Each theme is a closed set of colour and type tokens rather than a knob per
 * property. A presenter picking `ink` should get a deck that looks decided,
 * and an agent choosing a theme should be choosing between finished designs,
 * not assembling one.
 * @module dsh-slides/themes
 */

/** Name of a bundled theme. */
export type ThemeName = 'plain' | 'ink' | 'midnight' | 'slate' | 'sunrise'

/** Every token the stylesheet interpolates. */
export interface Theme {
  /** Human-facing one-liner shown in the tool description and the README. */
  readonly summary: string
  /** Slide background. */
  readonly background: string
  /** Panel behind image captions and code. */
  readonly surface: string
  /** Body text. */
  readonly text: string
  /** De-emphasised text: subtitles, captions, the slide counter. */
  readonly muted: string
  /** Headings, rules and the progress bar. */
  readonly accent: string
  /** Font stack for headings. */
  readonly headingFont: string
  /** Font stack for body text. */
  readonly bodyFont: string
}

const SANS = "'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
const SERIF = "Georgia, 'Times New Roman', 'Songti SC', 'SimSun', serif"

/**
 * The bundled themes.
 *
 * Font stacks name system faces only: a deck is one self-contained file with
 * no network access at presentation time, and a webfont that fails to load
 * mid-talk is worse than a system face that never tried.
 */
export const THEMES: Readonly<Record<ThemeName, Theme>> = {
  plain: {
    summary: 'White ground, sans-serif, thin accent rules. The default; disappears behind the content.',
    background: '#ffffff',
    surface: '#f4f4f5',
    text: '#18181b',
    muted: '#71717a',
    accent: '#2563eb',
    headingFont: SANS,
    bodyFont: SANS,
  },
  ink: {
    summary: 'Warm paper ground with a serif face. Reads like a printed paper; suits a seminar or a defense.',
    background: '#faf8f3',
    surface: '#f0ece1',
    text: '#1c1917',
    muted: '#78716c',
    accent: '#9a3412',
    headingFont: SERIF,
    bodyFont: SERIF,
  },
  midnight: {
    summary: 'Deep blue ground, light type. Holds up in a bright room where a white deck washes out.',
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    muted: '#94a3b8',
    accent: '#38bdf8',
    headingFont: SANS,
    bodyFont: SANS,
  },
  slate: {
    summary: 'Neutral greys, no colour accent. For decks whose figures carry all the colour.',
    background: '#f8fafc',
    surface: '#e2e8f0',
    text: '#0f172a',
    muted: '#64748b',
    accent: '#475569',
    headingFont: SANS,
    bodyFont: SANS,
  },
  sunrise: {
    summary: 'Off-white ground with a warm accent. A lighter register for a talk meant to persuade.',
    background: '#fffbf5',
    surface: '#fdf0e0',
    text: '#27272a',
    muted: '#78716c',
    accent: '#ea580c',
    headingFont: SANS,
    bodyFont: SERIF,
  },
}

/** Theme names in the order they are offered. */
export const THEME_NAMES = Object.keys(THEMES) as readonly ThemeName[]

/**
 * Look up a theme by name.
 * @param name - candidate theme name.
 * @returns the theme.
 * @throws Error naming the available themes when `name` is not one of them.
 */
export function resolveTheme(name: string): Theme {
  const theme = (THEMES as Record<string, Theme | undefined>)[name]
  if (theme === undefined) throw new Error(`unknown theme "${name}" (available: ${THEME_NAMES.join(', ')})`)
  return theme
}
