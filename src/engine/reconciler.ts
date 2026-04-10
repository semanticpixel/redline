import Reconciler from "react-reconciler";
import { ConcurrentRoot, DefaultEventPriority } from "react-reconciler/constants";
import {
  appendChildNode,
  createNode,
  createRootNode,
  insertBeforeNode,
  markDirty,
  removeChildNode,
  setSegments,
  setStyle,
  setText,
  type MiniTextSegment,
  type MiniNode,
  type MiniRootNode,
} from "./dom.js";
import { applyYogaStyle, attachYogaNode } from "./layout/yoga.js";

type Props = {
  style?: Record<string, unknown>;
  text?: string;
  segments?: MiniTextSegment[];
};

export const reconciler = Reconciler({
  getRootHostContext: () => null,
  getChildHostContext: () => null,
  prepareForCommit: () => null,
  resetAfterCommit(root: MiniRootNode) {
    root.wantsAltScreen = containsAltScreen(root);
    root.computeLayout();
    root.requestRender();
  },
  createInstance(type: string, props: Props) {
    const node = createNode(type as MiniNode["type"]);
    attachYogaNode(node);
    setStyle(node, (props.style ?? {}) as never);
    if (typeof props.text === "string") {
      setText(node, props.text);
    }
    if (Array.isArray(props.segments)) {
      setSegments(node, props.segments);
    }
    return node;
  },
  createTextInstance(text: string) {
    const node = createNode("raw-text");
    attachYogaNode(node);
    setText(node, text);
    return node;
  },
  appendInitialChild: appendChildNode,
  appendChild: appendChildNode,
  appendChildToContainer: appendChildNode,
  insertBefore: insertBeforeNode,
  insertInContainerBefore: insertBeforeNode,
  removeChild: removeChildNode,
  removeChildFromContainer: removeChildNode,
  finalizeInitialChildren: () => false,
  commitUpdate(instance: MiniNode, _payload: unknown, _type: string, _oldProps: Props, newProps: Props) {
    setStyle(instance, (newProps.style ?? {}) as never);
    if (typeof newProps.text === "string") {
      setText(instance, newProps.text);
    }
    if (Array.isArray(newProps.segments)) {
      setSegments(instance, newProps.segments);
    }
    applyYogaStyle(instance);
    markDirty(instance);
  },
  commitTextUpdate(textInstance: MiniNode, _oldText: string, newText: string) {
    setText(textInstance, newText);
    applyYogaStyle(textInstance);
  },
  prepareUpdate: () => true,
  shouldSetTextContent: () => false,
  getPublicInstance: (instance: MiniNode) => instance,
  clearContainer(container: MiniRootNode) {
    container.children = [];
    markDirty(container);
    return false;
  },
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  getCurrentEventPriority: () => DefaultEventPriority,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  isPrimaryRenderer: true,
  now: Date.now,
  hideInstance() {},
  unhideInstance() {},
  hideTextInstance() {},
  unhideTextInstance() {},
  detachDeletedInstance() {},
  scheduleMicrotask: queueMicrotask,
  supportsMicrotasks: true,
} as never);

export function createContainer(requestRender: () => void, computeLayout: () => void) {
  const rootNode = createRootNode(requestRender, computeLayout);
  attachYogaNode(rootNode);
  rootNode.root = rootNode;

  const container = reconciler.createContainer(
    rootNode,
    ConcurrentRoot,
    null,
    false,
    null,
    "mini-engine",
    console.error,
    console.error,
    console.error,
    null,
  );

  return { container, rootNode };
}

function containsAltScreen(node: MiniNode): boolean {
  if (node.type === "mini-alt-screen") {
    return true;
  }
  return node.children.some(containsAltScreen);
}
