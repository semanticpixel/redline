import assert from "node:assert/strict";
import type { PlanStep } from "../types.js";
import {
  annotationEditorText,
  annotationHitFromPoint,
  removeAnnotation,
  selectedRangeForEditingAnnotation,
  shouldIgnoreMouseForAnnotation,
  updateAnnotationText,
} from "./app.js";

{
  assert.equal(shouldIgnoreMouseForAnnotation(true, "press"), true);
  assert.equal(shouldIgnoreMouseForAnnotation(true, "drag"), true);
  assert.equal(shouldIgnoreMouseForAnnotation(true, "release"), true);
}

{
  assert.equal(shouldIgnoreMouseForAnnotation(true, "wheel"), false);
  assert.equal(shouldIgnoreMouseForAnnotation(false, "press"), false);
}

const step: PlanStep = {
  id: 1,
  content: "Create table",
  sourceStart: 10,
  sourceEnd: 22,
  sourceStartLine: 2,
  sourceStartColumn: 1,
  depth: 1,
  annotations: [
    {
      id: "a1",
      type: "comment",
      text: "hello",
      target: {
        range: { start: 10, end: 16 },
        lineStart: 2,
        columnStart: 1,
        lineEnd: 2,
        columnEnd: 7,
        excerpt: "Create",
        wholeStep: false,
      },
    },
    {
      id: "a2",
      type: "replace",
      text: "new text",
      replacement: "new text",
    },
  ],
};

{
  const hit = annotationHitFromPoint(
    {
      rows: [
        { key: "content", role: "content", segments: [{ text: "Create" }], stepIndex: 0 },
        { key: "annotation", role: "annotation", segments: [{ text: "hello" }], stepIndex: 0, annotationId: "a1" },
      ],
      stepStartRow: [0],
      stepRowCount: [2],
    },
    { row: 1, column: 3 },
  );

  assert.deepEqual(hit, { stepIndex: 0, annotationId: "a1" });
}

{
  assert.deepEqual(selectedRangeForEditingAnnotation([step], { stepIndex: 0, annotationId: "a1" }), {
    stepIndex: 0,
    range: { start: 10, end: 16 },
    wholeStep: false,
  });
}

{
  assert.equal(annotationEditorText(step.annotations[1]!), "new text");

  const updated = updateAnnotationText([step], { stepIndex: 0, annotationId: "a1" }, "updated");
  assert.equal(updated[0]!.annotations[0]!.text, "updated");
  assert.equal(updated[0]!.annotations[1]!.text, "new text");
}

{
  const updated = updateAnnotationText([step], { stepIndex: 0, annotationId: "a2" }, "replacement");
  assert.equal(updated[0]!.annotations[1]!.text, "replacement");
  assert.equal(updated[0]!.annotations[1]!.replacement, "replacement");
}

{
  const updated = removeAnnotation([step], { stepIndex: 0, annotationId: "a1" });
  assert.deepEqual(updated[0]!.annotations.map((annotation) => annotation.id), ["a2"]);
}

console.log("app tests passed");
