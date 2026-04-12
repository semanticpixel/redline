import type { ReactNode } from "react";
import MiniRuntime, { type RuntimeOptions } from "./runtime.js";

export interface Root {
  render(node: ReactNode): void;
  unmount(): void;
  waitUntilExit(): Promise<void>;
}

export async function createRoot(options: RuntimeOptions = {}): Promise<Root> {
  const runtime = new MiniRuntime(options);
  return {
    render: runtime.render,
    unmount: runtime.unmount,
    waitUntilExit: runtime.waitUntilExit,
  };
}

export async function render(
  node: ReactNode,
  options: RuntimeOptions = {},
): Promise<Root> {
  const root = await createRoot(options);
  root.render(node);
  return root;
}
