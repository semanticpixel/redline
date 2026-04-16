import assert from "node:assert/strict";
import { formatFeedback, parsePlan } from "./parsePlan.js";

{
  const markdown = "  \n# Plan\n\nIntro paragraph.\n\n- First item\n  continuation\n\n1. Second item\n";
  const steps = parsePlan(markdown);

  assert.equal(steps.length, 3);
  assert.equal(steps[0]?.content, "# Plan\n\nIntro paragraph.");
  assert.equal(steps[0]?.sourceStart, markdown.indexOf("# Plan"));
  assert.equal(steps[0]?.sourceEnd, markdown.indexOf("\n\n- First"));
  assert.equal(steps[0]?.sourceStartLine, 2);
  assert.equal(steps[0]?.sourceStartColumn, 1);

  assert.equal(steps[1]?.content, "- First item\n  continuation");
  assert.equal(steps[1]?.sourceStart, markdown.indexOf("- First item"));
  assert.equal(steps[1]?.sourceEnd, markdown.indexOf("\n\n1. Second"));
  assert.equal(steps[1]?.sourceStartLine, 6);
  assert.equal(steps[1]?.sourceStartColumn, 1);

  assert.equal(steps[2]?.content, "1. Second item");
  assert.equal(steps[2]?.sourceStart, markdown.indexOf("1. Second item"));
  assert.equal(steps[2]?.sourceEnd, markdown.indexOf("1. Second item") + "1. Second item".length);
}

{
  const [step] = parsePlan("## Step\nUse `code` now.");
  assert.ok(step);
  step.annotations.push({
    id: "targeted",
    type: "comment",
    text: "Be precise",
    target: {
      range: { start: step.sourceStart + 8, end: step.sourceStart + 14 },
      lineStart: 2,
      columnStart: 1,
      lineEnd: 2,
      columnEnd: 7,
      excerpt: "Use `c",
      wholeStep: false,
    },
  });

  const feedback = formatFeedback([step]);
  assert.match(feedback, /Target: chars \[8, 14\), lines 2:1-2:7/);
  assert.match(feedback, /Excerpt:\n  ```markdown\n  Use `c\n  ```/);
  assert.match(feedback, /💬 Comment: Be precise/);
}

{
  const [step] = parsePlan("## Remove me");
  assert.ok(step);
  step.annotations.push({
    id: "legacy-delete",
    type: "delete",
    text: "Remove this step",
  });

  assert.match(formatFeedback([step]), /🗑️  Remove this step: Remove this step/);
}

{
  const [step] = parsePlan("## Fence\n````\nvalue ``` inside\n````");
  assert.ok(step);
  step.annotations.push({
    id: "fenced",
    type: "question",
    text: "Can this survive?",
    target: {
      range: { start: step.sourceStart, end: step.sourceEnd },
      lineStart: 1,
      columnStart: 1,
      lineEnd: 4,
      columnEnd: 5,
      excerpt: "value ``` inside",
      wholeStep: false,
    },
  });

  assert.match(formatFeedback([step]), /````markdown\n  value ``` inside\n  ````/);
}

{
  const steps = parsePlan("## Step 1\r\nDo X\r\n## Step 2\r\nDo Y");

  assert.equal(steps.length, 2);
  assert.equal(steps[0]?.content, "## Step 1\nDo X");
  assert.equal(steps[1]?.sourceStartLine, 3);
}

{
  const [step] = parsePlan("## Multiline");
  assert.ok(step);
  step.annotations.push({
    id: "multi",
    type: "replace",
    text: "line one\nline two",
    replacement: "line one\nline two",
  });

  const feedback = formatFeedback([step], [{ id: "global", text: "first\nsecond" }]);

  assert.match(feedback, /General comments:\n  💬 Comment:\n  ```markdown\n  first\n  second\n  ```/);
  assert.match(feedback, /✏️  Replace with:\n  ```markdown\n  line one\n  line two\n  ```/);
}

console.log("parsePlan tests passed");
