import React from "react";
import type { GlobalComment, PlanStep } from "../types.js";
import { emitApprove, emitDeny, startHeartbeat, stopHeartbeat } from "../utils/hookIO.js";
import { formatFeedback } from "../utils/parsePlan.js";
import RedlineApp from "./app.js";
import { createRoot } from "./root.js";

export async function startApp(initialSteps: PlanStep[]): Promise<void> {
  const root = await createRoot();
  let closed = false;

  startHeartbeat();

  const finalize = (code: number, output?: () => void): void => {
    if (closed) {
      return;
    }
    closed = true;
    stopHeartbeat();
    root.unmount();
    cleanupSignalHandlers();
    output?.();
    process.exit(code);
  };

  const handleSubmit = (steps: PlanStep[], globalComments: GlobalComment[]): void => {
    const feedback = formatFeedback(steps, globalComments);
    finalize(0, () => {
      if (feedback) {
        emitDeny(feedback);
        return;
      }
      emitApprove();
    });
  };

  const handleQuit = (): void => {
    finalize(1, () => {
      emitDeny("Review cancelled by user.");
    });
  };

  const handleSignal = (): void => {
    finalize(0, () => {
      emitDeny("Review cancelled. Please re-present the plan.");
    });
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

