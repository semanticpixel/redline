import { PassThrough } from "stream";
import readline from "readline";
import React from "react";
import type { ReactNode } from "react";
import { createContainer, reconciler } from "./reconciler.js";
import type { Frame, FrameEvent } from "./frame.js";
import { diffFrames } from "./log-update.js";
import { computeYogaLayout } from "./layout/yoga.js";
import { renderTree } from "./renderer.js";
import { exitAltScreen, enterAltScreen, writeTerminal } from "./terminal.js";
import { InputContext, type InputHandler, type InputKey } from "./hooks/useInput.js";
import { MouseContext, type MouseHandler, type MouseEvent } from "./hooks/useMouse.js";
import { TerminalSizeContext } from "./hooks/useTerminalSize.js";

type Listener = {
  handler: InputHandler;
  isActive: boolean;
};

type MouseListener = {
  handler: MouseHandler;
};

export type InkOptions = {
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  stderr?: NodeJS.WriteStream;
  onFrame?: (event: FrameEvent) => void;
};

const SGR_MOUSE_RE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

function parseMouseButton(cb: number): { button: MouseEvent["button"]; shift: boolean; ctrl: boolean } {
  const shift = (cb & 4) !== 0;
  const ctrl = (cb & 16) !== 0;
  const base = cb & ~(4 | 8 | 16 | 32);

  let button: MouseEvent["button"];
  switch (base) {
    case 0:
      button = "left";
      break;
    case 1:
      button = "middle";
      break;
    case 2:
      button = "right";
      break;
    case 64:
      button = "wheelUp";
      break;
    case 65:
      button = "wheelDown";
      break;
    default:
      button = "left";
      break;
  }

  return { button, shift, ctrl };
}

export default class MiniInk {
  private readonly stdout: NodeJS.WriteStream;
  private readonly stdin: NodeJS.ReadStream;
  private readonly stderr: NodeJS.WriteStream;
  private readonly rootNode;
  private readonly container: any;
  private readonly listeners: Listener[] = [];
  private readonly mouseListeners: MouseListener[] = [];
  private readonly keypressStream = new PassThrough();
  private renderQueued = false;
  private currentNode: ReactNode = null;
  private currentFrame: Frame | null = null;
  private altScreenActive = false;
  private frameCount = 0;
  private readonly exitPromise: Promise<void>;
  private resolveExit!: () => void;

  constructor(private readonly options: InkOptions = {}) {
    this.stdout = options.stdout ?? process.stdout;
    this.stdin = options.stdin ?? process.stdin;
    this.stderr = options.stderr ?? process.stderr;

    const { container, rootNode } = createContainer(
      this.scheduleRender,
      this.computeLayout,
    );
    this.container = container;
    this.rootNode = rootNode;

    this.exitPromise = new Promise<void>((resolve) => {
      this.resolveExit = resolve;
    });

    // Set up raw mode and intercept stdin data before readline sees it.
    // Mouse sequences are parsed and dispatched separately; everything
    // else is forwarded to a PassThrough that readline processes.
    readline.emitKeypressEvents(this.keypressStream);
    this.stdin.resume();
    if (this.stdin.isTTY) {
      this.stdin.setRawMode?.(true);
    }
    this.stdin.on("data", this.handleRawData);
    this.keypressStream.on("keypress", this.handleKeypress);
    this.stdout.on("resize", this.handleResize);
    process.on("exit", this.cleanupTerminal);

    // Enable SGR mouse tracking (button events + SGR extended coordinates)
    this.stdout.write("\x1b[?1000h\x1b[?1006h");
  }

  render = (node: ReactNode): void => {
    this.currentNode = node;
    reconciler.updateContainer(this.wrap(node), this.container, null, undefined);
  };

  unmount = (): void => {
    reconciler.updateContainer(null, this.container, null, undefined);
    this.cleanup();
  };

  waitUntilExit = (): Promise<void> => {
    return this.exitPromise;
  };

  private wrap(node: ReactNode): ReactNode {
    return (
      <InputContext.Provider
        value={{
          subscribe: (handler, config) => this.subscribeInput(handler, config),
        }}
      >
        <MouseContext.Provider
          value={{
            subscribe: (handler) => this.subscribeMouse(handler),
          }}
        >
          <TerminalSizeContext.Provider
            value={{
              columns: this.stdout.columns || 80,
              rows: this.stdout.rows || 24,
            }}
          >
            {node}
          </TerminalSizeContext.Provider>
        </MouseContext.Provider>
      </InputContext.Provider>
    );
  }

  private subscribeInput(
    handler: InputHandler,
    options?: { isActive?: boolean },
  ): () => void {
    const listener: Listener = {
      handler,
      isActive: options?.isActive ?? true,
    };
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private subscribeMouse(handler: MouseHandler): () => void {
    const listener: MouseListener = { handler };
    this.mouseListeners.push(listener);
    return () => {
      const index = this.mouseListeners.indexOf(listener);
      if (index >= 0) {
        this.mouseListeners.splice(index, 1);
      }
    };
  }

  private computeLayout = (): void => {
    computeYogaLayout(
      this.rootNode,
      this.stdout.columns || 80,
      this.stdout.rows || 24,
    );
  };

  private scheduleRender = (): void => {
    if (this.renderQueued) {
      return;
    }
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      this.onRender();
    });
  };

  private onRender(): void {
    if (this.rootNode.wantsAltScreen && !this.altScreenActive) {
      enterAltScreen(this.stdout);
      this.altScreenActive = true;
    }

    const width = this.stdout.columns || 80;
    const height = this.stdout.rows || 24;

    const start = performance.now();
    const renderStart = performance.now();
    const rendered = renderTree(this.rootNode, width, height);
    const renderMs = performance.now() - renderStart;

    const nextFrame: Frame = {
      screen: rendered.screen,
      stylePool: rendered.stylePool,
      width,
      height,
    };

    const diffStart = performance.now();
    const patches = diffFrames(this.currentFrame, nextFrame);
    const diffMs = performance.now() - diffStart;

    const writeStart = performance.now();
    writeTerminal(this.stdout, patches);
    const writeMs = performance.now() - writeStart;

    this.currentFrame = nextFrame;
    this.frameCount += 1;
    this.options.onFrame?.({
      durationMs: performance.now() - start,
      phases: {
        renderer: renderMs,
        diff: diffMs,
        write: writeMs,
        patches: patches.length,
      },
      damage: nextFrame.screen.damage,
    });
  }

  private handleRawData = (data: Buffer): void => {
    const str = data.toString("utf-8");

    // Extract mouse sequences and forward the rest to readline
    let lastEnd = 0;
    SGR_MOUSE_RE.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = SGR_MOUSE_RE.exec(str)) !== null) {
      // Forward any bytes before this mouse sequence
      if (match.index > lastEnd) {
        this.keypressStream.write(str.slice(lastEnd, match.index));
      }
      lastEnd = match.index + match[0].length;

      const cb = Number(match[1]);
      const cx = Number(match[2]);
      const cy = Number(match[3]);
      const isPress = match[4] === "M";

      const { button, shift, ctrl } = parseMouseButton(cb);
      const event: MouseEvent = {
        button,
        x: cx - 1, // SGR is 1-based
        y: cy - 1,
        shift,
        ctrl,
        type: isPress ? "press" : "release",
      };

      for (let i = this.mouseListeners.length - 1; i >= 0; i--) {
        this.mouseListeners[i]!.handler(event);
      }
    }

    // Forward remaining non-mouse bytes
    if (lastEnd < str.length) {
      this.keypressStream.write(str.slice(lastEnd));
    }
  };

  private handleKeypress = (input: string, key: readline.Key): void => {
    const normalized: InputKey = {
      upArrow: key.name === "up",
      downArrow: key.name === "down",
      leftArrow: key.name === "left",
      rightArrow: key.name === "right",
      return: key.name === "return",
      escape: key.name === "escape",
      backspace: key.name === "backspace",
      delete: key.name === "delete",
      pageUp: key.name === "pageup",
      pageDown: key.name === "pagedown",
      home: key.name === "home",
      end: key.name === "end",
      shift: Boolean(key.shift),
      tab: key.name === "tab",
      ctrl: Boolean(key.ctrl),
      name: key.name,
    };

    for (let index = this.listeners.length - 1; index >= 0; index--) {
      const listener = this.listeners[index]!;
      if (!listener.isActive) {
        continue;
      }
      listener.handler(input, normalized);
    }
  };

  private handleResize = (): void => {
    if (this.currentNode) {
      this.render(this.currentNode);
    }
  };

  private cleanup = (): void => {
    this.stdin.off("data", this.handleRawData);
    this.keypressStream.off("keypress", this.handleKeypress);
    this.stdout.off("resize", this.handleResize);
    this.cleanupTerminal();
    this.resolveExit();
  };

  private cleanupTerminal = (): void => {
    // Disable SGR mouse tracking
    this.stdout.write("\x1b[?1006l\x1b[?1000l");

    if (this.stdin.isTTY) {
      this.stdin.setRawMode?.(false);
    }
    if (this.altScreenActive) {
      exitAltScreen(this.stdout);
      this.altScreenActive = false;
    }
  };
}
