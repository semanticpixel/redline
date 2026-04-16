import assert from "node:assert/strict";
import type { MiniNode } from "./dom.js";
import { renderTree } from "./renderer.js";

function node(partial: Partial<MiniNode>): MiniNode {
  return {
    type: "mini-box",
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
    ...partial,
  };
}

{
  const text = node({
    type: "mini-text",
    layout: { x: 0, y: 0, width: 6, height: 1 },
    segments: [
      { text: "ab", style: { color: "red" } },
      { text: "cd", style: { color: "green" } },
      { text: "ef", style: { color: "blue" } },
    ],
  });
  const root = node({
    type: "root",
    layout: { x: 0, y: 0, width: 6, height: 1 },
    children: [text],
  });

  const { screen, stylePool } = renderTree(root, 6, 1);

  assert.equal(screen.chars.join(""), "abcdef");
  assert.equal(stylePool.get(screen.styles[0] ?? 0).color, "red");
  assert.equal(stylePool.get(screen.styles[2] ?? 0).color, "green");
  assert.equal(stylePool.get(screen.styles[4] ?? 0).color, "blue");
}

console.log("renderer tests passed");
