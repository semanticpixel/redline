export type MiniNodeType =
  | "root"
  | "mini-box"
  | "mini-text"
  | "mini-scroll-box"
  | "mini-alt-screen"
  | "raw-text";

export interface MiniStyle {
  flexDirection?: "row" | "column";
  flexGrow?: number;
  flexShrink?: number;
  width?: number | string;
  height?: number | string;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dim?: boolean;
}

export interface MiniTextSegment {
  text: string;
  style?: Pick<MiniStyle, "color" | "backgroundColor" | "bold" | "dim">;
}

export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MiniNode {
  type: MiniNodeType;
  parent: MiniNode | null;
  children: MiniNode[];
  style: MiniStyle;
  text: string;
  segments: MiniTextSegment[];
  yogaNode: any | null;
  layout: LayoutBox;
  dirty: boolean;
  root: MiniRootNode | null;
  scrollTop: number;
  scrollHeight: number;
  viewportHeight: number;
}

export interface MiniRootNode extends MiniNode {
  type: "root";
  requestRender: () => void;
  computeLayout: () => void;
  wantsAltScreen: boolean;
}

export function createRootNode(
  requestRender: () => void,
  computeLayout: () => void,
): MiniRootNode {
  return {
    type: "root",
    parent: null,
    children: [],
    style: { flexDirection: "column", flexGrow: 1, flexShrink: 0 },
    text: "",
    segments: [],
    yogaNode: null,
    layout: { x: 0, y: 0, width: 0, height: 0 },
    dirty: true,
    root: null,
    scrollTop: 0,
    scrollHeight: 0,
    viewportHeight: 0,
    requestRender,
    computeLayout,
    wantsAltScreen: false,
  };
}

export function createNode(type: MiniNodeType): MiniNode {
  return {
    type,
    parent: null,
    children: [],
    style: {},
    text: "",
    segments: [],
    yogaNode: null,
    layout: { x: 0, y: 0, width: 0, height: 0 },
    dirty: true,
    root: null,
    scrollTop: 0,
    scrollHeight: 0,
    viewportHeight: 0,
  };
}

export function appendChildNode(parent: MiniNode, child: MiniNode): void {
  child.parent = parent;
  child.root = parent.type === "root" ? (parent as MiniRootNode) : parent.root;
  parent.children.push(child);
  attachYogaChild(parent, child);
  syncRoot(child, child.root);
  markDirty(parent);
}

export function insertBeforeNode(
  parent: MiniNode,
  child: MiniNode,
  before: MiniNode,
): void {
  const index = parent.children.indexOf(before);
  if (index === -1) {
    appendChildNode(parent, child);
    return;
  }
  child.parent = parent;
  child.root = parent.type === "root" ? (parent as MiniRootNode) : parent.root;
  parent.children.splice(index, 0, child);
  attachYogaChild(parent, child, index);
  syncRoot(child, child.root);
  markDirty(parent);
}

export function removeChildNode(parent: MiniNode, child: MiniNode): void {
  const index = parent.children.indexOf(child);
  if (index >= 0) {
    parent.children.splice(index, 1);
  }
  detachYogaChild(parent, child);
  child.parent = null;
  child.root = null;
  markDirty(parent);
}

export function setStyle(node: MiniNode, style: MiniStyle): void {
  node.style = style;
  markDirty(node);
}

export function setText(node: MiniNode, text: string): void {
  node.text = text;
  node.segments = [];
  markDirty(node);
}

export function setSegments(node: MiniNode, segments: MiniTextSegment[]): void {
  node.segments = segments;
  node.text = segments.map((segment) => segment.text).join("");
  markDirty(node);
}

export function getNodeText(node: MiniNode): string {
  if (node.segments.length > 0) {
    return node.segments.map((segment) => segment.text).join("");
  }
  return node.text;
}

export function markDirty(node: MiniNode | null): void {
  let current = node;
  while (current) {
    current.dirty = true;
    current = current.parent;
  }
}

export function findAltScreenNode(node: MiniNode): boolean {
  if (node.type === "mini-alt-screen") {
    return true;
  }
  return node.children.some(findAltScreenNode);
}

function syncRoot(node: MiniNode, root: MiniRootNode | null): void {
  node.root = root;
  for (const child of node.children) {
    syncRoot(child, root);
  }
}

function attachYogaChild(parent: MiniNode, child: MiniNode, index?: number): void {
  if (!parent.yogaNode || !child.yogaNode) {
    return;
  }

  const childCount = parent.yogaNode.getChildCount?.() ?? 0;
  const insertAt = index === undefined ? childCount : Math.max(0, Math.min(index, childCount));
  parent.yogaNode.insertChild(child.yogaNode, insertAt);
}

function detachYogaChild(parent: MiniNode, child: MiniNode): void {
  if (!parent.yogaNode || !child.yogaNode) {
    return;
  }

  const childCount = parent.yogaNode.getChildCount?.() ?? 0;
  for (let index = 0; index < childCount; index++) {
    const yogaChild = parent.yogaNode.getChild(index);
    if (yogaChild === child.yogaNode) {
      parent.yogaNode.removeChild(yogaChild);
      break;
    }
  }
}
