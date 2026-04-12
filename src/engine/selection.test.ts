import assert from "node:assert/strict";
import type { RowLayout } from "./renderTypes.js";
import { resolveSelectedStepIndices } from "./selection.js";

const rowLayout: RowLayout = {
  rows: [
    { key: "step-0-row-0", segments: [], stepIndex: 0, role: "content" },
    { key: "step-0-row-1", segments: [], stepIndex: 0, role: "content" },
    { key: "section-spacer", segments: [], role: "spacer" },
    { key: "step-1-row-0", segments: [], stepIndex: 1, role: "content" },
    { key: "step-1-annotation-0", segments: [], stepIndex: 1, role: "annotation" },
    { key: "step-2-row-0", segments: [], stepIndex: 2, role: "content" },
  ],
  stepStartRow: [0, 3, 5],
  stepRowCount: [2, 2, 1],
};

assert.deepEqual(resolveSelectedStepIndices(rowLayout, null), []);
assert.deepEqual(resolveSelectedStepIndices(rowLayout, { anchor: 1, focus: 1 }), [0]);
assert.deepEqual(resolveSelectedStepIndices(rowLayout, { anchor: 1, focus: 4 }), [0, 1]);
assert.deepEqual(resolveSelectedStepIndices(rowLayout, { anchor: 4, focus: 5 }), [1, 2]);
assert.deepEqual(resolveSelectedStepIndices(rowLayout, { anchor: 2, focus: 2 }), []);

console.log("selection tests passed");
