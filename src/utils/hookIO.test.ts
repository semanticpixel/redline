import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { emitApprove, validateHookInput, writeOutput } from "./hookIO.js";

{
  assert.throws(() => validateHookInput(null), /not a JSON object/);
  assert.throws(
    () => validateHookInput({ session_id: "s", tool_name: "ExitPlanMode", tool_input: {} }),
    /tool_input\.plan/,
  );
  assert.throws(() => validateHookInput(JSON.parse("{")), SyntaxError);
}

{
  const input = validateHookInput({
    session_id: "s",
    tool_name: "ExitPlanMode",
    tool_input: { plan: "# Plan" },
  });

  assert.equal(input.tool_input.plan, "# Plan");
}

{
  let captured = "";
  const originalWrite = process.stdout.write;
  (process.stdout.write as unknown as (chunk: string) => boolean) = (chunk: string) => {
    captured += chunk;
    return true;
  };
  try {
    writeOutput({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "allow" },
      },
    });
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.match(captured, /"behavior":"allow"/);
}

{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "redline-hookio-"));
  const outputFile = path.join(tempDir, "output.json");
  const previousOutputFile = process.env.REDLINE_OUTPUT_FILE;
  process.env.REDLINE_OUTPUT_FILE = outputFile;
  try {
    emitApprove();
    assert.equal(fs.existsSync(outputFile), true);
    assert.match(fs.readFileSync(outputFile, "utf-8"), /"behavior":"allow"/);
    assert.equal(fs.readdirSync(tempDir).some((entry) => entry.endsWith(".tmp")), false);
  } finally {
    if (previousOutputFile === undefined) {
      delete process.env.REDLINE_OUTPUT_FILE;
    } else {
      process.env.REDLINE_OUTPUT_FILE = previousOutputFile;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

console.log("hook IO tests passed");
