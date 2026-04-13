import type { Frame, Patch } from "./frame.js";
import { rowEquals } from "./screen.js";
import { renderRow } from "./terminal.js";

export function diffFrames(previous: Frame | null, next: Frame): Patch[] {
  if (!previous || previous.width !== next.width || previous.height !== next.height) {
    const patches: Patch[] = [{ type: "clear" }];
    for (let row = 0; row < next.height; row++) {
      patches.push({
        type: "write",
        row,
        col: 0,
        content: renderRow(next.screen, row, next.stylePool),
      });
    }
    return patches;
  }

  const damage = next.screen.damage ?? {
    x: 0,
    y: 0,
    width: next.width,
    height: next.height,
  };

  const startRow = Math.max(0, damage.y);
  const endRow = Math.min(next.height, damage.y + damage.height);
  const patches: Patch[] = [];

  for (let row = startRow; row < endRow; row++) {
    if (rowEquals(previous.screen, previous.stylePool, next.screen, next.stylePool, row)) {
      continue;
    }
    patches.push({
      type: "write",
      row,
      col: 0,
      content: renderRow(next.screen, row, next.stylePool),
    });
  }

  return patches;
}
