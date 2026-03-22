/** A single step/section parsed from Claude Code's plan */
export interface PlanStep {
  id: number;
  /** Raw markdown content of this step */
  content: string;
  /** Depth level (h1=1, h2=2, bullet=3, etc.) */
  depth: number;
  /** User annotations attached to this step */
  annotations: Annotation[];
}

export interface Annotation {
  id: string;
  type: "comment" | "question" | "delete" | "replace";
  text: string;
  /** For 'replace' type — the suggested replacement */
  replacement?: string;
}

/** The JSON payload Claude Code sends via stdin on ExitPlanMode */
export interface HookInput {
  session_id: string;
  tool_name: string;
  tool_input: {
    plan: string;
    permission_mode?: string;
  };
}

/** The JSON payload we write to stdout to respond to the hook */
export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: "PermissionRequest";
    decision: {
      behavior: "allow" | "deny";
      message?: string;
    };
  };
}

export type ViewMode = "review" | "annotate";

export interface AppState {
  steps: PlanStep[];
  activeStepIndex: number;
  mode: ViewMode;
  /** Currently typing an annotation */
  isAnnotating: boolean;
  annotationType: Annotation["type"];
}
