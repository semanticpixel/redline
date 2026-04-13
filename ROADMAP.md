# Roadmap

Redline's roadmap is now centered on the custom terminal engine, scroll-first selection, and richer Markdown review.

## v0.2 - Daily Driver Polish

The immediate goal is to make Redline reliable and pleasant enough to use on every plan.

**Terminal and hook polish**

- [x] Hide the raw command that can appear at the top of newly opened terminal tabs.
- [ ] Auto-close the terminal tab after submit without flashing `exit`.
- [ ] Show a confirmation flash before the tab closes.
- [ ] Harden terminal cleanup after abnormal exits, suspend/resume, and interrupted hook flows.
- [ ] Improve terminal emulator detection and fallback messaging.

**Review UX**

- [x] Use a no-flicker custom renderer with diffed ANSI frame patches.
- [x] Render Markdown blocks with preserved spacing, lists, inline code, and fenced code blocks.
- [x] Replace arrow-driven step navigation with scroll-first review.
- [x] Add mouse wheel scrolling, drag selection, and Shift-click range extension.
- [x] Add exact Markdown source-span selection instead of mapping selected rows to whole parsed steps.
- [ ] Add app-managed copy or excerpt preview for the selected rendered text.
- [ ] Tune inactive contrast and heading hierarchy after more daily use.

**Annotation improvements**

- [ ] Edit an existing annotation.
- [ ] Cycle through annotations on a selected step with `Tab`.
- [ ] Multi-line annotation input.
- [ ] Annotation preview before submitting.
- [x] Include selected excerpts in feedback once source-span metadata exists.

## v0.3 - Distribution & Shareability

The goal is for anyone to install Redline in under 60 seconds.

**Install script**

- [ ] `curl -fsSL https://redline.dev/install.sh | bash` to download, build, and install the Claude Code hook.
- [ ] Detect existing hooks and merge instead of overwrite.
- [ ] Add `redline --uninstall` to remove the hook and clean up generated files.

**npm distribution**

- [ ] Publish to npm as `redline-cli`.
- [ ] Support `npx redline-cli` for one-off use.
- [ ] Add a post-install helper that prints the `settings.json` snippet.

**Claude Code plugin**

- [ ] Package as a Claude Code plugin.
- [ ] Install via the Claude Code plugin marketplace.
- [ ] Contribute the hook automatically where possible.
- [ ] Add a `/redline` command to annotate the last plan on demand.

**Homebrew**

- [ ] Publish a Homebrew tap.
- [ ] Ensure the formula handles the Node.js dependency cleanly.

## v0.4 - Power Features

The goal is to make Redline the best way to review AI-generated plans.

**Plan manipulation**

- [ ] Add new steps inline.
- [ ] Collapse and expand sections.
- [ ] Split a step into two after source-span selection exists.
- [ ] Reorder steps after the non-arrow interaction model has a clear design.

**Plan diffing**

- [ ] When Claude resubmits a revised plan, show what changed since the last review.
- [ ] Add inline diff rendering with added, removed, and modified regions.
- [ ] Show a compact change summary at the top.
- [ ] Optionally review only changed sections.

**Plan history**

- [ ] Save every plan and annotation set to `~/.redline/history/`.
- [ ] Browse past reviews with `redline history`.
- [ ] Re-open a past plan for reference.
- [ ] Track how many revision cycles a plan took.

**Context awareness**

- [ ] Read the plan file from `planFilePath` when present.
- [ ] Extract and highlight files mentioned by the plan.
- [ ] Open file paths in `$EDITOR`.
- [x] Add lightweight terminal-palette syntax highlighting for fenced code blocks.
- [ ] Consider language-grade syntax highlighting for fenced code blocks.

## v0.5 - Team & Collaboration

The goal is to make Redline useful beyond solo plan review.

**Share via URL**

- [ ] `redline share` to encode an annotated plan as a URL fragment.
- [ ] Render shared reviews in a web view.
- [ ] Include annotations, not just raw plan content.

**Export formats**

- [ ] Export annotated plans as Markdown with inline comments.
- [ ] Export as GitHub issue or PR comment text.
- [ ] Export as JSON for programmatic consumption.
- [ ] Copy feedback without submitting.

**Team review flow**

- [ ] Merge annotations from multiple reviewers.
- [ ] Attach plan review summaries to GitHub PRs.
- [ ] Post annotated plan summaries to Slack.

## v1.0 - Platform

The goal is for Redline to work with AI coding agents beyond Claude Code.

**Agent-agnostic core**

- [ ] Abstract the hook layer to support multiple input/output formats.
- [ ] Cursor integration.
- [ ] Aider integration.
- [ ] Copilot Workspace integration.
- [ ] Generic stdin mode for any tool that outputs a Markdown plan.

**Web companion**

- [ ] Optional browser UI for richer review sessions.
- [ ] Sync between terminal and browser sessions.
- [ ] Localhost mode via `redline --web`.

**API**

- [ ] Redline as a library.
- [ ] Programmatic annotation for CI/CD.
- [ ] MCP server exposing plan review as a tool.

## Ideas

- AI-assisted pre-review for common plan issues.
- Plan templates for repeated review patterns.
- Keyboard macro recording.
- Voice annotation.
- Plan scoring and complexity analysis.
- Token estimation.
