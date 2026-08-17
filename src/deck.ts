/**
 * The deck model: what a slide can hold, what a deck must satisfy, and the
 * small amount of inline formatting a bullet may carry.
 *
 * The model is deliberately narrow. A deck the agent can reason about is a
 * list of single-idea slides, not a canvas — anything that needs absolute
 * positioning belongs in a real editor, and pretending otherwise produces
 * decks that look generated.
 * @module dsh-slides/deck
 */

/** How a slide arranges what it holds. */
export type SlideLayout = 'title' | 'section' | 'bullets' | 'image' | 'quote'

/** Every layout this package renders. */
export const SLIDE_LAYOUTS: readonly SlideLayout[] = ['title', 'section', 'bullets', 'image', 'quote']

/** One slide. Which fields matter depends on {@link SlideSpec.layout}. */
export interface SlideSpec {
  /** Arrangement; inferred from the fields present when omitted. */
  readonly layout?: SlideLayout | undefined
  /** Headline. Required for every layout but `image`. */
  readonly title?: string | undefined
  /** Secondary line under the title. */
  readonly subtitle?: string | undefined
  /** Points, one idea each. Used by `bullets`. */
  readonly bullets?: readonly string[] | undefined
  /** Image URL or `data:` URI. Used by `image`; allowed as a side figure elsewhere. */
  readonly image?: string | undefined
  /** Caption printed under the image. */
  readonly caption?: string | undefined
  /** Speaker notes. Never shown on the slide; revealed with `S` in the deck. */
  readonly notes?: string | undefined
}

/** A whole presentation. */
export interface DeckSpec {
  /** Deck title, used on the opening slide and as the document title. */
  readonly title: string
  /** Subtitle for the opening slide. */
  readonly subtitle?: string | undefined
  /** Presenter, shown on the opening slide. */
  readonly author?: string | undefined
  /** The slides, in order. */
  readonly slides: readonly SlideSpec[]
}

/** A deck rejected by {@link validateDeck}. */
export class DeckError extends Error {
  /** @param message - what is wrong, in terms the model can act on. */
  constructor(message: string) {
    super(message)
    this.name = 'DeckError'
  }
}

/**
 * Decide a slide's layout when the caller did not state one.
 * @param slide - the slide to classify.
 * @returns the layout its fields imply.
 */
export function inferLayout(slide: SlideSpec): SlideLayout {
  if (slide.layout !== undefined) return slide.layout
  if (slide.image !== undefined && (slide.bullets === undefined || slide.bullets.length === 0)) return 'image'
  if (slide.bullets !== undefined && slide.bullets.length > 0) return 'bullets'
  return 'section'
}

/**
 * Reject a deck the renderer cannot turn into something worth showing.
 *
 * Every message names the slide by its 1-based position, because that is how
 * the model refers to it when fixing the call.
 * @param deck - the candidate deck.
 * @throws DeckError when the deck or any slide is unusable.
 */
export function validateDeck(deck: DeckSpec): void {
  if (deck.title.trim() === '') throw new DeckError('the deck needs a title')
  if (deck.slides.length === 0) throw new DeckError('the deck needs at least one slide')

  deck.slides.forEach((slide, index) => {
    const at = `slide ${index + 1}`
    const layout = inferLayout(slide)
    if (!SLIDE_LAYOUTS.includes(layout)) {
      throw new DeckError(`${at}: unknown layout "${layout}" (use one of ${SLIDE_LAYOUTS.join(', ')})`)
    }
    if (layout === 'image') {
      if (slide.image === undefined || slide.image.trim() === '') throw new DeckError(`${at}: an image layout needs an image`)
    } else if (slide.title === undefined || slide.title.trim() === '') {
      throw new DeckError(`${at}: a ${layout} layout needs a title`)
    }
    if (layout === 'bullets' && (slide.bullets === undefined || slide.bullets.length === 0)) {
      throw new DeckError(`${at}: a bullets layout needs at least one bullet`)
    }
    if (slide.bullets !== undefined && slide.bullets.some((bullet) => bullet.trim() === '')) {
      throw new DeckError(`${at}: a bullet is empty`)
    }
  })
}

/**
 * Turn a title into a filename stem.
 *
 * Non-ASCII titles keep their characters rather than collapsing to nothing,
 * so a Chinese deck gets a readable filename instead of `deck-1`.
 * @param title - the deck title.
 * @returns a stem safe for a filename, never empty.
 */
export function slugify(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    // Drop what a filename should not carry, keeping letters of any script.
    .replace(/[\\/:*?"<>|.,;!'`~@#$%^&()[\]{}+=]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
  return slug === '' ? 'deck' : slug
}

/** Escape text for HTML text content and double-quoted attribute values. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** A stretch of text with the inline emphasis that applies to it. */
export interface InlineRun {
  /** The literal text. Never escaped or marked up — that is the renderer's job. */
  readonly text: string
  /** `**bold**`. */
  readonly bold?: boolean
  /** `*italic*`. */
  readonly italic?: boolean
  /** `` `code` ``. */
  readonly code?: boolean
}

/** Code first, then bold, then italic — a `*` inside `**` must not open emphasis. */
const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g

/**
 * Split the inline markdown a bullet may carry into runs.
 *
 * Every renderer works from these runs rather than from its own parse, so the
 * HTML deck and the pptx export can never disagree about what is bold.
 * @param text - raw bullet, title or caption text.
 * @returns the runs, in order; a single plain run when there is no markup.
 */
export function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = []
  let cursor = 0
  for (const match of text.matchAll(INLINE)) {
    const start = match.index
    if (start > cursor) runs.push({ text: text.slice(cursor, start) })
    const [, code, bold, italic] = match
    if (code !== undefined) runs.push({ text: code, code: true })
    else if (bold !== undefined) runs.push({ text: bold, bold: true })
    else if (italic !== undefined) runs.push({ text: italic, italic: true })
    cursor = start + match[0].length
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor) })
  return runs
}

/**
 * Render inline markdown to HTML.
 *
 * Each run's text is escaped before its tags are added, so deck content can
 * never inject markup.
 * @param text - raw bullet, title or caption text.
 * @returns escaped HTML with the three inline forms applied.
 */
export function renderInline(text: string): string {
  return parseInline(text)
    .map((run) => {
      const escaped = escapeHtml(run.text)
      if (run.code === true) return `<code>${escaped}</code>`
      if (run.bold === true) return `<strong>${escaped}</strong>`
      if (run.italic === true) return `<em>${escaped}</em>`
      return escaped
    })
    .join('')
}
