import React from "react";
import { Box, Text } from "ink";
import type { PlanStep } from "../types.js";

interface Props {
  step: PlanStep;
  isActive: boolean;
  isSelected: boolean;
  index: number;
  totalSteps: number;
}

export const PlanStepView: React.FC<Props> = ({
  step,
  isActive,
  isSelected,
  index,
  totalSteps,
}) => {
  const hasAnnotations = step.annotations.length > 0;
  const isDeleted = step.annotations.some((a) => a.type === "delete");
  const gutter = `${String(index + 1).padStart(String(totalSteps).length, " ")}`;
  const highlighted = isActive || isSelected;
  const firstLine = step.content.split("\n")[0];
  const isHeading = /^#{1,6}\s/.test(firstLine);

  // Color logic: headings get a distinct color, body content is dimmer
  const getStepColor = () => {
    if (isDeleted) return "red";
    if (highlighted && isHeading) return "white";
    if (highlighted) return "white";
    if (isHeading) return "cyan";
    return "gray";
  };

  return (
    <Box flexDirection="column" marginBottom={0}>
      <Box>
        {/* Selection bar */}
        <Text color="blue" bold>
          {isSelected && !isActive ? "┃ " : "  "}
        </Text>

        {/* Line number gutter */}
        <Text color={highlighted ? "yellow" : "gray"} dimColor={!highlighted}>
          {gutter}{" "}
        </Text>

        {/* Active indicator */}
        <Text color="red" bold>
          {isActive ? "▸ " : "  "}
        </Text>

        {/* Step content (first line) */}
        <Text
          color={getStepColor()}
          bold={isActive || isHeading}
          backgroundColor={isSelected && !isActive ? "blue" : undefined}
          strikethrough={isDeleted}
        >
          {firstLine}
        </Text>

        {/* Annotation count badge */}
        {hasAnnotations && (
          <Text color="red" bold>
            {" "}
            [{step.annotations.length}]
          </Text>
        )}
      </Box>

      {/* Show annotations inline when step is active */}
      {isActive &&
        step.annotations.map((annotation) => (
          <Box key={annotation.id} marginLeft={6}>
            <Text color="red" dimColor>
              {"│ "}
            </Text>
            <Text color={getAnnotationColor(annotation.type)}>
              {getAnnotationIcon(annotation.type)} {annotation.text}
            </Text>
          </Box>
        ))}

      {/* Show multi-line content always */}
      {step.content.split("\n").length > 1 && (
        <Box flexDirection="column" marginLeft={6}>
          {step.content
            .split("\n")
            .slice(1)
            .filter((l) => l.trim())
            .map((line, i) => (
              <Text key={i} color="gray">
                {"  "}
                {line}
              </Text>
            ))}
        </Box>
      )}
    </Box>
  );
};

function getAnnotationColor(
  type: string
): "yellow" | "cyan" | "red" | "green" {
  switch (type) {
    case "comment":
      return "yellow";
    case "question":
      return "cyan";
    case "delete":
      return "red";
    case "replace":
      return "green";
    default:
      return "yellow";
  }
}

function getAnnotationIcon(type: string): string {
  switch (type) {
    case "comment":
      return "💬";
    case "question":
      return "❓";
    case "delete":
      return "🗑️ ";
    case "replace":
      return "✏️ ";
    default:
      return "•";
  }
}
