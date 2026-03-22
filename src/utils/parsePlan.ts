import type { PlanStep } from "../types.js";

/**
 * Parse a markdown plan into discrete, annotatable steps.
 *
 * Strategy: split on headings and top-level list items so each
 * "step" in the plan is independently addressable.
 */
export function parsePlan(markdown: string): PlanStep[] {
  const lines = markdown.split("\n");
  const steps: PlanStep[] = [];
  let currentContent: string[] = [];
  let currentDepth = 0;
  let id = 0;

  const flush = () => {
    const content = currentContent.join("\n").trim();
    if (content) {
      steps.push({
        id: id++,
        content,
        depth: currentDepth,
        annotations: [],
      });
    }
    currentContent = [];
  };

  for (const line of lines) {
    // Match headings: # H1, ## H2, ### H3
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flush();
      currentDepth = headingMatch[1].length;
      currentContent.push(line);
      continue;
    }

    // Match top-level numbered list items: 1. Step one
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numberedMatch) {
      flush();
      currentDepth = 3;
      currentContent.push(line);
      continue;
    }

    // Match top-level bullet items (not indented sub-bullets)
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      flush();
      currentDepth = 3;
      currentContent.push(line);
      continue;
    }

    // Continuation lines belong to the current block
    currentContent.push(line);
  }

  flush();
  return steps;
}

/**
 * Format annotations into structured feedback for Claude Code.
 * This becomes the "deny" message sent back through the hook.
 */
export function formatFeedback(steps: PlanStep[]): string {
  const annotatedSteps = steps.filter((s) => s.annotations.length > 0);

  if (annotatedSteps.length === 0) {
    return "";
  }

  const sections = annotatedSteps.map((step) => {
    const stepPreview = step.content.split("\n")[0].trim();
    const annotations = step.annotations
      .map((a) => {
        switch (a.type) {
          case "comment":
            return `  💬 Comment: ${a.text}`;
          case "question":
            return `  ❓ Question: ${a.text}`;
          case "delete":
            return `  🗑️  Remove this step${a.text ? `: ${a.text}` : ""}`;
          case "replace":
            return `  ✏️  Replace with: ${a.replacement || a.text}`;
        }
      })
      .join("\n");

    return `On step: "${stepPreview}"\n${annotations}`;
  });

  return [
    "Plan feedback from redline review:",
    "",
    ...sections,
    "",
    "Please revise the plan addressing the above annotations, then present the updated plan.",
  ].join("\n");
}
