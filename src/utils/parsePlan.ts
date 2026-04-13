import type { Annotation, AnnotationTarget, PlanStep } from "../types.js";

type SourceLine = {
  text: string;
  start: number;
};

/**
 * Parse a markdown plan into discrete, annotatable steps.
 *
 * Strategy: split on headings and top-level list items so each
 * "step" in the plan is independently addressable.
 */
export function parsePlan(markdown: string): PlanStep[] {
  const steps: PlanStep[] = [];
  const lineStarts = computeLineStarts(markdown);
  let currentLines: SourceLine[] = [];
  let currentDepth = 0;
  let id = 0;

  const flush = () => {
    if (currentLines.length === 0) {
      return;
    }

    const rawContent = currentLines.map((line) => line.text).join("\n");
    const content = rawContent.trim();
    if (content) {
      const rawStart = currentLines[0]!.start;
      const sourceStart = rawStart + leadingWhitespaceLength(rawContent);
      const sourceEnd = rawStart + rawContent.length - trailingWhitespaceLength(rawContent);
      const startPosition = offsetToLineColumn(lineStarts, sourceStart);
      steps.push({
        id: id++,
        content,
        sourceStart,
        sourceEnd,
        sourceStartLine: startPosition.line,
        sourceStartColumn: startPosition.column,
        depth: currentDepth,
        annotations: [],
      });
    }
    currentLines = [];
  };

  for (const line of splitSourceLines(markdown)) {
    // Match headings: # H1, ## H2, ### H3
    const headingMatch = line.text.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flush();
      currentDepth = headingMatch[1].length;
      currentLines.push(line);
      continue;
    }

    // Match top-level numbered list items: 1. Step one
    const numberedMatch = line.text.match(/^(\d+)\.\s+(.+)/);
    if (numberedMatch) {
      flush();
      currentDepth = 3;
      currentLines.push(line);
      continue;
    }

    // Match top-level bullet items (not indented sub-bullets)
    const bulletMatch = line.text.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      flush();
      currentDepth = 3;
      currentLines.push(line);
      continue;
    }

    // Continuation lines belong to the current block
    currentLines.push(line);
  }

  flush();
  return steps;
}

/**
 * Format annotations into structured feedback for Claude Code.
 * This becomes the "deny" message sent back through the hook.
 */
export function formatFeedback(steps: PlanStep[]): string {
  const annotatedSteps = steps.filter((s) => s.annotations.length > 0);

  if (annotatedSteps.length === 0) {
    return "";
  }

  const sections = annotatedSteps.map((step) => {
    const stepPreview = step.content.split("\n")[0].trim();
    const annotations = step.annotations
      .map((a) => formatAnnotation(a))
      .join("\n");

    return `On step: "${stepPreview}"\n${annotations}`;
  });

  return [
    "Plan feedback from redline review:",
    "",
    ...sections,
    "",
    "Please revise the plan addressing the above annotations, then present the updated plan.",
  ].join("\n");
}

function formatAnnotation(annotation: Annotation): string {
  if (!annotation.target || annotation.target.wholeStep) {
    return formatAnnotationBody(annotation, false);
  }

  return [
    formatTarget(annotation.target),
    formatAnnotationBody(annotation, true),
  ].join("\n");
}

function formatAnnotationBody(annotation: Annotation, targeted: boolean): string {
  switch (annotation.type) {
    case "comment":
      return `  💬 Comment: ${annotation.text}`;
    case "question":
      return `  ❓ Question: ${annotation.text}`;
    case "delete":
      return targeted
        ? `  🗑️  Remove selected range${annotation.text ? `: ${annotation.text}` : ""}`
        : `  🗑️  Remove this step${annotation.text ? `: ${annotation.text}` : ""}`;
    case "replace":
      return targeted
        ? `  ✏️  Replace selection with: ${annotation.replacement || annotation.text}`
        : `  ✏️  Replace with: ${annotation.replacement || annotation.text}`;
  }
}

function formatTarget(target: AnnotationTarget): string {
  const fence = markdownFence(target.excerpt);
  return [
    `  Target: chars [${target.range.start}, ${target.range.end}), lines ${target.lineStart}:${target.columnStart}-${target.lineEnd}:${target.columnEnd}`,
    "  Excerpt:",
    `  ${fence}markdown`,
    indentLines(target.excerpt, "  "),
    `  ${fence}`,
  ].join("\n");
}

function markdownFence(text: string): string {
  let maxRun = 0;
  for (const match of text.matchAll(/`+/g)) {
    maxRun = Math.max(maxRun, match[0].length);
  }
  return "`".repeat(Math.max(3, maxRun + 1));
}

function indentLines(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function splitSourceLines(markdown: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let offset = 0;

  while (offset <= markdown.length) {
    const newlineIndex = markdown.indexOf("\n", offset);
    const end = newlineIndex === -1 ? markdown.length : newlineIndex;
    lines.push({
      text: markdown.slice(offset, end),
      start: offset,
    });

    if (newlineIndex === -1) {
      break;
    }
    offset = newlineIndex + 1;
  }

  return lines;
}

function computeLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function offsetToLineColumn(
  lineStarts: number[],
  offset: number,
): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const start = lineStarts[middle]!;
    const next = lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY;
    if (offset < start) {
      high = middle - 1;
    } else if (offset >= next) {
      low = middle + 1;
    } else {
      return {
        line: middle + 1,
        column: offset - start + 1,
      };
    }
  }

  const lastStart = lineStarts[lineStarts.length - 1] ?? 0;
  return {
    line: lineStarts.length,
    column: Math.max(1, offset - lastStart + 1),
  };
}

function leadingWhitespaceLength(text: string): number {
  return text.length - text.trimStart().length;
}

function trailingWhitespaceLength(text: string): number {
  return text.length - text.trimEnd().length;
}
