# Roadmap

Redline's development roadmap, organized by priority and theme.

## v0.2 — Polish & Daily Driver

The immediate goal: make redline reliable and pleasant enough to use on every plan, every day.

**UX refinements**
- [ ] Clear the terminal before rendering (no leftover shell output bleeding through)
- [ ] Hide the raw command (`cat ... | node ...`) that shows at the top of the iTerm tab
- [ ] Auto-close the iTerm tab after submit (currently shows `exit` briefly)
- [x] Smooth scrolling — when navigating past the viewport edge, scroll by one line instead of jumping
- [ ] Wrap long lines instead of truncating — some plan steps have full paragraphs
- [ ] Syntax highlighting for code blocks inside plan steps (fence detection + chalk coloring)
- [ ] Show a confirmation flash ("✓ Feedback sent" / "✓ Approved") before the tab closes
- [ ] Debounce renders to reduce any residual flicker on rapid keystrokes

**Annotation improvements**
- [ ] Edit an existing annotation (navigate to it and press `e`)
- [ ] Cycle through annotations on a step with `Tab`
- [ ] Multi-line annotation input (Shift+Enter for newline within a comment)
- [ ] Annotation preview — show formatted feedback before submitting (press `p` to preview)

## v0.3 — Distribution & Shareability

The goal: anyone can install redline in under 60 seconds.

**Install script**
- [ ] `curl -fsSL https://redline.dev/install.sh | bash` — downloads the binary, adds the hook to `~/.claude/settings.json`, and restarts Claude Code
- [ ] Detect existing hooks and merge instead of overwrite
- [ ] Uninstall command: `redline --uninstall` (removes hook, cleans up)

**npm distribution**
- [ ] Publish to npm as `redline-cli` (`npx redline-cli` for one-off use)
- [ ] `pnpm add -g redline-cli` for permanent install
- [ ] Post-install script that outputs the settings.json snippet to copy

**Claude Code plugin**
- [ ] Package as a Claude Code plugin with `.claude-plugin/plugin.json`
- [ ] Install via `/plugin marketplace add YOUR_USERNAME/redline`
- [ ] Plugin contributes the hook automatically — no manual settings.json editing
- [ ] Slash command: `/redline` to annotate the last plan on demand

**Homebrew**
- [ ] Homebrew tap: `brew install YOUR_USERNAME/tap/redline`
- [ ] Formula handles Node.js dependency

## v0.4 — Power Features

The goal: make redline the best way to review AI-generated plans, period.

**Plan manipulation**
- [ ] Reorder steps with `Shift+j/k` (move step up/down)
- [ ] Add a new step (`a` — insert after current, `A` — insert before)
- [ ] Collapse/expand sections — headings act as toggleable folders
- [ ] Split a step into two (`s` — split at cursor)

**Plan diffing**
- [ ] When Claude resubmits a revised plan, show what changed since last review
- [ ] Side-by-side or inline diff view (green = added, red = removed, yellow = modified)
- [ ] Badge showing "+3 / -1 / ~2" changes at the top
- [ ] Option to only review changed steps (skip unchanged sections)

**Plan history**
- [ ] Save every plan + annotations to `~/.redline/history/`
- [ ] Browse past reviews: `redline history`
- [ ] Re-open a past plan for reference: `redline history <id>`
- [ ] Track how many revision cycles a plan took

**Context awareness**
- [ ] Read the plan file from `planFilePath` (provided in hook payload) for richer context
- [ ] Show which files the plan will modify (extract from plan content)
- [ ] Link to file paths — pressing `Enter` on a file path opens it in `$EDITOR`

## v0.5 — Team & Collaboration

The goal: redline isn't just a solo tool — teams can use it for plan review.

**Share via URL**
- [ ] `redline share` — compress the annotated plan and encode as a URL fragment (no server needed)
- [ ] Recipient opens the URL → renders the annotated plan in a web view
- [ ] URL includes annotations, not just the plan — reviewer's comments are visible

**Export formats**
- [ ] Export annotated plan as markdown with inline comments
- [ ] Export as GitHub issue / PR comment format
- [ ] Export as JSON for programmatic consumption
- [ ] Copy feedback to clipboard (`y` keybinding) without submitting

**Team review flow**
- [ ] Multiple reviewers annotate independently, then merge annotations
- [ ] Integration with GitHub PRs — attach plan review as a PR comment
- [ ] Slack integration — post annotated plan summary to a channel

## v1.0 — Platform

The goal: redline works with any AI coding agent, not just Claude Code.

**Agent-agnostic core**
- [ ] Abstract the hook layer — support different input/output formats
- [ ] Cursor integration (read plan from Cursor's plan mode)
- [ ] Aider integration
- [ ] Copilot Workspace integration
- [ ] Generic stdin mode — any tool that outputs a markdown plan can pipe to redline

**Web companion**
- [ ] Optional browser-based UI (for when you want richer interaction)
- [ ] Syncs with terminal TUI — start reviewing in terminal, continue in browser
- [ ] Accessible at `localhost:PORT` when `redline --web` is running

**API**
- [ ] Redline as a library: `import { reviewPlan } from 'redline-cli'`
- [ ] Programmatic annotation for CI/CD — auto-annotate plans based on rules
- [ ] MCP server — expose plan review as an MCP tool

## Ideas (unscheduled)

Things that could be interesting but need more thought:

- **AI-assisted review** — redline calls Claude to pre-annotate the plan with common issues (e.g., "this step might need error handling")
- **Plan templates** — save annotation patterns (e.g., "always ask about error handling on database steps")
- **Keyboard macro recording** — record a sequence of annotations and replay on similar plans
- **Voice annotation** — press `v` to record a voice note, transcribe it as a comment
- **Plan scoring** — rate plan quality (1-5 stars) and track scores over time
- **Token estimation** — show estimated token cost for each plan step
- **Plan complexity analysis** — flag overly complex steps that should be broken down
