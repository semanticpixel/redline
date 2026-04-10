import type { ReactNode } from "react";
import MiniInk, { type InkOptions } from "./ink.js";

export interface Root {
  render(node: ReactNode): void;
  unmount(): void;
  waitUntilExit(): Promise<void>;
}

export async function createRoot(options: InkOptions = {}): Promise<Root> {
  const ink = new MiniInk(options);
  return {
    render: ink.render,
    unmount: ink.unmount,
    waitUntilExit: ink.waitUntilExit,
  };
}

export async function render(node: ReactNode, options: InkOptions = {}): Promise<Root> {
  const root = await createRoot(options);
  root.render(node);
  return root;
}
