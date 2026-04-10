import type { Writable } from "stream";
import type { CellStyle, Screen, StylePool } from "./screen.js";
import type { Patch } from "./frame.js";

const ESC = "\u001b[";
const ENTER_ALT_SCREEN = "\u001b[?1049h";
const EXIT_ALT_SCREEN = "\u001b[?1049l";
const HIDE_CURSOR = "\u001b[?25l";
const SHOW_CURSOR = "\u001b[?25h";
const CLEAR_SCREEN = `${ESC}2J${ESC}H`;
const SYNC_BEGIN = "\u001b[?2026h";
const SYNC_END = "\u001b[?2026l";

const ANSI_COLORS: Record<string, number> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  gray: 90,
};

export function moveTo(row: number, col: number): string {
  return `${ESC}${row + 1};${col + 1}H`;
}

export function writeTerminal(
  stdout: Writable,
  patches: Patch[],
  synchronized = supportsSynchronizedOutput(),
): void {
  if (patches.length === 0) {
    return;
  }

  let buffer = synchronized ? SYNC_BEGIN : "";
  for (const patch of patches) {
    if (patch.type === "clear") {
      buffer += CLEAR_SCREEN;
    } else {
      buffer += moveTo(patch.row, patch.col) + patch.content;
    }
  }
  if (synchronized) {
    buffer += SYNC_END;
  }
  stdout.write(buffer);
}

export function renderRow(
  screen: Screen,
  row: number,
  stylePool: StylePool,
): string {
  let currentStyle = stylePool.none;
  let output = "";

  for (let x = 0; x < screen.width; x++) {
    const index = row * screen.width + x;
    const nextStyle = screen.styles[index]!;
    if (nextStyle !== currentStyle) {
      output += styleToAnsi(stylePool.get(nextStyle), stylePool.get(currentStyle));
      currentStyle = nextStyle;
    }
    output += screen.chars[index] ?? " ";
  }

  if (currentStyle !== stylePool.none) {
    output += `${ESC}0m`;
  }

  return output;
}

export function enterAltScreen(stdout: Writable): void {
  stdout.write(ENTER_ALT_SCREEN + HIDE_CURSOR + CLEAR_SCREEN);
}

export function exitAltScreen(stdout: Writable): void {
  stdout.write(`${ESC}0m${SHOW_CURSOR}${EXIT_ALT_SCREEN}`);
}

export function supportsSynchronizedOutput(): boolean {
  if (process.env.TMUX) {
    return false;
  }

  const termProgram = process.env.TERM_PROGRAM;
  const term = process.env.TERM ?? "";

  if (
    termProgram === "iTerm.app" ||
    termProgram === "WezTerm" ||
    termProgram === "vscode" ||
    termProgram === "ghostty"
  ) {
    return true;
  }

  return term.includes("kitty") || term.includes("alacritty");
}

function styleToAnsi(next: CellStyle, previous: CellStyle): string {
  const codes: number[] = [0];

  if (next.bold) {
    codes.push(1);
  }
  if (next.dim) {
    codes.push(2);
  }

  const foreground = next.color ? ANSI_COLORS[next.color] : undefined;
  if (foreground !== undefined) {
    codes.push(foreground);
  }

  const background = next.backgroundColor
    ? ANSI_COLORS[next.backgroundColor]
    : undefined;
  if (background !== undefined) {
    codes.push(background + 10);
  }

  if (
    next.color === previous.color &&
    next.backgroundColor === previous.backgroundColor &&
    next.bold === previous.bold &&
    next.dim === previous.dim
  ) {
    return "";
  }

  return `${ESC}${codes.join(";")}m`;
}
