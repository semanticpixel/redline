export type MouseButton = "left" | "middle" | "right";

export type MouseEvent =
  | {
      type: "wheel";
      x: number;
      y: number;
      wheel: "up" | "down";
      rawButton: number;
      shift: boolean;
      meta: boolean;
      ctrl: boolean;
    }
  | {
      type: "press" | "release" | "drag";
      x: number;
      y: number;
      button: MouseButton;
      rawButton: number;
      shift: boolean;
      meta: boolean;
      ctrl: boolean;
    };

export type ParsedMousePackets = {
  events: MouseEvent[];
  rest: string;
};

export type ParsedMouseInput = ParsedMousePackets & {
  keyboardInput: string;
};

const SGR_MOUSE_PATTERN = /\u001b\[<(\d+);(\d+);(\d+)([Mm])/g;

export function parseSgrMousePackets(input: string): ParsedMousePackets {
  const { events, rest } = parseSgrMouseInput(input);
  return { events, rest };
}

export function parseSgrMouseInput(input: string): ParsedMouseInput {
  const events: MouseEvent[] = [];
  const keyboardChunks: string[] = [];
  let lastMatchEnd = 0;

  for (const match of input.matchAll(SGR_MOUSE_PATTERN)) {
    keyboardChunks.push(input.slice(lastMatchEnd, match.index));

    const rawButton = Number(match[1]);
    const x = Math.max(0, Number(match[2]) - 1);
    const y = Math.max(0, Number(match[3]) - 1);
    const final = match[4] as "M" | "m";
    const event = toMouseEvent(rawButton, x, y, final);

    if (event) {
      events.push(event);
    }
    lastMatchEnd = (match.index ?? 0) + match[0].length;
  }

  const trailing = input.slice(lastMatchEnd);
  const incompleteStart = trailing.lastIndexOf("\u001b[<");
  if (incompleteStart >= 0) {
    keyboardChunks.push(trailing.slice(0, incompleteStart));
  } else {
    keyboardChunks.push(trailing);
  }

  return {
    events,
    keyboardInput: keyboardChunks.join(""),
    rest: incompleteStart >= 0 ? trailing.slice(incompleteStart) : "",
  };
}

function toMouseEvent(
  rawButton: number,
  x: number,
  y: number,
  final: "M" | "m",
): MouseEvent | null {
  const shift = Boolean(rawButton & 4);
  const meta = Boolean(rawButton & 8);
  const ctrl = Boolean(rawButton & 16);
  const wheelCode = rawButton & 65;

  if (wheelCode === 64 || wheelCode === 65) {
    return {
      type: "wheel",
      x,
      y,
      wheel: wheelCode === 64 ? "up" : "down",
      rawButton,
      shift,
      meta,
      ctrl,
    };
  }

  const baseButton = rawButton & 3;
  if (baseButton === 3) {
    return {
      type: "release",
      x,
      y,
      button: "left",
      rawButton,
      shift,
      meta,
      ctrl,
    };
  }

  const button = toButton(baseButton);
  if (!button) {
    return null;
  }

  if (final === "m") {
    return {
      type: "release",
      x,
      y,
      button,
      rawButton,
      shift,
      meta,
      ctrl,
    };
  }

  return {
    type: Boolean(rawButton & 32) ? "drag" : "press",
    x,
    y,
    button,
    rawButton,
    shift,
    meta,
    ctrl,
  };
}

function toButton(baseButton: number): MouseButton | null {
  switch (baseButton) {
    case 0:
      return "left";
    case 1:
      return "middle";
    case 2:
      return "right";
    default:
      return null;
  }
}
