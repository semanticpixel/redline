import assert from "node:assert/strict";
import { StylePool, createScreen, rowEquals, setCell } from "./screen.js";

{
  const previousPool = new StylePool();
  const nextPool = new StylePool();
  const previous = createScreen(1, 1);
  const next = createScreen(1, 1);

  setCell(previous, 0, 0, "x", previousPool.intern({ backgroundColor: "blue", color: "white" }));
  setCell(next, 0, 0, "x", nextPool.intern({ color: "gray" }));

  assert.equal(rowEquals(previous, previousPool, next, nextPool, 0), false);
}

{
  const previousPool = new StylePool();
  const nextPool = new StylePool();
  const previous = createScreen(1, 1);
  const next = createScreen(1, 1);

  setCell(previous, 0, 0, "x", previousPool.intern({ color: "gray" }));
  setCell(next, 0, 0, "x", nextPool.intern({ color: "gray" }));

  assert.equal(rowEquals(previous, previousPool, next, nextPool, 0), true);
}

console.log("screen tests passed");
