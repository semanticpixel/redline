import React, { createContext, useContext, useEffect } from "react";
import type { MouseEvent } from "../mouse.js";

export type MouseHandler = (event: MouseEvent) => void;

interface MouseContextValue {
  subscribe: (
    handler: MouseHandler,
    options?: { isActive?: boolean },
  ) => () => void;
}

export const MouseContext = createContext<MouseContextValue>({
  subscribe: () => () => {},
});

export function useMouse(
  handler: MouseHandler,
  options?: { isActive?: boolean },
): void {
  const context = useContext(MouseContext);

  useEffect(() => {
    return context.subscribe(handler, options);
  }, [context, handler, options?.isActive]);
}
