export type Color = "white" | "yellow" | "cyan" | "red" | "green" | "gray" | "blue";

export type Segment = {
  text: string;
  color?: Color;
  backgroundColor?: "blue";
  bold?: boolean;
  dim?: boolean;
};

export type RenderedRow = {
  key: string;
  segments: Segment[];
};

export type RowLayout = {
  rows: RenderedRow[];
  stepStartRow: number[];
  stepRowCount: number[];
};
