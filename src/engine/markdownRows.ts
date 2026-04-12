import { lexer, type Token, type Tokens } from "marked";
import type { Annotation, PlanStep } from "../types.js";
import type { RenderedRow, RowLayout, Segment } from "./renderTypes.js";

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
};

type InlineStyle = Omit<Segment, "text">;

type ComputeMarkdownRowsOptions = {
  selectedStepIndices?: Iterable<number>;
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

  for (let index = 0; index < totalSteps; index++) {
    const step = steps[index]!;
    const active = activeIndex !== null && index === activeIndex;
    const selected = selectedStepIndices.size > 0
      ? selectedStepIndices.has(index)
      : isSelected(index, activeIndex, selectionAnchor);
    const state: StepRenderState = {
      active,
      selected,
      highlighted: active || selected,
      backgroundColor: selected && !active ? "gray" : undefined,
      hasDelete: step.annotations.some((annotation) => annotation.type === "delete"),
    };
    const prefixLength = 2 + gutterWidth + 1 + 2;
    const prefixPadding = " ".repeat(prefixLength);
    const availableWidth = Math.max(1, width - prefixLength);
    const firstLineSuffix = step.annotations.length > 0 ? ` [${step.annotations.length}]` : "";
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
      firstLineSuffix,
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
  firstLineSuffix,
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
  firstLineSuffix: string;
  stepIndex: number;
}): void {
  const contentRows = logicalRows.length > 0 ? logicalRows : [plainTextRow(step.content, bodyStyle(state))];
  let paintedAnyRow = false;

  contentRows.forEach((logicalRow, logicalRowIndex) => {
    const suffix = !paintedAnyRow ? firstLineSuffix : "";
    const wrappedRows = logicalRow.blank
      ? [{ segments: [{ text: " " }], blank: true }]
      : logicalRow.preserveWhitespace
        ? wrapSegmentsPreservingWhitespace(
            logicalRow.segments,
            Math.max(1, availableWidth - suffix.length),
            logicalRow.hangingIndent ?? 0,
          )
        : wrapSegments(
            logicalRow.segments,
            Math.max(1, availableWidth - suffix.length),
            logicalRow.hangingIndent ?? 0,
          );

    wrappedRows.forEach((wrappedRow, wrappedIndex) => {
      const isFirstStepRow = !paintedAnyRow;
      const segments: Segment[] = isFirstStepRow
        ? buildFirstPrefix(index, gutterWidth, state)
        : [{ text: prefixPadding }];

      segments.push(...wrappedRow.segments);

      if (isFirstStepRow && suffix) {
        segments.push({
          text: suffix,
          color: "red",
          backgroundColor: state.backgroundColor,
          bold: true,
        });
      }

      rows.push({
        key: `step-${step.id}-md-${logicalRowIndex}-${wrappedIndex}`,
        segments,
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
      text: state.selected && !state.active ? "┃ " : "  ",
      color: state.selected && !state.active ? "blue" : undefined,
      bold: state.selected && !state.active,
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
  return trimBlankEdges(coalesceBlankRows(renderBlocks(tokens, state)));
}

function renderBlocks(tokens: Token[], state: StepRenderState, listDepth = 0): LogicalRow[] {
  const rows: LogicalRow[] = [];
  const meaningfulTokens = tokens.filter((token) => token.type !== "def");

  meaningfulTokens.forEach((token, index) => {
    const rendered = renderBlock(token, state, listDepth);
    appendRows(rows, rendered);

    const currentIsSpace = token.type === "space";
    const next = meaningfulTokens[index + 1];
    if (!currentIsSpace && next && next.type !== "space") {
      pushBlank(rows);
    }
  });

  return rows;
}

function renderBlock(token: Token, state: StepRenderState, listDepth: number): LogicalRow[] {
  switch (token.type) {
    case "space":
      return [blankRow()];
    case "heading": {
      const heading = token as Tokens.Heading;
      return [
        {
          segments: renderInline(heading.tokens, headingStyle(state), heading.text),
        },
      ];
    }
    case "paragraph": {
      const paragraph = token as Tokens.Paragraph;
      return [
        {
          segments: renderInline(paragraph.tokens, bodyStyle(state), paragraph.text),
        },
      ];
    }
    case "text": {
      const text = token as Tokens.Text;
      return [
        {
          segments: text.tokens
            ? renderInline(text.tokens, bodyStyle(state), text.text)
            : [{ text: normalizeInlineText(text.text), ...bodyStyle(state) }],
        },
      ];
    }
    case "list":
      return renderList(token as Tokens.List, state, listDepth);
    case "code":
      return renderCode(token as Tokens.Code, state);
    case "blockquote":
      return renderBlockquote(token as Tokens.Blockquote, state, listDepth);
    case "hr":
      return [{ segments: [{ text: "─".repeat(12), ...bodyStyle(state) }] }];
    case "html":
      return [plainTextRow((token as Tokens.HTML).text || token.raw, codeStyle(state))];
    case "table":
      return renderTable(token as Tokens.Table, state);
    default:
      return [plainTextRow(textFromUnknownToken(token), bodyStyle(state))];
  }
}

function renderList(token: Tokens.List, state: StepRenderState, listDepth: number): LogicalRow[] {
  const rows: LogicalRow[] = [];
  const start = typeof token.start === "number" ? token.start : 1;

  token.items.forEach((item, itemIndex) => {
    const marker = token.ordered ? `${start + itemIndex}. ` : "- ";
    const prefix = `${"  ".repeat(listDepth)}${marker}`;
    const childRows = trimBlankEdges(renderListItem(item, state, listDepth));
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
): LogicalRow[] {
  const rows: LogicalRow[] = [];

  if (item.tokens.length === 0) {
    return [plainTextRow(item.text, bodyStyle(state))];
  }

  item.tokens.forEach((token, index) => {
    if (token.type === "list") {
      appendRows(rows, renderList(token as Tokens.List, state, listDepth + 1));
      return;
    }

    appendRows(rows, renderBlock(token, state, listDepth + 1));
    const next = item.tokens[index + 1];
    if (item.loose && next && token.type !== "space" && next.type !== "space") {
      pushBlank(rows);
    }
  });

  return rows;
}

function renderCode(token: Tokens.Code, state: StepRenderState): LogicalRow[] {
  const lines = token.text.split("\n");
  const rows = lines.length > 0 ? lines : [""];
  return rows.map((line) => ({
    segments: highlightCodeLine(line.length > 0 ? line : " ", token.lang, state),
    preserveWhitespace: true,
  }));
}

function renderBlockquote(
  token: Tokens.Blockquote,
  state: StepRenderState,
  listDepth: number,
): LogicalRow[] {
  return renderBlocks(token.tokens, state, listDepth).map((row) => {
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

function renderTable(token: Tokens.Table, state: StepRenderState): LogicalRow[] {
  const rows: LogicalRow[] = [];
  rows.push({
    segments: tableCellsToSegments(token.header, state),
  });
  for (const row of token.rows) {
    rows.push({
      segments: tableCellsToSegments(row, state),
    });
  }
  return rows;
}

function tableCellsToSegments(cells: Tokens.TableCell[], state: StepRenderState): Segment[] {
  const segments: Segment[] = [];
  cells.forEach((cell, index) => {
    if (index > 0) {
      segments.push({ text: " | ", ...bodyStyle(state) });
    }
    segments.push(...renderInline(cell.tokens, bodyStyle(state), cell.text));
  });
  return segments.length > 0 ? segments : [{ text: " ", ...bodyStyle(state) }];
}

function renderInline(tokens: Token[], style: InlineStyle, fallback = ""): Segment[] {
  if (tokens.length === 0) {
    return [{ text: normalizeInlineText(fallback), ...style }];
  }

  const segments: Segment[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "text":
      case "escape":
        segments.push({
          text: normalizeInlineText((token as Tokens.Text | Tokens.Escape).text),
          ...style,
        });
        break;
      case "strong": {
        const strong = token as Tokens.Strong;
        segments.push(...renderInline(strong.tokens, { ...style, bold: true }, strong.text));
        break;
      }
      case "em": {
        const em = token as Tokens.Em;
        segments.push(...renderInline(em.tokens, style, em.text));
        break;
      }
      case "codespan":
        segments.push({
          text: (token as Tokens.Codespan).text,
          ...style,
          color: "yellow",
        });
        break;
      case "link": {
        const link = token as Tokens.Link;
        segments.push(...renderInline(link.tokens, style, link.text));
        break;
      }
      case "image":
        segments.push({ text: (token as Tokens.Image).text, ...style });
        break;
      case "del": {
        const del = token as Tokens.Del;
        segments.push(...renderInline(del.tokens, style, del.text));
        break;
      }
      case "br":
        segments.push({ text: " ", ...style });
        break;
      case "html":
        segments.push({ text: normalizeInlineText((token as Tokens.HTML).text), ...style });
        break;
      default:
        segments.push({ text: normalizeInlineText(textFromUnknownToken(token)), ...style });
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
  return { color: "gray", backgroundColor: state.backgroundColor, dim: false };
}

function codeStyle(state: StepRenderState): InlineStyle {
  if (state.hasDelete) {
    return { color: "red", backgroundColor: state.backgroundColor };
  }
  if (state.highlighted) {
    return { color: "white", backgroundColor: state.backgroundColor };
  }
  return { color: "gray", backgroundColor: state.backgroundColor, dim: false };
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

function highlightCodeLine(
  line: string,
  language: string | undefined,
  state: StepRenderState,
): Segment[] {
  const base = codeStyle(state);
  if (state.hasDelete) {
    return [{ text: line, ...base }];
  }

  const segments: Segment[] = [];
  const tokenPattern =
    /(\/\/.*$|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[$A-Z_a-z][$\w-]*\b|[^\w"'`/]+|\/)/g;

  for (const match of line.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    const style = codeTokenStyle(token, line, index, language, base);
    segments.push({ text: token, ...style });
  }

  return segments.length > 0 ? segments : [{ text: line, ...base }];
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
    for (const chunk of segment.text.match(/\n|[^\S\n]+|\S+/g) ?? []) {
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
        appendText(currentRow, collapsed, segment);
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
        appendText(currentRow, next, segment);
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
    for (const char of segment.text) {
      if (char === "\n") {
        startContinuationRow();
        continue;
      }

      if (currentWidth >= safeWidth) {
        startContinuationRow();
      }

      appendChar(currentRow, char, segment);
      currentWidth += 1;
    }
  }

  return rows.map((row) => ({
    segments: row.length > 0 ? row : [{ text: " " }],
  }));
}

function appendText(row: Segment[], text: string, source: Segment): void {
  for (const char of text) {
    appendChar(row, char, source);
  }
}

function currentIndentWidth(row: Segment[]): number {
  return row.length === 1 && row[0]?.text.trim().length === 0 ? row[0].text.length : 0;
}

function appendChar(row: Segment[], char: string, source: Segment): void {
  const style: Omit<Segment, "text"> = {
    color: source.color,
    backgroundColor: source.backgroundColor,
    bold: source.bold,
    dim: source.dim,
  };
  const previous = row[row.length - 1];
  if (previous && sameStyle(previous, style)) {
    previous.text += char;
    return;
  }
  row.push({ text: char, ...style });
}

function sameStyle(left: Segment, right: Omit<Segment, "text">): boolean {
  return (
    left.color === right.color &&
    left.backgroundColor === right.backgroundColor &&
    left.bold === right.bold &&
    left.dim === right.dim
  );
}

function plainTextRow(text: string, style: InlineStyle): LogicalRow {
  return {
    segments: [{ text, ...style }],
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
