import { html, nothing, type TemplateResult } from "lit";
import { parseYamlValue, stringifyYaml } from "../../../lib/yaml/esphome-yaml";
import type { SchemaFormEnv } from "./env";

export function estimateYamlEditorHeightPx(text: string): number {
  const lines = (text || "").split("\n").length;
  const lineHeightPx = 18;
  const paddingPx = 28;
  const minPx = 86;
  const maxPx = 520;
  const estimated = lines * lineHeightPx + paddingPx;
  return Math.max(minPx, Math.min(maxPx, estimated));
}

export function renderYamlEditor(
  env: SchemaFormEnv,
  text: string,
  heightPx: number,
  onTextChange: (nextText: string) => void,
  opts?: { useYamlEditor?: boolean },
): TemplateResult {
  const store = env.store;
  const useYamlEditor = opts?.useYamlEditor ?? false;
  if (useYamlEditor && store?.monacoState === "ready") {
    return html`
      <div class="yamlEditor" style="height:${heightPx}px;">
        <eve-monaco-editor
          height="100%"
          language="yaml"
          .value=${text}
          @value-changed=${(e: CustomEvent) => onTextChange(e.detail.value ?? "")}
        ></eve-monaco-editor>
      </div>
    `;
  }

  return html`
    <textarea
      class="codeArea"
      rows="1"
      .value=${text}
      @input=${(e: Event) => {
        const el = e.target as HTMLTextAreaElement;
        el.style.height = "0px";
        el.style.height = `${el.scrollHeight}px`;
        onTextChange(el.value);
      }}
    ></textarea>
  `;
}

export function renderRawYamlField(
  env: SchemaFormEnv,
  path: string,
  label: string,
  value: unknown,
  onChange: (next: unknown) => void,
  showCodeHint: boolean,
  opts?: { useYamlEditor?: boolean; onJumpToYaml?: (() => void) | null },
): TemplateResult {
  const canonical = value === undefined ? "" : stringifyYaml(value).trimEnd();
  const draftKey = `${path}`;
  const draft = env.state.yamlFieldDrafts.get(draftKey) ?? canonical;
  const text = draft;
  const useYamlEditor = opts?.useYamlEditor ?? false;
  const heightPx = useYamlEditor ? estimateYamlEditorHeightPx(text) : 0;
  return html`
    <div class="formRow">
      <div class="fieldLabelRow">
        <div class="fieldLabel">${label}</div>
        ${opts?.onJumpToYaml
          ? html`
              <div class="fieldLabelActions">
                <button type="button" class="fieldLabelIconBtn" title="Jump to YAML" @click=${opts.onJumpToYaml}>
                  <span class="mdi mdi-code-tags fieldLabelIcon" aria-hidden="true"></span>
                </button>
              </div>
            `
          : nothing}
      </div>
      ${renderYamlEditor(
        env,
        text,
        heightPx,
        (nextText) => {
          if (!(nextText || "").trim()) {
            env.state.yamlFieldDrafts.delete(draftKey);
            env.requestUpdate();
            onChange(undefined);
            return;
          }
          env.state.yamlFieldDrafts.set(draftKey, nextText);
          env.requestUpdate();
          const parsed = parseYamlValue(nextText);
          if (parsed.error) return;
          onChange(parsed.value);
        },
        { useYamlEditor },
      )}
      ${showCodeHint
        ? html`<div class="hint">Tip: use YAML <code>|-</code> for multi-line code blocks.</div>`
        : nothing}
    </div>
  `;
}
