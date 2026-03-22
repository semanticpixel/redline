import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import type { PlanStep, Annotation } from "../types.js";
import { PlanStepView } from "./PlanStepView.js";
import { StatusBar } from "./StatusBar.js";
import { Header } from "./Header.js";
import { formatFeedback } from "../utils/parsePlan.js";
import { emitApprove, emitDeny } from "../utils/hookIO.js";

interface Props {
  steps: PlanStep[];
}

export const App: React.FC<Props> = ({ steps: initialSteps }) => {
  const { exit } = useApp();
  const [steps, setSteps] = useState<PlanStep[]>(initialSteps);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotationType, setAnnotationType] =
    useState<Annotation["type"]>("comment");
  const [inputValue, setInputValue] = useState("");

  // Multi-select: null means no selection (single active step mode)
  // When set, it's the index where the selection started (anchor)
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);

  // Compute the selected range
  const getSelectedIndices = useCallback((): number[] => {
    if (selectionAnchor === null) return [activeIndex];
    const start = Math.min(selectionAnchor, activeIndex);
    const end = Math.max(selectionAnchor, activeIndex);
    const indices: number[] = [];
    for (let i = start; i <= end; i++) indices.push(i);
    return indices;
  }, [selectionAnchor, activeIndex]);

  const isSelected = useCallback(
    (index: number): boolean => {
      if (selectionAnchor === null) return false;
      const start = Math.min(selectionAnchor, activeIndex);
      const end = Math.max(selectionAnchor, activeIndex);
      return index >= start && index <= end;
    },
    [selectionAnchor, activeIndex]
  );

  const handleSubmit = useCallback(() => {
    const feedback = formatFeedback(steps);
    if (feedback) {
      emitDeny(feedback);
    } else {
      emitApprove();
    }
    exit();
  }, [steps, exit]);

  const handleQuit = useCallback(() => {
    process.exit(1);
  }, []);

  const startAnnotation = useCallback((type: Annotation["type"]) => {
    setAnnotationType(type);
    setIsAnnotating(true);
    setInputValue("");
  }, []);

  const commitAnnotation = useCallback(() => {
    if (!inputValue.trim() && annotationType !== "delete") {
      setIsAnnotating(false);
      return;
    }

    const selectedIndices = getSelectedIndices();

    const annotation: Annotation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: annotationType,
      text: inputValue.trim() || "Remove this step",
      replacement:
        annotationType === "replace" ? inputValue.trim() : undefined,
    };

    setSteps((prev) =>
      prev.map((step, i) =>
        selectedIndices.includes(i)
          ? { ...step, annotations: [...step.annotations, annotation] }
          : step
      )
    );

    setIsAnnotating(false);
    setInputValue("");
    setSelectionAnchor(null);
  }, [inputValue, annotationType, getSelectedIndices]);

  const undoLastAnnotation = useCallback(() => {
    const selectedIndices = getSelectedIndices();
    setSteps((prev) =>
      prev.map((step, i) =>
        selectedIndices.includes(i)
          ? { ...step, annotations: step.annotations.slice(0, -1) }
          : step
      )
    );
  }, [getSelectedIndices]);

  // Handle escape during annotation mode
  useInput(
    (_input, key) => {
      if (key.escape) {
        setIsAnnotating(false);
        setInputValue("");
      }
    },
    { isActive: isAnnotating }
  );

  // Handle keyboard input (disabled while annotating so TextInput gets focus)
  useInput(
    (input, key) => {
      // Shift+Arrow — extend/start selection
      if (key.shift && key.upArrow) {
        setSelectionAnchor((prev) => prev ?? activeIndex);
        setActiveIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.shift && key.downArrow) {
        setSelectionAnchor((prev) => prev ?? activeIndex);
        setActiveIndex((i) => Math.min(steps.length - 1, i + 1));
        return;
      }

      // Regular navigation — clears selection
      if (key.upArrow || input === "k") {
        setSelectionAnchor(null);
        setActiveIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectionAnchor(null);
        setActiveIndex((i) => Math.min(steps.length - 1, i + 1));
        return;
      }

      // Escape clears selection
      if (key.escape) {
        setSelectionAnchor(null);
        return;
      }

      // Annotation triggers — apply to all selected steps
      if (input === "c") {
        startAnnotation("comment");
        return;
      }
      if (input === "?") {
        startAnnotation("question");
        return;
      }
      if (input === "d") {
        const selectedIndices = getSelectedIndices();
        setSteps((prev) =>
          prev.map((step, i) => {
            if (!selectedIndices.includes(i)) return step;
            const hasDelete = step.annotations.some((a) => a.type === "delete");
            if (hasDelete) {
              // Toggle off — remove delete annotations
              return {
                ...step,
                annotations: step.annotations.filter((a) => a.type !== "delete"),
              };
            } else {
              // Toggle on — add delete annotation
              return {
                ...step,
                annotations: [
                  ...step.annotations,
                  {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    type: "delete" as const,
                    text: "Remove this step",
                  },
                ],
              };
            }
          })
        );
        setSelectionAnchor(null);
        return;
      }
      if (input === "r") {
        startAnnotation("replace");
        return;
      }

      // Undo
      if (input === "u") {
        undoLastAnnotation();
        return;
      }

      // Actions
      if (key.return) {
        handleSubmit();
        return;
      }
      if (input === "q") {
        handleQuit();
        return;
      }
    },
    { isActive: !isAnnotating }
  );

  // Compute visible window (scroll if plan is long)
  const VISIBLE_ROWS = process.stdout.rows ? process.stdout.rows - 12 : 20;
  const halfWindow = Math.floor(VISIBLE_ROWS / 2);
  let startIdx = Math.max(0, activeIndex - halfWindow);
  let endIdx = Math.min(steps.length, startIdx + VISIBLE_ROWS);
  if (endIdx - startIdx < VISIBLE_ROWS) {
    startIdx = Math.max(0, endIdx - VISIBLE_ROWS);
  }
  const visibleSteps = steps.slice(startIdx, endIdx);

  // Get plan title from first heading
  const planTitle = steps[0]?.content?.split("\n")[0]?.replace(/^#+\s*/, "");

  // Selection info for status bar
  const selectedCount = getSelectedIndices().length;

  return (
    <Box flexDirection="column" padding={1}>
      <Header planPreview={planTitle} />

      {/* Scroll indicator top */}
      {startIdx > 0 && (
        <Box marginLeft={4}>
          <Text color="gray" dimColor>
            ↑ {startIdx} more above
          </Text>
        </Box>
      )}

      {/* Plan steps */}
      <Box flexDirection="column">
        {visibleSteps.map((step) => (
          <PlanStepView
            key={step.id}
            step={step}
            isActive={step.id === steps[activeIndex]?.id}
            isSelected={isSelected(step.id)}
            index={step.id}
            totalSteps={steps.length}
          />
        ))}
      </Box>

      {/* Scroll indicator bottom */}
      {endIdx < steps.length && (
        <Box marginLeft={4}>
          <Text color="gray" dimColor>
            ↓ {steps.length - endIdx} more below
          </Text>
        </Box>
      )}

      {/* Annotation input */}
      {isAnnotating && (
        <Box marginTop={1} marginLeft={4}>
          <Text color={getTypeColor(annotationType)} bold>
            {getTypeLabel(annotationType)}
            {selectedCount > 1 ? ` (${selectedCount} steps)` : ""}:{" "}
          </Text>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={commitAnnotation}
          />
        </Box>
      )}

      <StatusBar
        steps={steps}
        activeIndex={activeIndex}
        isAnnotating={isAnnotating}
        selectedCount={selectedCount}
      />
    </Box>
  );
};

function getTypeColor(
  type: Annotation["type"]
): "yellow" | "cyan" | "red" | "green" {
  const colors: Record<Annotation["type"], "yellow" | "cyan" | "red" | "green"> = {
    comment: "yellow",
    question: "cyan",
    delete: "red",
    replace: "green",
  };
  return colors[type];
}

function getTypeLabel(type: Annotation["type"]): string {
  const labels: Record<Annotation["type"], string> = {
    comment: "💬 Comment",
    question: "❓ Question",
    delete: "🗑️  Delete reason",
    replace: "✏️  Replace with",
  };
  return labels[type];
}
