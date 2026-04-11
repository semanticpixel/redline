import type { MiniStyle } from "../dom.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import Text from "./Text.js";

export interface DividerProps extends Pick<MiniStyle, "color" | "backgroundColor" | "bold" | "dim"> {
  width?: number;
}

export function Divider({width, ...style} : DividerProps) {
  const size = useTerminalSize();
  const contentWidth = width ?? size.columns;

  return (
    <Text {...style}>
      {"─".repeat(contentWidth)}
    </Text>
  )
}