import React from "react";
import type { PlanStep } from "../types.js";
import { emitApprove, emitDeny } from "../utils/hookIO.js";
import { formatFeedback } from "../utils/parsePlan.js";
import RedlineApp from "./app.js";
import { createRoot } from "./root.js";

export async function startApp(initialSteps: PlanStep[]): Promise<void> {
  const root = await createRoot();
  let closed = false;

  const finalize = (code: number, output?: () => void): void => {
    if (closed) {
      return;
    }
    closed = true;
    root.unmount();
    cleanupSignalHandlers();
    output?.();
    process.exit(code);
  };

  const handleSubmit = (steps: PlanStep[]): void => {
    const feedback = formatFeedback(steps);
    finalize(0, () => {
      if (feedback) {
        emitDeny(feedback);
        return;
      }
      emitApprove();
    });
  };

  const handleQuit = (): void => {
    finalize(1);
  };

  const handleSignal = (): void => {
    finalize(1);
  };

  const handleException = (error: unknown): void => {
    finalize(1, () => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    });
  };

  const cleanupSignalHandlers = (): void => {
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
    process.off("uncaughtException", handleException);
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
  process.on("uncaughtException", handleException);

  root.render(
    React.createElement(RedlineApp, {
      initialSteps,
      onSubmit: handleSubmit,
      onQuit: handleQuit,
    }),
  );

  await root.waitUntilExit();
}

