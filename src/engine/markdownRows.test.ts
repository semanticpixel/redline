import assert from "node:assert/strict";
import type { PlanStep } from "../types.js";
import { computeMarkdownRows } from "./markdownRows.js";
import type { RenderedRow } from "./renderTypes.js";

let nextId = 0;

function step(content: string): PlanStep {
  return {
    id: nextId++,
    content,
    depth: 1,
    annotations: [],
  };
}

function rowText(row: RenderedRow): string {
  return row.segments.map((segment) => segment.text).join("");
}

function rowTexts(rows: RenderedRow[]): string[] {
  return rows.map(rowText);
}

{
  const layout = computeMarkdownRows(
    [step("# Plan\n\nParagraph one.\n\nParagraph two.")],
    0,
    null,
    80,
  );
  const texts = rowTexts(layout.rows);

  assert.match(texts[0] ?? "", /1 ▸ Plan/);
  assert.equal(texts[1]?.trim(), "");
  assert.match(texts[2] ?? "", /Paragraph one\./);
  assert.equal(texts[3]?.trim(), "");
  assert.match(texts[4] ?? "", /Paragraph two\./);
}

{
  const layout = computeMarkdownRows(
    [step("- First item\n  - Nested item\n- Second item")],
    0,
    null,
    100,
  );
  const text = rowTexts(layout.rows).join("\n");

  assert.match(text, /- First item/);
  assert.match(text, /  - Nested item/);
  assert.match(text, /- Second item/);
}

{
  const layout = computeMarkdownRows(
    [step("## Architecture\n\n```ts\nconst x = 1;\n  y();\n```")],
    0,
    null,
    100,
  );
  const text = rowTexts(layout.rows).join("\n");

  assert.match(text, /Architecture/);
  assert.match(text, /const x = 1;/);
  assert.match(text, /  y\(\);/);
}

{
  const layout = computeMarkdownRows(
    [step("Paragraph with **bold** and *em* and `code`.")],
    0,
    null,
    100,
  );
  const firstRow = layout.rows[0]!;

  assert.ok(firstRow.segments.some((segment) => segment.text.includes("bold") && segment.bold));
  assert.ok(firstRow.segments.some((segment) => segment.text.includes("em") && segment.dim));
  assert.ok(firstRow.segments.some((segment) => segment.text.includes("code") && segment.color === "yellow"));
}

{
  const layout = computeMarkdownRows(
    [step("- Selectable bullet\n\nContinuation paragraph")],
    0,
    null,
    80,
  );
  const texts = rowTexts(layout.rows);
  const gutterRows = texts.filter((text) => text.includes("1 ▸"));

  assert.equal(gutterRows.length, 1);
  assert.match(texts[0] ?? "", /1 ▸ - Selectable bullet/);
  assert.match(texts.join("\n"), /Continuation paragraph/);
}

{
  const layout = computeMarkdownRows(
    [
      step("## Context\n\nIntro paragraph."),
      step("- Keep bullet compact"),
      step("## Architecture\n\nNew section."),
    ],
    0,
    null,
    100,
  );
  const texts = rowTexts(layout.rows);
  const headingIndex = texts.findIndex((text) => text.includes("3   Architecture"));

  assert.ok(headingIndex > 0);
  assert.equal(texts[headingIndex - 1]?.trim(), "");
  assert.equal(texts.filter((text) => text.includes("2   - Keep bullet compact")).length, 1);
}

console.log("markdownRows tests passed");
