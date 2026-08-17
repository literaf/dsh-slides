/**
 * Boots a REAL Cordis context with the published `SystemPrompt`, `ToolRuntime`
 * and a filesystem service, mounts the built plugin from `lib/`, and drives
 * `make_slides` end to end — the only way to prove the tool's parameter schema
 * compiles, its write reaches `ctx.fs`, and its registrations are effects.
 *
 * The filesystem is a recording stand-in rather than the real local backend:
 * the assertion is that the tool writes through the service seam, not that
 * Node can create a file.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'

const LIB_ENTRY = new URL('../lib/index.js', import.meta.url)

/** Writes recorded by {@link RecordingFs}. */
const writes: { path: string; content: string }[] = []

/** Set to deny every text write, the way a sandboxing backend does. */
let denyWrites = false

/** Real directory backing `processPath`, so a byte write is observable. */
const SANDBOX_ROOT = mkdtempSync(join(tmpdir(), 'dsh-slides-'))

afterAll(() => rmSync(SANDBOX_ROOT, { recursive: true, force: true }))

/**
 * Minimal `ctx.fs` provider. `writeText` is the fenced mutation — it records,
 * or refuses when `denyWrites` — and `processPath` maps into a real directory
 * so the binary path can be checked for bytes it should never have written.
 */
class RecordingFs extends Service {
  constructor(ctx: Context) {
    super(ctx, 'fs')
  }

  async resolve(path: string) {
    return { path } as never
  }

  processPath(target: { path: string }): string {
    return join(SANDBOX_ROOT, target.path.replace(/[/]/g, '__'))
  }

  async writeText(target: { path: string }, content: string) {
    if (denyWrites) throw new Error(`cannot write "${target.path}": file access denied under workspace-write mode`)
    writes.push({ path: target.path, content })
    return { operation: 'create', version: 1, before: null } as never
  }
}

/** Mount the whole composition and return the runtime pieces a test drives. */
async function boot(config: Record<string, unknown> = {}) {
  const plugin = await import(LIB_ENTRY.href) as typeof import('../src/index.js')
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime, {})
  await ctx.plugin(RecordingFs)
  const fiber = await ctx.plugin(plugin, config)
  return { ctx, fiber }
}

/** Assemble the prompt and return this plugin's section, serialized. */
async function guidance(ctx: Context): Promise<string | undefined> {
  const assembly = await ctx.systemPrompt.assemble()
  const section = assembly.sections.find((s) => s.name === 'tool:slides')
  return section === undefined ? undefined : JSON.stringify(section)
}

describe.skipIf(!existsSync(LIB_ENTRY))('built plugin in a real composition', () => {
  it('registers the tool with a usable schema and withdraws it on dispose', async () => {
    const { ctx, fiber } = await boot()
    const schema = ctx.tools.schemas().find((s) => s.name === 'make_slides')
    expect(schema).toBeDefined()
    expect(schema?.parameters).toMatchObject({ type: 'object', required: ['title', 'slides'] })
    // The theme enum reaches the model, so it picks a real theme rather than inventing one.
    expect(JSON.stringify(schema?.parameters)).toContain('midnight')

    expect(await guidance(ctx)).toContain('make_slides')

    await fiber.dispose()
    expect(ctx.tools.schemas()).toHaveLength(0)
    expect(await guidance(ctx)).toBeUndefined()
  })

  it('writes a deck through ctx.fs at the configured path', async () => {
    writes.length = 0
    const { ctx } = await boot({ outputDir: 'talks/', defaultTheme: 'midnight' })
    const result = await ctx.tools.execute({
      callId: 'test-1' as never,
      signal: new AbortController().signal,
      name: 'make_slides',
      arguments: {
        title: 'Group meeting',
        slides: [{ title: 'Result', bullets: ['It held up'], notes: 'Pause here.' }],
      },
    })
    expect(result.isError).toBeFalsy()

    expect(writes).toHaveLength(1)
    expect(writes[0]?.path).toBe('talks/group-meeting.html')
    // The configured default theme is the one that got rendered.
    expect(writes[0]?.content).toContain('--bg: #0f172a;')
    expect(writes[0]?.content).toContain('data-notes="Pause here."')
    // Title slide plus the authored one.
    expect(writes[0]?.content.match(/class="slide slide--/g)).toHaveLength(2)
  })

  it('writes a real pptx alongside the html when both are asked for', async () => {
    writes.length = 0
    const { ctx } = await boot({ outputDir: 'talks/' })
    const result = await ctx.tools.execute({
      callId: 'pptx-1' as never,
      signal: new AbortController().signal,
      name: 'make_slides',
      arguments: {
        title: 'Group meeting',
        formats: ['html', 'pptx'],
        slides: [{ title: 'Result', bullets: ['It **held up**'], notes: 'Pause here.' }],
      },
    })
    expect(result.isError).toBeFalsy()
    expect(JSON.stringify(result)).toContain('talks/group-meeting.pptx')

    // Both went through the fenced writeText; the pptx one wrote an empty file
    // first so the backend could refuse before any bytes existed.
    expect(writes.map((w) => w.path)).toEqual(['talks/group-meeting.html', 'talks/group-meeting.pptx'])
    expect(writes[1]?.content).toBe('')

    // The bytes that followed are a real Office Open XML package.
    const bytes = readFileSync(join(SANDBOX_ROOT, 'talks__group-meeting.pptx'))
    expect(bytes.subarray(0, 2).toString()).toBe('PK')
    expect(bytes.byteLength).toBeGreaterThan(10_000)
  })

  it('writes no bytes when the filesystem refuses the path', async () => {
    writes.length = 0
    const { ctx } = await boot({ outputDir: 'escape/' })
    denyWrites = true
    try {
      const result = await ctx.tools.execute({
        callId: 'pptx-2' as never,
        signal: new AbortController().signal,
        name: 'make_slides',
        arguments: { title: 'Denied', formats: ['pptx'], slides: [{ title: 'x', bullets: ['y'] }] },
      })
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result)).toContain('denied')
    } finally {
      denyWrites = false
    }
    // The fence ran before the byte write, so nothing reached the disk.
    expect(existsSync(join(SANDBOX_ROOT, 'escape__denied.pptx'))).toBe(false)
    expect(writes).toHaveLength(0)
  })

  it('rejects a format it cannot write', async () => {
    const { ctx } = await boot()
    const result = await ctx.tools.execute({
      callId: 'fmt-1' as never,
      signal: new AbortController().signal,
      name: 'make_slides',
      arguments: { title: 'T', formats: ['keynote'], slides: [{ title: 'x', bullets: ['y'] }] },
    })
    expect(result.isError).toBe(true)
  })

  it('reports an unusable deck instead of writing a broken one', async () => {
    writes.length = 0
    const { ctx } = await boot()
    const result = await ctx.tools.execute({
      callId: 'test-2' as never,
      signal: new AbortController().signal,
      name: 'make_slides',
      arguments: { title: 'Bad', slides: [{ layout: 'bullets', title: 'no bullets' }] },
    })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain('slide 1')
    expect(writes).toHaveLength(0)
  })

  it('does not offer the tool where no filesystem provider is composed', async () => {
    const plugin = await import(LIB_ENTRY.href) as typeof import('../src/index.js')
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, {})
    await ctx.plugin(plugin, {})

    expect(ctx.tools.schemas().map((s) => s.name)).not.toContain('make_slides')
    // The guidance follows the tool: no tool, nothing to instruct.
    expect(await guidance(ctx)).toBeUndefined()
  })
})
