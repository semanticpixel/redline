import React, { useRef, useState } from "react";
import type { Annotation, PlanStep } from "../types.js";
import { AlternateScreen } from "./components/AlternateScreen.js";
import Box from "./components/Box.js";
import { Divider } from "./components/Divider.js";
import ScrollBox from "./components/ScrollBox.js";
import type { ScrollBoxHandle } from "./components/ScrollBox.js";
import Text from "./components/Text.js";
import { useInput } from "./hooks/useInput.js";
import { useMouse } from "./hooks/useMouse.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { computeMarkdownRows } from "./markdownRows.js";
import { resolveSelectedStepIndices } from "./selection.js";
import type { RowSelection } from "./selection.js";
import type { Segment } from "./renderTypes.js";

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
const WHEEL_SCROLL_ROWS = 3;

export default function RedlineApp({
  initialSteps,
  onSubmit,
  onQuit,
}: Props): React.ReactNode {
  const size = useTerminalSize();
  const scrollRef = useRef<ScrollBoxHandle | null>(null);
  const isDraggingRef = useRef(false);
  const [steps, setSteps] = useState(initialSteps);
  const [rowSelection, setRowSelection] = useState<RowSelection | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotationType, setAnnotationType] = useState<Annotation["type"]>("comment");
  const [inputValue, setInputValue] = useState("");

  const footerHeight = isAnnotating ? ANNOTATION_FOOTER_HEIGHT : REVIEW_FOOTER_HEIGHT;
  const bodyHeight = Math.max(1, size.rows - HEADER_HEIGHT - footerHeight);
  const contentWidth = Math.max(12, size.columns - 2);
  const baseRowLayout = computeMarkdownRows(steps, null, null, contentWidth);
  const selectedIndices = resolveSelectedStepIndices(baseRowLayout, rowSelection);
  const rowLayout = computeMarkdownRows(steps, null, null, contentWidth, {
    selectedStepIndices: selectedIndices,
  });
  const selectedCount = selectedIndices.length;
  const totalAnnotations = steps.reduce((sum, step) => sum + step.annotations.length, 0);
  const planTitle = steps[0]?.content.split("\n")[0]?.replace(/^#+\s*/, "") ?? "";

  useMouse((event) => {
    if (!isInsideBody(event.y, bodyHeight)) {
      if (event.type === "release") {
        isDraggingRef.current = false;
      }
      return;
    }

    if (event.type === "wheel") {
      scrollRef.current?.scrollBy(event.wheel === "up" ? -WHEEL_SCROLL_ROWS : WHEEL_SCROLL_ROWS);
      return;
    }

    if (event.button !== "left") {
      return;
    }

    const row = rowFromMouse(event.y, scrollRef.current, bodyHeight, rowLayout.rows.length);

    if (event.type === "press") {
      setRowSelection({ anchor: row, focus: row });
      isDraggingRef.current = true;
      setStatusMessage("");
      return;
    }

    if (event.type === "drag" && isDraggingRef.current) {
      setRowSelection((current) => current ? { ...current, focus: row } : { anchor: row, focus: row });
      return;
    }

    if (event.type === "release") {
      if (isDraggingRef.current) {
        setRowSelection((current) => current ? { ...current, focus: row } : current);
      }
      isDraggingRef.current = false;
    }
  });

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && key.name === "c")) {
      onQuit();
      return;
    }

    if (isAnnotating) {
      if (key.escape) {
        setInputValue("");
        setIsAnnotating(false);
        setRowSelection(null);
        setStatusMessage("");
        return;
      }

      if (key.return) {
        commitAnnotation({
          annotationType,
          inputValue,
          selectedIndices,
          setInputValue,
          setIsAnnotating,
          setStatusMessage,
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

    if (key.pageUp) {
      scrollRef.current?.scrollBy(-bodyHeight);
      return;
    }

    if (key.pageDown) {
      scrollRef.current?.scrollBy(bodyHeight);
      return;
    }

    if (key.home) {
      scrollRef.current?.scrollTo(0);
      return;
    }

    if (key.end) {
      scrollRef.current?.scrollToBottom();
      return;
    }

    if (key.escape) {
      setRowSelection(null);
      setStatusMessage("");
      return;
    }

    if (input === "c") {
      beginAnnotation("comment", selectedCount, setAnnotationType, setInputValue, setIsAnnotating, setStatusMessage);
      return;
    }

    if (input === "?") {
      beginAnnotation("question", selectedCount, setAnnotationType, setInputValue, setIsAnnotating, setStatusMessage);
      return;
    }

    if (input === "r") {
      beginAnnotation("replace", selectedCount, setAnnotationType, setInputValue, setIsAnnotating, setStatusMessage);
      return;
    }

    if (input === "d") {
      if (selectedCount === 0) {
        setStatusMessage("select text first");
        return;
      }
      setSteps((current) => toggleDelete(current, selectedIndices));
      setStatusMessage(`${selectedCount} step${selectedCount === 1 ? "" : "s"} marked for delete`);
      return;
    }

    if (input === "u") {
      if (selectedCount === 0) {
        setStatusMessage("select text first");
        return;
      }
      setSteps((current) => undoLastAnnotation(current, selectedIndices));
      setStatusMessage(`undid latest annotation on ${selectedCount} step${selectedCount === 1 ? "" : "s"}`);
      return;
    }

    if (key.return) {
      onSubmit(steps);
    }
  });

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

        <ScrollBox ref={scrollRef} height={bodyHeight} paddingX={0} flexShrink={0}>
          {rowLayout.rows.map((row) => (
            <InlineTextLine key={row.key} segments={row.segments} />
          ))}
        </ScrollBox>

        <Divider color="yellow" dim />

        {isAnnotating ? (
          <Box paddingX={1} flexShrink={0}>
            <InlineTextLine
              segments={[
                { text: `${TYPE_ICONS[annotationType]} `, color: TYPE_COLORS[annotationType], bold: true },
                {
                  text: `${TYPE_LABELS[annotationType]} (${selectedCount} step${selectedCount === 1 ? "" : "s"})`,
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
              segments={buildStatusSegments({
                selectedCount,
                totalAnnotations,
                statusMessage,
              })}
            />
            <InlineTextLine
              segments={[
                { text: "wheel", color: "white", bold: true },
                { text: "/Page scroll  ", color: "gray" },
                { text: "drag", color: "blue", bold: true },
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
                { text: "Esc", color: "gray", bold: true },
                { text: " clear  ", color: "gray" },
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

function beginAnnotation(
  annotationType: Annotation["type"],
  selectedCount: number,
  setAnnotationType: React.Dispatch<React.SetStateAction<Annotation["type"]>>,
  setInputValue: React.Dispatch<React.SetStateAction<string>>,
  setIsAnnotating: React.Dispatch<React.SetStateAction<boolean>>,
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>,
): void {
  if (selectedCount === 0) {
    setStatusMessage("select text first");
    return;
  }

  setAnnotationType(annotationType);
  setInputValue("");
  setStatusMessage("");
  setIsAnnotating(true);
}

function commitAnnotation({
  annotationType,
  inputValue,
  selectedIndices,
  setInputValue,
  setIsAnnotating,
  setStatusMessage,
  setSteps,
}: {
  annotationType: Annotation["type"];
  inputValue: string;
  selectedIndices: number[];
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  setIsAnnotating: React.Dispatch<React.SetStateAction<boolean>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  setSteps: React.Dispatch<React.SetStateAction<PlanStep[]>>;
}): void {
  const text = inputValue.trim();
  if (!text && annotationType !== "delete") {
    setInputValue("");
    setIsAnnotating(false);
    return;
  }

  const annotation: Annotation = {
    id: makeId(selectedIndices[0] ?? 0, annotationType),
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
  setStatusMessage(`${selectedIndices.length} step${selectedIndices.length === 1 ? "" : "s"} annotated`);
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
  selectedCount,
  totalAnnotations,
  statusMessage,
}: {
  selectedCount: number;
  totalAnnotations: number;
  statusMessage: string;
}): Segment[] {
  const segments: Segment[] = [];

  if (statusMessage) {
    segments.push({ text: statusMessage, color: "yellow", bold: true });
  } else if (selectedCount > 0) {
    segments.push({
      text: `${selectedCount} step${selectedCount === 1 ? "" : "s"} selected`,
      color: "blue",
      bold: true,
    });
  } else {
    segments.push({ text: "Drag select text to annotate", color: "gray" });
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

function isInsideBody(y: number, bodyHeight: number): boolean {
  return y >= HEADER_HEIGHT && y < HEADER_HEIGHT + bodyHeight;
}

function rowFromMouse(
  terminalY: number,
  scrollBox: ScrollBoxHandle | null,
  bodyHeight: number,
  rowCount: number,
): number {
  const localY = Math.max(0, Math.min(bodyHeight - 1, terminalY - HEADER_HEIGHT));
  const scrollTop = scrollBox?.getScrollTop() ?? 0;
  return Math.max(0, Math.min(Math.max(0, rowCount - 1), Math.floor(scrollTop) + localY));
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
