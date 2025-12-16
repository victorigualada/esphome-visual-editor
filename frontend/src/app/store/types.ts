export type StartupState = "loading" | "ready" | "failed";

export type Selection =
  | { kind: "core"; key: string }
  | { kind: "component"; domain: string; index: number; platform: string }
  | { kind: "disabled_component"; domain: string; key: string; platform: string };

export type DeleteTarget =
  | { kind: "component"; domain: string; index: number; platform: string }
  | { kind: "disabled_component"; domain: string; key: string; platform: string }
  | { kind: "core"; key: string };

export type ValidateIssue = {
  line: number;
  column?: number;
  message: string;
  severity: "error" | "warning";
};
