import Yoga from "yoga-layout";
import type { MiniNode } from "../dom.js";

export function attachYogaNode(node: MiniNode): void {
  if (node.type === "mini-text" || node.type === "raw-text") {
    const yogaNode = Yoga.Node.create();
    yogaNode.setMeasureFunc((width: number, widthMode: number) => {
      const wrapWidth =
        widthMode === Yoga.MEASURE_MODE_UNDEFINED ? undefined : Math.max(1, Math.floor(width));
      const lines = wrapText(node.text, wrapWidth);
      const measuredWidth =
        wrapWidth === undefined
          ? Math.max(1, ...lines.map((line) => line.length), 1)
          : Math.min(wrapWidth, Math.max(1, ...lines.map((line) => line.length), 1));
      return { width: measuredWidth, height: Math.max(1, lines.length) };
    });
    node.yogaNode = yogaNode;
    applyYogaStyle(node);
    return;
  }

  node.yogaNode = Yoga.Node.create();
  applyYogaStyle(node);
}

export function applyYogaStyle(node: MiniNode): void {
  const yogaNode = node.yogaNode;
  if (!yogaNode) {
    return;
  }

  const style = node.style;

  yogaNode.setDisplay(Yoga.DISPLAY_FLEX);
  yogaNode.setFlexDirection(
    style.flexDirection === "row" ? Yoga.FLEX_DIRECTION_ROW : Yoga.FLEX_DIRECTION_COLUMN,
  );

  if (style.flexGrow !== undefined) {
    yogaNode.setFlexGrow(style.flexGrow);
  }
  if (style.flexShrink !== undefined) {
    yogaNode.setFlexShrink(style.flexShrink);
  }

  setDimension(yogaNode, "width", style.width);
  setDimension(yogaNode, "height", style.height);

  const paddingTop = style.paddingTop ?? style.paddingY ?? style.padding ?? 0;
  const paddingBottom = style.paddingBottom ?? style.paddingY ?? style.padding ?? 0;
  const paddingLeft = style.paddingLeft ?? style.paddingX ?? style.padding ?? 0;
  const paddingRight = style.paddingRight ?? style.paddingX ?? style.padding ?? 0;
  yogaNode.setPadding(Yoga.EDGE_TOP, paddingTop);
  yogaNode.setPadding(Yoga.EDGE_BOTTOM, paddingBottom);
  yogaNode.setPadding(Yoga.EDGE_LEFT, paddingLeft);
  yogaNode.setPadding(Yoga.EDGE_RIGHT, paddingRight);
}

export function computeYogaLayout(root: MiniNode, width: number, height: number): void {
  if (!root.yogaNode) {
    return;
  }

  root.yogaNode.setWidth(width);
  root.yogaNode.setHeight(height);
  root.yogaNode.calculateLayout(width, height, Yoga.DIRECTION_LTR);
  syncLayout(root);
}

export function wrapText(text: string, width?: number): string[] {
  const rawLines = text.split("\n");
  if (width === undefined || width <= 0) {
    return rawLines.length > 0 ? rawLines : [""];
  }

  const lines: string[] = [];
  for (const rawLine of rawLines) {
    if (rawLine.length === 0) {
      lines.push("");
      continue;
    }

    let remaining = rawLine;
    while (remaining.length > width) {
      let breakIndex = remaining.lastIndexOf(" ", width);
      if (breakIndex <= 0) {
        breakIndex = width;
      }
      lines.push(remaining.slice(0, breakIndex));
      remaining = remaining.slice(breakIndex).trimStart();
    }
    lines.push(remaining);
  }

  return lines.length > 0 ? lines : [""];
}

function syncLayout(node: MiniNode): void {
  if (!node.yogaNode) {
    return;
  }

  node.layout = {
    x: Math.floor(node.yogaNode.getComputedLeft()),
    y: Math.floor(node.yogaNode.getComputedTop()),
    width: Math.floor(node.yogaNode.getComputedWidth()),
    height: Math.floor(node.yogaNode.getComputedHeight()),
  };

  const children = node.children.filter((child) => child.yogaNode);
  for (let index = 0; index < children.length; index++) {
    const child = children[index]!;
    const childYoga = node.yogaNode.getChild(index);
    child.yogaNode = childYoga;
    syncLayout(child);
  }
}

function setDimension(
  yogaNode: any,
  dimension: "width" | "height",
  value: number | string | undefined,
): void {
  if (value === undefined) {
    return;
  }

  if (typeof value === "string" && value.endsWith("%")) {
    const percentage = Number.parseFloat(value.slice(0, -1));
    if (dimension === "width") {
      yogaNode.setWidthPercent(percentage);
    } else {
      yogaNode.setHeightPercent(percentage);
    }
    return;
  }

  if (typeof value === "number") {
    if (dimension === "width") {
      yogaNode.setWidth(value);
    } else {
      yogaNode.setHeight(value);
    }
  }
}
