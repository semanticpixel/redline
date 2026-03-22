# Architecture

This document describes redline's architecture, data flow, and key design decisions.

## Overview

Redline is a terminal-based plan annotation tool that integrates with Claude Code via the hook system. It consists of three layers: a hook integration layer, a TUI rendering layer, and a feedback formatting layer.

```
┌─────────────────────────────────────────────────────────────┐
│ Claude Code                                                 │
│                                                             │
│  Plan mode → ExitPlanMode → PermissionRequest hook fires    │
│                    │                                        │
│                    ▼                                        │
│  ┌──────────────────────────────────┐                       │
│  │  redline-hook.sh (wrapper)       │                       │
│  │  - Saves stdin to temp file      │                       │
│  │  - Opens new iTerm tab           │                       │
│  │  - Waits for output file         │                       │
│  │  - Relays response to stdout     │                       │
│  └──────────────┬───────────────────┘                       │
│                 │                                           │
│    ┌────────────▼────────────────┐                          │
│    │  New iTerm Tab (has TTY)    │                          │
│    │                             │                          │
│    │  node dist/bin/index.js     │                          │
│    │  ┌───────────────────────┐  │                          │
│    │  │  hookIO.ts            │  │                          │
│    │  │  - Reads piped JSON   │  │                          │
│    │  │  - Reattaches TTY     │  │                          │
│    │  └───────────┬───────────┘  │                          │
│    │              ▼              │                          │
│    │  ┌───────────────────────┐  │                          │
│    │  │  parsePlan.ts         │  │                          │
│    │  │  - Markdown → Steps   │  │                          │
│    │  └───────────┬───────────┘  │                          │
│    │              ▼              │                          │
│    │  ┌───────────────────────┐  │                          │
│    │  │  Ink TUI (App.tsx)    │  │                          │
│    │  │  - Navigation         │  │                          │
│    │  │  - Annotations        │  │                          │
│    │  │  - Multi-select       │  │                          │
│    │  └───────────┬───────────┘  │                          │
│    │              ▼              │                          │
│    │  ┌───────────────────────┐  │                          │
│    │  │  hookIO.ts            │  │                          │
│    │  │  - Writes output file │  │                          │
│    │  └───────────────────────┘  │                          │
│    └─────────────────────────────┘                          │
│                 │                                           │
│                 ▼                                           │
│  Hook wrapper reads output file → stdout → Claude Code      │
│                                                             │
│  behavior: "allow" → Claude proceeds with implementation    │
│  behavior: "deny"  → Claude receives feedback, revises plan │
└─────────────────────────────────────────────────────────────┘
```

## Project structure

```
redline/
├── src/
│   ├── bin/
│   │   └── index.tsx          # CLI entry point
│   ├── components/
│   │   ├── App.tsx            # Main TUI orchestrator
│   │   ├── Header.tsx         # Branding + plan title
│   │   ├── PlanStepView.tsx   # Individual step rendering
│   │   └── StatusBar.tsx      # Keybinding hints + state
│   ├── utils/
│   │   ├── hookIO.ts          # stdin/stdout/file I/O for hook integration
│   │   └── parsePlan.ts       # Markdown → PlanStep[] parser + feedback formatter
│   └── types.ts               # TypeScript type definitions
├── redline-hook.sh            # Wrapper script for Claude Code hook
├── hooks.json                 # Reference hook config for settings.json
├── package.json
├── tsconfig.json
├── tsup.config.ts             # Build config (bundles to dist/bin/index.js)
└── ARCHITECTURE.md
```

## Data flow

### 1. Hook trigger

Claude Code calls `ExitPlanMode` when a plan is ready. This fires a `PermissionRequest` event. Our hook (configured in `~/.claude/settings.json`) runs `redline-hook.sh`.

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

### 2. The TTY problem

Claude Code hooks run without a controlling terminal (TTY). Ink requires a TTY for raw mode keyboard input. This is a fundamental constraint of the hook execution model.

**Solution:** `redline-hook.sh` acts as a bridge:

1. Saves stdin JSON to a temp file (`/tmp/redline-stdin-$PID.json`)
2. Sets `REDLINE_OUTPUT_FILE` env var pointing to an output temp file
3. Opens a new iTerm tab (which has a TTY) and runs the Node process there
4. Polls for the output file in a loop
5. When the file appears, reads it and writes to stdout for Claude Code

The Node process (`index.tsx`) also handles a secondary TTY reattachment for the direct-pipe testing scenario: after reading piped stdin, it reopens `/dev/tty` as a new `ReadStream` and replaces `process.stdin`. This allows `jq ... | redline` to work from a regular terminal.

### 3. Plan parsing

`parsePlan.ts` converts the markdown plan into an array of `PlanStep` objects. The parser splits on:

- Headings (`#`, `##`, `###`, etc.)
- Numbered list items (`1.`, `2.`, etc.)
- Bullet points (`-`, `*`)

Each becomes a discrete step that can be independently annotated. Continuation lines (indented text, code blocks, etc.) are grouped with the preceding step.

```typescript
interface PlanStep {
  id: number;
  content: string;        // Raw markdown for this step
  depth: number;          // Nesting level (h1=1, h2=2, bullet=3)
  annotations: Annotation[];
}
```

### 4. TUI rendering

The TUI is built with Ink (React for the terminal). The component tree:

```
<App>                        # State management + keyboard input
  <Header />                 # "▌ redline — plan review" + plan title
  <PlanStepView />           # × N — one per visible step
  <TextInput />              # Conditionally rendered during annotation
  <StatusBar />              # Keybindings + annotation count
</App>
```

**Keyboard handling** uses two `useInput` hooks to avoid conflicts with `TextInput`:

- **Navigation hook** (`isActive: !isAnnotating`) — handles arrow keys, annotation triggers (`c`, `d`, `r`, `?`), undo, submit, quit
- **Escape hook** (`isActive: isAnnotating`) — handles `Esc` to cancel annotation input

This separation ensures `TextInput` gets clean keyboard focus during annotation mode.

**Multi-select** is tracked via a `selectionAnchor` state. `Shift+↑↓` sets the anchor on first press, then extends the range as you move. Regular `↑↓` clears the selection. All annotation actions apply to the full selected range.

**Scrolling** uses a viewport window. The visible rows are calculated from `process.stdout.rows`, and the window follows the active step with overflow indicators ("↑ N more above", "↓ N more below").

### 5. Feedback formatting

When the user presses `Enter` with annotations present, `formatFeedback()` in `parsePlan.ts` assembles a structured message:

```
Plan feedback from redline review:

On step: "### 2. Update `package.json`"
  💬 Comment: Use pnpm --version to get the exact installed version

On step: "## Verification"
  🗑️  Remove this step

Please revise the plan addressing the above annotations, then present the updated plan.
```

This is sent as the `message` field in a `deny` decision. Claude Code receives it, Claude revises the plan, and the cycle repeats.

### 6. Hook response

Output is written via `hookIO.ts`. The `writeOutput()` function checks for `REDLINE_OUTPUT_FILE`:

- **If set** (hook mode): writes JSON to the file so `redline-hook.sh` can relay it
- **If not set** (direct pipe/testing): writes to `process.stdout`

Two possible responses:

```json
// Approve — no annotations, Claude proceeds
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": { "behavior": "allow" }
  }
}

// Deny — has annotations, Claude receives feedback
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

## Key design decisions

### Why Ink (React for terminal)?

Component-based rendering maps naturally to the step list + annotation + status bar layout. Ink handles terminal escape codes, cursor management, and re-rendering. The React mental model (state → render) makes the annotation flow clean: add annotation → state updates → TUI re-renders with the annotation visible.

### Why a wrapper shell script?

The no-TTY constraint is not solvable from within Node.js when running as a hook subprocess. We explored several approaches:

1. **Direct TUI in hook process** — fails because no TTY exists
2. **Reopen `/dev/tty`** — works for direct pipe testing but `/dev/tty` doesn't exist in hook subprocesses
3. **Browser-based UI** — works (this is what Plannotator does) but breaks the terminal-native goal
4. **New terminal tab via AppleScript** — the chosen approach; keeps everything terminal-native with minimal overhead

### Why `REDLINE_OUTPUT_FILE` instead of stdout?

In the new terminal tab, Ink needs stdout for rendering the TUI. If we redirect stdout to a file (for the hook response), the TUI becomes invisible. The env var approach lets Ink own stdout while `hookIO.ts` writes the hook response to a separate file.

### Why split `useInput` hooks?

Ink's `TextInput` and `useInput` both listen on stdin. When both are active, keystrokes get consumed unpredictably — pressing `c` during annotation would both type "c" and try to start a new comment. The `isActive` flag cleanly separates the two modes.

### Why toggle delete instead of stack?

In early testing, pressing `d` multiple times on the same step created multiple "Remove this step" annotations. This was confusing and wasteful. Toggle behavior (press to mark, press again to unmark) is more intuitive and matches how strikethrough works conceptually.

## Build

```bash
pnpm install     # Install dependencies
pnpm build       # Compile TypeScript → dist/bin/index.js via tsup
pnpm dev         # Watch mode for development
```

tsup bundles everything into a single ESM file with a shebang, marking `react`, `ink`, and `ink-text-input` as external (resolved from `node_modules` at runtime).

## Testing

```bash
# Demo mode — loads a sample plan
node dist/bin/index.js

# Simulated hook input
jq -n '{session_id:"test",tool_name:"ExitPlanMode",tool_input:{plan:"# Plan\n## Step 1\nDo X\n## Step 2\nDo Y"}}' | node dist/bin/index.js

# Full hook integration test
# 1. Set command in ~/.claude/settings.json to point to redline-hook.sh
# 2. Restart Claude Code
# 3. Shift+Tab into plan mode
# 4. Give Claude a task
# 5. Redline should intercept when the plan is ready
```
