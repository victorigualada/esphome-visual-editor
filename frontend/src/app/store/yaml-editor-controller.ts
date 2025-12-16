import { parseYamlDocumentForPositions } from "../../lib/yaml/esphome-yaml";
import type { Selection, ValidateIssue } from "./types";

type MonacoEditor = any;

export class EveYamlEditorController {
  private editor: MonacoEditor | null = null;

  private validationDecorations: string[] = [];
  private validationMarkerOwner = "eve-validate";
  private pendingValidateIssues: ValidateIssue[] = [];

  private parseDecorations: string[] = [];
  private parseMarkerOwner = "eve-parse";

  setEditor(editor: MonacoEditor | null) {
    this.editor = editor;
    // Don't keep stale markers when the editor remounts.
    this.clearValidationHighlights();
    if (this.pendingValidateIssues.length) {
      this.applyValidationHighlights(this.pendingValidateIssues);
      this.pendingValidateIssues = [];
    }
  }

  getEditor(): MonacoEditor | null {
    return this.editor;
  }

  bufferOrApplyValidation(issues: ValidateIssue[]) {
    if (this.editor) this.applyValidationHighlights(issues);
    else this.pendingValidateIssues = issues;
  }

  clearValidationHighlights() {
    const editor = this.editor;
    const model = editor?.getModel?.();
    try {
      if (editor?.deltaDecorations) {
        this.validationDecorations = editor.deltaDecorations(this.validationDecorations, []);
      }
    } catch {
      // ignore
    }
    try {
      const monaco = (window as any).monaco;
      if (monaco?.editor?.setModelMarkers && model) {
        monaco.editor.setModelMarkers(model, this.validationMarkerOwner, []);
      }
    } catch {
      // ignore
    }
  }

  clearYamlParseHighlights() {
    const editor = this.editor;
    const model = editor?.getModel?.();
    try {
      if (editor?.deltaDecorations) {
        this.parseDecorations = editor.deltaDecorations(this.parseDecorations, []);
      }
    } catch {
      // ignore
    }
    try {
      const monaco = (window as any).monaco;
      if (monaco?.editor?.setModelMarkers && model) {
        monaco.editor.setModelMarkers(model, this.parseMarkerOwner, []);
      }
    } catch {
      // ignore
    }
  }

  applyYamlParseErrorHighlights(msg: string | null) {
    if (!msg) {
      this.clearYamlParseHighlights();
      return;
    }
    const editor = this.editor;
    const model = editor?.getModel?.();
    if (!editor || !model) return;

    const m = String(msg).match(/\bline\s+(\d+)\s*,\s*column\s+(\d+)\b/i);
    if (!m) {
      // Can't place; clear markers to avoid stale positions.
      this.clearYamlParseHighlights();
      return;
    }
    const line = Number(m[1]);
    const col = Number(m[2]);
    if (!Number.isFinite(line) || line < 1) return;

    const lineCount = typeof model.getLineCount === "function" ? model.getLineCount() : 0;
    if (lineCount && line > lineCount) return;

    const maxCol =
      typeof model.getLineMaxColumn === "function" ? Math.max(2, model.getLineMaxColumn(line)) : Math.max(2, col + 1);
    const startCol = Math.max(1, col);
    const endCol = Math.max(startCol + 1, maxCol);

    // Decorations (whole line highlight)
    try {
      if (editor.deltaDecorations) {
        const dec = [
          {
            range: {
              startLineNumber: line,
              startColumn: 1,
              endLineNumber: line,
              endColumn: 1,
            },
            options: {
              isWholeLine: true,
              className: "eveParseErrorLine",
              hoverMessage: [{ value: msg }],
            },
          },
        ];
        this.parseDecorations = editor.deltaDecorations(this.parseDecorations, dec);
      }
    } catch {
      // ignore
    }

    // Markers (squiggle + gutter)
    try {
      const monaco = (window as any).monaco;
      if (monaco?.editor?.setModelMarkers) {
        monaco.editor.setModelMarkers(model, this.parseMarkerOwner, [
          {
            severity: monaco.MarkerSeverity.Error,
            message: msg,
            startLineNumber: line,
            startColumn: startCol,
            endLineNumber: line,
            endColumn: endCol,
          },
        ]);
      }
    } catch {
      // ignore
    }
  }

  applyValidationHighlights(issues: ValidateIssue[]) {
    const editor = this.editor;
    const model = editor?.getModel?.();
    if (!editor || !model || !editor.deltaDecorations) return;

    const lineCount = typeof model.getLineCount === "function" ? model.getLineCount() : 0;
    const dedup = new Map<string, ValidateIssue>();
    for (const it of issues) {
      if (!it?.line || it.line < 1 || it.line > lineCount) continue;
      const key = `${it.severity}:${it.line}:${it.column ?? 0}:${it.message}`;
      if (!dedup.has(key)) dedup.set(key, it);
    }

    const uniq = Array.from(dedup.values()).slice(0, 200);
    const decorations = uniq.map((it) => ({
      range: {
        startLineNumber: it.line,
        startColumn: 1,
        endLineNumber: it.line,
        endColumn: 1,
      },
      options: {
        isWholeLine: true,
        className: it.severity === "warning" ? "eveValidateWarnLine" : "eveValidateErrorLine",
        hoverMessage: [{ value: it.message }],
      },
    }));

    try {
      this.validationDecorations = editor.deltaDecorations(this.validationDecorations, decorations);
    } catch {
      // ignore
    }

    // Also set Monaco markers so users get gutter markers + squiggles + hover.
    try {
      const monaco = (window as any).monaco;
      if (monaco?.editor?.setModelMarkers) {
        const markers = uniq.map((it: ValidateIssue) => {
          const startCol = Math.max(1, it.column ?? 1);
          const endCol =
            it.column == null
              ? Math.max(2, typeof model.getLineMaxColumn === "function" ? model.getLineMaxColumn(it.line) : 2)
              : Math.max(startCol + 1, startCol + 2);
          return {
            severity: it.severity === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
            message: it.message,
            startLineNumber: it.line,
            startColumn: startCol,
            endLineNumber: it.line,
            endColumn: endCol,
          };
        });
        monaco.editor.setModelMarkers(model, this.validationMarkerOwner, markers);
      }
    } catch {
      // ignore
    }

    // Scroll to first issue (best-effort).
    try {
      const first = uniq[0];
      if (first) {
        editor.setPosition?.({ lineNumber: first.line, column: first.column ?? 1 });
        editor.revealPositionInCenter?.({ lineNumber: first.line, column: first.column ?? 1 });
      }
    } catch {
      // ignore
    }
  }

  parseValidateIssues(text: string, args: { ok: boolean }): ValidateIssue[] {
    const out: ValidateIssue[] = [];
    const ok = Boolean(args?.ok);
    const lines = String(text ?? "").split("\n");

    // ESPHome CLI emits several formats. We accept:
    // - /tmp/.../config.yaml:LINE:COL: message
    // - config.yaml:LINE:COL: message
    // - [source ...config.yaml:LINE] message
    const rx1 = /(?:^|\s)(?:\/[^\s]+\/)?config\.ya?ml:(\d+)(?::(\d+))?:\s*(.+)\s*$/i;
    const rx2 = /\[source[^\]]*config\.ya?ml:(\d+)\]\s*(.+)\s*$/i;

    for (const l of lines) {
      const line = String(l ?? "").trimEnd();
      if (!line) continue;

      let m = line.match(rx1);
      if (m) {
        const ln = Number(m[1]);
        const col = m[2] ? Number(m[2]) : undefined;
        const msg = String(m[3] ?? "").trim();
        if (Number.isFinite(ln) && ln >= 1 && msg)
          out.push({ line: ln, column: col, message: msg, severity: ok ? "warning" : "error" });
        continue;
      }

      m = line.match(rx2);
      if (m) {
        const ln = Number(m[1]);
        const msg = String(m[2] ?? "").trim();
        if (Number.isFinite(ln) && ln >= 1 && msg)
          out.push({ line: ln, message: msg, severity: ok ? "warning" : "error" });
      }
    }
    return out;
  }

  focusYamlForFieldPath(yamlText: string, selection: Selection, formPath: string, fieldKey: string) {
    const editor = this.editor;
    if (!editor) return;
    try {
      const posInfo = this.yamlFieldPositionFromFormPath(yamlText, selection, formPath, fieldKey);
      const pos = { lineNumber: posInfo?.line ?? 1, column: posInfo?.column ?? 1 };
      editor.focus?.();
      editor.setPosition?.(pos);
      editor.revealPositionInCenter?.(pos);
    } catch {
      // ignore
    }
  }

  private yamlKeyText(keyNode: any): string {
    if (typeof keyNode === "string") return keyNode;
    if (keyNode && typeof keyNode.value === "string") return keyNode.value;
    if (keyNode && typeof keyNode.value === "number") return String(keyNode.value);
    return String(keyNode?.value ?? keyNode ?? "");
  }

  private yamlFindPair(mapNode: any, key: string): any | null {
    const items: any[] = Array.isArray(mapNode?.items) ? mapNode.items : [];
    for (const p of items) {
      const k = this.yamlKeyText(p?.key);
      if (k === key) return p;
    }
    return null;
  }

  private yamlFindKeyOffset(mapNode: any, key: string): number | null {
    const pair = this.yamlFindPair(mapNode, key);
    const keyNode = pair?.key;
    const valNode = pair?.value;
    const off =
      (Array.isArray(keyNode?.range) ? keyNode.range[0] : null) ??
      (Array.isArray(valNode?.range) ? valNode.range[0] : null);
    return typeof off === "number" ? off : null;
  }

  private yamlFieldPositionFromFormPath(
    yamlText: string,
    selection: Selection,
    formPath: string,
    fieldKey: string,
  ): { line: number; column: number } | null {
    const parsed = parseYamlDocumentForPositions(yamlText);
    if (parsed.error || !parsed.doc || !parsed.lineCounter) return null;

    const doc: any = parsed.doc;
    const lc: any = parsed.lineCounter;
    const root = doc?.contents;
    if (!root || !Array.isArray(root.items)) return null;

    const parts = String(formPath || "")
      .split(".")
      .filter(Boolean);
    if (!parts.length) return null;

    const linePos = (offset: number) => {
      const lp = lc.linePos(offset);
      const line = Math.max(1, Number(lp?.line ?? 1));
      // yaml LineCounter cols are 1-based in most builds, but clamp defensively.
      const col = Math.max(1, Number(lp?.col ?? 1));
      return { line, column: col };
    };

    if (parts[0] === "core" && parts[1]) {
      const coreKey = parts[1];
      const corePair = this.yamlFindPair(root, coreKey);
      const coreVal = corePair?.value;
      // Navigate nested maps for deeper paths (best-effort).
      let node: any = coreVal;
      for (const k of parts.slice(2)) {
        const p = this.yamlFindPair(node, k);
        node = p?.value;
        if (!node) break;
      }
      const off = this.yamlFindKeyOffset(node ?? coreVal ?? root, fieldKey) ?? this.yamlFindKeyOffset(root, coreKey);
      return off != null ? linePos(off) : null;
    }

    if (parts[0] === "component" && parts[1]) {
      const domain = parts[1];
      const domainPair = this.yamlFindPair(root, domain);
      const seq = domainPair?.value;
      const items: any[] = Array.isArray(seq?.items) ? seq.items : [];
      const idx = selection.kind === "component" && selection.domain === domain ? selection.index : 0;
      const item = items[Math.max(0, Math.min(idx, items.length - 1))];
      let node: any = item;
      for (const k of parts.slice(3)) {
        const p = this.yamlFindPair(node, k);
        node = p?.value;
        if (!node) break;
      }
      const off =
        this.yamlFindKeyOffset(node ?? item ?? seq ?? root, fieldKey) ??
        // fallback: platform line inside the item
        this.yamlFindKeyOffset(item ?? root, "platform") ??
        this.yamlFindKeyOffset(root, domain);
      return off != null ? linePos(off) : null;
    }

    return null;
  }
}
