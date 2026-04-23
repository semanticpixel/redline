# redline

Terminal-native plan annotator for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Review, select, and redline AI-generated plans without leaving your terminal.

![Redline plan review demo](assets/redline-demo.gif)

[Watch the Redline demo GIF](assets/redline-demo.gif)

## Why

Claude Code's plan mode is powerful, but terminal review can become awkward once you need to point at specific parts of a plan. Redline hooks into Claude Code's plan lifecycle, opens a terminal review UI, lets you select plan content, attach comments/questions/deletes/replacements, and sends structured feedback back to Claude Code with one keypress.

## Features

- **Terminal-native review** - stays in your terminal, no browser required.
- **Scroll-first workflow** - use the mouse wheel, PageUp/PageDown, Home, and End instead of step-by-step arrow navigation.
- **Drag selection** - select exact rendered Markdown ranges with the mouse, extend with Shift-click, then annotate the touched source spans.
- **Inline annotations** - comment, question, delete, or replace selected plan ranges.
- **Markdown-aware rendering** - headings, paragraphs, lists, code fences, inline code, and spacing render from Markdown tokens.
- **No-flicker custom engine** - React reconciler, Yoga layout, screen buffer diffing, and ANSI patch writes.
- **Feedback loop** - Claude receives structured feedback, revises the plan, and Redline can intercept the revised plan again.

## Install

```bash
git clone https://github.com/semanticpixel/redline.git
cd redline
pnpm install
pnpm build
chmod +x redline-hook.sh
```

## Setup

Add the hook to `~/.claude/settings.json`, using the absolute path to your `redline-hook.sh`:

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/redline/redline-hook.sh",
            "timeout": 900
          }
        ]
      }
    ]
  }
}
```

The `timeout` value (in seconds) controls how long Claude Code waits for the hook before auto-proceeding. Set it high enough for thorough reviews — 900 seconds (15 minutes) is recommended. Redline uses a heartbeat to detect abandoned sessions, so it won't make Claude wait the full timeout if you close the tab early.

Restart Claude Code after adding the hook.

### Why a wrapper script?

Claude Code hooks run as background processes without a controlling TTY. Redline needs a real terminal for raw keyboard input, mouse reporting, alternate-screen rendering, and ANSI output. `redline-hook.sh` bridges that gap by saving the hook payload, opening a terminal tab, running Redline there, and relaying the final hook response back to Claude Code.

## Usage

### With Claude Code

1. Enter plan mode in Claude Code.
2. Ask Claude to generate a plan.
3. When Claude calls `ExitPlanMode`, Redline opens in a terminal tab.
4. Scroll, drag-select plan content, and add annotations.
5. Press `Enter` to approve if there are no annotations or send feedback if there are annotations.
6. Claude revises the plan, and Redline can intercept the next review cycle.

### Standalone demo

```bash
# Run with a built-in sample plan
node dist/bin/index.js

# Pipe a custom plan, simulating Claude Code's hook payload
jq -n '{
  session_id: "test",
  tool_name: "ExitPlanMode",
  tool_input: {
    plan: "# My Plan\n## Step 1\nDo something\n## Step 2\nDo another thing"
  }
}' | node dist/bin/index.js
```

### Markdown-heavy manual test

```bash
pnpm build
jq -n --rawfile plan test-plan.md \
  '{session_id:"test",tool_name:"ExitPlanMode",tool_input:{plan:$plan}}' \
  | node dist/bin/index.js
```

This exercises heading hierarchy, inline code, fenced code blocks, and multi-line step content. See [`test-plan.md`](test-plan.md) for the full plan.

## Keybindings

| Input | Action |
|-------|--------|
| Mouse wheel | Scroll the plan viewport |
| Drag | Select rendered Markdown ranges |
| Shift-click | Extend the current range selection |
| PageUp / PageDown | Scroll one viewport |
| Home / End | Jump to top or bottom |
| `c` | Add a comment to selected ranges |
| `?` | Add a question to selected ranges |
| `d` | Toggle delete on selected ranges |
| `r` | Suggest a replacement for selected ranges |
| `u` | Undo the latest annotation on selected ranges |
| `Esc` | Clear selection or cancel annotation input |
| `Enter` | Approve if clean, or send feedback if annotated |
| `q` / Ctrl-C | Quit without sending feedback |

## How feedback works

When you annotate steps and press `Enter`, Redline formats your annotations into structured feedback that Claude can act on:

```text
Plan feedback from redline review:

On step: "### 2. Update `package.json`"
  💬 Comment: Use pnpm --version to get the exact installed version

On step: "### 3. Update `.gitignore`"
  ❓ Question: Should we also add .pnpm-debug.log?

On step: "## Verification"
  🗑️  Remove this step

Please revise the plan addressing the above annotations, then present the updated plan.
```

Claude revises the plan and presents it again. Redline intercepts for another review cycle until you approve.

## Supported terminals

| Terminal | Platform | Status |
|----------|----------|--------|
| iTerm2 | macOS | Opens a new tab in the current window |
| Terminal.app | macOS | Fallback |
| gnome-terminal | Linux | Supported |
| kitty | Linux | Supported |
| alacritty | Linux | Supported |

## Requirements

- Node.js 20+
- pnpm
- Claude Code 2.1+

## License

MIT
