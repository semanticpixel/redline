import React, { useImperativeHandle, useRef } from "react";
import type { MiniNode, MiniStyle } from "../dom.js";
import { markDirty } from "../dom.js";

export interface ScrollBoxHandle {
  scrollTo(y: number): void;
  scrollBy(dy: number): void;
  scrollToBottom(): void;
  getScrollTop(): number;
  getScrollHeight(): number;
  getViewportHeight(): number;
}

export interface ScrollBoxProps extends MiniStyle {
  children?: React.ReactNode;
}

const ScrollBox = React.forwardRef<ScrollBoxHandle, ScrollBoxProps>(function ScrollBox(
  { children, ...style },
  ref,
) {
  const hostRef = useRef<MiniNode | null>(null);

  useImperativeHandle(ref, () => ({
    scrollTo(y: number) {
      const node = hostRef.current;
      if (!node) {
        return;
      }
      node.scrollTop = Math.max(0, Math.floor(y));
      markDirty(node);
      node.root?.requestRender();
    },
    scrollBy(dy: number) {
      const node = hostRef.current;
      if (!node) {
        return;
      }
      node.scrollTop = Math.max(0, Math.floor(node.scrollTop + dy));
      markDirty(node);
      node.root?.requestRender();
    },
    scrollToBottom() {
      const node = hostRef.current;
      if (!node) {
        return;
      }
      node.scrollTop = Math.max(0, node.scrollHeight - node.viewportHeight);
      markDirty(node);
      node.root?.requestRender();
    },
    getScrollTop() {
      return hostRef.current?.scrollTop ?? 0;
    },
    getScrollHeight() {
      return hostRef.current?.scrollHeight ?? 0;
    },
    getViewportHeight() {
      return hostRef.current?.viewportHeight ?? 0;
    },
  }));

  return React.createElement("mini-scroll-box", { ref: hostRef, style }, children);
});

export default ScrollBox;
