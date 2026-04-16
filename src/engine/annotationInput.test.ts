import assert from "node:assert/strict";
import {
  MAX_ANNOTATION_INPUT_LENGTH,
  appendAnnotationInput,
  appendAnnotationNewline,
  buildAnnotationInputDisplay,
  visibleAnnotationInputLineLimit,
} from "./annotationInput.js";

{
  assert.equal(appendAnnotationInput("abc", "def"), "abcdef");
  assert.equal(appendAnnotationNewline("abc"), "abc\n");
}

{
  const nearlyFull = "x".repeat(MAX_ANNOTATION_INPUT_LENGTH - 1);
  const result = appendAnnotationInput(nearlyFull, "abcdef");

  assert.equal(result.length, MAX_ANNOTATION_INPUT_LENGTH);
  assert.equal(result.endsWith("a"), true);
}

{
  const display = buildAnnotationInputDisplay("hello world", 8, 6);

  assert.deepEqual(display.text.split("\n"), ["> hello", "  world█"]);
  assert.equal(display.visibleLineCount, 2);
  assert.equal(display.totalLineCount, 2);
}

{
  const display = buildAnnotationInputDisplay("one\ntwo\nthree\nfour", 20, 2);

  assert.deepEqual(display.text.split("\n"), ["> three", "  four█"]);
  assert.equal(display.visibleLineCount, 2);
  assert.equal(display.totalLineCount, 4);
}

{
  const display = buildAnnotationInputDisplay("hello world\n", 20, 6);

  assert.deepEqual(display.text.split("\n"), ["> hello world", "  █"]);
  assert.equal(display.visibleLineCount, 2);
  assert.equal(display.totalLineCount, 2);
}

{
  const display = buildAnnotationInputDisplay("", 20, 6);

  assert.equal(display.text, "> █");
  assert.equal(display.visibleLineCount, 1);
}

{
  assert.equal(visibleAnnotationInputLineLimit(24, 7), 6);
  assert.equal(visibleAnnotationInputLineLimit(9, 7), 2);
  assert.equal(visibleAnnotationInputLineLimit(4, 7), 1);
}

console.log("annotation input tests passed");
