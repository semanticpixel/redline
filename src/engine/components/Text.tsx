import React from "react";
import type { MiniStyle } from "../dom.js";

export interface TextProps extends Pick<MiniStyle, "color" | "backgroundColor" | "bold" | "dim"> {
  children?: React.ReactNode;
}

const Text = React.forwardRef<object, TextProps>(function Text(
  { children, ...style },
  ref,
) {
  const text = React.Children.toArray(children)
    .map((child) => (typeof child === "string" || typeof child === "number" ? String(child) : ""))
    .join("");

  return React.createElement("mini-text", { ref, style, text });
});

export default Text;
