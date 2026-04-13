import assert from "node:assert/strict";
import type { RowLayout, Segment } from "./renderTypes.js";
import { extendPointSelection, resolveSelectedSourceRanges, resolveSelectedStepIndices } from "./selection.js";

function sourceSegment(text: string, sourceStart: number): Segment {
  return {
    text,
    sourceMap: Array.from({ length: text.length }, (_, index) => ({
      start: sourceStart + index,
      end: sourceStart + index + 1,
    })),
  };
}

const rowLayout: RowLayout = {
  rows: [
    { key: "step-0-row-0", segments: [{ text: "  1   " }, sourceSegment("Hello", 0)], stepIndex: 0, role: "content" },
    { key: "step-0-row-1", segments: [{ text: "      " }, sourceSegment("world", 6)], stepIndex: 0, role: "content" },
    { key: "section-spacer", segments: [], role: "spacer" },
    { key: "step-1-row-0", segments: [{ text: "  2   " }, sourceSegment("Second", 100)], stepIndex: 1, role: "content" },
    { key: "step-1-annotation-0", segments: [sourceSegment("Ignored", 120)], stepIndex: 1, role: "annotation" },
    { key: "step-2-row-0", segments: [{ text: "  3   " }, sourceSegment("Third", 200)], stepIndex: 2, role: "content" },
  ],
  stepStartRow: [0, 3, 5],
  stepRowCount: [2, 2, 1],
};

assert.deepEqual(resolveSelectedSourceRanges(rowLayout, null), []);
assert.deepEqual(
  resolveSelectedSourceRanges(rowLayout, { anchor: { row: 0, column: 6 }, focus: { row: 0, column: 8 } }),
  [{ stepIndex: 0, range: { start: 0, end: 3 }, wholeStep: false }],
);
assert.deepEqual(
  resolveSelectedSourceRanges(rowLayout, { anchor: { row: 1, column: 10 }, focus: { row: 0, column: 7 } }),
  [{ stepIndex: 0, range: { start: 1, end: 11 }, wholeStep: false }],
);
assert.deepEqual(
  resolveSelectedSourceRanges(rowLayout, { anchor: { row: 0, column: 99 }, focus: { row: 0, column: 0 } }),
  [{ stepIndex: 0, range: { start: 0, end: 5 }, wholeStep: false }],
);
assert.deepEqual(
  resolveSelectedSourceRanges(rowLayout, { anchor: { row: 2, column: 0 }, focus: { row: 2, column: 0 } }),
  [],
);
assert.deepEqual(
  resolveSelectedSourceRanges(rowLayout, { anchor: { row: 3, column: 6 }, focus: { row: 5, column: 99 } }),
  [
    { stepIndex: 1, range: { start: 100, end: 106 }, wholeStep: true },
    { stepIndex: 2, range: { start: 200, end: 205 }, wholeStep: true },
  ],
);
assert.deepEqual(
  resolveSelectedStepIndices(rowLayout, { anchor: { row: 3, column: 6 }, focus: { row: 5, column: 99 } }),
  [1, 2],
);
assert.deepEqual(extendPointSelection(null, { row: 3, column: 4 }), {
  anchor: { row: 3, column: 4 },
  focus: { row: 3, column: 4 },
});
assert.deepEqual(
  extendPointSelection({ anchor: { row: 1, column: 2 }, focus: { row: 1, column: 2 } }, { row: 5, column: 6 }),
  { anchor: { row: 1, column: 2 }, focus: { row: 5, column: 6 } },
);

console.log("selection tests passed");
