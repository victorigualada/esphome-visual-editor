import type { EveAppStore } from "../../../app/eve-app-store";
import type { BoardId } from "../../../boards/boards";
import type { EsphomeUiSchemaNode } from "../../../types";

export type SchemaFormCtx = {
  boardId: BoardId | null;
  espBoards: { target: "esp32" | "esp8266"; slug: string } | null;
};

export type SchemaFormState = {
  collapsedGroups: Map<string, boolean>;
  yamlFieldDrafts: Map<string, string>;
  anyOfSelection: Map<string, number>;
  mapDrafts: Map<string, { key: string; value: string }>;
  pendingOpenPinPath: string | null;
};

export type SchemaFormEnv = {
  store: EveAppStore;
  state: SchemaFormState;
  requestUpdate: () => void;
};

export function readSearchSelectValueFromEvent(e: Event): string | null {
  const detail = (e as any)?.detail;
  const v = detail?.value;
  return typeof v === "string" ? v : null;
}

export function schemaTitle(node: EsphomeUiSchemaNode, fallbackKey: string): string {
  const raw = node.ui?.title ? String(node.ui.title) : fallbackKey;
  return raw.replace(/_/g, " ");
}
