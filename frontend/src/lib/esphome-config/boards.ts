import { boards, type BoardId } from "../../boards/boards";
import { isObject } from "../type-guards";

export function espBoardsSlugToEsphomeBoardId(_target: "esp32" | "esp8266", slug: string): string {
  return String(slug ?? "").trim();
}

export function esphomeBoardIdToEspBoardsSlug(target: "esp32" | "esp8266", boardId: string): string {
  const b = String(boardId ?? "").trim();
  if (!b) return "";
  // Reverse mapping for pinouts/images (espboards.dev).
  if (target === "esp32" && b === "seeed_xiao_esp32c3") return "xiao-esp32c3";
  return b;
}

export function getRootBoardId(config: unknown): BoardId | null {
  if (!isObject(config)) return null;

  const esp32 = (config as any)["esp32"];

  if (isObject(esp32) && typeof (esp32 as any)["board"] === "string" && (esp32 as any)["board"] in boards)
    return (esp32 as any)["board"] as BoardId;

  if (isObject((config as any)["esp32"])) return "esp32dev";
  const esp8266 = (config as any)["esp8266"];

  if (isObject(esp8266) && typeof (esp8266 as any)["board"] === "string" && (esp8266 as any)["board"] in boards)
    return (esp8266 as any)["board"] as BoardId;

  if (isObject((config as any)["esp8266"])) return "nodemcuv2";

  const esphome = (config as any)["esphome"];

  if (isObject(esphome) && typeof (esphome as any)["board"] === "string" && (esphome as any)["board"] in boards)
    return (esphome as any)["board"] as BoardId;

  return null;
}

export function getEspBoardsSelectionForUi(config: unknown): { target: "esp32" | "esp8266"; slug: string } | null {
  if (!isObject(config)) return null;
  const esp32 = (config as any)["esp32"];
  if (isObject(esp32) && typeof (esp32 as any)["board"] === "string" && (esp32 as any)["board"].trim()) {
    const board = String((esp32 as any)["board"]).trim();
    return { target: "esp32", slug: esphomeBoardIdToEspBoardsSlug("esp32", board) };
  }
  const esp8266 = (config as any)["esp8266"];
  if (isObject(esp8266) && typeof (esp8266 as any)["board"] === "string" && (esp8266 as any)["board"].trim()) {
    const board = String((esp8266 as any)["board"]).trim();
    return { target: "esp8266", slug: esphomeBoardIdToEspBoardsSlug("esp8266", board) };
  }
  return null;
}
