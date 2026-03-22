import React from "react";
import { render } from "ink";
import fs from "fs";
import { App } from "../components/App.js";
import { readHookInput } from "../utils/hookIO.js";
import { parsePlan } from "../utils/parsePlan.js";

async function main() {
  // Check if we're receiving piped input (hook mode) or demo mode
  const isTTYInput = process.stdin.isTTY;

  let planMarkdown: string;

  if (isTTYInput) {
    // Demo mode — show a sample plan for testing
    planMarkdown = DEMO_PLAN;
    process.stderr.write("redline: running in demo mode (no stdin detected)\n");
  } else {
    // Hook mode — read the JSON payload from Claude Code
    try {
      const hookInput = await readHookInput();
      planMarkdown = hookInput.tool_input?.plan || "";

      if (!planMarkdown) {
        process.stderr.write("redline: no plan found in hook input\n");
        process.exit(1);
      }
    } catch (err) {
      process.stderr.write(`redline: failed to read hook input — ${err}\n`);
      process.exit(1);
    }

    // Re-attach stdin to the TTY so Ink can use raw mode for keyboard input.
    // When piped, process.stdin is the pipe — we need /dev/tty instead.
    try {
      const ttyFd = fs.openSync("/dev/tty", "r");
      const ttyStream = new (await import("tty")).ReadStream(ttyFd);
      Object.defineProperty(process, "stdin", {
        value: ttyStream,
        writable: true,
        configurable: true,
      });
    } catch (err) {
      process.stderr.write(
        `redline: could not open /dev/tty for interactive input — ${err}\n`
      );
      process.exit(1);
    }
  }

  const steps = parsePlan(planMarkdown);

  if (steps.length === 0) {
    process.stderr.write("redline: plan parsed to 0 steps\n");
    process.exit(1);
  }

  render(<App steps={steps} />);
}

const DEMO_PLAN = `# Refactor Authentication Module

## 1. Extract JWT utilities into shared package
- Move token generation, validation, and refresh logic from \`apps/api/auth\`
- Create \`packages/jwt-utils\` with proper TypeScript types
- Update imports across api and worker services

## 2. Implement refresh token rotation
- Add \`refresh_tokens\` table with family tracking
- Implement automatic rotation on each refresh
- Add reuse detection to invalidate entire token family

## 3. Add rate limiting to auth endpoints
- Configure rate limiter middleware for \`/login\`, \`/register\`, \`/refresh\`
- Use sliding window algorithm with Redis backend
- Set limits: 5 attempts per minute for login, 3 for register

## 4. Update tests
- Unit tests for JWT utility functions
- Integration tests for refresh token rotation
- Load tests for rate limiting behavior

## 5. Migration and deployment
- Write database migration for refresh_tokens table
- Update environment variables documentation
- Deploy in stages: database → packages → services
`;

main();
