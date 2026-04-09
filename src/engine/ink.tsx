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
import { TerminalSizeContext } from "./hooks/useTerminalSize.js";

type Listener = {
  handler: InputHandler;
  isActive: boolean;
};

export type InkOptions = {
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  stderr?: NodeJS.WriteStream;
  onFrame?: (event: FrameEvent) => void;
};

export default class MiniInk {
  private readonly stdout: NodeJS.WriteStream;
  private readonly stdin: NodeJS.ReadStream;
  private readonly stderr: NodeJS.WriteStream;
  private readonly rootNode;
  private readonly container: any;
  private readonly listeners: Listener[] = [];
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

    readline.emitKeypressEvents(this.stdin);
    this.stdin.resume();
    if (this.stdin.isTTY) {
      this.stdin.setRawMode?.(true);
    }
    this.stdin.on("keypress", this.handleKeypress);
    this.stdout.on("resize", this.handleResize);
    process.on("exit", this.cleanupTerminal);
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
        <TerminalSizeContext.Provider
          value={{
            columns: this.stdout.columns || 80,
            rows: this.stdout.rows || 24,
          }}
        >
          {node}
        </TerminalSizeContext.Provider>
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
    this.stdin.off("keypress", this.handleKeypress);
    this.stdout.off("resize", this.handleResize);
    this.cleanupTerminal();
    this.resolveExit();
  };

  private cleanupTerminal = (): void => {
    if (this.stdin.isTTY) {
      this.stdin.setRawMode?.(false);
    }
    if (this.altScreenActive) {
      exitAltScreen(this.stdout);
      this.altScreenActive = false;
    }
  };
}
