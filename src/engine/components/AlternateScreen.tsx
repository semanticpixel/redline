import React from "react";

type Props = {
  children?: React.ReactNode;
};

export function AlternateScreen({ children }: Props): React.ReactNode {
  return React.createElement("mini-alt-screen", null, children);
}
