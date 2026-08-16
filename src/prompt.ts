/**
 * The guidance that decides whether a generated deck is worth showing.
 *
 * The failure mode of an agent writing slides is not a broken file — it is a
 * deck that pastes prose onto slides and reads it aloud. The rules below are
 * the ones that separate the two, so they belong in the prompt rather than in
 * the tool description where they would compete with the parameter list.
 * @module dsh-slides/prompt
 */

/** Inputs of {@link buildGuidance}. */
export interface GuidanceInput {
  /** Configured output directory, named so the agent can find earlier decks. */
  outputDir: string
}

/**
 * Build the guidance text.
 * @param input - the output directory the guidance names.
 * @returns the section text.
 */
export function buildGuidance(input: GuidanceInput): string {
  return [
    'When the user asks for slides, a deck, a talk or a presentation, call make_slides rather than writing markdown they have to convert themselves.',
    'One idea per slide. A slide carries the claim; the evidence and the phrasing go in `notes`, which the presenter reads and the audience never sees. Six bullets is a ceiling, not a target, and a bullet that runs past one line belongs in the notes.',
    'Prefer a section slide between parts over a slide titled "Outline". Prefer a figure with a caption over a paragraph describing the figure.',
    `Decks are written to ${input.outputDir}. Read an existing deck before rewriting it so a revision keeps the structure the user already approved.`,
    'Say where the file landed and how to open it. Never claim a deck was produced without the tool having returned a path.',
  ].join('\n')
}
