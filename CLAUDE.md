# CLAUDE.md

## Project Overview

Redline is a terminal-native plan annotator for Claude Code. It intercepts plans via the `PermissionRequest` hook on `ExitPlanMode`, renders them in a fullscreen terminal UI, lets the user select plan content and annotate parsed steps, then sends structured feedback back to Claude Code.

## Tech Stack

- TypeScript and React 18.
- Custom terminal renderer in `src/engine`, built on `react-reconciler`, `yoga-layout`, screen-buffer diffing, and ANSI patch writes.
- `marked` for Markdown tokenization in the plan row renderer.
- `tsup` for ESM bundling.
- `pnpm` as package manager.

The runtime does not use the public `ink` package.

## Architecture

The system has three layers:

1. **Hook layer** (`redline-hook.sh`) bridges Claude Code's no-TTY hook environment to a real terminal tab and uses `REDLINE_OUTPUT_FILE` for response passing.
2. **Core** (`src/bin/index.ts`, `src/utils/`) reads hook JSON, parses plan Markdown into steps, reattaches TTY for direct-pipe testing, and writes hook responses.
3. **Engine** (`src/engine/`) renders the fullscreen UI, handles input/mouse events, scrolls the plan viewport, maps row selections to parsed steps, and records annotations.

See `ARCHITECTURE.md` for the full data flow and design decisions.

## Key Files

- `src/bin/index.ts` - CLI entry point, demo mode, hook mode detection.
- `src/engine/app.tsx` - review UI state, scrolling, selection, annotations, and footer.
- `src/engine/runtime.tsx` - runtime lifecycle, raw input, mouse events, resize handling, frame scheduling, and cleanup.
- `src/engine/markdownRows.ts` - Markdown tokens to styled rendered rows.
- `src/engine/selection.ts` - row selection to parsed step indices.
- `src/engine/mouse.ts` - SGR mouse packet decoding.
- `src/engine/reconciler.ts` - React host config.
- `src/engine/renderer.ts` - host tree to screen buffer paint.
- `src/engine/log-update.ts` - previous/next frame diffing.
- `src/engine/terminal.ts` - ANSI serialization and terminal mode sequences.
- `src/utils/parsePlan.ts` - Markdown to `PlanStep[]` parser and feedback formatter.
- `src/utils/hookIO.ts` - hook stdin/stdout/file I/O.
- `redline-hook.sh` - wrapper script that opens a terminal tab for the UI.

## Commands

```bash
pnpm install
pnpm build
pnpm dev
node dist/bin/index.js
```

## Tests

```bash
pnpm exec tsx src/engine/markdownRows.test.ts
pnpm exec tsx src/engine/mouse.test.ts
pnpm exec tsx src/engine/selection.test.ts
pnpm exec tsc --noEmit
pnpm build
```

## Simulated Hook Input

```bash
jq -n '{session_id:"test",tool_name:"ExitPlanMode",tool_input:{plan:"# Plan\n## Step 1\nDo X\n## Step 2\nDo Y"}}' | node dist/bin/index.js
```

## Important Patterns

- **Scroll-first interaction** - mouse wheel and PageUp/PageDown/Home/End move the `ScrollBox`; arrow keys are not the primary navigation model.
- **App-managed selection** - drag and Shift-click create row selections that are resolved back to whole parsed steps. Native terminal selection is not used for annotations.
- **Whole-step annotations** - exact Markdown source spans are deferred until tokenization, wrapping, and cell hit testing preserve source offsets.
- **Terminal cleanup** - alt-screen, cursor visibility, raw mode, and SGR mouse reporting must be restored on normal and abnormal exits.
- **File-based output** - hook mode writes the Claude Code response to `REDLINE_OUTPUT_FILE` because stdout is owned by the fullscreen renderer.
- **Delete is a toggle** - pressing `d` on selected steps with delete annotations removes the delete annotation instead of stacking duplicates.

## Code Style

- Functional React components with hooks.
- TypeScript strict mode.
- Named exports for utilities and components unless a file already uses a default component export.
- Shared domain types live in `src/types.ts`; render-specific row types live in `src/engine/renderTypes.ts`.

## Known Limitations

- Plan parser splits on headings and list items; deeply nested content groups with the parent step.
- Selection maps to whole parsed steps, not exact Markdown character ranges.
- Multi-line annotation input is not yet supported.
- Terminal mouse behavior varies by emulator, so cleanup and fallback behavior matter.
