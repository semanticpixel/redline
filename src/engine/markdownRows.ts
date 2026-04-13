import { lexer, type Token, type Tokens } from "marked";
import type { Annotation, PlanStep, SourceRange } from "../types.js";
import type { RenderedRow, RowLayout, Segment, SourceSpan } from "./renderTypes.js";

type LogicalRow = {
  segments: Segment[];
  blank?: boolean;
  hangingIndent?: number;
  preserveIndent?: boolean;
  preserveWhitespace?: boolean;
};

type StepRenderState = {
  active: boolean;
  selected: boolean;
  highlighted: boolean;
  backgroundColor?: Segment["backgroundColor"];
  hasDelete: boolean;
  annotationColor?: Segment["color"];
  selectedSourceRanges: SourceRange[];
};

type InlineStyle = Omit<Segment, "text" | "sourceMap">;
type AnnotationBadge = {
  text: string;
  color: Segment["color"];
};

type ComputeMarkdownRowsOptions = {
  selectedStepIndices?: Iterable<number>;
  selectedSourceRanges?: Iterable<SourceRange>;
};

const TYPE_COLORS: Record<Annotation["type"], "yellow" | "cyan" | "red" | "green"> = {
  comment: "yellow",
  question: "cyan",
  delete: "red",
  replace: "green",
};

const TYPE_ICONS: Record<Annotation["type"], string> = {
  comment: "💬",
  question: "❓",
  delete: "🗑️",
  replace: "✏️",
};

const ANNOTATION_TYPE_PRIORITY: Annotation["type"][] = ["delete", "replace", "question", "comment"];

export function computeMarkdownRows(
  steps: PlanStep[],
  activeIndex: number | null,
  selectionAnchor: number | null,
  width: number,
  options: ComputeMarkdownRowsOptions = {},
): RowLayout {
  const rows: RenderedRow[] = [];
  const stepStartRow: number[] = [];
  const stepRowCount: number[] = [];
  const totalSteps = steps.length;
  const gutterWidth = String(totalSteps).length;
  const selectedStepIndices = new Set(options.selectedStepIndices ?? []);
  const selectedSourceRanges = [...options.selectedSourceRanges ?? []];
  const hasSourceSelection = selectedSourceRanges.length > 0;

  for (let index = 0; index < totalSteps; index++) {
    const step = steps[index]!;
    const active = activeIndex !== null && index === activeIndex;
    const selected = selectedStepIndices.size > 0
      ? selectedStepIndices.has(index)
      : isSelected(index, activeIndex, selectionAnchor);
    const annotationType = prioritizedAnnotationType(step.annotations);
    const state: StepRenderState = {
      active,
      selected,
      highlighted: active || selected,
      backgroundColor: selected && !active && !hasSourceSelection ? "gray" : undefined,
      hasDelete: annotationType === "delete",
      annotationColor: annotationType ? TYPE_COLORS[annotationType] : undefined,
      selectedSourceRanges,
    };
    const prefixLength = 2 + gutterWidth + 1 + 2;
    const prefixPadding = " ".repeat(prefixLength);
    const availableWidth = Math.max(1, width - prefixLength);
    const firstLineBadge = annotationBadge(step.annotations);
    const logicalRows = renderStepMarkdown(step, state);

    if (index > 0 && startsWithHeading(step)) {
      addBlankRenderedRow(rows, `step-${step.id}-section-spacer`);
    }

    stepStartRow.push(rows.length);
    const startLength = rows.length;

    addLogicalRows({
      rows,
      logicalRows,
      step,
      index,
      state,
      gutterWidth,
      prefixPadding,
      availableWidth,
      firstLineBadge,
      stepIndex: index,
    });

    addAnnotationRows({
      rows,
      step,
      state,
      prefixPadding,
      width,
      prefixLength,
      stepIndex: index,
    });

    stepRowCount.push(Math.max(1, rows.length - startLength));
  }

  return {
    rows,
    stepStartRow,
    stepRowCount,
  };
}

function addLogicalRows({
  rows,
  logicalRows,
  step,
  index,
  state,
  gutterWidth,
  prefixPadding,
  availableWidth,
  firstLineBadge,
  stepIndex,
}: {
  rows: RenderedRow[];
  logicalRows: LogicalRow[];
  step: PlanStep;
  index: number;
  state: StepRenderState;
  gutterWidth: number;
  prefixPadding: string;
  availableWidth: number;
  firstLineBadge: AnnotationBadge | null;
  stepIndex: number;
}): void {
  const contentRows = logicalRows.length > 0 ? logicalRows : [plainTextRow(step.content, bodyStyle(state))];
  let paintedAnyRow = false;

  contentRows.forEach((logicalRow, logicalRowIndex) => {
    const badge = !paintedAnyRow ? firstLineBadge : null;
    const wrappedRows = logicalRow.blank
      ? [{ segments: [{ text: " " }], blank: true }]
      : logicalRow.preserveWhitespace
        ? wrapSegmentsPreservingWhitespace(
            logicalRow.segments,
            Math.max(1, availableWidth - (badge?.text.length ?? 0)),
            logicalRow.hangingIndent ?? 0,
          )
        : wrapSegments(
            logicalRow.segments,
            Math.max(1, availableWidth - (badge?.text.length ?? 0)),
            logicalRow.hangingIndent ?? 0,
          );

    wrappedRows.forEach((wrappedRow, wrappedIndex) => {
      const isFirstStepRow = !paintedAnyRow;
      const segments: Segment[] = isFirstStepRow
        ? buildFirstPrefix(index, gutterWidth, state)
        : [{ text: prefixPadding }];

      segments.push(...wrappedRow.segments);

      if (isFirstStepRow && badge) {
        segments.push({
          text: badge.text,
          color: badge.color,
          backgroundColor: state.backgroundColor,
          bold: true,
        });
      }

      rows.push({
        key: `step-${step.id}-md-${logicalRowIndex}-${wrappedIndex}`,
        segments: applySourceSelectionToSegments(segments, state.selectedSourceRanges),
        stepIndex,
        role: "content",
      });
      paintedAnyRow = true;
    });
  });
}

function addAnnotationRows({
  rows,
  step,
  state,
  prefixPadding,
  width,
  prefixLength,
  stepIndex,
}: {
  rows: RenderedRow[];
  step: PlanStep;
  state: StepRenderState;
  prefixPadding: string;
  width: number;
  prefixLength: number;
  stepIndex: number;
}): void {
  step.annotations.forEach((annotation, annotationIndex) => {
    const wrapped = wrapSegments(
      [{ text: formatAnnotationInline(annotation), ...annotationStyle(annotation, state) }],
      Math.max(1, width - (prefixLength + 4)),
    );
    wrapped.forEach((chunk, chunkIndex) => {
      rows.push({
        key: `step-${step.id}-annotation-${annotationIndex}-${chunkIndex}`,
        stepIndex,
        role: "annotation",
        segments: [
          { text: `${prefixPadding}  ` },
          {
            text: chunkIndex === 0 ? "│ " : "  ",
            color: state.highlighted ? "red" : "gray",
            backgroundColor: state.backgroundColor,
            dim: !state.highlighted,
          },
          ...chunk.segments,
        ],
      });
    });
  });
}

function buildFirstPrefix(
  index: number,
  gutterWidth: number,
  state: StepRenderState,
): Segment[] {
  return [
    {
      text: state.annotationColor ? "┃ " : "  ",
      color: state.annotationColor,
      bold: Boolean(state.annotationColor),
    },
    {
      text: `${String(index + 1).padStart(gutterWidth, " ")} `,
      color: state.highlighted ? "yellow" : "gray",
      dim: !state.highlighted,
    },
    {
      text: state.active ? "▸ " : "  ",
      color: state.active ? "red" : undefined,
      bold: state.active,
    },
  ];
}

function addBlankRenderedRow(rows: RenderedRow[], key: string): void {
  if (rows[rows.length - 1]?.segments.every((segment) => segment.text.trim().length === 0)) {
    return;
  }
  rows.push({
    key,
    role: "spacer",
    segments: [{ text: " " }],
  });
}

function startsWithHeading(step: PlanStep): boolean {
  return /^#{1,6}\s+/.test(step.content.trimStart());
}

function renderStepMarkdown(step: PlanStep, state: StepRenderState): LogicalRow[] {
  const tokens = lexer(step.content, { gfm: true, breaks: false });
  return trimBlankEdges(coalesceBlankRows(renderBlocks(tokens, state, 0, step.sourceStart, step.content)));
}

function renderBlocks(
  tokens: Token[],
  state: StepRenderState,
  listDepth = 0,
  sourceStart = 0,
  sourceText = "",
): LogicalRow[] {
  const rows: LogicalRow[] = [];
  const meaningfulTokens = tokens.filter((token) => token.type !== "def");
  let cursor = 0;

  meaningfulTokens.forEach((token, index) => {
    const tokenPosition = locateRaw(token.raw ?? "", sourceText, cursor);
    const tokenSourceStart = sourceStart + tokenPosition.start;
    cursor = tokenPosition.end;
    const rendered = renderBlock(token, state, listDepth, tokenSourceStart);
    appendRows(rows, rendered);

    const currentIsSpace = token.type === "space";
    const next = meaningfulTokens[index + 1];
    if (!currentIsSpace && next && next.type !== "space") {
      pushBlank(rows);
    }
  });

  return rows;
}

function renderBlock(
  token: Token,
  state: StepRenderState,
  listDepth: number,
  sourceStart: number,
): LogicalRow[] {
  switch (token.type) {
    case "space":
      return [blankRow()];
    case "heading": {
      const heading = token as Tokens.Heading;
      return [
        {
          segments: renderInline(heading.tokens, headingStyle(state), heading.text, sourceStart, heading.raw),
        },
      ];
    }
    case "paragraph": {
      const paragraph = token as Tokens.Paragraph;
      return [
        {
          segments: renderInline(paragraph.tokens, bodyStyle(state), paragraph.text, sourceStart, paragraph.raw),
        },
      ];
    }
    case "text": {
      const text = token as Tokens.Text;
      return [
        {
          segments: text.tokens
            ? renderInline(text.tokens, bodyStyle(state), text.text, sourceStart, text.raw)
            : [sourceSegment(normalizeInlineText(text.text), text.raw, sourceStart, bodyStyle(state), true)],
        },
      ];
    }
    case "list":
      return renderList(token as Tokens.List, state, listDepth, sourceStart);
    case "code":
      return renderCode(token as Tokens.Code, state, sourceStart);
    case "blockquote":
      return renderBlockquote(token as Tokens.Blockquote, state, listDepth, sourceStart);
    case "hr":
      return [{ segments: [{ text: "─".repeat(12), ...bodyStyle(state) }] }];
    case "html":
      return [plainTextRow((token as Tokens.HTML).text || token.raw, codeStyle(state), sourceStart, token.raw)];
    case "table":
      return renderTable(token as Tokens.Table, state, sourceStart);
    default:
      return [plainTextRow(textFromUnknownToken(token), bodyStyle(state), sourceStart, token.raw ?? textFromUnknownToken(token))];
  }
}

function renderList(
  token: Tokens.List,
  state: StepRenderState,
  listDepth: number,
  sourceStart: number,
): LogicalRow[] {
  const rows: LogicalRow[] = [];
  const start = typeof token.start === "number" ? token.start : 1;
  let itemCursor = 0;

  token.items.forEach((item, itemIndex) => {
    const itemPosition = locateRaw(item.raw, token.raw, itemCursor);
    const itemSourceStart = sourceStart + itemPosition.start;
    itemCursor = itemPosition.end;
    const marker = token.ordered ? `${start + itemIndex}. ` : "- ";
    const prefix = `${"  ".repeat(listDepth)}${marker}`;
    const childRows = trimBlankEdges(renderListItem(item, state, listDepth, itemSourceStart));
    let firstContentRow = true;

    for (const row of childRows) {
      if (row.blank) {
        pushBlank(rows);
        continue;
      }

      if (row.preserveIndent) {
        rows.push(row);
        continue;
      }

      const indent = firstContentRow ? prefix : " ".repeat(prefix.length);
      rows.push({
        segments: [{ text: indent, ...bodyStyle(state) }, ...row.segments],
        hangingIndent: prefix.length,
        preserveIndent: true,
      });
      firstContentRow = false;
    }

    if (item.loose && itemIndex < token.items.length - 1) {
      pushBlank(rows);
    }
  });

  return rows;
}

function renderListItem(
  item: Tokens.ListItem,
  state: StepRenderState,
  listDepth: number,
  sourceStart: number,
): LogicalRow[] {
  const rows: LogicalRow[] = [];

  if (item.tokens.length === 0) {
    return [plainTextRow(item.text, bodyStyle(state), sourceStart, item.raw)];
  }

  let cursor = 0;
  item.tokens.forEach((token, index) => {
    const tokenPosition = locateRaw(token.raw ?? "", item.raw, cursor);
    const tokenSourceStart = sourceStart + tokenPosition.start;
    cursor = tokenPosition.end;
    if (token.type === "list") {
      appendRows(rows, renderList(token as Tokens.List, state, listDepth + 1, tokenSourceStart));
      return;
    }

    appendRows(rows, renderBlock(token, state, listDepth + 1, tokenSourceStart));
    const next = item.tokens[index + 1];
    if (item.loose && next && token.type !== "space" && next.type !== "space") {
      pushBlank(rows);
    }
  });

  return rows;
}

function renderCode(token: Tokens.Code, state: StepRenderState, sourceStart: number): LogicalRow[] {
  const lines = token.text.split("\n");
  const rows = lines.length > 0 ? lines : [""];
  const bodyOffset = token.raw.indexOf(token.text);
  let lineSourceStart = sourceStart + Math.max(0, bodyOffset);

  return rows.map((line) => {
    const displayLine = line.length > 0 ? line : " ";
    const row = {
      segments: highlightCodeLine(displayLine, token.lang, state, line.length > 0 ? lineSourceStart : null),
      preserveWhitespace: true,
    };
    lineSourceStart += line.length + 1;
    return row;
  });
}

function renderBlockquote(
  token: Tokens.Blockquote,
  state: StepRenderState,
  listDepth: number,
  sourceStart: number,
): LogicalRow[] {
  return renderBlocks(token.tokens, state, listDepth, sourceStart, token.raw).map((row) => {
    if (row.blank) {
      return row;
    }
    return {
      ...row,
      segments: [{ text: "│ ", ...blockquoteStyle(state) }, ...row.segments],
      hangingIndent: (row.hangingIndent ?? 0) + 2,
    };
  });
}

function renderTable(token: Tokens.Table, state: StepRenderState, sourceStart: number): LogicalRow[] {
  const rows: LogicalRow[] = [];
  const rawLines = token.raw.split("\n");
  rows.push({
    segments: tableCellsToSegments(token.header, state, sourceStart, rawLines[0] ?? ""),
  });
  for (const [index, row] of token.rows.entries()) {
    const rawLineIndex = index + 2;
    const rawLineStart = sourceStart + rawLines.slice(0, rawLineIndex).join("\n").length + (rawLineIndex > 0 ? 1 : 0);
    rows.push({
      segments: tableCellsToSegments(row, state, rawLineStart, rawLines[rawLineIndex] ?? ""),
    });
  }
  return rows;
}

function tableCellsToSegments(
  cells: Tokens.TableCell[],
  state: StepRenderState,
  rowSourceStart: number,
  rowText: string,
): Segment[] {
  const segments: Segment[] = [];
  const cellRanges = locateTableCells(cells, rowText);
  cells.forEach((cell, index) => {
    if (index > 0) {
      segments.push({ text: " | ", ...bodyStyle(state) });
    }
    const range = cellRanges[index] ?? { start: 0, end: rowText.length };
    segments.push(...renderInline(
      cell.tokens,
      bodyStyle(state),
      cell.text,
      rowSourceStart + range.start,
      rowText.slice(range.start, range.end),
    ));
  });
  return segments.length > 0 ? segments : [{ text: " ", ...bodyStyle(state) }];
}

function renderInline(
  tokens: Token[],
  style: InlineStyle,
  fallback = "",
  sourceStart = 0,
  sourceText = fallback,
): Segment[] {
  if (tokens.length === 0) {
    return [sourceSegment(normalizeInlineText(fallback), sourceText, sourceStart, style, true)];
  }

  const segments: Segment[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const raw = token.raw ?? textFromUnknownToken(token);
    const tokenPosition = locateRaw(raw, sourceText, cursor);
    const tokenSourceStart = sourceStart + tokenPosition.start;
    cursor = tokenPosition.end;
    switch (token.type) {
      case "text":
      case "escape":
        segments.push({
          ...sourceSegment(
            normalizeInlineText((token as Tokens.Text | Tokens.Escape).text),
            raw,
            tokenSourceStart,
            style,
            true,
          ),
          ...style,
        });
        break;
      case "strong": {
        const strong = token as Tokens.Strong;
        segments.push(...renderInline(strong.tokens, { ...style, bold: true }, strong.text, tokenSourceStart, strong.raw));
        break;
      }
      case "em": {
        const em = token as Tokens.Em;
        segments.push(...renderInline(em.tokens, style, em.text, tokenSourceStart, em.raw));
        break;
      }
      case "codespan": {
        const codespan = token as Tokens.Codespan;
        const textOffset = raw.indexOf(codespan.text);
        segments.push(sourceSegment(
          codespan.text,
          codespan.text,
          tokenSourceStart + Math.max(0, textOffset),
          {
            ...style,
            color: style.color === "red" ? style.color : "yellow",
          },
          false,
        ));
        break;
      }
      case "link": {
        const link = token as Tokens.Link;
        segments.push(...renderInline(link.tokens, style, link.text, tokenSourceStart, link.raw));
        break;
      }
      case "image":
        segments.push(sourceSegment((token as Tokens.Image).text, raw, tokenSourceStart, style, true));
        break;
      case "del": {
        const del = token as Tokens.Del;
        segments.push(...renderInline(del.tokens, style, del.text, tokenSourceStart, del.raw));
        break;
      }
      case "br":
        segments.push({ text: " ", ...style });
        break;
      case "html":
        segments.push(sourceSegment(normalizeInlineText((token as Tokens.HTML).text), raw, tokenSourceStart, style, true));
        break;
      default:
        segments.push(sourceSegment(normalizeInlineText(textFromUnknownToken(token)), raw, tokenSourceStart, style, true));
        break;
    }
  }

  return segments.filter((segment) => segment.text.length > 0);
}

function headingStyle(state: StepRenderState): InlineStyle {
  if (state.hasDelete) {
    return { color: "red", backgroundColor: state.backgroundColor, bold: true };
  }
  if (state.highlighted) {
    return { color: "white", backgroundColor: state.backgroundColor, bold: true };
  }
  return { color: "cyan", backgroundColor: state.backgroundColor, bold: true };
}

function bodyStyle(state: StepRenderState): InlineStyle {
  if (state.hasDelete) {
    return { color: "red", backgroundColor: state.backgroundColor };
  }
  if (state.highlighted) {
    return { color: "white", backgroundColor: state.backgroundColor };
  }
  return { color: "lightGray", backgroundColor: state.backgroundColor, dim: false };
}

function codeStyle(state: StepRenderState): InlineStyle {
  if (state.hasDelete) {
    return { color: "red", backgroundColor: state.backgroundColor };
  }
  if (state.highlighted) {
    return { color: "white", backgroundColor: state.backgroundColor };
  }
  return { color: "lightGray", backgroundColor: state.backgroundColor, dim: false };
}

function blockquoteStyle(state: StepRenderState): InlineStyle {
  if (state.hasDelete) {
    return { color: "red", backgroundColor: state.backgroundColor };
  }
  return { color: "gray", backgroundColor: state.backgroundColor, dim: false };
}

function annotationStyle(annotation: Annotation, state: StepRenderState): InlineStyle {
  return {
    color: TYPE_COLORS[annotation.type],
    backgroundColor: state.backgroundColor,
    dim: false,
  };
}

function annotationBadge(annotations: Annotation[]): AnnotationBadge | null {
  const type = prioritizedAnnotationType(annotations);

  if (!type) {
    return null;
  }

  return {
    text: ` [${annotations.length}]`,
    color: TYPE_COLORS[type],
  };
}

function prioritizedAnnotationType(annotations: Annotation[]): Annotation["type"] | null {
  if (annotations.length === 0) {
    return null;
  }

  return ANNOTATION_TYPE_PRIORITY.find((candidate) =>
    annotations.some((annotation) => annotation.type === candidate),
  ) ?? "comment";
}

function highlightCodeLine(
  line: string,
  language: string | undefined,
  state: StepRenderState,
  sourceStart: number | null,
): Segment[] {
  const base = codeStyle(state);
  if (state.hasDelete) {
    return [sourceStart === null ? { text: line, ...base } : sourceSegment(line, line, sourceStart, base, false)];
  }

  const segments: Segment[] = [];
  const tokenPattern =
    /(\/\/.*$|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[$A-Z_a-z][$\w-]*\b|[^\w"'`/]+|\/)/g;

  for (const match of line.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    const style = codeTokenStyle(token, line, index, language, base);
    segments.push(sourceStart === null ? { text: token, ...style } : sourceSegment(token, token, sourceStart + index, style, false));
  }

  return segments.length > 0 ? segments : [sourceStart === null ? { text: line, ...base } : sourceSegment(line, line, sourceStart, base, false)];
}

function codeTokenStyle(
  token: string,
  line: string,
  index: number,
  language: string | undefined,
  base: InlineStyle,
): InlineStyle {
  if (/^\/\//.test(token) || /^\/\*/.test(token)) {
    return { ...base, color: "gray" };
  }

  if (/^["'`]/.test(token)) {
    return { ...base, color: "green" };
  }

  if (/^\d/.test(token)) {
    return { ...base, color: "yellow" };
  }

  if (/^[$A-Z_a-z][$\w-]*$/.test(token)) {
    if (CODE_KEYWORDS.has(token)) {
      return { ...base, color: "cyan", bold: true };
    }

    if (isCssPropertyToken(token, line, index, language)) {
      return { ...base, color: "cyan" };
    }

    if (isObjectKeyToken(token, line, index)) {
      return { ...base, color: "blue" };
    }
  }

  return base;
}

function isCssPropertyToken(
  token: string,
  line: string,
  index: number,
  language: string | undefined,
): boolean {
  const normalized = (language ?? "").toLowerCase();
  if (!["css", "scss", "sass", "less"].includes(normalized)) {
    return false;
  }

  const afterToken = line.slice(index + token.length).trimStart();
  return afterToken.startsWith(":");
}

function isObjectKeyToken(token: string, line: string, index: number): boolean {
  const beforeToken = line.slice(0, index).trimEnd();
  const afterToken = line.slice(index + token.length).trimStart();
  return afterToken.startsWith(":") && !beforeToken.endsWith("?");
}

const CODE_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "interface",
  "let",
  "new",
  "null",
  "of",
  "return",
  "satisfies",
  "switch",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "var",
  "while",
]);

function wrapSegments(
  segments: Segment[],
  width: number,
  hangingIndent = 0,
): Array<{ segments: Segment[] }> {
  const safeWidth = Math.max(1, width);
  const rows: Segment[][] = [[]];
  let currentWidth = 0;
  let currentRow = rows[0]!;

  const startContinuationRow = () => {
    const indent = " ".repeat(Math.min(hangingIndent, Math.max(0, safeWidth - 1)));
    currentRow = indent ? [{ text: indent }] : [];
    rows.push(currentRow);
    currentWidth = indent.length;
  };

  for (const segment of segments) {
    for (const match of segment.text.matchAll(/\n|[^\S\n]+|\S+/g)) {
      const chunk = match[0];
      const chunkIndex = match.index ?? 0;
      if (chunk === "\n") {
        startContinuationRow();
        continue;
      }

      if (/^[^\S\n]+$/.test(chunk)) {
        const collapsed = currentWidth === currentIndentWidth(currentRow) ? "" : " ";
        if (!collapsed) {
          continue;
        }
        if (currentWidth + collapsed.length > safeWidth) {
          startContinuationRow();
          continue;
        }
        appendChar(currentRow, collapsed, segment, spanForRange(segment, chunkIndex, chunkIndex + chunk.length));
        currentWidth += collapsed.length;
        continue;
      }

      if (currentWidth > currentIndentWidth(currentRow) && currentWidth + chunk.length > safeWidth) {
        startContinuationRow();
      }

      let remaining = chunk;
      while (remaining.length > 0) {
        const available = safeWidth - currentWidth;
        if (available <= 0) {
          startContinuationRow();
          continue;
        }

        const next = remaining.slice(0, available);
        const nextStart = chunkIndex + (chunk.length - remaining.length);
        appendText(currentRow, next, segment, nextStart);
        currentWidth += next.length;
        remaining = remaining.slice(next.length);

        if (remaining.length > 0) {
          startContinuationRow();
        }
      }
    }
  }

  return rows
    .filter((row, index) => index === 0 || row.length > 0)
    .map((row) => ({ segments: row.length > 0 ? row : [{ text: " " }] }));
}

function wrapSegmentsPreservingWhitespace(
  segments: Segment[],
  width: number,
  hangingIndent = 0,
): Array<{ segments: Segment[] }> {
  const safeWidth = Math.max(1, width);
  const rows: Segment[][] = [[]];
  let currentWidth = 0;
  let currentRow = rows[0]!;

  const startContinuationRow = () => {
    const indent = " ".repeat(Math.min(hangingIndent, Math.max(0, safeWidth - 1)));
    currentRow = indent ? [{ text: indent }] : [];
    rows.push(currentRow);
    currentWidth = indent.length;
  };

  for (const segment of segments) {
    for (let index = 0; index < segment.text.length; index++) {
      const char = segment.text[index] ?? "";
      if (char === "\n") {
        startContinuationRow();
        continue;
      }

      if (currentWidth >= safeWidth) {
        startContinuationRow();
      }

      appendChar(currentRow, char, segment, spanAt(segment, index));
      currentWidth += 1;
    }
  }

  return rows.map((row) => ({
    segments: row.length > 0 ? row : [{ text: " " }],
  }));
}

function appendText(row: Segment[], text: string, source: Segment, sourceTextStart: number): void {
  for (let index = 0; index < text.length; index++) {
    appendChar(row, text[index] ?? "", source, spanAt(source, sourceTextStart + index));
  }
}

function currentIndentWidth(row: Segment[]): number {
  return row.length === 1 && row[0]?.text.trim().length === 0 ? row[0].text.length : 0;
}

function appendChar(row: Segment[], char: string, source: Segment, span: SourceSpan | null = null): void {
  const style: Omit<Segment, "text" | "sourceMap"> = {
    color: source.color,
    backgroundColor: source.backgroundColor,
    bold: source.bold,
    dim: source.dim,
  };
  const previous = row[row.length - 1];
  if (previous && sameStyle(previous, style)) {
    previous.text += char;
    if (previous.sourceMap || span) {
      previous.sourceMap = previous.sourceMap ?? new Array(previous.text.length - 1).fill(null);
      previous.sourceMap.push(span);
    }
    return;
  }
  row.push({ text: char, sourceMap: span ? [span] : undefined, ...style });
}

function sameStyle(left: Segment, right: Omit<Segment, "text" | "sourceMap">): boolean {
  return (
    left.color === right.color &&
    left.backgroundColor === right.backgroundColor &&
    left.bold === right.bold &&
    left.dim === right.dim
  );
}

function sourceSegment(
  text: string,
  sourceText: string,
  sourceStart: number,
  style: InlineStyle,
  normalizeWhitespace: boolean,
): Segment {
  const sourceMap = normalizeWhitespace
    ? sourceMapForNormalizedText(sourceText, sourceStart)
    : sourceMapForText(text, sourceStart);
  return {
    text,
    sourceMap: sourceMap.length === text.length ? sourceMap : undefined,
    ...style,
  };
}

function sourceMapForText(text: string, sourceStart: number): SourceSpan[] {
  return Array.from({ length: text.length }, (_, index) => ({
    start: sourceStart + index,
    end: sourceStart + index + 1,
  }));
}

function sourceMapForNormalizedText(sourceText: string, sourceStart: number): SourceSpan[] {
  const sourceMap: SourceSpan[] = [];
  for (const match of sourceText.matchAll(/\s+|\S/g)) {
    const text = match[0];
    const start = sourceStart + (match.index ?? 0);
    if (/^\s+$/.test(text)) {
      sourceMap.push({
        start,
        end: start + text.length,
      });
      continue;
    }
    sourceMap.push({
      start,
      end: start + text.length,
    });
  }
  return sourceMap;
}

function spanAt(segment: Segment, index: number): SourceSpan | null {
  return segment.sourceMap?.[index] ?? null;
}

function spanForRange(segment: Segment, start: number, end: number): SourceSpan | null {
  const spans = segment.sourceMap?.slice(start, end).filter((span): span is SourceSpan => Boolean(span)) ?? [];
  if (spans.length === 0) {
    return null;
  }
  return {
    start: Math.min(...spans.map((span) => span.start)),
    end: Math.max(...spans.map((span) => span.end)),
  };
}

function locateRaw(raw: string, sourceText: string, cursor: number): { start: number; end: number } {
  if (!raw) {
    return { start: cursor, end: cursor };
  }

  const found = sourceText.indexOf(raw, Math.max(0, cursor));
  if (found >= 0) {
    return {
      start: found,
      end: found + raw.length,
    };
  }

  return {
    start: cursor,
    end: Math.min(sourceText.length, cursor + raw.length),
  };
}

function locateTableCells(
  cells: Tokens.TableCell[],
  rowText: string,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  for (const cell of cells) {
    const text = cell.text.trim();
    const found = text ? rowText.indexOf(text, cursor) : -1;
    const start = found >= 0 ? found : cursor;
    const end = found >= 0 ? found + text.length : start;
    ranges.push({ start, end });
    cursor = end;
  }

  return ranges;
}

function applySourceSelectionToSegments(
  segments: Segment[],
  selectedRanges: SourceRange[],
): Segment[] {
  if (selectedRanges.length === 0) {
    return segments;
  }

  const highlighted: Segment[] = [];
  for (const segment of segments) {
    for (let index = 0; index < segment.text.length; index++) {
      const span = spanAt(segment, index);
      const selected = span ? selectedRanges.some((range) => rangesOverlap(range, span)) : false;
      appendChar(highlighted, segment.text[index] ?? "", {
        ...segment,
        text: "",
        backgroundColor: selected ? "blue" : segment.backgroundColor,
        color: selected ? "white" : segment.color,
        dim: selected ? false : segment.dim,
        sourceMap: undefined,
      }, span);
    }
  }
  return highlighted;
}

function rangesOverlap(left: SourceRange, right: SourceSpan): boolean {
  return left.start < right.end && right.start < left.end;
}

function plainTextRow(
  text: string,
  style: InlineStyle,
  sourceStart?: number,
  sourceText = text,
): LogicalRow {
  return {
    segments: [sourceStart === undefined ? { text, ...style } : sourceSegment(text, sourceText, sourceStart, style, false)],
  };
}

function blankRow(): LogicalRow {
  return {
    blank: true,
    segments: [{ text: " " }],
  };
}

function appendRows(target: LogicalRow[], rows: LogicalRow[]): void {
  for (const row of rows) {
    if (row.blank) {
      pushBlank(target);
      continue;
    }
    target.push(row);
  }
}

function pushBlank(rows: LogicalRow[]): void {
  if (rows.length === 0 || rows[rows.length - 1]?.blank) {
    return;
  }
  rows.push(blankRow());
}

function coalesceBlankRows(rows: LogicalRow[]): LogicalRow[] {
  const coalesced: LogicalRow[] = [];
  appendRows(coalesced, rows);
  return coalesced;
}

function trimBlankEdges(rows: LogicalRow[]): LogicalRow[] {
  let start = 0;
  let end = rows.length;
  while (start < end && rows[start]?.blank) {
    start += 1;
  }
  while (end > start && rows[end - 1]?.blank) {
    end -= 1;
  }
  return rows.slice(start, end);
}

function formatAnnotationInline(annotation: Annotation): string {
  const spacer = annotation.type === "delete" ? "  " : " ";
  return `${TYPE_ICONS[annotation.type]}${spacer}${annotation.text}`;
}

function normalizeInlineText(text: string): string {
  return text.replace(/\s+/g, " ");
}

function textFromUnknownToken(token: Token): string {
  if ("text" in token && typeof token.text === "string") {
    return token.text;
  }
  return token.raw ?? "";
}

function isSelected(index: number, activeIndex: number | null, selectionAnchor: number | null): boolean {
  if (activeIndex === null || selectionAnchor === null) {
    return false;
  }
  const start = Math.min(activeIndex, selectionAnchor);
  const end = Math.max(activeIndex, selectionAnchor);
  return index >= start && index <= end;
}
