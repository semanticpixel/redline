import React from "react";
import { Box, Text } from "ink";
import type { PlanStep } from "../types.js";

interface Props {
  steps: PlanStep[];
  activeIndex: number;
  isAnnotating: boolean;
  selectedCount: number;
}

export const StatusBar: React.FC<Props> = ({
  steps,
  activeIndex,
  isAnnotating,
  selectedCount,
}) => {
  const totalAnnotations = steps.reduce(
    (sum, s) => sum + s.annotations.length,
    0
  );

  if (isAnnotating) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color="yellow" bold>
            ✎ Type your annotation, then press Enter to save
            {selectedCount > 1 ? ` (applies to ${selectedCount} steps)` : ""}
          </Text>
        </Box>
        <Box>
          <Text color="gray">Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Separator */}
      <Text color="gray" dimColor>
        {"─".repeat(60)}
      </Text>

      {/* Step counter */}
      <Box>
        <Text color="gray">
          Step {activeIndex + 1}/{steps.length}
        </Text>
        {selectedCount > 1 && (
          <Text color="blue" bold>
            {"  "}
            {selectedCount} selected
          </Text>
        )}
        {totalAnnotations > 0 && (
          <Text color="red" bold>
            {"  "}
            {totalAnnotations} annotation{totalAnnotations !== 1 ? "s" : ""}
          </Text>
        )}
      </Box>

      {/* Keybindings */}
      <Box gap={2} marginTop={0}>
        <Text color="gray">
          <Text color="white" bold>
            ↑↓
          </Text>{" "}
          navigate
        </Text>
        <Text color="gray">
          <Text color="blue" bold>
            Shift+↑↓
          </Text>{" "}
          select
        </Text>
        <Text color="gray">
          <Text color="yellow" bold>
            c
          </Text>{" "}
          comment
        </Text>
        <Text color="gray">
          <Text color="cyan" bold>
            ?
          </Text>{" "}
          question
        </Text>
        <Text color="gray">
          <Text color="red" bold>
            d
          </Text>{" "}
          delete
        </Text>
        <Text color="gray">
          <Text color="green" bold>
            r
          </Text>{" "}
          replace
        </Text>
      </Box>
      <Box gap={2}>
        <Text color="gray">
          <Text color="white" bold>
            u
          </Text>{" "}
          undo last
        </Text>
        <Text color="gray">
          <Text color="green" bold>
            Enter
          </Text>{" "}
          {totalAnnotations > 0 ? "send feedback" : "approve"}
        </Text>
        <Text color="gray">
          <Text color="gray" bold>
            q
          </Text>{" "}
          quit
        </Text>
      </Box>
    </Box>
  );
};
