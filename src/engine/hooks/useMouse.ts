import React, { createContext, useContext, useEffect } from "react";

export interface MouseEvent {
  button: "left" | "middle" | "right" | "wheelUp" | "wheelDown";
  x: number;
  y: number;
  shift: boolean;
  ctrl: boolean;
  type: "press" | "release";
}

export type MouseHandler = (event: MouseEvent) => void;

interface MouseContextValue {
  subscribe: (handler: MouseHandler) => () => void;
}

export const MouseContext = createContext<MouseContextValue>({
  subscribe: () => () => {},
});

export function useMouse(handler: MouseHandler): void {
  const context = useContext(MouseContext);

  useEffect(() => {
    return context.subscribe(handler);
  }, [context, handler]);
}
