import { isObject } from "../type-guards";

export function normalizeConfig(doc: unknown): unknown {
  if (!isObject(doc)) return doc;
  const normalized: Record<string, unknown> = { ...doc };
  for (const key of ["logger", "api", "ota", "captive_portal", "web_server", "mqtt"]) {
    if (key in normalized && normalized[key] === null) normalized[key] = {};
  }
  return normalized;
}
