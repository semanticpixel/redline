import { wrapText } from "./layout/yoga.js";

export const MAX_ANNOTATION_INPUT_LENGTH = 2000;
export const MAX_VISIBLE_ANNOTATION_INPUT_LINES = 6;

const PROMPT_PREFIX = "> ";
const CONTINUATION_PREFIX = "  ";
const CURSOR = "█";

export function appendAnnotationInput(current: string, addition: string): string {
  if (!addition || current.length >= MAX_ANNOTATION_INPUT_LENGTH) {
    return current;
  }
  return `${current}${addition}`.slice(0, MAX_ANNOTATION_INPUT_LENGTH);
}

export function appendAnnotationNewline(current: string): string {
  return appendAnnotationInput(current, "\n");
}

export function visibleAnnotationInputLineLimit(terminalRows: number, reservedRows: number): number {
  const available = terminalRows - reservedRows;
  return Math.max(1, Math.min(MAX_VISIBLE_ANNOTATION_INPUT_LINES, available));
}

export function buildAnnotationInputDisplay(
  value: string,
  width: number,
  maxVisibleLines: number,
): { text: string; visibleLineCount: number; totalLineCount: number } {
  const inputWidth = Math.max(1, width - PROMPT_PREFIX.length);
  const wrappedLines = wrapText(`${value}${CURSOR}`, inputWidth);
  const lineLimit = Math.max(1, maxVisibleLines);
  const visibleLines = wrappedLines.slice(-lineLimit);
  const prefixedLines = visibleLines.map((line, index) =>
    `${index === 0 ? PROMPT_PREFIX : CONTINUATION_PREFIX}${line}`,
  );

  return {
    text: prefixedLines.join("\n"),
    visibleLineCount: prefixedLines.length,
    totalLineCount: wrappedLines.length,
  };
}
