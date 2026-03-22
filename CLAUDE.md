# CLAUDE.md

## Project overview

Redline is a terminal-native plan annotator for Claude Code. It intercepts plans via the `PermissionRequest` hook on `ExitPlanMode`, renders them in an interactive TUI (Ink/React), lets the user annotate steps, and sends structured feedback back to Claude Code.

## Tech stack

- TypeScript, React 18, Ink 5 (React for the terminal)
- ink-text-input for annotation input
- tsup for bundling (ESM, single file output)
- pnpm as package manager

## Architecture

The system has three layers:

1. **Hook layer** (`redline-hook.sh`) — bridges Claude Code's no-TTY hook environment to a real terminal tab via AppleScript. Sets `REDLINE_OUTPUT_FILE` env var for file-based response passing.

2. **Core** (`src/bin/index.tsx`, `src/utils/`) — reads hook JSON from stdin, parses plan markdown into steps, reattaches TTY when piped, writes hook responses to file or stdout.

3. **TUI** (`src/components/`) — Ink components for plan rendering, navigation, annotation, and multi-select.

See `ARCHITECTURE.md` for the full data flow diagram and design decisions.

## Key files

- `src/components/App.tsx` — main orchestrator, all state management and keyboard handling
- `src/components/PlanStepView.tsx` — renders individual plan steps with annotations
- `src/utils/parsePlan.ts` — markdown → PlanStep[] parser + feedback formatter
- `src/utils/hookIO.ts` — stdin reading, TTY reattachment, output writing (file or stdout)
- `src/bin/index.tsx` — CLI entry point, demo mode, hook mode detection
- `redline-hook.sh` — wrapper script that opens iTerm tab for the TUI

## Commands

```bash
pnpm install          # install dependencies
pnpm build            # compile to dist/bin/index.js
pnpm dev              # watch mode
node dist/bin/index.js  # run in demo mode (sample plan)
```

## Testing with simulated hook input

```bash
jq -n '{session_id:"test",tool_name:"ExitPlanMode",tool_input:{plan:"# Plan\n## Step 1\nDo X\n## Step 2\nDo Y"}}' | node dist/bin/index.js
```

## Important patterns

**Dual useInput hooks** — `App.tsx` uses two `useInput` hooks to avoid conflicts with `TextInput`. The navigation hook is `isActive: !isAnnotating`, the escape hook is `isActive: isAnnotating`. Never merge these into one hook.

**TTY reattachment** — when stdin is a pipe (not a TTY), `index.tsx` reads all piped data first, then reopens `/dev/tty` as a new `ReadStream` and replaces `process.stdin`. This lets Ink enter raw mode for keyboard input after consuming the hook payload.

**File-based output** — in hook mode, `REDLINE_OUTPUT_FILE` env var tells `hookIO.ts` to write the response JSON to a file instead of stdout (which Ink needs for rendering). The wrapper script polls for this file and relays it to Claude Code.

**Delete is a toggle** — pressing `d` on a step that already has a delete annotation removes it instead of stacking. Other annotation types (`c`, `r`, `?`) do stack.

## Code style

- Functional React components with hooks only (no classes)
- TypeScript strict mode
- Named exports for components, utility functions
- Types defined in `src/types.ts`

## Known limitations

- Plan parser splits on headings and top-level list items; deeply nested content groups with the parent step
- Multi-line annotation input is not yet supported (single line only)
- The wrapper script uses AppleScript — macOS only for iTerm/Terminal.app; Linux uses direct terminal emulator invocation
- Ink re-renders the full component tree on state changes; very long plans (50+ steps) may feel sluggish
