import YAML from "yaml";
import { normalizeConfig } from "../esphome-config/normalize";
import { hashFNV1aHex } from "../hash";
import { isObject } from "../type-guards";

function reorderTopLevelKeys(doc: Record<string, unknown>, coreKeyOrder: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const included = new Set<string>();

  const addKey = (k: string) => {
    if (included.has(k)) return;
    if (!(k in doc)) return;
    out[k] = doc[k];
    included.add(k);
  };

  for (const k of coreKeyOrder) {
    if (k === "board") {
      addKey("esp32");
      addKey("esp8266");
      continue;
    }
    addKey(k);
  }

  for (const k of Object.keys(doc)) {
    if (included.has(k)) continue;
    out[k] = doc[k];
  }
  return out;
}

function secretTag() {
  return {
    tag: "!secret",
    identify: (v: unknown) =>
      typeof v === "object" && v !== null && (v as any).__eveTag === "secret" && typeof (v as any).key === "string",
    resolve: (str: string) => ({ __eveTag: "secret", key: str }),
    createNode: (_schema: any, v: any) => {
      const node = new (YAML as any).Scalar(String(v?.key ?? ""));
      // Ensure we stringify back as `!secret <key>` (not as a normal quoted scalar).
      node.tag = "!secret";
      return node;
    },
  } as any;
}

export function safeParseYaml(text: string): { doc?: unknown; error?: string } {
  try {
    const doc = YAML.parseDocument(text, { customTags: [secretTag()] });
    if (doc.errors?.length) return { error: doc.errors[0]?.message ?? "Unknown YAML error" };
    const js = doc.toJS();
    return { doc: normalizeConfig(js) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function stringifyYaml(doc: unknown): string {
  return YAML.stringify(doc, { lineWidth: 0, customTags: [secretTag()] });
}

export function parseYamlValue(text: string): { value?: unknown; error?: string } {
  try {
    const doc = YAML.parseDocument(text, { customTags: [secretTag()] });
    if (doc.errors?.length) return { error: doc.errors[0]?.message ?? "Unknown YAML error" };
    return { value: doc.toJS() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function parseYamlDocumentForPositions(text: string): { doc?: any; lineCounter?: any; error?: string } {
  try {
    const lineCounter = new (YAML as any).LineCounter();
    const doc = YAML.parseDocument(text, { customTags: [secretTag()], keepCstNodes: true, lineCounter } as any);
    if (doc.errors?.length) return { error: doc.errors[0]?.message ?? "Unknown YAML error" };
    return { doc, lineCounter };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function commentOutYaml(text: string): string {
  return text
    .split("\n")
    .map((l) => (l.trim() === "" ? "#" : `# ${l}`))
    .join("\n");
}

export function extractDisabledCoreBlocks(text: string): Record<string, string> {
  const lines = text.split("\n");
  const out: Record<string, string> = {};
  const markerAny = /^#\s*eve:disabled_(core|component):/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#\s*eve:disabled_core:([a-zA-Z0-9_]+)\s*$/);
    if (!m) continue;
    const key = m[1];
    const block: string[] = [lines[i]];
    i += 1;
    while (i < lines.length) {
      if (markerAny.test(lines[i])) {
        i -= 1;
        break;
      }
      if (!lines[i].startsWith("#")) {
        i -= 1;
        break;
      }
      block.push(lines[i]);
      i += 1;
    }
    out[key] = block.join("\n").trimEnd();
  }
  return out;
}

export function parseDisabledCoreBlock(block: string, key: string): { value?: unknown; error?: string } {
  const uncommented = block
    .split("\n")
    .filter((l) => !l.match(/^#\s*eve:disabled_core:/))
    .map((l) => l.replace(/^#\s?/, ""))
    .join("\n")
    .trim();
  if (!uncommented) return {};
  const parsed = safeParseYaml(uncommented);
  if (parsed.error) return { error: parsed.error };
  if (!parsed.doc || !isObject(parsed.doc)) return { error: "Invalid YAML block" };
  return { value: (parsed.doc as any)[key] };
}

export function buildDisabledCoreBlock(key: string, value: unknown): string {
  const marker = `# eve:disabled_core:${key}`;
  const yamlBlock = stringifyYaml({ [key]: value }).trimEnd();
  return `${marker}\n${commentOutYaml(yamlBlock)}`;
}

export function extractDisabledComponentBlocks(text: string): Record<string, string> {
  const lines = text.split("\n");
  const out: Record<string, string> = {};
  const markerAny = /^#\s*eve:disabled_(core|component):/;
  const marker = /^#\s*eve:disabled_component:([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+):([0-9a-f]+)\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(marker);
    if (!m) continue;
    const key = `${m[1]}:${m[2]}:${m[3]}`;
    const block: string[] = [lines[i]];
    i += 1;
    while (i < lines.length) {
      if (markerAny.test(lines[i])) {
        i -= 1;
        break;
      }
      if (!lines[i].startsWith("#")) {
        i -= 1;
        break;
      }
      block.push(lines[i]);
      i += 1;
    }
    out[key] = block.join("\n").trimEnd();
  }
  return out;
}

export function parseDisabledComponentBlock(block: string, domain: string): { value?: unknown; error?: string } {
  const uncommented = block
    .split("\n")
    .filter((l) => !l.match(/^#\s*eve:disabled_component:/))
    .map((l) => l.replace(/^#\s?/, ""))
    .join("\n")
    .trim();
  if (!uncommented) return {};
  const parsed = safeParseYaml(uncommented);
  if (parsed.error) return { error: parsed.error };
  if (!parsed.doc || !isObject(parsed.doc)) return { error: "Invalid YAML block" };
  const arr = (parsed.doc as any)[domain];
  if (!Array.isArray(arr) || !arr.length) return { error: `Missing ${domain}: list` };
  return { value: arr[0] };
}

export function buildDisabledComponentBlock(
  domain: string,
  value: unknown,
  existingKey?: string,
): { key: string; block: string } {
  const item = isObject(value) ? value : {};
  const platform = typeof (item as any).platform === "string" ? String((item as any).platform) : "unknown";
  const yamlBlock = stringifyYaml({ [domain]: [item] }).trimEnd();
  const key = existingKey ?? `${domain}:${platform}:${hashFNV1aHex(`${domain}:${platform}\n${yamlBlock}`)}`;
  const marker = `# eve:disabled_component:${key}`;
  return { key, block: `${marker}\n${commentOutYaml(yamlBlock)}` };
}

export function stringifyYamlWithDisabled(
  doc: unknown,
  disabledCoreBlocks: Record<string, string>,
  disabledComponentBlocks: Record<string, string>,
  opts?: { coreKeyOrder?: readonly string[]; blankLineBetweenTopLevelKeys?: boolean },
): string {
  const ensureBlankLineBetweenTopLevelKeys = (mainYaml: string): string => {
    const lines = String(mainYaml ?? "").split("\n");
    const isTopLevelKeyLine = (line: string): boolean => {
      if (!line) return false;
      if (line.startsWith("#")) return false;
      if (/^\s/.test(line)) return false;
      return /^([A-Za-z0-9_][A-Za-z0-9_-]*)\s*:\s*(?:#.*)?$/.test(line);
    };

    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (isTopLevelKeyLine(line)) {
        // If previous output line isn't blank (and we're not at the start), insert one blank line.
        if (out.length > 0 && (out[out.length - 1] ?? "").trim() !== "") out.push("");
      }
      out.push(line);
    }

    // If we inserted a blank line at the very top, remove it.
    while (out.length && out[0]?.trim() === "") out.shift();
    return out.join("\n").trimEnd();
  };

  const normalized = normalizeConfig(doc);
  const ordered =
    opts?.coreKeyOrder && isObject(normalized)
      ? reorderTopLevelKeys(normalized as Record<string, unknown>, opts.coreKeyOrder)
      : normalized;
  let main = stringifyYaml(ordered).trimEnd();
  if (opts?.blankLineBetweenTopLevelKeys) main = ensureBlankLineBetweenTopLevelKeys(main);
  const blocks = [
    ...Object.keys(disabledCoreBlocks)
      .sort()
      .map((k) => disabledCoreBlocks[k].trimEnd()),
    ...Object.keys(disabledComponentBlocks)
      .sort()
      .map((k) => disabledComponentBlocks[k].trimEnd()),
  ].filter(Boolean);
  if (blocks.length === 0) return `${main}\n`;
  return `${main}\n\n${blocks.join("\n\n")}\n`;
}
