# Changelog

All notable changes to `dsh-slides` are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/) (0.x: minor bumps may change the deck model).

## [0.2.0] - 2026-08-17

### Added
- `.pptx` export. `formats` selects what `make_slides` writes (`["html"]` by default); ask for `["html", "pptx"]` and an editable PowerPoint file lands beside the HTML deck, carrying the theme's colours and faces, the bullets, and the speaker notes.
- `parseInline` splits a bullet's `**bold**` / `*italic*` / `` `code` `` into runs once, and both renderers work from those runs — so the HTML deck and the pptx can never disagree about what is bold.

### Changed
- The tool result now reports a `files` array rather than one path, because a call can write more than one file.
- Bullets are emitted as paragraphs of a single pptx text box instead of one box each, which keeps the line spacing uniform and lets a long bullet reflow.

### Notes
- The pptx write asks for its path through the sanctioned `ctx.fs.writeText` before any bytes exist, so a sandboxing backend applies its real policy and can refuse with `FS_SANDBOX_DENIED` first. `resolve` is not a fenced operation, so resolving and writing directly would have gone around the fence.

## [0.1.0] - 2026-08-17

### Added
- `make_slides`: a deck described as structured data becomes one self-contained HTML file — no stylesheet, script, font or image host is fetched at presentation time, so a talk cannot fail on the room's network.
- Five slide layouts (`title`, `section`, `bullets`, `image`, `quote`), inferred from the fields present when the call does not name one.
- Speaker notes per slide, carried as data and revealed with `S` during the talk, so the claim stays on the slide and the talking does not.
- Presentation controls: arrow/space navigation, click zones, fullscreen, a slide number in the URL, and a print stylesheet that puts one slide per page for Ctrl+P to PDF.
- Five finished themes (`plain`, `ink`, `midnight`, `slate`, `sunrise`) whose font stacks name system faces only.
- Inline `**bold**`, `*italic*` and `` `code` `` in bullets, applied after escaping so deck content can never inject markup.
- Workflow guidance in the system prompt: one idea per slide, evidence in the notes, a section divider over an "Outline" slide, and never claiming a deck exists without a path back from the tool.

### Notes
- Decks are written through `ctx.fs`, never `node:fs`, so a sandboxing filesystem backend fences the write. The tool and its guidance are therefore registered only where a filesystem provider is composed.
- No `.pptx` export in this release. It is planned: `ctx.fs.resolve` has the backend decide whether a path is allowed, `processPath` returns the resolved location, and the bytes go there — containment stays with the sandbox.
