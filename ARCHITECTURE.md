# Architecture

This document describes Redline's current architecture, data flow, and main design decisions.

## Overview

Redline is a terminal-based plan annotation tool that integrates with Claude Code via the hook system. The runtime has three major parts: hook bridging, plan parsing/feedback, and a custom fullscreen terminal renderer.

```text
┌─────────────────────────────────────────────────────────────┐
│ Claude Code                                                 │
│                                                             │
│  Plan mode -> ExitPlanMode -> PermissionRequest hook fires  │
│                    │                                        │
│                    ▼                                        │
│  ┌──────────────────────────────────┐                       │
│  │ redline-hook.sh                  │                       │
│  │ - Saves hook JSON to temp file   │                       │
│  │ - Opens a terminal tab           │                       │
│  │ - Waits for output file          │                       │
│  │ - Relays response to stdout      │                       │
│  └──────────────┬───────────────────┘                       │
│                 │                                           │
│    ┌────────────▼────────────────┐                          │
│    │ New terminal tab with TTY   │                          │
│    │                             │                          │
│    │ node dist/bin/index.js      │                          │
│    │  ┌───────────────────────┐  │                          │
│    │  │ hookIO.ts             │  │                          │
│    │  │ read hook JSON        │  │                          │
│    │  └───────────┬───────────┘  │                          │
│    │              ▼              │                          │
│    │  ┌───────────────────────┐  │                          │
│    │  │ parsePlan.ts          │  │                          │
│    │  │ Markdown -> steps     │  │                          │
│    │  └───────────┬───────────┘  │                          │
│    │              ▼              │                          │
│    │  ┌───────────────────────┐  │                          │
│    │  │ src/engine            │  │                          │
│    │  │ custom React renderer │  │                          │
│    │  │ scroll + selection UI │  │                          │
│    │  └───────────┬───────────┘  │                          │
│    │              ▼              │                          │
│    │  ┌───────────────────────┐  │                          │
│    │  │ hookIO.ts             │  │                          │
│    │  │ write hook response   │  │                          │
│    │  └───────────────────────┘  │                          │
│    └─────────────────────────────┘                          │
│                 │                                           │
│                 ▼                                           │
│  Hook wrapper reads output file -> stdout -> Claude Code    │
│                                                             │
│  allow -> Claude proceeds                                   │
│  deny  -> Claude receives feedback and revises the plan     │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```text
redline/
├── src/
│   ├── bin/
│   │   └── index.ts          # CLI entry point
│   ├── engine/
│   │   ├── app.tsx           # Redline review UI state and interactions
│   │   ├── root.ts           # createRoot/render public entry points
│   │   ├── runtime.tsx       # runtime lifecycle, input, mouse, resize, frames
│   │   ├── reconciler.ts     # React host config
│   │   ├── dom.ts            # lightweight host tree nodes
│   │   ├── layout/yoga.ts    # Yoga layout bridge
│   │   ├── renderer.ts       # host tree -> screen buffer
│   │   ├── screen.ts         # cell/style frame memory
│   │   ├── log-update.ts     # frame diffing
│   │   ├── terminal.ts       # ANSI serialization and terminal modes
│   │   ├── markdownRows.ts   # Markdown tokens -> rendered plan rows
│   │   ├── selection.ts      # row selection -> parsed step indices
│   │   ├── mouse.ts          # SGR mouse decoding
│   │   ├── components/       # Box, Text, ScrollBox, Divider, AlternateScreen
│   │   └── hooks/            # useInput, useMouse, useTerminalSize
│   ├── utils/
│   │   ├── hookIO.ts         # stdin/stdout/file I/O for hook integration
│   │   └── parsePlan.ts      # Markdown -> PlanStep[] parser + feedback format
│   └── types.ts              # shared PlanStep/Annotation types
├── redline-hook.sh           # wrapper script for Claude Code hook
├── hooks.json                # reference hook config
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── ARCHITECTURE.md
```

## Data Flow

### 1. Hook Trigger

Claude Code calls `ExitPlanMode` when a plan is ready. This fires a `PermissionRequest` event. The configured hook runs `redline-hook.sh`.

The hook receives JSON on stdin:

```json
{
  "session_id": "abc-123",
  "tool_name": "ExitPlanMode",
  "tool_input": {
    "plan": "# Plan Title\n## Step 1\n...",
    "planFilePath": "/Users/.../.claude/plans/some-plan.md"
  },
  "permission_mode": "plan",
  "hook_event_name": "PermissionRequest"
}
```

### 2. The TTY Bridge

Claude Code hooks run without a controlling terminal. Redline's fullscreen renderer needs a TTY for raw keyboard input, SGR mouse reporting, alternate-screen mode, and ANSI output.

`redline-hook.sh` handles this bridge:

1. Saves stdin JSON to a temp file.
2. Sets `REDLINE_OUTPUT_FILE` to a response temp file.
3. Opens a terminal tab and runs the Node process there.
4. Polls for the response file.
5. Writes the response JSON to stdout for Claude Code.

The Node process also handles direct-pipe testing by reading piped stdin first, reopening `/dev/tty`, and replacing `process.stdin` when possible.

### 3. Plan Parsing

`parsePlan.ts` converts the Markdown plan into `PlanStep[]`. The parser splits on headings and list items that Redline treats as selectable review units. Continuation lines are grouped with the preceding step.

```typescript
interface PlanStep {
  id: number;
  content: string;
  depth: number;
  annotations: Annotation[];
}
```

Markdown rendering is separate from step parsing. `markdownRows.ts` lexes each step with `marked`, renders Markdown tokens into styled row segments, preserves block spacing, wraps rows to the viewport, and attaches internal row metadata for selection hit testing.

### 4. Custom Terminal Engine

The current renderer is not the public `ink` npm package. It is a small custom engine built for Redline's fullscreen needs.

The pipeline is:

```text
React components
  -> react-reconciler host tree
  -> Yoga layout
  -> screen buffer
  -> previous/next frame diff
  -> ANSI patch write
```

Important pieces:

- `root.ts` exposes `createRoot()` and `render()`.
- `runtime.tsx` owns raw input, mouse events, terminal resize, frame scheduling, and cleanup.
- `reconciler.ts` mounts React components into the lightweight host tree from `dom.ts`.
- `layout/yoga.ts` computes box layout and text measurement.
- `renderer.ts`, `output.ts`, and `screen.ts` paint the tree into an in-memory screen buffer.
- `log-update.ts` produces small patch operations instead of clearing and redrawing the screen.
- `terminal.ts` serializes patches and manages alt-screen, cursor, and mouse modes.

### 5. App Interaction Model

`app.tsx` renders the review UI:

```text
<AlternateScreen>
  <Box column>
    header
    divider
    <ScrollBox>
      Markdown-rendered plan rows
    </ScrollBox>
    divider
    footer or annotation input
  </Box>
</AlternateScreen>
```

The primary workflow is scroll and select:

- Mouse wheel scrolls the `ScrollBox`.
- PageUp, PageDown, Home, and End are keyboard scroll fallbacks.
- Dragging inside the plan body creates an app-managed row selection.
- Shift-click extends the current row selection.
- `selection.ts` resolves selected rendered rows back to unique parsed step indices.
- Annotation keys apply to selected parsed steps.

V1 selection maps rendered rows to whole parsed steps. Exact Markdown character/source-span annotations are a separate follow-up because source offsets must survive tokenization, wrapping, and terminal cell hit testing.

### 6. Feedback Formatting

When the user presses `Enter` with annotations present, `formatFeedback()` in `parsePlan.ts` assembles a structured message:

```text
Plan feedback from redline review:

On step: "### 2. Update `package.json`"
  💬 Comment: Use pnpm --version to get the exact installed version

On step: "## Verification"
  🗑️  Remove this step

Please revise the plan addressing the above annotations, then present the updated plan.
```

This is sent as a `deny` decision. If there are no annotations, Redline emits an `allow` decision.

### 7. Hook Response

Output is written via `hookIO.ts`.

- If `REDLINE_OUTPUT_FILE` is set, Redline writes JSON to that file so `redline-hook.sh` can relay it.
- If it is not set, Redline writes to `process.stdout` for direct testing.

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": { "behavior": "allow" }
  }
}
```

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "deny",
      "message": "Plan feedback from redline review:\n\n..."
    }
  }
}
```

## Key Design Decisions

### Why a Custom Renderer?

The old implementation used the public Ink package. That made early iteration fast, but Redline needed tighter control over flicker, terminal mouse mode, scroll clipping, and row-level selection metadata. The current renderer keeps the React authoring model while owning the terminal pipeline directly.

### Why a Wrapper Shell Script?

The no-TTY hook environment is not solvable from inside the hook subprocess. Opening a terminal tab keeps the product terminal-native while giving the renderer the input and output streams it needs.

### Why `REDLINE_OUTPUT_FILE`?

The fullscreen renderer needs stdout for terminal drawing. The hook response therefore goes through a separate file, which the wrapper script relays back to Claude Code.

### Why Whole-Step Annotations for Now?

Rows know which parsed step they belong to, but not the exact Markdown source offsets for every rendered cell. Whole-step annotations preserve the existing feedback format while leaving a clear path toward source-span annotation later.

### Why Mouse Selection Instead of Native Terminal Selection?

Native terminal selection is not reliably observable by the app. Redline enables SGR mouse reporting and renders its own selection highlight so annotation shortcuts can target the selected rows deterministically.

## Build

```bash
pnpm install
pnpm build
pnpm dev
```

`tsup` builds a single ESM CLI entry at `dist/bin/index.js`. React and the reconciler are bundled to avoid dynamic `require("react")` calls in Node's ESM runtime.

## Testing

```bash
# Pure renderer and input tests
pnpm exec tsx src/engine/markdownRows.test.ts
pnpm exec tsx src/engine/mouse.test.ts
pnpm exec tsx src/engine/selection.test.ts

# Typecheck and build
pnpm exec tsc --noEmit
pnpm build

# Demo mode
node dist/bin/index.js

# Simulated hook input
jq -n '{session_id:"test",tool_name:"ExitPlanMode",tool_input:{plan:"# Plan\n## Step 1\nDo X\n## Step 2\nDo Y"}}' | node dist/bin/index.js
```
