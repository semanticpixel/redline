import blessed from "blessed";
import type { PlanStep, Annotation } from "../types.js";
import { formatFeedback } from "../utils/parsePlan.js";
import { emitApprove, emitDeny } from "../utils/hookIO.js";

// ── State ──────────────────────────────────────────────────────────

interface AppState {
  steps: PlanStep[];
  activeIndex: number;
  selectionAnchor: number | null;
  isAnnotating: boolean;
  annotationType: Annotation["type"];
  inputValue: string;
}

// ── Helpers ────────────────────────────────────────────────────────

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

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const TYPE_COLORS: Record<Annotation["type"], string> = {
  comment: "yellow",
  question: "cyan",
  delete: "red",
  replace: "green",
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

// ── Main ───────────────────────────────────────────────────────────

export function startApp(initialSteps: PlanStep[]): void {
  const state: AppState = {
    steps: initialSteps,
    activeIndex: 0,
    selectionAnchor: null,
    isAnnotating: false,
    annotationType: "comment",
    inputValue: "",
  };

  // ── Screen ─────────────────────────────────────────────────────

  const screen = blessed.screen({
    terminal: "xterm-256color",
    fullUnicode: true,
    warnings: false,
  });

  // ── Header (pinned top) ────────────────────────────────────────

  const planTitle = state.steps[0]?.content?.split("\n")[0]?.replace(/^#+\s*/, "") ?? "";
  const titlePreview = planTitle.length > 70 ? planTitle.slice(0, 70) + "\u2026" : planTitle;

  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 4,
    tags: true,
    content:
      " {red-fg}{bold}\u258C redline{/bold}{/red-fg}{gray-fg} \u2014 plan review{/gray-fg}\n" +
      ` {gray-fg}${titlePreview}{/gray-fg}\n` +
      " {gray-fg}" + "\u2500".repeat(60) + "{/gray-fg}",
    style: { bg: "black" },
  });

  // ── Footer (pinned bottom) ─────────────────────────────────────

  const footer = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 5,
    tags: true,
    style: { bg: "black" },
  });

  // ── Annotation input panel (bordered, above footer) ─────────────

  const inputPanel = blessed.box({
    parent: screen,
    bottom: 5,
    left: 0,
    width: "100%",
    height: 3,
    border: { type: "line" },
    tags: true,
    hidden: true,
    style: {
      bg: "black",
      fg: "white",
      border: { fg: "gray" },
      label: { fg: "white", bold: true },
    },
  });

  const inputBox = blessed.textbox({
    parent: inputPanel,
    top: 0,
    left: 0,
    width: "100%-2",
    height: 1,
    inputOnFocus: true,
    style: {
      bg: "black",
      fg: "white",
    },
  });

  // ── Scrollable list area ───────────────────────────────────────

  const stepList = blessed.list({
    parent: screen,
    top: 4,
    left: 0,
    width: "100%",
    bottom: 5,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { style: { bg: "gray" } },
    tags: true,
    mouse: true,
    keys: false,
    style: {
      bg: "black",
      // Make the list's built-in selection highlight invisible —
      // we handle all styling ourselves via tags.
      selected: { bg: "black" },
    },
  });

  // ── Rendering ──────────────────────────────────────────────────

  // Maps step index → the list item index where that step's title line lives.
  let stepToItemIndex: number[] = [];

  function renderList() {
    const items: string[] = [];
    const offsets: number[] = [];
    const totalSteps = state.steps.length;
    const gutterWidth = String(totalSteps).length;

    for (let i = 0; i < totalSteps; i++) {
      // Record which item index this step starts at
      offsets.push(items.length);

      const step = state.steps[i];
      const active = i === state.activeIndex;
      const selected = isSelected(state, i);
      const highlighted = active || selected;
      const hasAnnotations = step.annotations.length > 0;
      const isDeleted = step.annotations.some((a) => a.type === "delete");

      const firstLine = step.content.split("\n")[0];
      const isHeading = /^#{1,6}\s/.test(firstLine);

      // Selection bar
      const selBar = selected && !active ? "{blue-fg}{bold}\u2503 {/bold}{/blue-fg}" : "  ";

      // Gutter
      const gutter = String(i + 1).padStart(gutterWidth, " ");
      const gutterColor = highlighted ? "yellow" : "gray";

      // Pointer
      const pointer = active ? "{red-fg}{bold}\u25B8{/bold}{/red-fg}" : " ";

      // Step text styling
      let titleTag: string;
      if (isDeleted) {
        titleTag = "{red-fg}";
      } else if (highlighted && isHeading) {
        titleTag = "{white-fg}{bold}";
      } else if (highlighted) {
        titleTag = "{white-fg}{bold}";
      } else if (isHeading) {
        titleTag = "{cyan-fg}";
      } else {
        titleTag = "{gray-fg}";
      }
      const titleEnd = "{/}";

      // Selection highlight background
      const bgOpen = selected && !active ? "{blue-bg}" : "";
      const bgClose = selected && !active ? "{/blue-bg}" : "";

      // Annotation badge
      const badge = hasAnnotations
        ? ` {red-fg}{bold}[${step.annotations.length}]{/bold}{/red-fg}`
        : "";

      items.push(
        `${selBar}{${gutterColor}-fg}${gutter}{/${gutterColor}-fg} ${pointer} ${bgOpen}${titleTag}${escapeBlessed(firstLine)}${titleEnd}${bgClose}${badge}`
      );

      // Show inline annotations when active
      if (active && hasAnnotations) {
        for (const ann of step.annotations) {
          const color = TYPE_COLORS[ann.type];
          const icon = TYPE_ICONS[ann.type];
          items.push(
            `      {red-fg}\u2502{/red-fg} {${color}-fg}${icon} ${escapeBlessed(ann.text)}{/${color}-fg}`
          );
        }
      }

      // Multi-line content (body lines after the first)
      const contentLines = step.content.split("\n");
      if (contentLines.length > 1) {
        for (let j = 1; j < contentLines.length; j++) {
          const line = contentLines[j];
          if (line.trim()) {
            items.push(`        {gray-fg}${escapeBlessed(line)}{/gray-fg}`);
          }
        }
      }
    }

    stepToItemIndex = offsets;
    stepList.setItems(items);
    // select() is called in render() after dimensions are finalized
  }

  function renderFooter() {
    if (state.isAnnotating) {
      const selectedCount = getSelectedIndices(state).length;
      const color = TYPE_COLORS[state.annotationType];
      const icon = TYPE_ICONS[state.annotationType];
      const label = TYPE_LABELS[state.annotationType];
      const multi = selectedCount > 1
        ? ` (${selectedCount} steps)`
        : ` on step ${state.activeIndex + 1}`;

      // Bordered input panel label
      (inputPanel as any).setLabel(` ${icon} ${label}${multi} `);
      (inputPanel.style.border as any).fg = color;
      inputPanel.show();

      // Footer becomes a compact hint bar
      footer.setContent(
        ` {gray-fg}Enter{/gray-fg} save   {gray-fg}Esc{/gray-fg} cancel`
      );
      footer.height = 1;
      inputPanel.bottom = 1;
    } else {
      inputPanel.hide();

      const totalAnnotations = state.steps.reduce((sum, s) => sum + s.annotations.length, 0);
      const selectedCount = getSelectedIndices(state).length;

      let statusLine = ` {gray-fg}Step ${state.activeIndex + 1}/${state.steps.length}{/gray-fg}`;
      if (selectedCount > 1) {
        statusLine += `  {blue-fg}{bold}${selectedCount} selected{/bold}{/blue-fg}`;
      }
      if (totalAnnotations > 0) {
        statusLine += `  {red-fg}{bold}${totalAnnotations} annotation${totalAnnotations !== 1 ? "s" : ""}{/bold}{/red-fg}`;
      }

      const enterLabel = totalAnnotations > 0 ? "send feedback" : "approve";

      footer.setContent(
        " {gray-fg}" + "\u2500".repeat(60) + "{/gray-fg}\n" +
        statusLine + "\n" +
        ` {bold}\u2191\u2193{/bold} navigate  {blue-fg}{bold}Shift+\u2191\u2193{/bold}{/blue-fg} select  ` +
        `{yellow-fg}{bold}c{/bold}{/yellow-fg} comment  {cyan-fg}{bold}?{/bold}{/cyan-fg} question  ` +
        `{red-fg}{bold}d{/bold}{/red-fg} delete  {green-fg}{bold}r{/bold}{/green-fg} replace\n` +
        ` {bold}u{/bold} undo  {green-fg}{bold}Enter{/bold}{/green-fg} ${enterLabel}  {gray-fg}{bold}q{/bold}{/gray-fg} quit`
      );
      footer.height = 5;
    }
  }

  function render() {
    renderFooter();
    // Set list dimensions before select() so scroll math uses correct height
    const footerH = footer.height as number;
    stepList.bottom = state.isAnnotating ? footerH + 3 : footerH;
    renderList();
    // select() after setItems() + correct dimensions → blessed auto-scrolls
    stepList.select(stepToItemIndex[state.activeIndex] ?? 0);
    screen.render();
  }

  // ── Annotation logic ───────────────────────────────────────────

  function startAnnotation(type: Annotation["type"]) {
    state.annotationType = type;
    state.isAnnotating = true;
    state.inputValue = "";
    render();

    inputBox.setValue("");
    inputBox.focus();
    inputBox.readInput(() => {});
    screen.render();
  }

  function commitAnnotation(value: string) {
    const text = value.trim();
    if (!text && state.annotationType !== "delete") {
      state.isAnnotating = false;
      render();
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
    render();
  }

  function toggleDelete() {
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
    render();
  }

  function undoLastAnnotation() {
    const selectedIndices = getSelectedIndices(state);
    for (const idx of selectedIndices) {
      const step = state.steps[idx];
      state.steps[idx] = {
        ...step,
        annotations: step.annotations.slice(0, -1),
      };
    }
    render();
  }

  function destroyScreen() {
    try { screen.destroy(); } catch {}
  }

  function handleSubmit() {
    const feedback = formatFeedback(state.steps);
    if (feedback) {
      emitDeny(feedback);
    } else {
      emitApprove();
    }
    destroyScreen();
    process.exit(0);
  }

  function handleQuit() {
    destroyScreen();
    process.exit(1);
  }

  // ── Input box events ───────────────────────────────────────────

  inputBox.on("submit", (value: string) => {
    commitAnnotation(value);
  });

  inputBox.on("cancel", () => {
    state.isAnnotating = false;
    state.inputValue = "";
    render();
  });

  // ── Keyboard handling ──────────────────────────────────────────

  screen.on("keypress", (ch: string | null, key: any) => {
    if (state.isAnnotating) {
      // Input box handles its own keys; we only watch for escape
      // (blessed textbox emits 'cancel' on escape already)
      return;
    }

    const name = key?.name;
    const shift = key?.shift;

    // Shift+Arrow — extend/start selection
    if (shift && name === "up") {
      if (state.selectionAnchor === null) state.selectionAnchor = state.activeIndex;
      state.activeIndex = Math.max(0, state.activeIndex - 1);
      render();
      return;
    }
    if (shift && name === "down") {
      if (state.selectionAnchor === null) state.selectionAnchor = state.activeIndex;
      state.activeIndex = Math.min(state.steps.length - 1, state.activeIndex + 1);
      render();
      return;
    }

    // Regular navigation — clears selection
    if (name === "up" || ch === "k") {
      state.selectionAnchor = null;
      state.activeIndex = Math.max(0, state.activeIndex - 1);
      render();
      return;
    }
    if (name === "down" || ch === "j") {
      state.selectionAnchor = null;
      state.activeIndex = Math.min(state.steps.length - 1, state.activeIndex + 1);
      render();
      return;
    }

    // Escape clears selection
    if (name === "escape") {
      state.selectionAnchor = null;
      render();
      return;
    }

    // Annotation triggers
    if (ch === "c") {
      startAnnotation("comment");
      return;
    }
    if (ch === "?") {
      startAnnotation("question");
      return;
    }
    if (ch === "d") {
      toggleDelete();
      return;
    }
    if (ch === "r") {
      startAnnotation("replace");
      return;
    }

    // Undo
    if (ch === "u") {
      undoLastAnnotation();
      return;
    }

    // Submit
    if (name === "enter") {
      handleSubmit();
      return;
    }

    // Quit
    if (ch === "q") {
      handleQuit();
      return;
    }
  });

  // Ctrl-C always quits
  screen.key(["C-c"], () => handleQuit());

  // ── Initial render ─────────────────────────────────────────────
  render();
}

/** Escape blessed tag-like sequences in user content */
function escapeBlessed(text: string): string {
  return text.replace(/\{/g, "\\{");
}
