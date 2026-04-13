export type Color = "white" | "yellow" | "cyan" | "red" | "green" | "gray" | "blue";
export type BackgroundColor = "blue" | "gray" | "\e[38;5;248m";

export type SourceSpan = {
  start: number;
  end: number;
};

export type Segment = {
  text: string;
  sourceMap?: Array<SourceSpan | null>;
  color?: Color;
  backgroundColor?: BackgroundColor;
  bold?: boolean;
  dim?: boolean;
};

export type RenderedRow = {
  key: string;
  segments: Segment[];
  stepIndex?: number;
  role?: "content" | "annotation" | "spacer";
};

export type RowLayout = {
  rows: RenderedRow[];
  stepStartRow: number[];
  stepRowCount: number[];
};
