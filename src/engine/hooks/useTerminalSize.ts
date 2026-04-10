import React, { createContext, useContext } from "react";

export interface TerminalSize {
  columns: number;
  rows: number;
}

export const TerminalSizeContext = createContext<TerminalSize>({
  columns: 80,
  rows: 24,
});

export function useTerminalSize(): TerminalSize {
  return useContext(TerminalSizeContext);
}
