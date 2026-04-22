import React, { useRef, useState } from "react";
import type { Annotation, AnnotationTarget, GlobalComment, PlanStep, SourceRange } from "../types.js";
import {
  appendAnnotationInput,
  appendAnnotationNewline,
  buildAnnotationInputDisplay,
  visibleAnnotationInputLineLimit,
} from "./annotationInput.js";
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
import { extendPointSelection, resolveSelectedSourceRanges } from "./selection.js";
import type { PointSelection, SelectedSourceRange, SelectionPoint } from "./selection.js";
import type { RowLayout, Segment } from "./renderTypes.js";

type Props = {
  initialSteps: PlanStep[];
  onSubmit: (steps: PlanStep[], globalComments: GlobalComment[]) => void;
  onQuit: () => void;
};

export type EditingAnnotationRef = {
  stepIndex: number;
  annotationId: string;
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
const ANNOTATION_FOOTER_RESERVED_ROWS = HEADER_HEIGHT + 4;
const WHEEL_SCROLL_ROWS = 3;
const SELECTION_DRAG_THRESHOLD = 2;

export default function RedlineApp({
  initialSteps,
  onSubmit,
  onQuit,
}: Props): React.ReactNode {
  const size = useTerminalSize();
  const scrollRef = useRef<ScrollBoxHandle | null>(null);
  const isDraggingRef = useRef(false);
  const dragAnchorRef = useRef<SelectionPoint | null>(null);
  const hasDraggedRef = useRef(false);
  const [steps, setSteps] = useState(initialSteps);
  const [pointSelection, setPointSelection] = useState<PointSelection | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isGlobalAnnotating, setIsGlobalAnnotating] = useState(false);
  const [annotationType, setAnnotationType] = useState<Annotation["type"]>("comment");
  const [inputValue, setInputValue] = useState("");
  const [globalComments, setGlobalComments] = useState<GlobalComment[]>([]);
  const [editingAnnotation, setEditingAnnotation] = useState<EditingAnnotationRef | null>(null);

  const contentWidth = Math.max(1, size.columns - 2);
  const maxVisibleAnnotationInputLines = visibleAnnotationInputLineLimit(size.rows, ANNOTATION_FOOTER_RESERVED_ROWS);
  const annotationInputDisplay = buildAnnotationInputDisplay(
    inputValue,
    contentWidth,
    maxVisibleAnnotationInputLines,
  );
  const annotationFooterHeight = 3 + annotationInputDisplay.visibleLineCount;
  const footerHeight = isAnnotating ? annotationFooterHeight : REVIEW_FOOTER_HEIGHT;
  const bodyHeight = Math.max(1, size.rows - HEADER_HEIGHT - footerHeight);
  const baseRowLayout = computeMarkdownRows(steps, null, null, contentWidth);
  const selectedRanges = resolveSelectedSourceRanges(baseRowLayout, pointSelection);
  const editingSelection = selectedRangeForEditingAnnotation(steps, editingAnnotation);
  const highlightedRanges = editingSelection ? [editingSelection] : selectedRanges;
  const selectedIndices = uniqueStepIndices(selectedRanges);
  const rowLayout = computeMarkdownRows(steps, null, null, contentWidth, {
    selectedSourceRanges: highlightedRanges.map((selection) => selection.range),
  });
  const selectedCount = selectedRanges.length;
  const highlightedCount = editingSelection ? 1 : selectedCount;
  const editingAnnotationRecord = findEditingAnnotation(steps, editingAnnotation);
  const totalAnnotations = steps.reduce((sum, step) => sum + step.annotations.length, 0) + globalComments.length;
  const planTitle = steps[0]?.content.split("\n")[0]?.replace(/^#+\s*/, "") ?? "";

  const saveAnnotationInput = (): void => {
    if (isGlobalAnnotating) {
      const text = inputValue.trim();
      if (text) {
        setGlobalComments((current) => [
          ...current,
          { id: `global-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text },
        ]);
        setStatusMessage("global comment added");
      }
      setInputValue("");
      setIsAnnotating(false);
      setIsGlobalAnnotating(false);
      setEditingAnnotation(null);
      return;
    }

    if (editingAnnotationRecord) {
      setSteps((current) => updateAnnotationText(current, editingAnnotation, inputValue));
      setInputValue("");
      setIsAnnotating(false);
      setEditingAnnotation(null);
      setStatusMessage("annotation updated");
      return;
    }

    commitAnnotation({
      annotationType,
      inputValue,
      selectedRanges,
      steps,
      setInputValue,
      setIsAnnotating,
      setStatusMessage,
      setSteps,
    });
  };

  useMouse((event) => {
    if (shouldIgnoreMouseForAnnotation(isAnnotating, event.type)) {
      isDraggingRef.current = false;
      dragAnchorRef.current = null;
      hasDraggedRef.current = false;
      return;
    }

    if (event.type === "wheel") {
      if (isInsideBody(event.y, bodyHeight)) {
        scrollRef.current?.scrollBy(event.wheel === "up" ? -WHEEL_SCROLL_ROWS : WHEEL_SCROLL_ROWS);
      }
      return;
    }

    if (!isInsideBody(event.y, bodyHeight)) {
      if (event.type === "press" && event.button === "left" && !event.shift) {
        setPointSelection(null);
        setStatusMessage("");
      }
      if (event.type === "release") {
        if (!isDraggingRef.current && !event.shift) {
          setPointSelection(null);
          setStatusMessage("");
        }
        isDraggingRef.current = false;
        dragAnchorRef.current = null;
        hasDraggedRef.current = false;
      }
      return;
    }

    if (event.button !== "left") {
      return;
    }

    const point = pointFromMouse(event.x, event.y, scrollRef.current, bodyHeight, rowLayout.rows.length, contentWidth);
    const annotationHit = annotationHitFromPoint(rowLayout, point);

    if (event.type === "press") {
      if (!event.shift && annotationHit) {
        beginAnnotationEdit({
          annotationHit,
          steps,
          setAnnotationType,
          setEditingAnnotation,
          setInputValue,
          setIsAnnotating,
          setIsGlobalAnnotating,
          setPointSelection,
          setStatusMessage,
        });
        isDraggingRef.current = false;
        dragAnchorRef.current = null;
        hasDraggedRef.current = false;
        return;
      }

      if (event.shift) {
        setPointSelection((current) => extendPointSelection(current, point));
        isDraggingRef.current = false;
        dragAnchorRef.current = null;
        hasDraggedRef.current = false;
        setStatusMessage("");
        return;
      }

      setPointSelection(null);
      isDraggingRef.current = true;
      dragAnchorRef.current = point;
      hasDraggedRef.current = false;
      setStatusMessage("");
      return;
    }

    if (event.type === "drag" && isDraggingRef.current) {
      const anchor = dragAnchorRef.current ?? point;
      if (!hasDraggedRef.current && pointDistance(anchor, point) < SELECTION_DRAG_THRESHOLD) {
        return;
      }
      hasDraggedRef.current = true;
      setPointSelection({ anchor, focus: point });
      return;
    }

    if (event.type === "release") {
      if (isDraggingRef.current && hasDraggedRef.current) {
        const anchor = dragAnchorRef.current ?? point;
        setPointSelection({ anchor, focus: point });
      } else if (isDraggingRef.current) {
        setPointSelection(null);
      } else if (!event.shift) {
        setPointSelection(null);
        setStatusMessage("");
      }
      isDraggingRef.current = false;
      dragAnchorRef.current = null;
      hasDraggedRef.current = false;
    }
  });

  useInput((input, key) => {
    if (isAnnotating) {
      if (key.escape) {
        setInputValue("");
        setIsAnnotating(false);
        setIsGlobalAnnotating(false);
        setEditingAnnotation(null);
        setPointSelection(null);
        setStatusMessage("");
        return;
      }

      if (editingAnnotationRecord && key.ctrl && key.name === "d") {
        setSteps((current) => removeAnnotation(current, editingAnnotation));
        setInputValue("");
        setIsAnnotating(false);
        setEditingAnnotation(null);
        setStatusMessage("annotation removed");
        return;
      }

      if (isSaveInputKey(input, key)) {
        saveAnnotationInput();
        return;
      }

      if (key.return) {
        setInputValue(appendAnnotationNewline);
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

      if (input && !key.ctrl && !key.meta) {
        setInputValue((current) => appendAnnotationInput(current, input));
      }
      return;
    }

    if (input === "q" || (key.ctrl && key.name === "c")) {
      onQuit();
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
      setPointSelection(null);
      setStatusMessage("");
      return;
    }

    if (input === "C") {
      setAnnotationType("comment");
      setInputValue("");
      setEditingAnnotation(null);
      setStatusMessage("");
      setIsGlobalAnnotating(true);
      setIsAnnotating(true);
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
      setSteps((current) => toggleDelete(current, selectedRanges));
      setStatusMessage(`${selectedCount} range${selectedCount === 1 ? "" : "s"} marked for delete`);
      return;
    }

    if (input === "u") {
      if (selectedCount === 0) {
        if (globalComments.length > 0) {
          setGlobalComments((current) => current.slice(0, -1));
          setStatusMessage("undid last global comment");
        } else {
          setStatusMessage("select text first");
        }
        return;
      }
      setSteps((current) => undoLastAnnotation(current, selectedIndices));
      setStatusMessage(`undid latest annotation on ${selectedCount} range${selectedCount === 1 ? "" : "s"}`);
      return;
    }

    if (key.return) {
      onSubmit(steps, globalComments);
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
          <Box paddingX={1} height={annotationInputDisplay.visibleLineCount + 2} flexShrink={0}>
            <InlineTextLine
              segments={[
                { text: `${TYPE_ICONS[annotationType]} `, color: TYPE_COLORS[annotationType], bold: true },
                {
                  text: isGlobalAnnotating
                    ? "Global comment"
                    : editingAnnotationRecord
                      ? `Editing ${TYPE_LABELS[editingAnnotationRecord.annotation.type].toLowerCase()}`
                      : `${TYPE_LABELS[annotationType]} (${selectedCount} range${selectedCount === 1 ? "" : "s"})`,
                  color: TYPE_COLORS[annotationType],
                  bold: true,
                },
              ]}
            />
            <Text
              color="white"
              width={contentWidth}
              height={annotationInputDisplay.visibleLineCount}
              flexShrink={0}
            >
              {annotationInputDisplay.text}
            </Text>
            <InlineTextLine
              segments={[
                { text: "Ctrl+S", color: "green", bold: true },
                { text: " save  ", color: "gray" },
                ...(editingAnnotationRecord
                  ? [
                      { text: "Ctrl+D", color: "red" as const, bold: true },
                      { text: " remove  ", color: "gray" as const },
                    ]
                  : []),
                { text: "Enter", color: "green", bold: true },
                { text: " newline  ", color: "gray" },
                { text: "Esc", color: "gray", bold: true },
                { text: " cancel", color: "gray" },
              ]}
            />
          </Box>
        ) : (
          <Box paddingX={1} flexShrink={0}>
            <InlineTextLine
              segments={buildStatusSegments({
                selectedCount: highlightedCount,
                totalAnnotations,
                statusMessage,
              })}
            />
            <InlineTextLine
              segments={[
                { text: "wheel", color: "white", bold: true },
                { text: "/Page scroll  ", color: "gray" },
                { text: "drag", color: "blue", bold: true },
                { text: "/Shift-click select  ", color: "gray" },
                { text: "c", color: "yellow", bold: true },
                { text: " comment  ", color: "gray" },
                { text: "C", color: "yellow", bold: true },
                { text: " global  ", color: "gray" },
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

export function shouldIgnoreMouseForAnnotation(
  isAnnotating: boolean,
  eventType: "wheel" | "press" | "release" | "drag",
): boolean {
  return isAnnotating && eventType !== "wheel";
}

export function annotationHitFromPoint(
  rowLayout: RowLayout,
  point: SelectionPoint,
): EditingAnnotationRef | null {
  const row = rowLayout.rows[point.row];
  if (row?.role !== "annotation" || row.stepIndex === undefined || !row.annotationId) {
    return null;
  }

  return {
    stepIndex: row.stepIndex,
    annotationId: row.annotationId,
  };
}

export function findEditingAnnotation(
  steps: PlanStep[],
  editing: EditingAnnotationRef | null,
): { step: PlanStep; annotation: Annotation; stepIndex: number } | null {
  if (!editing) {
    return null;
  }

  const step = steps[editing.stepIndex];
  const annotation = step?.annotations.find((candidate) => candidate.id === editing.annotationId);
  if (!step || !annotation) {
    return null;
  }

  return { step, annotation, stepIndex: editing.stepIndex };
}

export function selectedRangeForEditingAnnotation(
  steps: PlanStep[],
  editing: EditingAnnotationRef | null,
): SelectedSourceRange | null {
  const editingRecord = findEditingAnnotation(steps, editing);
  if (!editingRecord) {
    return null;
  }

  return selectedRangeForAnnotation(
    editingRecord.step,
    editingRecord.stepIndex,
    editingRecord.annotation,
  );
}

export function selectedRangeForAnnotation(
  step: PlanStep,
  stepIndex: number,
  annotation: Annotation,
): SelectedSourceRange {
  return {
    stepIndex,
    range: annotation.target?.range ?? { start: step.sourceStart, end: step.sourceEnd },
    wholeStep: annotation.target?.wholeStep ?? true,
  };
}

export function annotationEditorText(annotation: Annotation): string {
  return annotation.replacement ?? annotation.text;
}

export function updateAnnotationText(
  steps: PlanStep[],
  editing: EditingAnnotationRef | null,
  inputValue: string,
): PlanStep[] {
  if (!editing) {
    return steps;
  }

  const text = inputValue.trim();
  return steps.map((step, stepIndex) => {
    if (stepIndex !== editing.stepIndex) {
      return step;
    }

    return {
      ...step,
      annotations: step.annotations.map((annotation) => {
        if (annotation.id !== editing.annotationId) {
          return annotation;
        }

        const nextText = annotation.type === "delete"
          ? text || "Remove selected range"
          : text || annotation.text;

        return {
          ...annotation,
          text: nextText,
          replacement: annotation.type === "replace" ? nextText : annotation.replacement,
        };
      }),
    };
  });
}

export function removeAnnotation(
  steps: PlanStep[],
  editing: EditingAnnotationRef | null,
): PlanStep[] {
  if (!editing) {
    return steps;
  }

  return steps.map((step, stepIndex) => {
    if (stepIndex !== editing.stepIndex) {
      return step;
    }

    return {
      ...step,
      annotations: step.annotations.filter((annotation) => annotation.id !== editing.annotationId),
    };
  });
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

function isSaveInputKey(input: string, key: { ctrl?: boolean; meta?: boolean; name?: string }): boolean {
  const keyName = key.name?.toLowerCase();
  const inputName = input.toLowerCase();

  return Boolean(
    (key.meta && (inputName === "s" || keyName === "s")) ||
    (key.ctrl && (inputName === "s" || keyName === "s"))
  );
}

function beginAnnotationEdit({
  annotationHit,
  steps,
  setAnnotationType,
  setEditingAnnotation,
  setInputValue,
  setIsAnnotating,
  setIsGlobalAnnotating,
  setPointSelection,
  setStatusMessage,
}: {
  annotationHit: EditingAnnotationRef;
  steps: PlanStep[];
  setAnnotationType: React.Dispatch<React.SetStateAction<Annotation["type"]>>;
  setEditingAnnotation: React.Dispatch<React.SetStateAction<EditingAnnotationRef | null>>;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  setIsAnnotating: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGlobalAnnotating: React.Dispatch<React.SetStateAction<boolean>>;
  setPointSelection: React.Dispatch<React.SetStateAction<PointSelection | null>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
}): void {
  const editingRecord = findEditingAnnotation(steps, annotationHit);
  if (!editingRecord) {
    return;
  }

  setAnnotationType(editingRecord.annotation.type);
  setEditingAnnotation(annotationHit);
  setInputValue(annotationEditorText(editingRecord.annotation));
  setIsGlobalAnnotating(false);
  setIsAnnotating(true);
  setPointSelection(null);
  setStatusMessage("");
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
  selectedRanges,
  steps,
  setInputValue,
  setIsAnnotating,
  setStatusMessage,
  setSteps,
}: {
  annotationType: Annotation["type"];
  inputValue: string;
  selectedRanges: SelectedSourceRange[];
  steps: PlanStep[];
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

  setSteps((current) =>
    current.map((step, index) => {
      const selectedRange = selectedRanges.find((range) => range.stepIndex === index);
      if (!selectedRange) {
        return step;
      }
      const annotation: Annotation = {
        id: makeId(index, annotationType),
        type: annotationType,
        text: text || "Remove selected range",
        target: buildAnnotationTarget(steps[index] ?? step, selectedRange),
        replacement: annotationType === "replace" ? text : undefined,
      };
      return {
        ...step,
        annotations: [...step.annotations, annotation],
      };
    }),
  );
  setInputValue("");
  setIsAnnotating(false);
  setStatusMessage(`${selectedRanges.length} range${selectedRanges.length === 1 ? "" : "s"} annotated`);
}

function toggleDelete(steps: PlanStep[], selectedRanges: SelectedSourceRange[]): PlanStep[] {
  return steps.map((step, index) => {
    const selectedRange = selectedRanges.find((range) => range.stepIndex === index);
    if (!selectedRange) {
      return step;
    }

    const hasDelete = step.annotations.some((annotation) =>
      annotation.type === "delete" && sameTargetRange(annotation.target?.range, selectedRange.range),
    );
    if (hasDelete) {
      return {
        ...step,
        annotations: step.annotations.filter((annotation) =>
          annotation.type !== "delete" || !sameTargetRange(annotation.target?.range, selectedRange.range),
        ),
      };
    }

    return {
      ...step,
      annotations: [
        ...step.annotations,
        {
          id: makeId(index, "delete"),
          type: "delete",
          text: "Remove selected range",
          target: buildAnnotationTarget(step, selectedRange),
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
      text: `${selectedCount} range${selectedCount === 1 ? "" : "s"} selected`,
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

function pointFromMouse(
  terminalX: number,
  terminalY: number,
  scrollBox: ScrollBoxHandle | null,
  bodyHeight: number,
  rowCount: number,
  contentWidth: number,
): SelectionPoint {
  const localY = Math.max(0, Math.min(bodyHeight - 1, terminalY - HEADER_HEIGHT));
  const scrollTop = scrollBox?.getScrollTop() ?? 0;
  return {
    row: Math.max(0, Math.min(Math.max(0, rowCount - 1), Math.floor(scrollTop) + localY)),
    column: Math.max(0, Math.min(Math.max(0, contentWidth - 1), terminalX)),
  };
}

function pointDistance(left: SelectionPoint, right: SelectionPoint): number {
  return Math.abs(left.row - right.row) + Math.abs(left.column - right.column);
}

function uniqueStepIndices(selectedRanges: SelectedSourceRange[]): number[] {
  return [...new Set(selectedRanges.map((range) => range.stepIndex))].sort((left, right) => left - right);
}

function buildAnnotationTarget(step: PlanStep, selectedRange: SelectedSourceRange): AnnotationTarget {
  const start = Math.max(step.sourceStart, Math.min(selectedRange.range.start, step.sourceEnd));
  const end = Math.max(start, Math.min(selectedRange.range.end, step.sourceEnd));
  const excerpt = step.content.slice(start - step.sourceStart, end - step.sourceStart);
  const startPosition = sourcePositionForStepOffset(step, start);
  const endPosition = sourcePositionForStepOffset(step, end);

  return {
    range: { start, end },
    lineStart: startPosition.line,
    columnStart: startPosition.column,
    lineEnd: endPosition.line,
    columnEnd: endPosition.column,
    excerpt,
    wholeStep: selectedRange.wholeStep,
  };
}

function sourcePositionForStepOffset(
  step: PlanStep,
  absoluteOffset: number,
): { line: number; column: number } {
  const localOffset = Math.max(0, Math.min(step.content.length, absoluteOffset - step.sourceStart));
  let line = 1;
  let column = 1;

  for (let index = 0; index < localOffset; index++) {
    if (step.content[index] === "\n") {
      line += 1;
      column = 1;
      continue;
    }
    column += 1;
  }

  return {
    line: step.sourceStartLine + line - 1,
    column: line === 1 ? step.sourceStartColumn + column - 1 : column,
  };
}

function sameTargetRange(left: SourceRange | undefined, right: SourceRange): boolean {
  return Boolean(left && left.start === right.start && left.end === right.end);
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
