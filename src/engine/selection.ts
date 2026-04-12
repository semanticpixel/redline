import type { RowLayout } from "./renderTypes.js";

export type RowSelection = {
  anchor: number;
  focus: number;
};

export function normalizeRowSelection(selection: RowSelection): { start: number; end: number } {
  return {
    start: Math.min(selection.anchor, selection.focus),
    end: Math.max(selection.anchor, selection.focus),
  };
}

export function resolveSelectedStepIndices(
  rowLayout: RowLayout,
  selection: RowSelection | null,
): number[] {
  if (!selection) {
    return [];
  }

  const { start, end } = normalizeRowSelection(selection);
  const selected = new Set<number>();

  for (let rowIndex = Math.max(0, start); rowIndex <= end && rowIndex < rowLayout.rows.length; rowIndex++) {
    const stepIndex = rowLayout.rows[rowIndex]?.stepIndex;
    if (stepIndex !== undefined) {
      selected.add(stepIndex);
    }
  }

  return [...selected].sort((left, right) => left - right);
}
