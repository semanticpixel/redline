import React from "react";
import { Box, Text } from "ink";

interface Props {
  planPreview?: string;
}

export const Header: React.FC<Props> = ({ planPreview }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="red" bold>
          ▌ redline
        </Text>
        <Text color="gray"> — plan review</Text>
      </Box>
      {planPreview && (
        <Text color="gray" dimColor>
          {planPreview.length > 70
            ? planPreview.slice(0, 70) + "…"
            : planPreview}
        </Text>
      )}
      <Text color="gray" dimColor>
        {"─".repeat(60)}
      </Text>
    </Box>
  );
};
