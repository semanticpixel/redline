import React, { createContext, useContext, useEffect } from "react";

export interface InputKey {
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  return?: boolean;
  escape?: boolean;
  backspace?: boolean;
  delete?: boolean;
  pageUp?: boolean;
  pageDown?: boolean;
  home?: boolean;
  end?: boolean;
  shift?: boolean;
  tab?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  name?: string;
}

export type InputHandler = (input: string, key: InputKey) => void;

interface InputContextValue {
  subscribe: (
    handler: InputHandler,
    options?: { isActive?: boolean },
  ) => () => void;
}

export const InputContext = createContext<InputContextValue>({
  subscribe: () => () => {},
});

export function useInput(
  handler: InputHandler,
  options?: { isActive?: boolean },
): void {
  const context = useContext(InputContext);

  useEffect(() => {
    return context.subscribe(handler, options);
  }, [context, handler, options?.isActive]);
}
