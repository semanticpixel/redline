import React, { useCallback, useRef, useState } from "react";
import type { Annotation, PlanStep } from "../types.js";
import { AlternateScreen } from "./components/AlternateScreen.js";
import Box from "./components/Box.js";
import ScrollBox from "./components/ScrollBox.js";
import type { ScrollBoxHandle } from "./components/ScrollBox.js";
import { Divider } from "./components/Divider.js";
import Text from "./components/Text.js";
import { useInput } from "./hooks/useInput.js";
import { useMouse } from "./hooks/useMouse.js";
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
const REVIEW_FOOTER_HEIGHT = 3;
const ANNOTATION_FOOTER_HEIGHT = 4;

export default function RedlineApp({
  initialSteps,
  onSubmit,
  onQuit,
}: Props): React.ReactNode {
  const size = useTerminalSize();
  const [steps, setSteps] = useState(initialSteps);
  const [selectedSteps, setSelectedSteps] = useState<Set<number>>(new Set());
  const [lastClickedStep, setLastClickedStep] = useState<number | null>(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotationType, setAnnotationType] = useState<Annotation["type"]>("comment");
  const [inputValue, setInputValue] = useState("");
  const scrollBoxRef = useRef<ScrollBoxHandle>(null);

  const footerHeight = isAnnotating ? ANNOTATION_FOOTER_HEIGHT : REVIEW_FOOTER_HEIGHT;
  const bodyHeight = Math.max(1, size.rows - HEADER_HEIGHT - footerHeight);
  const contentWidth = Math.max(12, size.columns - 2);
  const selectedIndices = Array.from(selectedSteps);
  const rowLayout = computeMarkdownRows(steps, selectedSteps, contentWidth);
  const totalAnnotations = steps.reduce((sum, step) => sum + step.annotations.length, 0);
  const selectedCount = selectedSteps.size;
  const planTitle = steps[0]?.content.split("\n")[0]?.replace(/^#+\s*/, "") ?? "";

  // Keep rowLayout in a ref so the mouse handler can access it
  const rowLayoutRef = useRef<RowLayout>(rowLayout);
  rowLayoutRef.current = rowLayout;

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
          annotationType,
          inputValue,
          selectedIndices,
          setInputValue,
          setIsAnnotating,
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

    // Scroll navigation
    if (key.upArrow || input === "k") {
      scrollBoxRef.current?.scrollBy(-1);
      return;
    }

    if (key.downArrow || input === "j") {
      scrollBoxRef.current?.scrollBy(1);
      return;
    }

    if (key.pageUp) {
      scrollBoxRef.current?.scrollBy(-bodyHeight);
      return;
    }

    if (key.pageDown) {
      scrollBoxRef.current?.scrollBy(bodyHeight);
      return;
    }

    if (key.home || input === "g") {
      scrollBoxRef.current?.scrollTo(0);
      return;
    }

    if (key.end || input === "G") {
      scrollBoxRef.current?.scrollToBottom();
      return;
    }

    // Tab/Shift+Tab: keyboard step selection fallback
    if (key.tab) {
      if (key.shift) {
        selectAdjacentStep(-1);
      } else {
        selectAdjacentStep(1);
      }
      return;
    }

    if (key.escape) {
      setSelectedSteps(new Set());
      setLastClickedStep(null);
      return;
    }

    // Annotation keys — only work when steps are selected
    if (selectedCount === 0) {
      if (key.return) {
        onSubmit(steps);
      }
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

  const selectAdjacentStep = useCallback((direction: 1 | -1) => {
    const current = lastClickedStep ?? -1;
    const next = Math.max(0, Math.min(steps.length - 1, current + direction));
    setSelectedSteps(new Set([next]));
    setLastClickedStep(next);

    // Scroll to make the selected step visible
    const layout = rowLayoutRef.current;
    const stepStart = layout.stepStartRow[next] ?? 0;
    const scrollTop = scrollBoxRef.current?.getScrollTop() ?? 0;
    const viewportH = scrollBoxRef.current?.getViewportHeight() ?? bodyHeight;
    if (stepStart < scrollTop) {
      scrollBoxRef.current?.scrollTo(stepStart);
    } else if (stepStart >= scrollTop + viewportH) {
      scrollBoxRef.current?.scrollTo(stepStart - viewportH + 1);
    }
  }, [lastClickedStep, steps.length, bodyHeight]);

  useMouse(useCallback((event) => {
    if (isAnnotating) {
      return;
    }

    // Mouse wheel → scroll
    if (event.button === "wheelUp") {
      scrollBoxRef.current?.scrollBy(-3);
      return;
    }
    if (event.button === "wheelDown") {
      scrollBoxRef.current?.scrollBy(3);
      return;
    }

    // Left click → select step
    if (event.button === "left" && event.type === "press") {
      const bodyY = event.y - HEADER_HEIGHT;
      if (bodyY < 0 || bodyY >= bodyHeight) {
        return;
      }

      const scrollTop = scrollBoxRef.current?.getScrollTop() ?? 0;
      const absoluteRow = bodyY + scrollTop;
      const layout = rowLayoutRef.current;
      const stepIndex = resolveRowToStep(layout, absoluteRow);
      if (stepIndex === null) {
        return;
      }

      if (event.shift && lastClickedStep !== null) {
        // Range select
        const start = Math.min(lastClickedStep, stepIndex);
        const end = Math.max(lastClickedStep, stepIndex);
        const range = new Set<number>();
        for (let i = start; i <= end; i++) {
          range.add(i);
        }
        setSelectedSteps(range);
      } else {
        setSelectedSteps(new Set([stepIndex]));
      }
      setLastClickedStep(stepIndex);
    }
  }, [isAnnotating, bodyHeight, lastClickedStep]));

  return (
    <AlternateScreen>
      <Box flexDirection="column" height={size.rows} backgroundColor="black">
        <Box paddingX={1} flexShrink={0}>
          <InlineTextLine
            segments={[
              { text: "▌ ", color: "red", bold: true },
              { text: "redline", color: "red", bold: true },
              { text: " — plan review", color: "gray", dim: false },
            ]}
          />
          <Text color="blue">
            {truncate(planTitle, contentWidth)}
          </Text>
        </Box>
        <Divider color="cyan" dim />

        <ScrollBox ref={scrollBoxRef} height={bodyHeight} flexShrink={0}>
          {rowLayout.rows.map((row) => (
            <InlineTextLine key={row.key} segments={row.segments} />
          ))}
        </ScrollBox>

        <Divider color="yellow" dim />

        {isAnnotating ? (
          <Box paddingX={1} flexShrink={0} >
            <InlineTextLine
              segments={[
                { text: `${TYPE_ICONS[annotationType]} `, color: TYPE_COLORS[annotationType], bold: true },
                {
                  text: `${TYPE_LABELS[annotationType]} on ${selectedCount} step${selectedCount === 1 ? "" : "s"}`,
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
          <Box paddingX={1} flexShrink={0}>
            <InlineTextLine
              segments={buildStatusSegments({ selectedCount, totalAnnotations })}
            />
            <InlineTextLine
              segments={[
                { text: "click", color: "white", bold: true },
                { text: " select  ", color: "gray" },
                { text: "c", color: "yellow", bold: true },
                { text: " comment  ", color: "gray" },
                { text: "?", color: "cyan", bold: true },
                { text: " question  ", color: "gray" },
                { text: "d", color: "red", bold: true },
                { text: " delete  ", color: "gray" },
                { text: "r", color: "green", bold: true },
                { text: " replace  ", color: "gray" },
                { text: "u", color: "white", bold: true },
                { text: " undo  ", color: "gray" },
                { text: "Enter", color: "green", bold: true },
                { text: ` ${totalAnnotations > 0 ? "send" : "approve"}  `, color: "gray" },
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

function resolveRowToStep(layout: RowLayout, absoluteRow: number): number | null {
  const { stepStartRow, stepRowCount } = layout;
  for (let i = stepStartRow.length - 1; i >= 0; i--) {
    const start = stepStartRow[i] ?? 0;
    const end = start + (stepRowCount[i] ?? 0);
    if (absoluteRow >= start && absoluteRow < end) {
      return i;
    }
  }
  return null;
}

function commitAnnotation({
  annotationType,
  inputValue,
  selectedIndices,
  setInputValue,
  setIsAnnotating,
  setSteps,
}: {
  annotationType: Annotation["type"];
  inputValue: string;
  selectedIndices: number[];
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  setIsAnnotating: React.Dispatch<React.SetStateAction<boolean>>;
  setSteps: React.Dispatch<React.SetStateAction<PlanStep[]>>;
}): void {
  const text = inputValue.trim();
  if (!text && annotationType !== "delete") {
    setInputValue("");
    setIsAnnotating(false);
    return;
  }

  const selectedSet = new Set(selectedIndices);
  const annotation: Annotation = {
    id: makeId(selectedIndices[0] ?? 0, annotationType),
    type: annotationType,
    text: text || "Remove this step",
    replacement: annotationType === "replace" ? text : undefined,
  };

  setSteps((current) =>
    current.map((step, index) => {
      if (!selectedSet.has(index)) {
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
}

function toggleDelete(steps: PlanStep[], selectedIndices: number[]): PlanStep[] {
  const selectedSet = new Set(selectedIndices);
  return steps.map((step, index) => {
    if (!selectedSet.has(index)) {
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
  const selectedSet = new Set(selectedIndices);
  return steps.map((step, index) => {
    if (!selectedSet.has(index)) {
      return step;
    }
    return {
      ...step,
      annotations: step.annotations.slice(0, -1),
    };
  });
}

function buildStatusSegments({
  selectedCount,
  totalAnnotations,
}: {
  selectedCount: number;
  totalAnnotations: number;
}): Segment[] {
  const segments: Segment[] = [];

  if (selectedCount > 0) {
    segments.push({ text: `${selectedCount} selected`, color: "blue", bold: true });
  }

  if (totalAnnotations > 0) {
    if (segments.length > 0) {
      segments.push({ text: "  " });
    }
    segments.push({
      text: `${totalAnnotations} annotation${totalAnnotations === 1 ? "" : "s"}`,
      color: "red",
      bold: true,
    });
  }

  if (segments.length === 0) {
    segments.push({ text: "No steps selected", color: "gray", dim: true });
  }

  return segments;
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
