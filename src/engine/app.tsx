import React, { useLayoutEffect, useState } from "react";
import type { Annotation, PlanStep } from "../types.js";
import { AlternateScreen } from "./components/AlternateScreen.js";
import Box from "./components/Box.js";
import Text from "./components/Text.js";
import { useInput } from "./hooks/useInput.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";

type Props = {
  initialSteps: PlanStep[];
  onSubmit: (steps: PlanStep[]) => void;
  onQuit: () => void;
};

type RenderedRow = {
  key: string;
  text: string;
  color?: "white" | "yellow" | "cyan" | "red" | "green" | "gray";
  backgroundColor?: "blue";
  bold?: boolean;
  dim?: boolean;
};

type RowLayout = {
  rows: RenderedRow[];
  stepStartRow: number[];
  stepRowCount: number[];
};

const TYPE_COLORS: Record<Annotation["type"], "yellow" | "cyan" | "red" | "green"> = {
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
  comment: "💬",
  question: "❓",
  delete: "🗑️",
  replace: "✏️",
};

const HEADER_HEIGHT = 3;
const REVIEW_FOOTER_HEIGHT = 4;
const ANNOTATION_FOOTER_HEIGHT = 4;

export default function RedlineApp({
  initialSteps,
  onSubmit,
  onQuit,
}: Props): React.ReactNode {
  const size = useTerminalSize();
  const [steps, setSteps] = useState(initialSteps);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotationType, setAnnotationType] = useState<Annotation["type"]>("comment");
  const [inputValue, setInputValue] = useState("");

  const footerHeight = isAnnotating ? ANNOTATION_FOOTER_HEIGHT : REVIEW_FOOTER_HEIGHT;
  const bodyHeight = Math.max(1, size.rows - HEADER_HEIGHT - footerHeight);
  const contentWidth = Math.max(12, size.columns - 2);
  const selectedIndices = getSelectedIndices(activeIndex, selectionAnchor);
  const rowLayout = computeRows(steps, activeIndex, selectionAnchor, contentWidth);
  const nextScrollOffset = ensureActiveVisible({
    activeIndex,
    bodyHeight,
    rowLayout,
    scrollOffset,
  });
  const visibleRows = rowLayout.rows.slice(nextScrollOffset, nextScrollOffset + bodyHeight);
  const totalAnnotations = steps.reduce((sum, step) => sum + step.annotations.length, 0);
  const selectedCount = selectedIndices.length;
  const planTitle = steps[0]?.content.split("\n")[0]?.replace(/^#+\s*/, "") ?? "";
  const viewportCounts = countStepsOutsideViewport(rowLayout, nextScrollOffset, bodyHeight);

  useLayoutEffect(() => {
    if (scrollOffset !== nextScrollOffset) {
      setScrollOffset(nextScrollOffset);
    }
  }, [nextScrollOffset, scrollOffset]);

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && key.name === "c")) {
      onQuit();
      return;
    }

    if (isAnnotating) {
      if (key.escape) {
        setInputValue("");
        setIsAnnotating(false);
        return;
      }

      if (key.return) {
        commitAnnotation({
          activeIndex,
          annotationType,
          inputValue,
          selectedIndices,
          setInputValue,
          setIsAnnotating,
          setSelectionAnchor,
          setSteps,
        });
        return;
      }

      if (key.backspace || key.delete) {
        setInputValue((current) => current.slice(0, -1));
        return;
      }

      if (
        key.upArrow ||
        key.downArrow ||
        key.leftArrow ||
        key.rightArrow ||
        key.pageUp ||
        key.pageDown ||
        key.home ||
        key.end ||
        key.tab
      ) {
        return;
      }

      if (input && !key.ctrl) {
        setInputValue((current) => current + input);
      }
      return;
    }

    if (key.shift && key.upArrow) {
      setSelectionAnchor((current) => current ?? activeIndex);
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (key.shift && key.downArrow) {
      setSelectionAnchor((current) => current ?? activeIndex);
      setActiveIndex((current) => Math.min(steps.length - 1, current + 1));
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectionAnchor(null);
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectionAnchor(null);
      setActiveIndex((current) => Math.min(steps.length - 1, current + 1));
      return;
    }

    if (key.pageUp) {
      setSelectionAnchor(null);
      setActiveIndex((current) => Math.max(0, current - bodyHeight));
      return;
    }

    if (key.pageDown) {
      setSelectionAnchor(null);
      setActiveIndex((current) => Math.min(steps.length - 1, current + bodyHeight));
      return;
    }

    if (key.home || input === "g") {
      setSelectionAnchor(null);
      setActiveIndex(0);
      return;
    }

    if (key.end || input === "G") {
      setSelectionAnchor(null);
      setActiveIndex(Math.max(0, steps.length - 1));
      return;
    }

    if (key.escape) {
      setSelectionAnchor(null);
      return;
    }

    if (input === "c") {
      setAnnotationType("comment");
      setInputValue("");
      setIsAnnotating(true);
      return;
    }

    if (input === "?") {
      setAnnotationType("question");
      setInputValue("");
      setIsAnnotating(true);
      return;
    }

    if (input === "r") {
      setAnnotationType("replace");
      setInputValue("");
      setIsAnnotating(true);
      return;
    }

    if (input === "d") {
      setSteps((current) => toggleDelete(current, selectedIndices));
      setSelectionAnchor(null);
      return;
    }

    if (input === "u") {
      setSteps((current) => undoLastAnnotation(current, selectedIndices));
      return;
    }

    if (key.return) {
      onSubmit(steps);
    }
  });

  return (
    <AlternateScreen>
      <Box flexDirection="column" height={size.rows} backgroundColor="black">
        <Box height={HEADER_HEIGHT} paddingX={1} flexShrink={0} backgroundColor="black">
          <Text color="red" bold>
            ▌ redline
          </Text>
          <Text color="gray">{truncate(planTitle, contentWidth)}</Text>
          <Text color="gray" dim>
            {"j/k or arrows move  Shift+arrows select  c ? d r annotate  Enter submit  q quit"}
          </Text>
        </Box>

        <Box height={bodyHeight} paddingX={1} flexShrink={0} backgroundColor="black">
          {visibleRows.map((row) => (
            <Text
              key={row.key}
              color={row.color}
              backgroundColor={row.backgroundColor}
              bold={row.bold}
              dim={row.dim}
            >
              {row.text}
            </Text>
          ))}
          {Array.from({ length: Math.max(0, bodyHeight - visibleRows.length) }, (_, index) => (
            <Text key={`blank-${index}`} color="gray">
              {" "}
            </Text>
          ))}
        </Box>

        {isAnnotating ? (
          <Box height={ANNOTATION_FOOTER_HEIGHT} paddingX={1} flexShrink={0} backgroundColor="black">
            <Text color={TYPE_COLORS[annotationType]} bold>
              {`${TYPE_LABELS[annotationType]}${selectedCount > 1 ? ` (${selectedCount} steps)` : ` on step ${activeIndex + 1}`}`}
            </Text>
            <Text color="white">{truncate(`> ${inputValue}█`, contentWidth)}</Text>
            <Text color="gray">Enter save  Esc cancel</Text>
            <Text color="gray" dim>
              {truncate(steps[activeIndex]?.content.split("\n")[0] ?? "", contentWidth)}
            </Text>
          </Box>
        ) : (
          <Box height={REVIEW_FOOTER_HEIGHT} paddingX={1} flexShrink={0} backgroundColor="black">
            <Text color="gray" dim>
              {buildStatusLine({
                activeIndex,
                totalSteps: steps.length,
                selectedCount,
                totalAnnotations,
                scrollOffset: nextScrollOffset,
                maxScroll: Math.max(0, rowLayout.rows.length - bodyHeight),
              })}
            </Text>
            <Text color="gray">
              {"↑↓ navigate  Shift+↑↓ select  c comment  ? question  d delete  r replace"}
            </Text>
            <Text color="gray">{`u undo  Enter ${totalAnnotations > 0 ? "send feedback" : "approve"}  q quit`}</Text>
            <Text color="gray" dim>
              {viewportCounts.above > 0 || viewportCounts.below > 0
                ? `${viewportCounts.above > 0 ? `↑ ${viewportCounts.above} above` : ""}${viewportCounts.above > 0 && viewportCounts.below > 0 ? "  " : ""}${viewportCounts.below > 0 ? `↓ ${viewportCounts.below} below` : ""}`
                : "all steps visible"}
            </Text>
          </Box>
        )}
      </Box>
    </AlternateScreen>
  );
}

function computeRows(
  steps: PlanStep[],
  activeIndex: number,
  selectionAnchor: number | null,
  width: number,
): RowLayout {
  const rows: RenderedRow[] = [];
  const stepStartRow: number[] = [];
  const stepRowCount: number[] = [];
  const totalSteps = steps.length;
  const gutterWidth = String(totalSteps).length;

  for (let index = 0; index < totalSteps; index++) {
    const step = steps[index]!;
    const active = index === activeIndex;
    const selected = isSelected(index, activeIndex, selectionAnchor);
    const highlighted = active || selected;
    const hasAnnotations = step.annotations.length > 0;
    const hasDelete = step.annotations.some((annotation) => annotation.type === "delete");
    const firstLine = step.content.split("\n")[0] ?? "";
    const bodyLines = step.content.split("\n").slice(1).filter((line) => line.trim().length > 0);
    const isHeading = /^#{1,6}\s/.test(firstLine);
    const prefix = `${selected && !active ? "┃" : " "} ${String(index + 1).padStart(gutterWidth, " ")} ${active ? "▸" : " "} `;
    const continuationPrefix = " ".repeat(prefix.length);
    const availableWidth = Math.max(1, width - prefix.length);
    const firstLineSuffix = hasAnnotations ? ` [${step.annotations.length}]` : "";
    const titleLines = wrapText(firstLine, Math.max(1, availableWidth - firstLineSuffix.length));

    stepStartRow.push(rows.length);
    const startLength = rows.length;

    titleLines.forEach((line, lineIndex) => {
      const text = `${lineIndex === 0 ? prefix : continuationPrefix}${line}${lineIndex === 0 ? firstLineSuffix : ""}`;
      rows.push({
        key: `step-${step.id}-title-${lineIndex}`,
        text,
        color: hasDelete ? "red" : highlighted ? "white" : isHeading ? "cyan" : "yellow",
        backgroundColor: highlighted ? "blue" : undefined,
        bold: active || isHeading,
        dim: !highlighted && !isHeading,
      });
    });

    if (bodyLines.length > 0) {
      for (const [lineIndex, line] of bodyLines.entries()) {
        const wrapped = wrapText(line.trim(), Math.max(1, width - 4));
        wrapped.forEach((chunk, chunkIndex) => {
          rows.push({
            key: `step-${step.id}-body-${lineIndex}-${chunkIndex}`,
            text: `    ${chunk}`,
            color: hasDelete ? "red" : highlighted ? "white" : "gray",
            backgroundColor: highlighted ? "blue" : undefined,
            dim: !highlighted,
          });
        });
      }
    }

    if (hasAnnotations) {
      step.annotations.forEach((annotation, annotationIndex) => {
        const wrapped = wrapText(
          `${TYPE_ICONS[annotation.type]} ${annotation.text}`,
          Math.max(1, width - 6),
        );
        wrapped.forEach((chunk, chunkIndex) => {
          rows.push({
            key: `step-${step.id}-annotation-${annotationIndex}-${chunkIndex}`,
            text: `    │ ${chunk}`,
            color: TYPE_COLORS[annotation.type],
            backgroundColor: highlighted ? "blue" : undefined,
            dim: !highlighted,
          });
        });
      });
    }

    stepRowCount.push(rows.length - startLength);
  }

  return {
    rows,
    stepStartRow,
    stepRowCount,
  };
}

function wrapText(text: string, width: number): string[] {
  if (width <= 0) {
    return [text];
  }

  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine.length <= width) {
      lines.push(rawLine);
      continue;
    }

    let remaining = rawLine;
    while (remaining.length > width) {
      let breakAt = remaining.lastIndexOf(" ", width);
      if (breakAt <= 0) {
        breakAt = width;
      }
      lines.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining.length > 0) {
      lines.push(remaining);
    }
  }

  return lines.length > 0 ? lines : [""];
}

function ensureActiveVisible({
  activeIndex,
  bodyHeight,
  rowLayout,
  scrollOffset,
}: {
  activeIndex: number;
  bodyHeight: number;
  rowLayout: RowLayout;
  scrollOffset: number;
}): number {
  const activeStart = rowLayout.stepStartRow[activeIndex] ?? 0;
  const activeEnd = activeStart + (rowLayout.stepRowCount[activeIndex] ?? 1);
  let next = scrollOffset;

  if (activeStart < next) {
    next = activeStart;
  }
  if (activeEnd > next + bodyHeight) {
    next = activeEnd - bodyHeight;
  }

  return Math.max(0, Math.min(next, Math.max(0, rowLayout.rows.length - bodyHeight)));
}

function countStepsOutsideViewport(
  rowLayout: RowLayout,
  scrollOffset: number,
  bodyHeight: number,
): { above: number; below: number } {
  let above = 0;
  let below = 0;

  for (let index = 0; index < rowLayout.stepStartRow.length; index++) {
    const start = rowLayout.stepStartRow[index] ?? 0;
    const end = start + (rowLayout.stepRowCount[index] ?? 0);
    if (end <= scrollOffset) {
      above += 1;
      continue;
    }
    if (start >= scrollOffset + bodyHeight) {
      below += 1;
    }
  }

  return { above, below };
}

function getSelectedIndices(activeIndex: number, selectionAnchor: number | null): number[] {
  if (selectionAnchor === null) {
    return [activeIndex];
  }

  const start = Math.min(activeIndex, selectionAnchor);
  const end = Math.max(activeIndex, selectionAnchor);
  const selected: number[] = [];
  for (let index = start; index <= end; index++) {
    selected.push(index);
  }
  return selected;
}

function isSelected(index: number, activeIndex: number, selectionAnchor: number | null): boolean {
  if (selectionAnchor === null) {
    return false;
  }
  const start = Math.min(activeIndex, selectionAnchor);
  const end = Math.max(activeIndex, selectionAnchor);
  return index >= start && index <= end;
}

function commitAnnotation({
  activeIndex,
  annotationType,
  inputValue,
  selectedIndices,
  setInputValue,
  setIsAnnotating,
  setSelectionAnchor,
  setSteps,
}: {
  activeIndex: number;
  annotationType: Annotation["type"];
  inputValue: string;
  selectedIndices: number[];
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  setIsAnnotating: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectionAnchor: React.Dispatch<React.SetStateAction<number | null>>;
  setSteps: React.Dispatch<React.SetStateAction<PlanStep[]>>;
}): void {
  const text = inputValue.trim();
  if (!text && annotationType !== "delete") {
    setInputValue("");
    setIsAnnotating(false);
    return;
  }

  const annotation: Annotation = {
    id: makeId(activeIndex, annotationType),
    type: annotationType,
    text: text || "Remove this step",
    replacement: annotationType === "replace" ? text : undefined,
  };

  setSteps((current) =>
    current.map((step, index) => {
      if (!selectedIndices.includes(index)) {
        return step;
      }
      return {
        ...step,
        annotations: [...step.annotations, { ...annotation }],
      };
    }),
  );
  setInputValue("");
  setIsAnnotating(false);
  setSelectionAnchor(null);
}

function toggleDelete(steps: PlanStep[], selectedIndices: number[]): PlanStep[] {
  return steps.map((step, index) => {
    if (!selectedIndices.includes(index)) {
      return step;
    }

    const hasDelete = step.annotations.some((annotation) => annotation.type === "delete");
    if (hasDelete) {
      return {
        ...step,
        annotations: step.annotations.filter((annotation) => annotation.type !== "delete"),
      };
    }

    return {
      ...step,
      annotations: [
        ...step.annotations,
        {
          id: makeId(index, "delete"),
          type: "delete",
          text: "Remove this step",
        },
      ],
    };
  });
}

function undoLastAnnotation(steps: PlanStep[], selectedIndices: number[]): PlanStep[] {
  return steps.map((step, index) => {
    if (!selectedIndices.includes(index)) {
      return step;
    }
    return {
      ...step,
      annotations: step.annotations.slice(0, -1),
    };
  });
}

function buildStatusLine({
  activeIndex,
  totalSteps,
  selectedCount,
  totalAnnotations,
  scrollOffset,
  maxScroll,
}: {
  activeIndex: number;
  totalSteps: number;
  selectedCount: number;
  totalAnnotations: number;
  scrollOffset: number;
  maxScroll: number;
}): string {
  const parts = [`step ${activeIndex + 1}/${totalSteps}`];
  if (selectedCount > 1) {
    parts.push(`${selectedCount} selected`);
  }
  if (totalAnnotations > 0) {
    parts.push(`${totalAnnotations} annotation${totalAnnotations === 1 ? "" : "s"}`);
  }
  parts.push(`scroll ${scrollOffset}/${maxScroll}`);
  return parts.join("  |  ");
}

function truncate(text: string, width: number): string {
  if (text.length <= width) {
    return text;
  }
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}

function makeId(seed: number, type: Annotation["type"]): string {
  return `${Date.now()}-${seed}-${type}-${Math.random().toString(36).slice(2, 6)}`;
}
