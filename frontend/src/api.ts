import { apiJson } from "./services/api-client";
import type { ComponentRef, CoreSchemaResponse, EspBoardDetails, EspBoardsCatalog, SchemaResponse } from "./types";

export async function getMeta(): Promise<{ version: string; generatedAt: string; esphomeVersion?: string | null }> {
  return apiJson("api/meta");
}

export async function getComponents(): Promise<{ allowlistMode: number; components: ComponentRef[] }> {
  return apiJson("api/components");
}

export async function getSchema(domain: string, platform: string): Promise<SchemaResponse> {
  return apiJson(`api/schema/${encodeURIComponent(domain)}/${encodeURIComponent(platform)}`);
}

export async function getCoreSchema(name: string): Promise<CoreSchemaResponse> {
  return apiJson(`api/core-schema/${encodeURIComponent(name)}`);
}

export async function getEspBoards(target: "esp32" | "esp8266"): Promise<EspBoardsCatalog> {
  return apiJson(`api/espboards/${encodeURIComponent(target)}`);
}

export async function getEspBoardDetails(target: "esp32" | "esp8266", slug: string): Promise<EspBoardDetails> {
  return apiJson(`api/espboards/${encodeURIComponent(target)}/${encodeURIComponent(slug)}`);
}

export async function getProjects(): Promise<{ projects: string[] }> {
  return apiJson("api/projects");
}

export async function getProject(name: string): Promise<{ name: string; yaml: string }> {
  return apiJson(`api/projects/${encodeURIComponent(name)}`);
}

export async function saveProject(name: string, yaml: string): Promise<{ ok: boolean }> {
  return apiJson(`api/projects/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ yaml }),
  });
}

export async function validateConfig(yaml: string): Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
  returncode: number;
}> {
  return apiJson("api/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ yaml }),
  });
}
