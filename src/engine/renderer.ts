import type { MiniNode } from "./dom.js";
import { getNodeText } from "./dom.js";
import type { CellStyle } from "./screen.js";
import { StylePool, createScreen } from "./screen.js";
import Output from "./output.js";
import { wrapText } from "./layout/yoga.js";

export function renderTree(root: MiniNode, width: number, height: number) {
  const stylePool = new StylePool();
  const screen = createScreen(width, height);
  const output = new Output(screen);

  for (const child of root.children) {
    renderNode(child, output, stylePool, { x: 0, y: 0 }, {});
  }

  return {
    screen: output.get(),
    stylePool,
  };
}

function renderNode(
  node: MiniNode,
  output: Output,
  stylePool: StylePool,
  offset: { x: number; y: number },
  inheritedTextStyle: CellStyle,
): void {
  const x = offset.x + node.layout.x;
  const y = offset.y + node.layout.y;
  const textStyle = mergeTextStyle(inheritedTextStyle, node.style);

  if (node.type === "mini-alt-screen") {
    for (const child of node.children) {
      renderNode(child, output, stylePool, { x, y }, textStyle);
    }
    return;
  }

  if (node.type === "mini-box" || node.type === "root") {
    paintBackground(node, output, stylePool, x, y, textStyle);
    for (const child of node.children) {
      renderNode(child, output, stylePool, { x, y }, textStyle);
    }
    node.dirty = false;
    return;
  }

  if (node.type === "mini-scroll-box") {
    paintBackground(node, output, stylePool, x, y, textStyle);
    node.viewportHeight = node.layout.height;
    const contentHeight = Math.max(
      node.layout.height,
      ...node.children.map((child) => child.layout.y + child.layout.height),
      0,
    );
    node.scrollHeight = contentHeight;
    const maxScroll = Math.max(0, contentHeight - node.viewportHeight);
    node.scrollTop = Math.max(0, Math.min(node.scrollTop, maxScroll));

    output.clip({
      x,
      y,
      width: node.layout.width,
      height: node.layout.height,
    });
    for (const child of node.children) {
      renderNode(
        child,
        output,
        stylePool,
        { x, y: y - node.scrollTop },
        textStyle,
      );
    }
    output.unclip();
    node.dirty = false;
    return;
  }

  if (node.type === "mini-text" || node.type === "raw-text") {
    const fullText = getNodeText(node);
    const lines = wrapText(fullText, Math.max(1, node.layout.width));
    if (node.segments.length > 0 && lines.length <= 1) {
      let cursorX = x;
      for (const segment of node.segments) {
        const segmentStyle = mergeTextStyle(textStyle, segment.style ?? {});
        const styleId = stylePool.intern(segmentStyle);
        const maxChars = Math.max(0, node.layout.width - (cursorX - x));
        const sliced = segment.text.slice(0, maxChars);
        output.write(cursorX, y, sliced, styleId);
        cursorX += sliced.length;
        if (cursorX >= x + node.layout.width) {
          break;
        }
      }
      node.dirty = false;
      return;
    }

    const styleId = stylePool.intern(textStyle);
    for (let index = 0; index < Math.min(lines.length, node.layout.height); index++) {
      const line = lines[index] ?? "";
      output.write(x, y + index, line.slice(0, node.layout.width), styleId);
    }
    node.dirty = false;
  }
}

function paintBackground(
  node: MiniNode,
  output: Output,
  stylePool: StylePool,
  x: number,
  y: number,
  textStyle: CellStyle,
): void {
  const styleId = stylePool.intern(textStyle);
  if (node.style.backgroundColor) {
    output.fill(
      {
        x,
        y,
        width: node.layout.width,
        height: node.layout.height,
      },
      styleId,
    );
  }
}

function mergeTextStyle(
  inherited: CellStyle,
  current: {
    color?: string;
    backgroundColor?: string;
    bold?: boolean;
    dim?: boolean;
  },
): CellStyle {
  return {
    color: current.color ?? inherited.color,
    backgroundColor: current.backgroundColor ?? inherited.backgroundColor,
    bold: current.bold ?? inherited.bold,
    dim: current.dim ?? inherited.dim,
  };
}
