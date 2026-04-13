import type { SourceRange } from "../types.js";
import type { RenderedRow, RowLayout, SourceSpan } from "./renderTypes.js";

export type SelectionPoint = {
  row: number;
  column: number;
};

export type PointSelection = {
  anchor: SelectionPoint;
  focus: SelectionPoint;
};

export type SelectedSourceRange = {
  stepIndex: number;
  range: SourceRange;
  wholeStep: boolean;
};

type SourceCell = {
  row: number;
  column: number;
  stepIndex: number;
  span: SourceSpan;
};

export function normalizePointSelection(
  selection: PointSelection,
): { start: SelectionPoint; end: SelectionPoint } {
  return comparePoints(selection.anchor, selection.focus) <= 0
    ? { start: selection.anchor, end: selection.focus }
    : { start: selection.focus, end: selection.anchor };
}

export function extendPointSelection(
  selection: PointSelection | null,
  focus: SelectionPoint,
): PointSelection {
  return selection ? { ...selection, focus } : { anchor: focus, focus };
}

export function resolveSelectedSourceRanges(
  rowLayout: RowLayout,
  selection: PointSelection | null,
): SelectedSourceRange[] {
  if (!selection) {
    return [];
  }

  const normalized = normalizePointSelection({
    anchor: snapPointToSelectableCell(rowLayout, selection.anchor),
    focus: snapPointToSelectableCell(rowLayout, selection.focus),
  });
  const selectedByStep = new Map<number, SourceRange>();
  const selectableBoundsByStep = sourceBoundsByStep(rowLayout);

  for (let rowIndex = Math.max(0, normalized.start.row); rowIndex <= normalized.end.row && rowIndex < rowLayout.rows.length; rowIndex++) {
    const row = rowLayout.rows[rowIndex];
    if (!row || row.role !== "content") {
      continue;
    }

    const startColumn = rowIndex === normalized.start.row ? normalized.start.column : 0;
    const endColumn = rowIndex === normalized.end.row ? normalized.end.column : Number.POSITIVE_INFINITY;

    for (const cell of sourceCellsForRow(row, rowIndex)) {
      if (cell.column < startColumn || cell.column > endColumn) {
        continue;
      }

      const existing = selectedByStep.get(cell.stepIndex);
      if (!existing) {
        selectedByStep.set(cell.stepIndex, { ...cell.span });
        continue;
      }
      existing.start = Math.min(existing.start, cell.span.start);
      existing.end = Math.max(existing.end, cell.span.end);
    }
  }

  return [...selectedByStep.entries()]
    .map(([stepIndex, range]) => {
      const bounds = selectableBoundsByStep.get(stepIndex);
      return {
        stepIndex,
        range,
        wholeStep: Boolean(bounds && range.start <= bounds.start && range.end >= bounds.end),
      };
    })
    .filter((selectionRange) => selectionRange.range.start < selectionRange.range.end)
    .sort((left, right) =>
      left.stepIndex === right.stepIndex
        ? left.range.start - right.range.start
        : left.stepIndex - right.stepIndex,
    );
}

export function resolveSelectedStepIndices(
  rowLayout: RowLayout,
  selection: PointSelection | null,
): number[] {
  return resolveSelectedSourceRanges(rowLayout, selection).map((range) => range.stepIndex);
}

function snapPointToSelectableCell(rowLayout: RowLayout, point: SelectionPoint): SelectionPoint {
  const row = rowLayout.rows[point.row];
  if (!row || row.role !== "content") {
    return point;
  }

  const cells = sourceCellsForRow(row, point.row);
  if (cells.length === 0) {
    return point;
  }

  const first = cells[0]!;
  const last = cells[cells.length - 1]!;
  if (point.column <= first.column) {
    return { row: point.row, column: first.column };
  }
  if (point.column >= last.column) {
    return { row: point.row, column: last.column };
  }
  return point;
}

function sourceCellsForRow(row: RenderedRow, rowIndex: number): SourceCell[] {
  if (row.stepIndex === undefined) {
    return [];
  }

  const cells: SourceCell[] = [];
  let column = 0;
  for (const segment of row.segments) {
    for (let index = 0; index < segment.text.length; index++) {
      const span = segment.sourceMap?.[index] ?? null;
      if (span) {
        cells.push({
          row: rowIndex,
          column,
          stepIndex: row.stepIndex,
          span,
        });
      }
      column += 1;
    }
  }
  return cells;
}

function sourceBoundsByStep(rowLayout: RowLayout): Map<number, SourceRange> {
  const bounds = new Map<number, SourceRange>();
  rowLayout.rows.forEach((row, rowIndex) => {
    if (row.role !== "content") {
      return;
    }
    for (const cell of sourceCellsForRow(row, rowIndex)) {
      const existing = bounds.get(cell.stepIndex);
      if (!existing) {
        bounds.set(cell.stepIndex, { ...cell.span });
        continue;
      }
      existing.start = Math.min(existing.start, cell.span.start);
      existing.end = Math.max(existing.end, cell.span.end);
    }
  });
  return bounds;
}

function comparePoints(left: SelectionPoint, right: SelectionPoint): number {
  if (left.row !== right.row) {
    return left.row - right.row;
  }
  return left.column - right.column;
}
