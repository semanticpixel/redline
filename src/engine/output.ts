import type { Rect, Screen } from "./screen.js";
import { fillRect, setCell } from "./screen.js";

type Operation =
  | { type: "write"; x: number; y: number; text: string; styleId: number }
  | { type: "clear"; rect: Rect; styleId: number }
  | { type: "fill"; rect: Rect; styleId: number }
  | { type: "clip"; rect: Rect }
  | { type: "unclip" };

function intersect(a: Rect, b: Rect): Rect | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 >= x2 || y1 >= y2) {
    return null;
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export default class Output {
  private readonly operations: Operation[] = [];

  constructor(private readonly screen: Screen) {}

  write(x: number, y: number, text: string, styleId: number): void {
    if (!text) {
      return;
    }
    this.operations.push({ type: "write", x, y, text, styleId });
  }

  clear(rect: Rect, styleId: number): void {
    this.operations.push({ type: "clear", rect, styleId });
  }

  fill(rect: Rect, styleId: number): void {
    this.operations.push({ type: "fill", rect, styleId });
  }

  clip(rect: Rect): void {
    this.operations.push({ type: "clip", rect });
  }

  unclip(): void {
    this.operations.push({ type: "unclip" });
  }

  get(): Screen {
    const clipStack: Rect[] = [];
    for (const operation of this.operations) {
      switch (operation.type) {
        case "clip":
          clipStack.push(operation.rect);
          break;
        case "unclip":
          clipStack.pop();
          break;
        case "clear":
        case "fill": {
          const clip = clipStack.at(-1);
          const rect = clip ? intersect(clip, operation.rect) : operation.rect;
          if (rect) {
            fillRect(this.screen, rect, operation.styleId);
          }
          break;
        }
        case "write": {
          const clip = clipStack.at(-1);
          for (let offset = 0; offset < operation.text.length; offset++) {
            const x = operation.x + offset;
            const y = operation.y;
            if (
              clip &&
              (x < clip.x ||
                y < clip.y ||
                x >= clip.x + clip.width ||
                y >= clip.y + clip.height)
            ) {
              continue;
            }
            setCell(
              this.screen,
              x,
              y,
              operation.text[offset] ?? " ",
              operation.styleId,
            );
          }
          break;
        }
      }
    }

    return this.screen;
  }
}
