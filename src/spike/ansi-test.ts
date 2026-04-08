/**
 * Spike: Raw ANSI escape code TUI rendering
 *
 * Validates that raw ANSI on the alternate screen buffer gives us:
 * - Smooth scrolling with line wrapping
 * - Stable header/footer
 * - No flicker
 * - Full control over layout
 *
 * Run: tsx src/spike/ansi-test.ts
 *   or: node dist/spike/ansi-test.js (after pnpm build)
 */

import { WriteStream } from "tty";

// ── ANSI escape sequences ──────────────────────────────────────────

const ESC = "\x1b[";
const ALT_SCREEN_ON = "\x1b[?1049h";
const ALT_SCREEN_OFF = "\x1b[?1049l";
const CURSOR_HIDE = "\x1b[?25l";
const CURSOR_SHOW = "\x1b[?25h";
const CLEAR_SCREEN = `${ESC}2J`;
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const WHITE = `${ESC}37m`;
const CYAN = `${ESC}36m`;
const YELLOW = `${ESC}33m`;
const GRAY = `${ESC}90m`;
const BG_BLUE = `${ESC}44m`;
const BG_RESET = `${ESC}49m`;

function moveTo(row: number, col: number): string {
  return `${ESC}${row + 1};${col + 1}H`;
}

function clearLine(): string {
  return `${ESC}2K`;
}

// ── Data ────────────────────────────────────────────────────────────

interface Item {
  id: number;
  text: string;
}

function generateItems(count: number): Item[] {
  const items: Item[] = [];
  const descriptions = [
    "Short task",
    "Read the configuration file and validate all required fields are present",
    "Refactor the authentication middleware to support both JWT and session-based auth, ensuring backward compatibility with existing API consumers and adding proper error messages for each failure mode",
    "Update tests",
    "Migrate the database schema to add the new user_preferences table with columns for theme, language, notification settings, and timezone, including proper indexes and foreign key constraints back to the users table",
    "Fix typo in README",
    "Implement the new caching layer that sits between the API handlers and the database queries, with support for TTL-based expiration, LRU eviction, cache warming on startup, and invalidation hooks that fire when the underlying data changes through any write path",
    "Add logging",
    "Review and update all third-party dependencies to their latest stable versions, checking for breaking changes in each major version bump and updating our code accordingly",
    "Delete unused CSS",
    "Create comprehensive integration tests for the payment processing pipeline covering successful charges, declined cards, network timeouts, partial refunds, webhook delivery failures, and idempotency key conflicts",
    "Bump version number",
    "Set up CI/CD pipeline with linting, type checking, unit tests, integration tests, and deployment to staging",
    "Quick fix for the null check",
    "Design and implement a rate limiting system with per-user quotas, sliding window counters, configurable limits per endpoint, grace periods for burst traffic, and admin override capabilities",
  ];

  for (let i = 0; i < count; i++) {
    items.push({
      id: i + 1,
      text: descriptions[i % descriptions.length],
    });
  }
  return items;
}

// ── Line wrapping ───────────────────────────────────────────────────

const INDENT_PREFIX = "     "; // continuation indent (5 spaces to align with "## " prefix content)

function wrapText(text: string, width: number, firstLinePrefix: string): string[] {
  const firstLineWidth = width - firstLinePrefix.length;
  const contLineWidth = width - INDENT_PREFIX.length;

  if (firstLineWidth <= 0 || contLineWidth <= 0) return [firstLinePrefix + text];

  const lines: string[] = [];
  let remaining = text;

  // First line
  if (remaining.length <= firstLineWidth) {
    lines.push(firstLinePrefix + remaining);
    return lines;
  }

  // Break at word boundary
  let breakAt = remaining.lastIndexOf(" ", firstLineWidth);
  if (breakAt <= 0) breakAt = firstLineWidth;
  lines.push(firstLinePrefix + remaining.slice(0, breakAt));
  remaining = remaining.slice(breakAt).trimStart();

  // Continuation lines
  while (remaining.length > 0) {
    if (remaining.length <= contLineWidth) {
      lines.push(INDENT_PREFIX + remaining);
      break;
    }
    breakAt = remaining.lastIndexOf(" ", contLineWidth);
    if (breakAt <= 0) breakAt = contLineWidth;
    lines.push(INDENT_PREFIX + remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }

  return lines;
}

// ── Rendering ───────────────────────────────────────────────────────

interface RenderState {
  items: Item[];
  activeIndex: number;
  scrollOffset: number; // row offset into the virtual content
}

const HEADER_LINES = 3;
const FOOTER_LINES = 2;

function getTermSize(): { cols: number; rows: number } {
  return {
    cols: (process.stdout as WriteStream).columns || 80,
    rows: (process.stdout as WriteStream).rows || 24,
  };
}

/** Pre-compute all rendered rows for all items, returning per-item row ranges. */
function computeRenderedRows(items: Item[], width: number): { lines: string[]; itemStartRow: number[]; itemRowCount: number[] } {
  const allLines: string[] = [];
  const itemStartRow: number[] = [];
  const itemRowCount: number[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prefix = `  ${String(item.id).padStart(2)}. `;
    const wrapped = wrapText(item.text, width, prefix);
    itemStartRow.push(allLines.length);
    itemRowCount.push(wrapped.length);
    allLines.push(...wrapped);
  }

  return { lines: allLines, itemStartRow, itemRowCount };
}

function render(state: RenderState): void {
  const { cols, rows } = getTermSize();
  const viewportRows = rows - HEADER_LINES - FOOTER_LINES;
  if (viewportRows <= 0) return;

  const { lines: allLines, itemStartRow, itemRowCount } = computeRenderedRows(state.items, cols);
  const totalRenderedRows = allLines.length;

  // Ensure scroll offset keeps active item visible
  const activeStart = itemStartRow[state.activeIndex];
  const activeEnd = activeStart + itemRowCount[state.activeIndex];

  let scroll = state.scrollOffset;
  if (activeStart < scroll) {
    scroll = activeStart;
  }
  if (activeEnd > scroll + viewportRows) {
    scroll = activeEnd - viewportRows;
  }
  scroll = Math.max(0, Math.min(scroll, Math.max(0, totalRenderedRows - viewportRows)));
  state.scrollOffset = scroll;

  // Count items above/below viewport for scroll indicators
  const aboveCount = countItemsAbove(itemStartRow, itemRowCount, scroll);
  const belowCount = countItemsBelow(itemStartRow, scroll + viewportRows);

  // Build frame buffer
  const buf: string[] = [];

  // ── Header ──
  buf.push(moveTo(0, 0) + clearLine() + BG_BLUE + WHITE + BOLD + pad(" redline — plan review", cols) + RESET);
  buf.push(moveTo(1, 0) + clearLine() + CYAN + " Plan: Implement new feature pipeline" + RESET);
  buf.push(moveTo(2, 0) + clearLine() + DIM + "─".repeat(cols) + RESET);

  // ── Content viewport ──
  for (let vRow = 0; vRow < viewportRows; vRow++) {
    const srcRow = scroll + vRow;
    const screenRow = HEADER_LINES + vRow;
    buf.push(moveTo(screenRow, 0) + clearLine());

    if (srcRow >= totalRenderedRows) {
      // Empty row below content
      continue;
    }

    // Determine which item this row belongs to
    const itemIdx = findItemForRow(srcRow, itemStartRow, itemRowCount);
    const isActive = itemIdx === state.activeIndex;
    const isFirstRowOfItem = srcRow === itemStartRow[itemIdx];

    let line = allLines[srcRow];

    if (isActive) {
      // Replace leading spaces with marker on first row
      if (isFirstRowOfItem) {
        line = `${BOLD}${WHITE}▸${line.slice(1)}${RESET}`;
      } else {
        line = `${BOLD}${WHITE}${line}${RESET}`;
      }
    } else {
      line = `${GRAY}${line}${RESET}`;
    }

    buf.push(line);
  }

  // ── Footer ──
  const footerRow = rows - FOOTER_LINES;
  buf.push(moveTo(footerRow, 0) + clearLine() + DIM + "─".repeat(cols) + RESET);

  let statusLeft = ` ${YELLOW}↑↓${RESET} navigate  ${YELLOW}q${RESET} quit`;
  let statusRight = `${state.activeIndex + 1}/${state.items.length}`;

  // Scroll indicators
  const scrollHints: string[] = [];
  if (aboveCount > 0) scrollHints.push(`↑ ${aboveCount} more above`);
  if (belowCount > 0) scrollHints.push(`↓ ${belowCount} more below`);
  if (scrollHints.length > 0) {
    statusRight = `${DIM}${scrollHints.join("  ")}${RESET}  ${statusRight}`;
  }

  buf.push(moveTo(footerRow + 1, 0) + clearLine() + statusLeft + moveTo(footerRow + 1, cols - stripAnsi(statusRight).length) + statusRight);

  // Write in a single call — flicker-free
  process.stdout.write(buf.join(""));
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function pad(text: string, width: number): string {
  const visible = stripAnsi(text);
  if (visible.length >= width) return text;
  return text + " ".repeat(width - visible.length);
}

function findItemForRow(row: number, itemStartRow: number[], itemRowCount: number[]): number {
  // Binary search for the item containing this row
  let lo = 0;
  let hi = itemStartRow.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (itemStartRow[mid] <= row) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function countItemsAbove(itemStartRow: number[], itemRowCount: number[], viewportTopRow: number): number {
  let count = 0;
  for (let i = 0; i < itemStartRow.length; i++) {
    if (itemStartRow[i] + itemRowCount[i] <= viewportTopRow) count++;
  }
  return count;
}

function countItemsBelow(itemStartRow: number[], viewportBottomRow: number): number {
  let count = 0;
  for (let i = 0; i < itemStartRow.length; i++) {
    if (itemStartRow[i] >= viewportBottomRow) count++;
  }
  return count;
}

// ── Input handling ──────────────────────────────────────────────────

function setupInput(state: RenderState): void {
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  stdin.on("data", (data: string) => {
    const key = data;

    if (key === "q" || key === "\x03" /* Ctrl-C */) {
      cleanup();
      process.exit(0);
    }

    if (key === "\x1b[A" /* Up */) {
      if (state.activeIndex > 0) {
        state.activeIndex--;
        render(state);
      }
    } else if (key === "\x1b[B" /* Down */) {
      if (state.activeIndex < state.items.length - 1) {
        state.activeIndex++;
        render(state);
      }
    } else if (key === "\x1b[5~" /* Page Up */) {
      const { rows } = getTermSize();
      const jump = rows - HEADER_LINES - FOOTER_LINES - 1;
      state.activeIndex = Math.max(0, state.activeIndex - jump);
      render(state);
    } else if (key === "\x1b[6~" /* Page Down */) {
      const { rows } = getTermSize();
      const jump = rows - HEADER_LINES - FOOTER_LINES - 1;
      state.activeIndex = Math.min(state.items.length - 1, state.activeIndex + jump);
      render(state);
    } else if (key === "g") {
      state.activeIndex = 0;
      render(state);
    } else if (key === "G") {
      state.activeIndex = state.items.length - 1;
      render(state);
    }
  });
}

// ── Lifecycle ───────────────────────────────────────────────────────

function cleanup(): void {
  process.stdout.write(CURSOR_SHOW + ALT_SCREEN_OFF);
  if (process.stdin.isRaw) {
    process.stdin.setRawMode(false);
  }
}

function main(): void {
  // Enter alternate screen, hide cursor, clear
  process.stdout.write(ALT_SCREEN_ON + CURSOR_HIDE + CLEAR_SCREEN);

  // Clean exit on signals
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });
  process.on("uncaughtException", (err) => {
    cleanup();
    console.error(err);
    process.exit(1);
  });

  const state: RenderState = {
    items: generateItems(50),
    activeIndex: 0,
    scrollOffset: 0,
  };

  // Re-render on terminal resize
  process.stdout.on("resize", () => render(state));

  // Initial render
  render(state);

  // Start listening for keys
  setupInput(state);
}

main();
