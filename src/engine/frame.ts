import type { Rect, Screen, StylePool } from "./screen.js";

export interface Frame {
  screen: Screen;
  stylePool: StylePool;
  width: number;
  height: number;
}

export interface FrameEvent {
  durationMs: number;
  phases: {
    renderer: number;
    diff: number;
    write: number;
    patches: number;
  };
  damage: Rect | null;
}

export type Patch =
  | { type: "clear" }
  | { type: "write"; row: number; col: number; content: string };
