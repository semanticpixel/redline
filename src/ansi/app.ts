import { WriteStream } from "tty";
import type { PlanStep, Annotation } from "../types.js";
import { formatFeedback } from "../utils/parsePlan.js";
import { emitApprove, emitDeny } from "../utils/hookIO.js";

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
const STRIKETHROUGH = `${ESC}9m`;
const WHITE = `${ESC}37m`;
const RED = `${ESC}31m`;
const GREEN = `${ESC}32m`;
const YELLOW = `${ESC}33m`;
const BLUE = `${ESC}34m`;
const CYAN = `${ESC}36m`;
const GRAY = `${ESC}90m`;
const BG_BLUE = `${ESC}44m`;
const BG_RESET = `${ESC}49m`;

function moveTo(row: number, col: number): string {
  return `${ESC}${row + 1};${col + 1}H`;
}

function clearLine(): string {
  return `${ESC}2K`;
}

// ── State ──────────────────────────────────────────────────────────

interface AppState {
  steps: PlanStep[];
  activeIndex: number;
  scrollOffset: number;
  selectionAnchor: number | null;
  isAnnotating: boolean;
  annotationType: Annotation["type"];
  inputValue: string;
}

// ── Constants ──────────────────────────────────────────────────────

const HEADER_LINES = 3;
const FOOTER_IDLE_LINES = 4;
const FOOTER_ANNOTATING_LINES = 3; // label + input + hint

const TYPE_COLORS: Record<Annotation["type"], string> = {
  comment: YELLOW,
  question: CYAN,
  delete: RED,
  replace: GREEN,
};

const TYPE_LABELS: Record<Annotation["type"], string> = {
  comment: "Comment",
  question: "Question",
  delete: "Delete reason",
  replace: "Replace with",
};

const TYPE_ICONS: Record<Annotation["type"], string> = {
  comment: "\u{1F4AC}",
  question: "\u2753",
  delete: "\u{1F5D1}\uFE0F ",
  replace: "\u270F\uFE0F ",
};

// ── Helpers ────────────────────────────────────────────────────────

function getTermSize(): { cols: number; rows: number } {
  return {
    cols: (process.stdout as WriteStream).columns || 80,
    rows: (process.stdout as WriteStream).rows || 24,
  };
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function pad(text: string, width: number): string {
  const visible = stripAnsi(text);
  if (visible.length >= width) return text;
  return text + " ".repeat(width - visible.length);
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function getSelectedIndices(state: AppState): number[] {
  if (state.selectionAnchor === null) return [state.activeIndex];
  const start = Math.min(state.selectionAnchor, state.activeIndex);
  const end = Math.max(state.selectionAnchor, state.activeIndex);
  const indices: number[] = [];
  for (let i = start; i <= end; i++) indices.push(i);
  return indices;
}

function isSelected(state: AppState, index: number): boolean {
  if (state.selectionAnchor === null) return false;
  const start = Math.min(state.selectionAnchor, state.activeIndex);
  const end = Math.max(state.selectionAnchor, state.activeIndex);
  return index >= start && index <= end;
}

// ── Line wrapping ───────────────────────────────────────────────────

/**
 * Break text into lines that fit within the given widths.
 * Returns an array of text chunks (no prefixes attached).
 */
function breakIntoLines(text: string, firstWidth: number, contWidth: number): string[] {
  if (firstWidth <= 0 || contWidth <= 0) return [text];
  if (text.length <= firstWidth) return [text];

  const lines: string[] = [];
  let remaining = text;

  // First line
  let breakAt = remaining.lastIndexOf(" ", firstWidth);
  if (breakAt <= 0) breakAt = firstWidth;
  lines.push(remaining.slice(0, breakAt));
  remaining = remaining.slice(breakAt).trimStart();

  // Continuation lines
  while (remaining.length > 0) {
    if (remaining.length <= contWidth) {
      lines.push(remaining);
      break;
    }
    breakAt = remaining.lastIndexOf(" ", contWidth);
    if (breakAt <= 0) breakAt = contWidth;
    lines.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }

  return lines;
}

// ── Row computation ─────────────────────────────────────────────────

interface RenderedRow {
  text: string;
  stepIndex: number;
}

function computeRows(state: AppState, width: number): {
  rows: RenderedRow[];
  stepStartRow: number[];
  stepRowCount: number[];
} {
  const allRows: RenderedRow[] = [];
  const stepStartRow: number[] = [];
  const stepRowCount: number[] = [];
  const totalSteps = state.steps.length;
  const gutterWidth = String(totalSteps).length;

  for (let i = 0; i < totalSteps; i++) {
    stepStartRow.push(allRows.length);
    const startLen = allRows.length;

    const step = state.steps[i];
    const active = i === state.activeIndex;
    const selected = isSelected(state, i);
    const highlighted = active || selected;
    const hasAnnotations = step.annotations.length > 0;
    const isDeleted = step.annotations.some((a) => a.type === "delete");

    const firstLine = step.content.split("\n")[0];
    const isHeading = /^#{1,6}\s/.test(firstLine);

    // Prefix layout: "  {gutter} {pointer} "
    //   selBar(2) + gutter(N) + space(1) + pointer(1) + space(1)
    const prefixLen = 2 + gutterWidth + 1 + 1 + 1;
    const contPad = " ".repeat(prefixLen);

    // Build styled prefix
    const selBar = selected && !active
      ? `${BLUE}${BOLD}\u2503 ${RESET}`
      : "  ";
    const gutter = String(i + 1).padStart(gutterWidth);
    const gutterStyled = highlighted
      ? `${YELLOW}${gutter}${RESET}`
      : `${GRAY}${gutter}${RESET}`;
    const pointer = active ? `${RED}${BOLD}\u25B8${RESET}` : " ";
    const styledPrefix = `${selBar}${gutterStyled} ${pointer} `;

    // Title color
    let titleColor: string;
    if (isDeleted) {
      titleColor = RED + STRIKETHROUGH;
    } else if (highlighted) {
      titleColor = WHITE + BOLD;
    } else if (isHeading) {
      titleColor = CYAN;
    } else {
      titleColor = GRAY;
    }

    // Badge
    const badgePlain = hasAnnotations ? ` [${step.annotations.length}]` : "";
    const badgeStyled = hasAnnotations
      ? ` ${RED}${BOLD}[${step.annotations.length}]${RESET}`
      : "";

    // Wrap title text (reserve space for badge on first line)
    const availWidth = width - prefixLen;
    const firstLineAvail = Math.max(1, availWidth - badgePlain.length);
    const chunks = breakIntoLines(firstLine, firstLineAvail, availWidth);

    for (let w = 0; w < chunks.length; w++) {
      let content = `${titleColor}${chunks[w]}${RESET}`;
      // Badge on first line only
      if (w === 0) content += badgeStyled;
      // Selection background
      if (selected && !active) {
        content = `${BG_BLUE}${content}${BG_RESET}`;
      }
      const prefix = w === 0 ? styledPrefix : contPad;
      allRows.push({ text: `${prefix}${content}`, stepIndex: i });
    }

    // Inline annotations when active
    if (active && hasAnnotations) {
      const annIndent = " ".repeat(prefixLen + 2);
      for (const ann of step.annotations) {
        const color = TYPE_COLORS[ann.type];
        const icon = TYPE_ICONS[ann.type];
        allRows.push({
          text: `${annIndent}${RED}\u2502${RESET} ${color}${icon} ${ann.text}${RESET}`,
          stepIndex: i,
        });
      }
    }

    // Body lines (content lines after the first)
    const contentLines = step.content.split("\n");
    if (contentLines.length > 1) {
      const bodyIndent = " ".repeat(prefixLen + 2);
      for (let j = 1; j < contentLines.length; j++) {
        const line = contentLines[j];
        if (line.trim()) {
          // Wrap long body lines too
          const bodyAvail = width - prefixLen - 2;
          const bodyChunks = breakIntoLines(line.trim(), bodyAvail, bodyAvail);
          for (const chunk of bodyChunks) {
            allRows.push({
              text: `${bodyIndent}${GRAY}${chunk}${RESET}`,
              stepIndex: i,
            });
          }
        }
      }
    }

    stepRowCount.push(allRows.length - startLen);
  }

  return { rows: allRows, stepStartRow, stepRowCount };
}

// ── Rendering ───────────────────────────────────────────────────────

function render(state: AppState): void {
  const { cols, rows: termRows } = getTermSize();

  const footerLines = state.isAnnotating ? FOOTER_ANNOTATING_LINES : FOOTER_IDLE_LINES;
  const viewportRows = termRows - HEADER_LINES - footerLines;
  if (viewportRows <= 0) return;

  const { rows: allRows, stepStartRow, stepRowCount } = computeRows(state, cols);
  const totalRenderedRows = allRows.length;

  // Ensure active step is visible
  const activeStart = stepStartRow[state.activeIndex];
  const activeEnd = activeStart + stepRowCount[state.activeIndex];

  let scroll = state.scrollOffset;
  if (activeStart < scroll) scroll = activeStart;
  if (activeEnd > scroll + viewportRows) scroll = activeEnd - viewportRows;
  scroll = Math.max(0, Math.min(scroll, Math.max(0, totalRenderedRows - viewportRows)));
  state.scrollOffset = scroll;

  // Count steps above/below viewport
  let aboveCount = 0;
  let belowCount = 0;
  for (let i = 0; i < stepStartRow.length; i++) {
    if (stepStartRow[i] + stepRowCount[i] <= scroll) aboveCount++;
    if (stepStartRow[i] >= scroll + viewportRows) belowCount++;
  }

  // Plan title for header
  const planTitle = state.steps[0]?.content?.split("\n")[0]?.replace(/^#+\s*/, "") ?? "";
  const maxTitleLen = cols - 4;
  const titlePreview = planTitle.length > maxTitleLen
    ? planTitle.slice(0, maxTitleLen - 1) + "\u2026"
    : planTitle;

  // ── Build frame buffer ──
  const buf: string[] = [];

  // Header
  buf.push(moveTo(0, 0) + clearLine() + ` ${RED}${BOLD}\u258C redline${RESET}${GRAY} \u2014 plan review${RESET}`);
  buf.push(moveTo(1, 0) + clearLine() + ` ${GRAY}${titlePreview}${RESET}`);
  buf.push(moveTo(2, 0) + clearLine() + DIM + "\u2500".repeat(cols) + RESET);

  // Content viewport
  for (let vRow = 0; vRow < viewportRows; vRow++) {
    const srcRow = scroll + vRow;
    const screenRow = HEADER_LINES + vRow;
    buf.push(moveTo(screenRow, 0) + clearLine());
    if (srcRow < totalRenderedRows) {
      buf.push(allRows[srcRow].text);
    }
  }

  // Footer area
  const footerStartRow = termRows - footerLines;

  if (state.isAnnotating) {
    const selectedCount = getSelectedIndices(state).length;
    const color = TYPE_COLORS[state.annotationType];
    const icon = TYPE_ICONS[state.annotationType];
    const label = TYPE_LABELS[state.annotationType];
    const target = selectedCount > 1
      ? ` (${selectedCount} steps)`
      : ` on step ${state.activeIndex + 1}`;

    buf.push(
      moveTo(footerStartRow, 0) + clearLine() +
      `${color}${BOLD} ${icon} ${label}${target}${RESET}`
    );
    buf.push(
      moveTo(footerStartRow + 1, 0) + clearLine() +
      ` ${WHITE}${state.inputValue}${RESET}`
    );
    buf.push(
      moveTo(footerStartRow + 2, 0) + clearLine() +
      ` ${GRAY}Enter${RESET} save   ${GRAY}Esc${RESET} cancel`
    );
  } else {
    const totalAnnotations = state.steps.reduce((sum, s) => sum + s.annotations.length, 0);
    const selectedCount = getSelectedIndices(state).length;
    const enterLabel = totalAnnotations > 0 ? "send feedback" : "approve";

    // Status line
    let statusLine = ` ${GRAY}Step ${state.activeIndex + 1}/${state.steps.length}${RESET}`;
    if (selectedCount > 1) {
      statusLine += `  ${BLUE}${BOLD}${selectedCount} selected${RESET}`;
    }
    if (totalAnnotations > 0) {
      statusLine += `  ${RED}${BOLD}${totalAnnotations} annotation${totalAnnotations !== 1 ? "s" : ""}${RESET}`;
    }

    // Scroll indicators (right-aligned)
    const scrollHints: string[] = [];
    if (aboveCount > 0) scrollHints.push(`\u2191 ${aboveCount} above`);
    if (belowCount > 0) scrollHints.push(`\u2193 ${belowCount} below`);
    const scrollRight = scrollHints.length > 0
      ? `${DIM}${scrollHints.join("  ")}${RESET}`
      : "";

    buf.push(moveTo(footerStartRow, 0) + clearLine() + DIM + "\u2500".repeat(cols) + RESET);

    if (scrollRight) {
      const rightPlain = stripAnsi(scrollRight);
      buf.push(
        moveTo(footerStartRow + 1, 0) + clearLine() + statusLine +
        moveTo(footerStartRow + 1, cols - rightPlain.length - 1) + scrollRight
      );
    } else {
      buf.push(moveTo(footerStartRow + 1, 0) + clearLine() + statusLine);
    }

    buf.push(
      moveTo(footerStartRow + 2, 0) + clearLine() +
      ` ${BOLD}\u2191\u2193${RESET} navigate  ` +
      `${BLUE}${BOLD}Shift+\u2191\u2193${RESET} select  ` +
      `${YELLOW}${BOLD}c${RESET} comment  ` +
      `${CYAN}${BOLD}?${RESET} question  ` +
      `${RED}${BOLD}d${RESET} delete  ` +
      `${GREEN}${BOLD}r${RESET} replace`
    );
    buf.push(
      moveTo(footerStartRow + 3, 0) + clearLine() +
      ` ${BOLD}u${RESET} undo  ` +
      `${GREEN}${BOLD}Enter${RESET} ${enterLabel}  ` +
      `${GRAY}${BOLD}q${RESET} quit`
    );
  }

  // Single write — flicker-free
  process.stdout.write(buf.join(""));

  // Cursor: show at input position when annotating, hide otherwise
  if (state.isAnnotating) {
    const cursorCol = 1 + state.inputValue.length;
    process.stdout.write(moveTo(footerStartRow + 1, cursorCol) + CURSOR_SHOW);
  } else {
    process.stdout.write(CURSOR_HIDE);
  }
}

// ── Input handling ──────────────────────────────────────────────────

function setupInput(state: AppState, renderFn: () => void): void {
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  stdin.on("data", (data: string) => {
    if (state.isAnnotating) {
      handleAnnotationInput(state, data, renderFn);
    } else {
      handleNavigationInput(state, data, renderFn);
    }
  });
}

function handleAnnotationInput(state: AppState, data: string, renderFn: () => void): void {
  // Escape — cancel annotation
  if (data === "\x1b" || data === "\x1b\x1b") {
    state.isAnnotating = false;
    state.inputValue = "";
    renderFn();
    return;
  }

  // Enter — commit annotation
  if (data === "\r" || data === "\n") {
    commitAnnotation(state);
    renderFn();
    return;
  }

  // Backspace
  if (data === "\x7f" || data === "\x08") {
    if (state.inputValue.length > 0) {
      state.inputValue = state.inputValue.slice(0, -1);
      renderFn();
    }
    return;
  }

  // Ctrl-C — quit
  if (data === "\x03") {
    handleQuit();
    return;
  }

  // Ignore escape sequences and control characters
  if (data.startsWith("\x1b[") || data.charCodeAt(0) < 32) {
    return;
  }

  // Printable characters
  state.inputValue += data;
  renderFn();
}

function handleNavigationInput(state: AppState, data: string, renderFn: () => void): void {
  // Ctrl-C — always quit
  if (data === "\x03") {
    handleQuit();
    return;
  }

  // Shift+Up — extend selection
  if (data === "\x1b[1;2A") {
    if (state.selectionAnchor === null) state.selectionAnchor = state.activeIndex;
    state.activeIndex = Math.max(0, state.activeIndex - 1);
    renderFn();
    return;
  }

  // Shift+Down — extend selection
  if (data === "\x1b[1;2B") {
    if (state.selectionAnchor === null) state.selectionAnchor = state.activeIndex;
    state.activeIndex = Math.min(state.steps.length - 1, state.activeIndex + 1);
    renderFn();
    return;
  }

  // Up arrow / k — navigate up
  if (data === "\x1b[A" || data === "k") {
    state.selectionAnchor = null;
    state.activeIndex = Math.max(0, state.activeIndex - 1);
    renderFn();
    return;
  }

  // Down arrow / j — navigate down
  if (data === "\x1b[B" || data === "j") {
    state.selectionAnchor = null;
    state.activeIndex = Math.min(state.steps.length - 1, state.activeIndex + 1);
    renderFn();
    return;
  }

  // Page Up
  if (data === "\x1b[5~") {
    const { rows } = getTermSize();
    const footerLines = state.isAnnotating ? FOOTER_ANNOTATING_LINES : FOOTER_IDLE_LINES;
    const jump = rows - HEADER_LINES - footerLines - 1;
    state.selectionAnchor = null;
    state.activeIndex = Math.max(0, state.activeIndex - jump);
    renderFn();
    return;
  }

  // Page Down
  if (data === "\x1b[6~") {
    const { rows } = getTermSize();
    const footerLines = state.isAnnotating ? FOOTER_ANNOTATING_LINES : FOOTER_IDLE_LINES;
    const jump = rows - HEADER_LINES - footerLines - 1;
    state.selectionAnchor = null;
    state.activeIndex = Math.min(state.steps.length - 1, state.activeIndex + jump);
    renderFn();
    return;
  }

  // g — go to top
  if (data === "g") {
    state.selectionAnchor = null;
    state.activeIndex = 0;
    renderFn();
    return;
  }

  // G — go to bottom
  if (data === "G") {
    state.selectionAnchor = null;
    state.activeIndex = state.steps.length - 1;
    renderFn();
    return;
  }

  // Escape — clear selection
  if (data === "\x1b") {
    state.selectionAnchor = null;
    renderFn();
    return;
  }

  // Annotation triggers
  if (data === "c") {
    startAnnotation(state, "comment");
    renderFn();
    return;
  }
  if (data === "?") {
    startAnnotation(state, "question");
    renderFn();
    return;
  }
  if (data === "d") {
    toggleDelete(state);
    renderFn();
    return;
  }
  if (data === "r") {
    startAnnotation(state, "replace");
    renderFn();
    return;
  }

  // u — undo last annotation
  if (data === "u") {
    undoLastAnnotation(state);
    renderFn();
    return;
  }

  // Enter — submit
  if (data === "\r" || data === "\n") {
    handleSubmit(state);
    return;
  }

  // q — quit
  if (data === "q") {
    handleQuit();
    return;
  }
}

// ── Annotation logic ────────────────────────────────────────────────

function startAnnotation(state: AppState, type: Annotation["type"]): void {
  state.annotationType = type;
  state.isAnnotating = true;
  state.inputValue = "";
}

function commitAnnotation(state: AppState): void {
  const text = state.inputValue.trim();
  if (!text && state.annotationType !== "delete") {
    state.isAnnotating = false;
    state.inputValue = "";
    return;
  }

  const selectedIndices = getSelectedIndices(state);
  const annotation: Annotation = {
    id: makeId(),
    type: state.annotationType,
    text: text || "Remove this step",
    replacement: state.annotationType === "replace" ? text : undefined,
  };

  for (const idx of selectedIndices) {
    state.steps[idx] = {
      ...state.steps[idx],
      annotations: [...state.steps[idx].annotations, annotation],
    };
  }

  state.isAnnotating = false;
  state.inputValue = "";
  state.selectionAnchor = null;
}

function toggleDelete(state: AppState): void {
  const selectedIndices = getSelectedIndices(state);
  for (const idx of selectedIndices) {
    const step = state.steps[idx];
    const hasDelete = step.annotations.some((a) => a.type === "delete");
    if (hasDelete) {
      state.steps[idx] = {
        ...step,
        annotations: step.annotations.filter((a) => a.type !== "delete"),
      };
    } else {
      state.steps[idx] = {
        ...step,
        annotations: [
          ...step.annotations,
          { id: makeId(), type: "delete", text: "Remove this step" },
        ],
      };
    }
  }
  state.selectionAnchor = null;
}

function undoLastAnnotation(state: AppState): void {
  const selectedIndices = getSelectedIndices(state);
  for (const idx of selectedIndices) {
    const step = state.steps[idx];
    state.steps[idx] = {
      ...step,
      annotations: step.annotations.slice(0, -1),
    };
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────

function cleanup(): void {
  process.stdout.write(CURSOR_SHOW + ALT_SCREEN_OFF);
  if (process.stdin.isRaw) {
    process.stdin.setRawMode(false);
  }
}

function handleSubmit(state: AppState): void {
  const feedback = formatFeedback(state.steps);
  cleanup();
  if (feedback) {
    emitDeny(feedback);
  } else {
    emitApprove();
  }
  process.exit(0);
}

function handleQuit(): void {
  cleanup();
  process.exit(1);
}

// ── Entry point ─────────────────────────────────────────────────────

export function startApp(initialSteps: PlanStep[]): void {
  const state: AppState = {
    steps: initialSteps,
    activeIndex: 0,
    scrollOffset: 0,
    selectionAnchor: null,
    isAnnotating: false,
    annotationType: "comment",
    inputValue: "",
  };

  // Enter alternate screen, hide cursor, clear
  process.stdout.write(ALT_SCREEN_ON + CURSOR_HIDE + CLEAR_SCREEN);

  // Clean exit on signals
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
  process.on("uncaughtException", (err) => {
    cleanup();
    console.error(err);
    process.exit(1);
  });

  const renderFn = () => render(state);

  // Re-render on terminal resize
  process.stdout.on("resize", renderFn);

  // Initial render
  render(state);

  // Start listening for keys
  setupInput(state, renderFn);
}
