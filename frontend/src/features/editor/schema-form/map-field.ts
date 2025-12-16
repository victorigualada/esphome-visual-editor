import { html, nothing, type TemplateResult } from "lit";
import type { EsphomeUiSchemaNode } from "../../../types";
import { isObject } from "../../../lib/type-guards";
import type { SchemaFormCtx, SchemaFormEnv } from "./env";
import { renderAnyOfInline, type RenderObjectForm } from "./anyof";

export type RenderObjectFormWithOpts = (
  path: string,
  node: Extract<EsphomeUiSchemaNode, { type: "object" }>,
  value: Record<string, unknown>,
  onChange: (next: Record<string, unknown>) => void,
  opts?: { hiddenKeys?: string[]; ctx?: SchemaFormCtx },
) => TemplateResult;

export function renderMapField(args: {
  env: SchemaFormEnv;
  path: string;
  fieldKey: string;
  label: string;
  node: Extract<EsphomeUiSchemaNode, { type: "map" }>;
  value: unknown;
  onChange: (next: unknown) => void;
  ctx?: SchemaFormCtx;
  renderObjectForm: RenderObjectFormWithOpts;
}): TemplateResult {
  const { env, path, fieldKey, label, node, value, onChange, ctx, renderObjectForm } = args;
  const obj = isObject(value) ? (value as Record<string, unknown>) : {};
  const entries = Object.entries(obj).sort((a, b) => a[0].localeCompare(b[0]));

  const valueSchema: EsphomeUiSchemaNode = node.value ?? { type: "string" };

  const draftKey = `${path}.${fieldKey}.__mapDraft`;
  const draft = env.state.mapDrafts.get(draftKey) ?? { key: "", value: "" };
  const setDraft = (next: { key: string; value: string }) => {
    env.state.mapDrafts.set(draftKey, next);
    env.requestUpdate();
  };

  const renderObjectFormBare: RenderObjectForm = (p, n, v, oc) => renderObjectForm(p, n, v, oc, { ctx });
  const renderAnyOfInlineForValue = (
    rowPath: string,
    n: Extract<EsphomeUiSchemaNode, { type: "any_of" }>,
    v: unknown,
    oc: (next: unknown) => void,
  ) => renderAnyOfInline(env, renderObjectFormBare, rowPath, n, v, oc);

  const setValueAt = (k: string, v: unknown) => {
    const next = { ...obj, [k]: v };
    onChange(next);
  };

  const renderValueEditor = (rowPath: string, v: unknown, setV: (next: unknown) => void) => {
    if (valueSchema.type === "string" || valueSchema.type === "id") {
      return html`<input
        class="mapValueInput"
        .value=${typeof v === "string" ? v : ""}
        @input=${(e: Event) => setV((e.target as HTMLInputElement).value)}
      />`;
    }
    if (valueSchema.type === "int" || valueSchema.type === "float" || valueSchema.type === "number") {
      const s = typeof v === "number" ? String(v) : v === 0 ? "0" : "";
      return html`<input
        class="mapValueInput"
        type="number"
        .value=${s}
        @input=${(e: Event) => {
          const raw = (e.target as HTMLInputElement).value;
          if (raw === "") return setV(undefined);
          const n = valueSchema.type === "int" ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
          if (Number.isFinite(n)) setV(n);
        }}
      />`;
    }
    if (valueSchema.type === "boolean") {
      return html`<label class="switch" style="margin-left:6px;">
        <input
          type="checkbox"
          .checked=${Boolean(v)}
          @change=${(e: Event) => setV((e.target as HTMLInputElement).checked)}
        />
        <span class="switchSlider"></span>
      </label>`;
    }
    if (valueSchema.type === "enum") {
      const s = typeof v === "string" || typeof v === "number" ? String(v) : "";
      const opts = valueSchema.options ?? [];
      return html`<select
        class="mapValueInput"
        .value=${s}
        @change=${(e: Event) => setV((e.target as HTMLSelectElement).value)}
      >
        <option value=""></option>
        ${opts.map((o) => html`<option value=${String(o.value)}>${o.label ?? String(o.value)}</option>`)}
      </select>`;
    }
    if (valueSchema.type === "any_of") {
      return renderAnyOfInlineForValue(`${rowPath}.__any_of`, valueSchema, v, setV);
    }
    if (valueSchema.type === "object") {
      const vv = isObject(v) ? (v as Record<string, unknown>) : {};
      return html`${renderObjectForm(`${rowPath}.__obj`, valueSchema, vv, (nextObj) => setV(nextObj), { ctx })}`;
    }

    const s =
      v === undefined || v === null
        ? ""
        : typeof v === "string" || typeof v === "number" || typeof v === "boolean"
          ? String(v)
          : (() => {
              try {
                return JSON.stringify(v);
              } catch {
                return String(v);
              }
            })();
    return html`<input
      class="mapValueInput"
      .value=${s}
      @input=${(e: Event) => setV((e.target as HTMLInputElement).value)}
    />`;
  };

  return html`
    <div class="formRow">
      <div class="fieldLabel">${label}</div>
      <div class="mapEditor">
        ${entries.length === 0 ? html`<div class="hint">No entries.</div>` : nothing}
        ${entries.map(([k, v]) => {
          const rowPath = `${path}.${fieldKey}.${k}`;
          return html`
            <div class="mapEntry">
              <div class="mapEntryHeader">
                <input
                  class="mapKeyInput"
                  .value=${k}
                  @input=${(e: Event) => {
                    const nextKey = (e.target as HTMLInputElement).value;
                    if (nextKey === k) return;
                    const next: Record<string, unknown> = { ...obj };
                    delete next[k];
                    if (nextKey) next[nextKey] = v;
                    onChange(next);
                  }}
                />
                <button
                  type="button"
                  class="iconBtn danger"
                  title="Remove"
                  @click=${() => {
                    const next: Record<string, unknown> = { ...obj };
                    delete next[k];
                    onChange(next);
                  }}
                >
                  <span class="mdi mdi-trash-can-outline iconImg" aria-hidden="true"></span>
                </button>
              </div>
              <div class="mapEntryBody">${renderValueEditor(rowPath, v, (nextV) => setValueAt(k, nextV))}</div>
            </div>
          `;
        })}

        <div class="mapEntry mapEntryAdd">
          <div class="mapEntryHeader">
            <input
              class="mapKeyInput"
              placeholder="Key"
              .value=${draft.key}
              @input=${(e: Event) => setDraft({ ...draft, key: (e.target as HTMLInputElement).value })}
            />
            <button
              type="button"
              @click=${() => {
                const keyText = draft.key.trim();
                if (!keyText) return;
                const next: Record<string, unknown> = { ...obj };
                next[keyText] = draft.value;
                onChange(next);
                setDraft({ key: "", value: "" });
              }}
            >
              Add
            </button>
          </div>
          <div class="mapEntryBody">
            <input
              class="mapValueInput"
              placeholder="Value"
              .value=${draft.value}
              @input=${(e: Event) => setDraft({ ...draft, value: (e.target as HTMLInputElement).value })}
            />
          </div>
        </div>
      </div>
    </div>
  `;
}
