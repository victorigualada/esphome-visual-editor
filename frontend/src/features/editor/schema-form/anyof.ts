import { html, nothing, type TemplateResult } from "lit";
import type { EsphomeUiSchemaNode } from "../../../types";
import { isObject } from "../../../lib/type-guards";
import type { SchemaFormEnv } from "./env";
import { renderArrayInline } from "./array";

export type RenderObjectForm = (
  path: string,
  node: Extract<EsphomeUiSchemaNode, { type: "object" }>,
  value: Record<string, unknown>,
  onChange: (next: Record<string, unknown>) => void,
) => TemplateResult;

function inferAnyOfIndex(options: EsphomeUiSchemaNode[], value: unknown): number {
  const vt = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
  const matches = (opt: EsphomeUiSchemaNode) => {
    if (opt.type === "object") return vt === "object" && value !== null && !Array.isArray(value);
    if (opt.type === "array") return Array.isArray(value);
    if (opt.type === "boolean") return vt === "boolean";
    if (opt.type === "int" || opt.type === "float" || opt.type === "number") return vt === "number";
    if (opt.type === "string" || opt.type === "id") return vt === "string";
    if (opt.type === "enum") return vt === "string" || vt === "number";
    return false;
  };
  const idx = options.findIndex(matches);
  return idx >= 0 ? idx : 0;
}

function renderAnyOfOption(
  _env: SchemaFormEnv,
  renderObjectForm: RenderObjectForm,
  opt: EsphomeUiSchemaNode,
  value: unknown,
  onChange: (next: unknown) => void,
  path: string,
): TemplateResult {
  if (opt.type === "string" || opt.type === "id") {
    return html`<input
      class="mapValueInput"
      .value=${typeof value === "string" ? value : ""}
      @input=${(e: Event) => onChange((e.target as HTMLInputElement).value)}
    />`;
  }
  if (opt.type === "boolean") {
    return html`<label class="switch">
      <input
        type="checkbox"
        .checked=${Boolean(value)}
        @change=${(e: Event) => onChange((e.target as HTMLInputElement).checked)}
      />
      <span class="switchSlider"></span>
    </label>`;
  }
  if (opt.type === "int" || opt.type === "float" || opt.type === "number") {
    const s = typeof value === "number" ? String(value) : value === 0 ? "0" : "";
    return html`<input
      class="mapValueInput"
      type="number"
      .value=${s}
      @input=${(e: Event) => {
        const raw = (e.target as HTMLInputElement).value;
        if (raw === "") return onChange(undefined);
        const n = opt.type === "int" ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
        if (Number.isFinite(n)) onChange(n);
      }}
    />`;
  }
  if (opt.type === "enum") {
    const v = typeof value === "string" || typeof value === "number" ? String(value) : "";
    const options = opt.options ?? [];
    return html`<div class="toggleRow">
      ${options.map((o) => {
        const ov = String(o.value);
        const active = v === ov;
        return html`<button
          type="button"
          class=${active ? "toggleBtn active" : "toggleBtn"}
          @click=${() => onChange(o.value)}
        >
          ${o.label ?? ov}
        </button>`;
      })}
    </div>`;
  }
  if (opt.type === "object") {
    const obj = isObject(value) ? (value as Record<string, unknown>) : {};
    return html`${renderObjectForm(`${path}.__obj`, opt, obj, (next) => onChange(next))}`;
  }
  if (opt.type === "array") {
    // Use the shared array renderer so list UIs behave consistently everywhere.
    return renderArrayInline({
      env: _env,
      path: `${path}.__arr`,
      node: opt,
      value,
      onChange,
      renderObjectForm: (p, n, v, oc) => renderObjectForm(p, n, v, oc),
    });
    const s =
      value === undefined || value === null
        ? ""
        : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : (() => {
              try {
                return JSON.stringify(value);
              } catch {
                return String(value);
              }
            })();
    return html`<input
      class="mapValueInput"
      .value=${s}
      @input=${(e: Event) => onChange((e.target as HTMLInputElement).value)}
    />`;
  }
  return html`<div class="hint">Unsupported any_of option: ${(opt as any)?.type ?? "unknown"}</div>`;
}

export function renderAnyOfInline(
  env: SchemaFormEnv,
  renderObjectForm: RenderObjectForm,
  path: string,
  node: Extract<EsphomeUiSchemaNode, { type: "any_of" }>,
  value: unknown,
  onChange: (next: unknown) => void,
): TemplateResult {
  const options = (node.options ?? []).filter((opt) => opt.type !== "raw_yaml");
  if (!options.length) return html`<div class="hint">Unsupported any_of (no usable options).</div>`;

  const savedIdx = env.state.anyOfSelection.get(path);
  const inferred = inferAnyOfIndex(options, value);
  const idx = savedIdx === undefined ? inferred : Math.max(0, Math.min(options.length - 1, savedIdx));
  const selected = options[idx]!;
  const showToggleRow = options.length > 1;

  return html`
    <div class="anyOfInline">
      ${showToggleRow
        ? html`
            <div class="toggleRow">
              ${options.map((opt, i) => {
                const label = opt.ui?.title ? String(opt.ui.title) : opt.type;
                const active = i === idx;
                return html`<button
                  type="button"
                  class=${active ? "toggleBtn active" : "toggleBtn"}
                  @click=${() => {
                    env.state.anyOfSelection.set(path, i);
                    env.requestUpdate();
                    if (opt.type === "object" && (!isObject(value) || value === null)) onChange({});
                  }}
                >
                  ${label}
                </button>`;
              })}
            </div>
          `
        : nothing}
      <div>${renderAnyOfOption(env, renderObjectForm, selected, value, onChange, path)}</div>
    </div>
  `;
}
