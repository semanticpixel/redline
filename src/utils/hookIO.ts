import fs from "fs";
import path from "path";
import type { HookInput, HookOutput } from "../types.js";

const HEARTBEAT_INTERVAL_MS = 10_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function heartbeatPath(): string | null {
  const outputFile = process.env.REDLINE_OUTPUT_FILE;
  return outputFile ? `${outputFile}.heartbeat` : null;
}

/** Start writing a heartbeat file so the hook script knows we're alive. */
export function startHeartbeat(): void {
  const path = heartbeatPath();
  if (!path) return;

  const touch = () => {
    try {
      fs.writeFileSync(path, String(Date.now()));
    } catch {}
  };

  touch();
  heartbeatTimer = setInterval(touch, HEARTBEAT_INTERVAL_MS);
}

/** Stop the heartbeat and remove the file. */
export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  const path = heartbeatPath();
  if (path) {
    try {
      fs.unlinkSync(path);
    } catch {}
  }
}

/**
 * Read the hook payload from stdin.
 * Claude Code pipes JSON to our process when the PermissionRequest fires.
 */
export async function readHookInput(): Promise<HookInput> {
  return new Promise((resolve, reject) => {
    let data = "";
    let settled = false;

    const settleResolve = (input: HookInput) => {
      if (!settled) {
        settled = true;
        resolve(input);
      }
    };

    const settleReject = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    const parseAndResolve = () => {
      try {
        settleResolve(validateHookInput(JSON.parse(data)));
      } catch (e) {
        settleReject(new Error(`Failed to parse hook input: ${e}`));
      }
    };

    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", parseAndResolve);
    process.stdin.on("error", (error) => settleReject(error));

    // If stdin is already ended (e.g. piped), handle gracefully
    if (process.stdin.readableEnded) {
      parseAndResolve();
    }
  });
}

/**
 * Write hook output — either to a file (when launched via redline-hook.sh)
 * or to stdout (when piped directly for testing).
 */
export function writeOutput(output: HookOutput): void {
  const json = JSON.stringify(output);
  const outputFile = process.env.REDLINE_OUTPUT_FILE;

  if (outputFile) {
    // Hook mode: write to file so the wrapper script can relay it to Claude Code
    const tmpFile = path.join(path.dirname(outputFile), `.${path.basename(outputFile)}.${process.pid}.tmp`);
    fs.writeFileSync(tmpFile, json);
    fs.renameSync(tmpFile, outputFile);
  } else {
    // Direct pipe mode (testing): write to stdout
    process.stdout.write(json);
  }
}

/** Approve the plan — Claude proceeds with implementation */
export function emitApprove(): void {
  writeOutput({
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior: "allow",
      },
    },
  });
}

/** Deny the plan with feedback — Claude receives annotations and revises */
export function emitDeny(message: string): void {
  writeOutput({
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior: "deny",
        message,
      },
    },
  });
}

export function validateHookInput(value: unknown): HookInput {
  if (!value || typeof value !== "object") {
    throw new Error("Hook input is not a JSON object");
  }

  const input = value as Partial<HookInput>;
  if (typeof input.session_id !== "string") {
    throw new Error("Hook input missing string session_id");
  }
  if (typeof input.tool_name !== "string") {
    throw new Error("Hook input missing string tool_name");
  }
  if (!input.tool_input || typeof input.tool_input !== "object") {
    throw new Error("Hook input missing tool_input object");
  }
  if (typeof input.tool_input.plan !== "string") {
    throw new Error("Hook input tool_input.plan must be a string");
  }

  return input as HookInput;
}
