import React, { useLayoutEffect, useState } from "react";
import type { Annotation, PlanStep } from "../types.js";
import { AlternateScreen } from "./components/AlternateScreen.js";
import Box from "./components/Box.js";
import Text from "./components/Text.js";
import { useInput } from "./hooks/useInput.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { computeMarkdownRows } from "./markdownRows.js";
import type { RowLayout, Segment } from "./renderTypes.js";

type Props = {
  initialSteps: PlanStep[];
  onSubmit: (steps: PlanStep[]) => void;
  onQuit: () => void;
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
  const rowLayout = computeMarkdownRows(steps, activeIndex, selectionAnchor, contentWidth);
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
          <InlineTextLine
            segments={[
              { text: "▌ ", color: "red", bold: true },
              { text: "redline", color: "red", bold: true },
              { text: " — plan review", color: "gray", dim: true },
            ]}
          />
          <Text color="gray" dim>
            {truncate(planTitle, contentWidth)}
          </Text>
          <Text color="gray" dim>
            {"─".repeat(contentWidth)}
          </Text>
        </Box>

        <Box height={bodyHeight} paddingX={1} flexShrink={0} backgroundColor="black">
          {visibleRows.map((row) => (
            <InlineTextLine key={row.key} segments={row.segments} />
          ))}
          {Array.from({ length: Math.max(0, bodyHeight - visibleRows.length) }, (_, index) => (
            <Text key={`blank-${index}`} color="gray">
              {" "}
            </Text>
          ))}
        </Box>

        {isAnnotating ? (
          <Box height={ANNOTATION_FOOTER_HEIGHT} paddingX={1} flexShrink={0} backgroundColor="black">
            <Text color="gray" dim>
              {"─".repeat(contentWidth)}
            </Text>
            <InlineTextLine
              segments={[
                { text: `${TYPE_ICONS[annotationType]} `, color: TYPE_COLORS[annotationType], bold: true },
                {
                  text: `${TYPE_LABELS[annotationType]}${selectedCount > 1 ? ` (${selectedCount} steps)` : ` on step ${activeIndex + 1}`}`,
                  color: TYPE_COLORS[annotationType],
                  bold: true,
                },
              ]}
            />
            <Text color="white">{truncate(`> ${inputValue}█`, contentWidth)}</Text>
            <InlineTextLine
              segments={[
                { text: "Enter", color: "green", bold: true },
                { text: " save  ", color: "gray" },
                { text: "Esc", color: "gray", bold: true },
                { text: " cancel", color: "gray" },
              ]}
            />
          </Box>
        ) : (
          <Box height={REVIEW_FOOTER_HEIGHT} paddingX={1} flexShrink={0} backgroundColor="black">
            <Text color="gray" dim>
              {"─".repeat(contentWidth)}
            </Text>
            <InlineTextLine
              segments={alignRight(
                buildStatusSegments({
                  activeIndex,
                  totalSteps: steps.length,
                  selectedCount,
                  totalAnnotations,
                }),
                buildViewportSegments(viewportCounts),
                contentWidth,
              )}
            />
            <InlineTextLine
              segments={[
                { text: "↑↓", color: "white", bold: true },
                { text: " navigate  ", color: "gray" },
                { text: "Shift+↑↓", color: "blue", bold: true },
                { text: " select  ", color: "gray" },
                { text: "c", color: "yellow", bold: true },
                { text: " comment  ", color: "gray" },
                { text: "?", color: "cyan", bold: true },
                { text: " question  ", color: "gray" },
                { text: "d", color: "red", bold: true },
                { text: " delete  ", color: "gray" },
                { text: "r", color: "green", bold: true },
                { text: " replace", color: "gray" },
              ]}
            />
            <InlineTextLine
              segments={[
                { text: "u", color: "white", bold: true },
                { text: " undo  ", color: "gray" },
                { text: "Enter", color: "green", bold: true },
                { text: ` ${totalAnnotations > 0 ? "send feedback" : "approve"}  `, color: "gray" },
                { text: "q", color: "gray", bold: true },
                { text: " quit", color: "gray" },
              ]}
            />
          </Box>
        )}
      </Box>
    </AlternateScreen>
  );
}

function InlineTextLine({ segments }: { segments: Segment[] }): React.ReactNode {
  return (
    <Text
      segments={segments.map((segment) => ({
        text: segment.text,
        style: {
          color: segment.color,
          backgroundColor: segment.backgroundColor,
          bold: segment.bold,
          dim: segment.dim,
        },
      }))}
    />
  );
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

function buildStatusSegments({
  activeIndex,
  totalSteps,
  selectedCount,
  totalAnnotations,
}: {
  activeIndex: number;
  totalSteps: number;
  selectedCount: number;
  totalAnnotations: number;
}): Segment[] {
  const segments: Segment[] = [{ text: `Step ${activeIndex + 1}/${totalSteps}`, color: "gray" }];

  if (selectedCount > 1) {
    segments.push({ text: "  " });
    segments.push({ text: `${selectedCount} selected`, color: "blue", bold: true });
  }

  if (totalAnnotations > 0) {
    segments.push({ text: "  " });
    segments.push({
      text: `${totalAnnotations} annotation${totalAnnotations === 1 ? "" : "s"}`,
      color: "red",
      bold: true,
    });
  }

  return segments;
}

function buildViewportSegments(viewportCounts: { above: number; below: number }): Segment[] {
  if (viewportCounts.above === 0 && viewportCounts.below === 0) {
    return [];
  }

  const segments: Segment[] = [];
  if (viewportCounts.above > 0) {
    segments.push({ text: `↑ ${viewportCounts.above} above`, color: "gray", dim: true });
  }
  if (viewportCounts.above > 0 && viewportCounts.below > 0) {
    segments.push({ text: "  " });
  }
  if (viewportCounts.below > 0) {
    segments.push({ text: `↓ ${viewportCounts.below} below`, color: "gray", dim: true });
  }

  return segments;
}

function alignRight(left: Segment[], right: Segment[], width: number): Segment[] {
  if (right.length === 0) {
    return left;
  }

  const leftWidth = measureSegments(left);
  const rightWidth = measureSegments(right);
  const spaces = Math.max(2, width - leftWidth - rightWidth);
  return [...left, { text: " ".repeat(spaces) }, ...right];
}

function measureSegments(segments: Segment[]): number {
  return segments.reduce((sum, segment) => sum + segment.text.length, 0);
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
