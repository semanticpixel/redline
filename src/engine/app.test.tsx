import assert from "node:assert/strict";
import { shouldIgnoreMouseForAnnotation } from "./app.js";

{
  assert.equal(shouldIgnoreMouseForAnnotation(true, "press"), true);
  assert.equal(shouldIgnoreMouseForAnnotation(true, "drag"), true);
  assert.equal(shouldIgnoreMouseForAnnotation(true, "release"), true);
}

{
  assert.equal(shouldIgnoreMouseForAnnotation(true, "wheel"), false);
  assert.equal(shouldIgnoreMouseForAnnotation(false, "press"), false);
}

console.log("app tests passed");
