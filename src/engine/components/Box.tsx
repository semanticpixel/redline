import React from "react";
import type { MiniStyle } from "../dom.js";

export interface BoxProps extends MiniStyle {
  children?: React.ReactNode;
}

const Box = React.forwardRef<object, BoxProps>(function Box(
  { children, ...style },
  ref,
) {
  return React.createElement("mini-box", { ref, style }, children);
});

export default Box;
