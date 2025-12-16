import { DEFAULT_YAML, CORE_KEYS, OPTIONAL_CORE_KEYS } from "./constants";
import { getComponents, getMeta, getProject, getProjects, saveProject, validateConfig } from "../api";
import type { ComponentRef, CoreSchemaResponse, EspBoardsCatalog, SchemaResponse } from "../types";
import { isObject } from "../lib/type-guards";
import type { DeleteTarget, Selection, StartupState, ValidateIssue } from "./store/types";
import { EveSchemaController } from "./store/schema-controller";
import { EveYamlEditorController } from "./store/yaml-editor-controller";
import {
  buildDisabledComponentBlock,
  buildDisabledCoreBlock,
  extractDisabledComponentBlocks,
  extractDisabledCoreBlocks,
  parseDisabledComponentBlock,
  parseDisabledCoreBlock,
  safeParseYaml,
  stringifyYamlWithDisabled,
} from "../lib/yaml/esphome-yaml";

export class EveAppStore extends EventTarget {
  startupState: StartupState = "loading";
  startupError: string | null = null;

  meta: { esphomeVersion?: string | null } | null = null;
  projects: string[] = [];
  projectName = "demo";

  yamlText = DEFAULT_YAML;
  yamlError: string | null = null;
  validateOutput = "";

  availableComponents: ComponentRef[] = [];

  selection: Selection = { kind: "core", key: "esphome" };

  addDialogOpen = false;
  addQuery = "";
  addSelectedDomain = "";
  addSelectedPlatform = "";

  deleteDialogOpen = false;
  deleteTarget: DeleteTarget | null = null;

  leftCoreCollapsed = false;
  leftComponentsCollapsed = false;

  boardPickerDialogOpen = false;
  private boardPickerDialogReturnSelection: Selection | null = null;

  monacoState: "loading" | "ready" | "failed" = "loading";
  monacoError: string | null = null;

  configObj: unknown = {};
  private lastValidConfigObj: unknown = {};

  private autoFixingEmptyDomainKey = false;
  private readonly yamlEditorController = new EveYamlEditorController();
  private foldAllRequestId = 0;
  private readonly schemaController = new EveSchemaController({
    notify: () => this.notify(),
    reportError: (message) => {
      this.validateOutput = message;
    },
  });

  notify() {
    this.dispatchEvent(new Event("change"));
  }

  setYamlEditor(editor: any) {
    this.yamlEditorController.setEditor(editor);
  }

  private clearValidationHighlights() {
    this.yamlEditorController.clearValidationHighlights();
  }

  private applyYamlParseErrorHighlights(msg: string | null) {
    this.yamlEditorController.applyYamlParseErrorHighlights(msg);
  }

  private parseValidateIssues(text: string, args: { ok: boolean }): ValidateIssue[] {
    const out: ValidateIssue[] = [];
    const ok = Boolean(args?.ok);
    const lines = String(text || "").split(/\r?\n/);

    // Common patterns observed in CLI tooling:
    // - /tmp/.../config.yaml:12:34: message
    // - config.yaml:12: message
    // - [source /tmp/.../config.yaml:12]
    // - ... line 12, column 34: message
    const rePathLineCol = /(?:^|\s)(?:.*\/)?config\.ya?ml:(\d+):(\d+):\s*(.+)$/i;
    const rePathLine = /(?:^|\s)(?:.*\/)?config\.ya?ml:(\d+):\s*(.+)$/i;
    const reSourceBracket = /\[source\s+.*\/config\.ya?ml:(\d+)\]/i;
    const reAnyConfigLineRef = /(?:^|\s)(?:.*\/)?config\.ya?ml:(\d+)(?:\b|[\]])?/i;
    const reLineCol = /\bline\s+(\d+)\s*(?:,|\s)\s*(?:col(?:umn)?\s+)?(\d+)\b[:\s-]*(.+)?$/i;
    const reLineOnly = /\bline\s+(\d+)\b[:\s-]*(.+)?$/i;

    const isHeaderish = (l: string) => {
      const t = l.trim();
      if (!t) return false;
      if (/^failed config\b/i.test(t)) return true;
      // e.g. "sensor.adc: [source ...]"
      if (t.includes("[source") && t.includes("config.yaml")) return true;
      return false;
    };

    const collectFollowingMessage = (startIdx: number): string => {
      const chunk: string[] = [];
      for (let j = startIdx + 1; j < lines.length; j++) {
        const raw = lines[j] ?? "";
        // Stop if next block starts.
        if (j !== startIdx + 1 && isHeaderish(raw)) break;
        // Keep indented lines and short context after the source line.
        if (raw.trim().length === 0) {
          // Keep a single blank line as separator.
          if (chunk.length && chunk[chunk.length - 1] !== "") chunk.push("");
          continue;
        }
        if (/^\s+/.test(raw) || chunk.length < 8) {
          chunk.push(raw.trimEnd());
          // Avoid unbounded capture.
          if (chunk.length >= 12) break;
          continue;
        }
        break;
      }
      return chunk.join("\n").trim();
    };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i] ?? "";
      const line = raw.trimEnd();
      let m = line.match(rePathLineCol);
      if (m) {
        const ln = Number(m[1]);
        const col = Number(m[2]);
        const msg = String(m[3] ?? "").trim() || line.trim();
        const sev: ValidateIssue["severity"] =
          /\bwarn(?:ing)?\b/i.test(msg) || /\bWARNING\b/.test(line) ? "warning" : "error";
        out.push({ line: ln, column: Number.isFinite(col) ? col : undefined, message: msg, severity: sev });
        continue;
      }
      m = line.match(rePathLine);
      if (m) {
        const ln = Number(m[1]);
        const msg = String(m[2] ?? "").trim() || line.trim();
        const sev: ValidateIssue["severity"] =
          /\bwarn(?:ing)?\b/i.test(msg) || /\bWARNING\b/.test(line) ? "warning" : "error";
        out.push({ line: ln, message: msg, severity: sev });
        continue;
      }

      // ESPHome format: "sensor.adc: [source /tmp/.../config.yaml:7]"
      m = line.match(reSourceBracket);
      if (m) {
        const ln = Number(m[1]);
        const msgBlock = collectFollowingMessage(i);
        const msg = msgBlock || line.trim();
        const sev: ValidateIssue["severity"] =
          /\bwarn(?:ing)?\b/i.test(msg) || /\bWARNING\b/.test(line) ? "warning" : "error";
        out.push({ line: ln, message: msg, severity: sev });
        continue;
      }

      // Fallback: any "config.yaml:LINE" occurrence even if followed by "]" and without a colon/message.
      m = line.match(reAnyConfigLineRef);
      if (m && /\[source\b/i.test(line)) {
        const ln = Number(m[1]);
        const msgBlock = collectFollowingMessage(i);
        const msg = msgBlock || line.trim();
        const sev: ValidateIssue["severity"] =
          /\bwarn(?:ing)?\b/i.test(msg) || /\bWARNING\b/.test(line) ? "warning" : "error";
        out.push({ line: ln, message: msg, severity: sev });
        continue;
      }

      m = line.match(reLineCol);
      if (m) {
        const ln = Number(m[1]);
        const col = Number(m[2]);
        const msg = String(m[3] ?? "").trim() || line.trim();
        const sev: ValidateIssue["severity"] =
          /\bwarn(?:ing)?\b/i.test(msg) || /\bWARNING\b/.test(line) ? "warning" : "error";
        out.push({ line: ln, column: Number.isFinite(col) ? col : undefined, message: msg, severity: sev });
        continue;
      }

      m = line.match(reLineOnly);
      if (m) {
        const ln = Number(m[1]);
        const msg = String(m[2] ?? "").trim() || line.trim();
        const sev: ValidateIssue["severity"] =
          /\bwarn(?:ing)?\b/i.test(msg) || /\bWARNING\b/.test(line) ? "warning" : "error";
        out.push({ line: ln, message: msg, severity: sev });
      }
    }

    // If validation failed but we couldn't parse positions, don't highlight arbitrary lines.
    // Still return empty list; the output pane will show the raw error.
    if (!out.length && !ok) return [];
    return out;
  }

  foldAllDisabledBlocksInYamlEditor() {
    this.foldAllRequestId += 1;
    const requestId = this.foldAllRequestId;
    const markerRe = /^\s*#\s*eve:disabled_[^\s]*\s*$/;

    const tryFoldAll = () => {
      const editor = this.yamlEditorController.getEditor();
      const model = editor?.getModel?.();
      if (!editor || !model) return false;
      const lineCount = model.getLineCount();
      const markerLines: number[] = [];
      for (let i = 1; i <= lineCount; i++) {
        const line = model.getLineContent(i);
        if (markerRe.test(line)) markerLines.push(i);
      }
      if (!markerLines.length) return true;
      for (let idx = markerLines.length - 1; idx >= 0; idx--) {
        const lineNumber = markerLines[idx];
        try {
          editor.setSelection?.({
            startLineNumber: lineNumber,
            startColumn: 1,
            endLineNumber: lineNumber,
            endColumn: 1,
          });
          editor.setPosition?.({ lineNumber, column: 1 });
          editor.getAction?.("editor.fold")?.run?.();
        } catch {
          // ignore
        }
      }
      return true;
    };

    let attempts = 0;
    const tick = () => {
      if (this.foldAllRequestId !== requestId) return;
      attempts += 1;
      const ok = tryFoldAll();
      if (ok) return;
      if (attempts >= 10) return;
      window.setTimeout(tick, 120);
    };
    window.setTimeout(tick, 0);
  }

  foldDisabledBlocksSoon() {
    if (this.monacoState !== "ready") return;
    this.foldAllDisabledBlocksInYamlEditor();
  }

  async loadMonacoEditor() {
    if (this.monacoState === "ready") return;
    this.monacoState = "loading";
    this.monacoError = null;
    this.notify();
    try {
      await import("../components/eve-monaco-editor");
      this.monacoState = "ready";
    } catch (e) {
      this.monacoState = "failed";
      this.monacoError = e instanceof Error ? e.message : String(e);
    }
    this.notify();
  }

  async loadStartup() {
    this.startupState = "loading";
    this.startupError = null;
    this.notify();
    try {
      const [meta, projects, components] = await Promise.all([getMeta(), getProjects(), getComponents()]);
      this.meta = meta;
      this.projects = projects.projects ?? [];
      this.availableComponents = components.components ?? [];

      if (this.projects.length === 0) {
        await saveProject("demo", DEFAULT_YAML);
        this.projects = ["demo"];
      }

      const first = this.projects[0] ?? "demo";
      this.projectName = first;
      const proj = await getProject(first);
      this.setYamlText(proj.yaml ?? DEFAULT_YAML);
      this.startupState = "ready";
    } catch (e) {
      this.startupState = "failed";
      this.startupError = e instanceof Error ? e.message : String(e);
      this.updateYamlError();
    }
    this.notify();
  }

  async selectProject(name: string) {
    this.projectName = name;
    this.notify();
    try {
      const proj = await getProject(name);
      this.setYamlText(proj.yaml ?? "");
    } catch (e) {
      this.validateOutput = `Project load error: ${e instanceof Error ? e.message : String(e)}`;
      this.notify();
    }
  }

  setYamlText(text: string) {
    this.yamlText = text;
    this.updateYamlError();
    // Edits invalidate the last validation markers.
    this.clearValidationHighlights();
    this.notify();
  }

  private updateYamlError() {
    const parsed = safeParseYaml(this.yamlText);
    this.yamlError = parsed.error ?? null;
    if (this.yamlError) {
      // Keep the last valid config so the UI can keep rendering while the user types.
      this.configObj = this.lastValidConfigObj ?? {};
    } else {
      this.configObj = parsed.doc ?? {};
      this.lastValidConfigObj = this.configObj;
    }
    this.applyYamlParseErrorHighlights(this.yamlError);

    if (
      !this.autoFixingEmptyDomainKey &&
      !this.yamlError &&
      isObject(this.configObj) &&
      Array.isArray((this.configObj as any)[""]) &&
      (this.availableComponents?.length ?? 0) > 0
    ) {
      this.autoFixingEmptyDomainKey = true;
      queueMicrotask(() => {
        try {
          this.updateConfig((_draft) => void _draft);
        } finally {
          this.autoFixingEmptyDomainKey = false;
        }
      });
    }
  }

  private fixEmptyDomainKeyInDraft(draft: any) {
    if (!draft || typeof draft !== "object") return;
    const list = (draft as any)[""];
    if (!Array.isArray(list) || list.length === 0) return;

    const platformToDomains = new Map<string, Set<string>>();
    for (const c of this.availableComponents ?? []) {
      if (!c?.domain || !c?.platform) continue;
      const set = platformToDomains.get(c.platform) ?? new Set<string>();
      set.add(c.domain);
      platformToDomains.set(c.platform, set);
    }

    const remaining: unknown[] = [];
    let moved = 0;
    for (const item of list) {
      if (!isObject(item) || typeof (item as any).platform !== "string") {
        remaining.push(item);
        continue;
      }
      const platform = String((item as any).platform);
      const domains = platformToDomains.get(platform);
      if (!domains || domains.size !== 1) {
        remaining.push(item);
        continue;
      }
      const [domain] = Array.from(domains);
      (draft as any)[domain] ??= [];
      if (!Array.isArray((draft as any)[domain])) (draft as any)[domain] = [];
      (draft as any)[domain].push(item);
      moved += 1;
    }

    if (remaining.length === 0) {
      delete (draft as any)[""];
    } else {
      (draft as any)[""] = remaining;
      if (moved > 0) this.validateOutput = `Fixed ${moved} component(s) that were added under an empty domain key.`;
      else
        this.validateOutput = `Found components under an empty domain key (""). Please re-add them under the correct domain.`;
    }
  }

  updateConfig(
    mutator: (draft: any) => void,
    opts?: {
      mutateDisabledCoreBlocks?: (blocks: Record<string, string>, draft: any) => void;
      mutateDisabledComponentBlocks?: (blocks: Record<string, string>, draft: any) => void;
    },
  ) {
    const current = isObject(this.configObj) ? structuredClone(this.configObj) : {};
    const disabledCore = extractDisabledCoreBlocks(this.yamlText);
    const disabledComponents = extractDisabledComponentBlocks(this.yamlText);
    mutator(current);
    this.fixEmptyDomainKeyInDraft(current);
    opts?.mutateDisabledCoreBlocks?.(disabledCore, current);
    opts?.mutateDisabledComponentBlocks?.(disabledComponents, current);
    for (const k of Object.keys(disabledCore)) if (k in current) delete disabledCore[k];
    this.yamlText = stringifyYamlWithDisabled(current, disabledCore, disabledComponents, {
      coreKeyOrder: CORE_KEYS,
      blankLineBetweenTopLevelKeys: true,
    });
    this.updateYamlError();
    this.notify();
  }

  getTree(): { core: Array<{ key: string; present: boolean }>; domains: string[] } {
    const configObj = this.configObj;
    const core = CORE_KEYS.map((k) => {
      if (!isObject(configObj)) return { key: k, present: false };
      if (k === "board") return { key: k, present: "esp32" in configObj || "esp8266" in configObj };
      return { key: k, present: k in configObj };
    });
    const domains: string[] = [];
    if (isObject(configObj)) {
      for (const k of Object.keys(configObj)) {
        if (CORE_KEYS.includes(k as any)) continue;
        const v = (configObj as any)[k];
        if (Array.isArray(v)) domains.push(k);
      }
    }
    const disabled = extractDisabledComponentBlocks(this.yamlText);
    for (const k of Object.keys(disabled)) {
      const domain = k.split(":")[0];
      if (domain) domains.push(domain);
    }
    domains.sort((a, b) => a.localeCompare(b));
    return { core, domains: Array.from(new Set(domains)) };
  }

  openAddDialog() {
    this.addDialogOpen = true;
    this.addQuery = "";
    this.addSelectedDomain = "";
    this.addSelectedPlatform = "";
    this.notify();
  }

  closeAddDialog() {
    this.addDialogOpen = false;
    this.notify();
  }

  openDeleteDialog(target: DeleteTarget) {
    this.deleteTarget = target;
    this.deleteDialogOpen = true;
    this.notify();
  }

  closeDeleteDialog() {
    this.deleteDialogOpen = false;
    this.deleteTarget = null;
    this.notify();
  }

  confirmDelete() {
    const target = this.deleteTarget;
    if (!target) return;

    if (target.kind === "core") {
      const key = target.key;
      if (key === "esphome" || key === "board") {
        this.closeDeleteDialog();
        return;
      }
      this.updateConfig(
        (draft) => {
          delete draft[key];
        },
        {
          mutateDisabledCoreBlocks: (blocks) => {
            delete blocks[key];
          },
        },
      );
      this.selection = { kind: "core", key: "esphome" };
      this.validateOutput = `Deleted core component ${key}.`;
      this.closeDeleteDialog();
      return;
    }

    if (target.kind === "component") {
      const { domain, index } = target;
      this.updateConfig((draft) => {
        const list = (draft as any)[domain];
        if (!Array.isArray(list)) return;
        if (index < 0 || index >= list.length) return;
        list.splice(index, 1);
        if (list.length === 0) delete (draft as any)[domain];
      });
      this.selection = { kind: "core", key: "esphome" };
      this.validateOutput = `Deleted ${target.domain}.${target.platform}.`;
      this.closeDeleteDialog();
      return;
    }

    if (target.kind === "disabled_component") {
      const { key } = target;
      this.updateConfig((_draft) => void _draft, {
        mutateDisabledComponentBlocks: (blocks) => {
          delete blocks[key];
        },
      });
      this.selection = { kind: "core", key: "esphome" };
      this.validateOutput = `Deleted disabled ${target.domain}.${target.platform}.`;
      this.closeDeleteDialog();
    }
  }

  addComponent(domain: string, platform: string) {
    if (!domain || !platform) {
      this.validateOutput = "Select a domain and platform before adding a component.";
      this.notify();
      return;
    }
    this.updateConfig((draft) => {
      draft[domain] ??= [];
      if (!Array.isArray(draft[domain])) draft[domain] = [];
      draft[domain].push({ platform });
      const index = draft[domain].length - 1;
      this.selection = { kind: "component", domain, index, platform };
    });
  }

  readSelectedValue(): unknown {
    const configObj = this.configObj;
    if (!isObject(configObj)) return null;
    if (this.selection.kind === "core") {
      if (this.selection.key === "board") {
        return { esp32: configObj["esp32"], esp8266: configObj["esp8266"] };
      }
      return (configObj as any)[this.selection.key];
    }
    if (this.selection.kind === "disabled_component") {
      const blocks = extractDisabledComponentBlocks(this.yamlText);
      const block = blocks[this.selection.key];
      if (!block) return null;
      const parsed = parseDisabledComponentBlock(block, this.selection.domain);
      return parsed.error ? null : parsed.value;
    }
    const list = (configObj as any)[this.selection.domain];
    if (!Array.isArray(list)) return null;
    return list[this.selection.index];
  }

  writeSelectedValue(next: unknown) {
    const selection = this.selection;

    if (selection.kind === "disabled_component") {
      const key = selection.key;
      const domain = selection.domain;
      this.updateConfig((_draft) => void _draft, {
        mutateDisabledComponentBlocks: (blocks) => {
          blocks[key] = buildDisabledComponentBlock(domain, next ?? {}, key).block;
        },
      });
      return;
    }

    if (selection.kind === "core") {
      this.updateConfig((draft) => {
        if (selection.key === "board") return;
        draft[selection.key] = next;
      });
      return;
    }

    this.updateConfig((draft) => {
      draft[selection.domain] ??= [];
      if (!Array.isArray(draft[selection.domain])) draft[selection.domain] = [];
      draft[selection.domain][selection.index] = next;
    });
  }

  focusYamlForFieldPath(formPath: string, fieldKey: string) {
    this.yamlEditorController.focusYamlForFieldPath(this.yamlText, this.selection, formPath, fieldKey);
  }

  selectCore(key: string) {
    const tree = this.getTree();
    const present = tree.core.find((c) => c.key === key)?.present ?? false;
    const optional = OPTIONAL_CORE_KEYS.has(key as any);
    if (!present && !optional && key !== "board") {
      this.updateConfig((draft) => {
        if (key === "esphome") draft.esphome = { name: "demo" };
        else draft[key] = {};
      });
    }
    this.selection = { kind: "core", key };
    this.notify();
  }

  openBoardPickerDialog() {
    if (this.boardPickerDialogOpen) return;
    this.boardPickerDialogReturnSelection = this.selection;
    this.boardPickerDialogOpen = true;
    this.notify();
  }

  closeBoardPickerDialog() {
    this.boardPickerDialogOpen = false;
    if (this.boardPickerDialogReturnSelection) this.selection = this.boardPickerDialogReturnSelection;
    this.boardPickerDialogReturnSelection = null;
    this.notify();
  }

  toggleOptionalCore(key: string, enabled: boolean) {
    if (!OPTIONAL_CORE_KEYS.has(key as any)) return;
    if (enabled) {
      const disabled = extractDisabledCoreBlocks(this.yamlText);
      const block = disabled[key];
      const parsed = block ? parseDisabledCoreBlock(block, key) : {};
      const value = parsed.error ? {} : (parsed.value ?? {});
      this.updateConfig(
        (draft) => {
          draft[key] = value;
        },
        {
          mutateDisabledCoreBlocks: (blocks) => {
            delete blocks[key];
          },
        },
      );
      this.selection = { kind: "core", key };
      this.notify();
      return;
    }

    const currentValue = isObject(this.configObj) ? (this.configObj as any)[key] : {};
    this.updateConfig(
      (draft) => {
        delete draft[key];
      },
      {
        mutateDisabledCoreBlocks: (blocks) => {
          blocks[key] = buildDisabledCoreBlock(key, currentValue === undefined ? {} : currentValue);
        },
      },
    );
    this.foldDisabledBlocksSoon();
    // Keep selection on the toggled key so the editor can show the disabled block view.
    if (this.selection.kind === "core" && this.selection.key === key) this.notify();
  }

  toggleComponent(domain: string, idOrIndex: string | number, enabled: boolean) {
    if (enabled) {
      const key = String(idOrIndex);
      const blocks = extractDisabledComponentBlocks(this.yamlText);
      const block = blocks[key];
      if (!block) return;
      const parsed = parseDisabledComponentBlock(block, domain);
      if (parsed.error) {
        this.validateOutput = `Cannot enable disabled block: ${parsed.error}`;
        this.notify();
        return;
      }
      const item = isObject(parsed.value) ? parsed.value : {};
      const platform = typeof (item as any).platform === "string" ? String((item as any).platform) : "unknown";
      this.updateConfig(
        (draft) => {
          draft[domain] ??= [];
          if (!Array.isArray(draft[domain])) draft[domain] = [];
          draft[domain].push(item);
          const index = draft[domain].length - 1;
          this.selection = { kind: "component", domain, index, platform };
        },
        {
          mutateDisabledComponentBlocks: (b) => {
            delete b[key];
          },
        },
      );
      return;
    }

    const index = typeof idOrIndex === "number" ? idOrIndex : Number.NaN;
    if (!Number.isFinite(index)) return;
    const cfg = this.configObj;
    if (!isObject(cfg)) return;
    const list = (cfg as any)[domain];
    if (!Array.isArray(list) || index < 0 || index >= list.length) return;
    const item = list[index];
    const { key, block } = buildDisabledComponentBlock(domain, item);
    this.updateConfig(
      (draft) => {
        if (!Array.isArray(draft[domain])) return;
        draft[domain].splice(index, 1);
        if (draft[domain].length === 0) delete draft[domain];
      },
      {
        mutateDisabledComponentBlocks: (blocks) => {
          blocks[key] = block;
        },
      },
    );
    this.foldDisabledBlocksSoon();

    if (this.selection.kind === "component" && this.selection.domain === domain && this.selection.index === index) {
      this.selection = { kind: "core", key: "esphome" };
      this.notify();
    }
  }

  async ensureSchema(domain: string, platform: string): Promise<SchemaResponse | null> {
    return await this.schemaController.ensureSchema(domain, platform);
  }

  getSchemaCached(domain: string, platform: string): SchemaResponse | null {
    return this.schemaController.getSchemaCached(domain, platform);
  }

  getSchemaError(domain: string, platform: string): string | null {
    return this.schemaController.getSchemaError(domain, platform);
  }

  clearSchemaError(domain: string, platform: string) {
    this.schemaController.clearSchemaError(domain, platform);
  }

  async ensureCoreSchema(name: string): Promise<CoreSchemaResponse | null> {
    return await this.schemaController.ensureCoreSchema(name);
  }

  getCoreSchemaCached(name: string): CoreSchemaResponse | null {
    return this.schemaController.getCoreSchemaCached(name);
  }

  getCoreSchemaError(name: string): string | null {
    return this.schemaController.getCoreSchemaError(name);
  }

  clearCoreSchemaError(name: string) {
    this.schemaController.clearCoreSchemaError(name);
  }

  async ensureEspBoards(target: "esp32" | "esp8266"): Promise<EspBoardsCatalog | null> {
    return await this.schemaController.ensureEspBoards(target);
  }

  getEspBoardsCached(target: "esp32" | "esp8266"): EspBoardsCatalog | null {
    return this.schemaController.getEspBoardsCached(target);
  }

  async validate() {
    this.validateOutput = "Validating…";
    this.clearValidationHighlights();
    this.notify();
    try {
      const res = await validateConfig(this.yamlText);
      const stdout = String(res.stdout ?? "").trimEnd();
      const stderr = String(res.stderr ?? "").trimEnd();
      const header = res.ok ? "OK" : `FAILED (code ${res.returncode})`;

      const parts: string[] = [header];
      // On success, stdout is usually just noisy CLI output; hide it.
      if (!res.ok && stdout.trim()) parts.push("", stdout);
      if (stderr.trim()) parts.push("", stderr);
      this.validateOutput = parts.join("\n");

      const issues = this.parseValidateIssues(`${stdout}\n${stderr}`, { ok: Boolean(res.ok) });
      this.yamlEditorController.bufferOrApplyValidation(issues);
    } catch (e) {
      this.validateOutput = `Validate error: ${e instanceof Error ? e.message : String(e)}`;
    }
    this.notify();
  }

  async save() {
    this.validateOutput = "Saving…";
    this.notify();
    try {
      await saveProject(this.projectName, this.yamlText);
      this.validateOutput = "Saved.";
    } catch (e) {
      this.validateOutput = `Save error: ${e instanceof Error ? e.message : String(e)}`;
    }
    this.notify();
  }
}
