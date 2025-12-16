import { html, nothing, type TemplateResult } from "lit";
import type { EsphomeUiSchemaNode } from "../../../types";
import type { SchemaFormEnv } from "./env";

export function isMapLikeObjectSchema(properties: Record<string, EsphomeUiSchemaNode>, keys: string[]): boolean {
  if (keys.length !== 1) return false;
  const key = keys[0] ?? "";
  if (!key) return false;
  if (!(key in properties)) return false;
  if (key.startsWith("<function")) return true;
  if (key.startsWith("<") && key.endsWith(">")) return true;
  return false;
}

export function renderMapLikeObjectForm(args: {
  env: SchemaFormEnv;
  path: string;
  value: Record<string, unknown>;
  valueNode: EsphomeUiSchemaNode;
  onChange: (next: Record<string, unknown>) => void;
  renderAnyOfInline: (
    rowPath: string,
    node: Extract<EsphomeUiSchemaNode, { type: "any_of" }>,
    value: unknown,
    onChange: (next: unknown) => void,
  ) => TemplateResult;
}): TemplateResult {
  const { env, path, value, valueNode, onChange } = args;
  const entries = Object.entries(value ?? {}).sort((a, b) => a[0].localeCompare(b[0]));
  const draft = env.state.mapDrafts.get(path) ?? { key: "", value: "" };

  const setDraft = (next: { key: string; value: string }) => {
    env.state.mapDrafts.set(path, next);
    env.requestUpdate();
  };

  const renderValueEditor = (rowPath: string, v: unknown, setV: (next: unknown) => void) => {
    if (valueNode.type === "string" || valueNode.type === "id") {
      return html`<input
        class="mapValueInput"
        .value=${typeof v === "string" ? v : ""}
        @input=${(e: Event) => setV((e.target as HTMLInputElement).value)}
      />`;
    }
    if (valueNode.type === "int" || valueNode.type === "float" || valueNode.type === "number") {
      const s = typeof v === "number" ? String(v) : v === 0 ? "0" : "";
      return html`<input
        class="mapValueInput"
        type="number"
        .value=${s}
        @input=${(e: Event) => {
          const raw = (e.target as HTMLInputElement).value;
          if (raw === "") return setV(undefined);
          const n = valueNode.type === "int" ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
          if (Number.isFinite(n)) setV(n);
        }}
      />`;
    }
    if (valueNode.type === "boolean") {
      return html`<label class="switch" style="margin-left:6px;">
        <input
          type="checkbox"
          .checked=${Boolean(v)}
          @change=${(e: Event) => setV((e.target as HTMLInputElement).checked)}
        />
        <span class="switchSlider"></span>
      </label>`;
    }
    if (valueNode.type === "enum") {
      const s = typeof v === "string" || typeof v === "number" ? String(v) : "";
      const opts = valueNode.options ?? [];
      return html`<select
        class="mapValueInput"
        .value=${s}
        @change=${(e: Event) => setV((e.target as HTMLSelectElement).value)}
      >
        <option value=""></option>
        ${opts.map((o) => html`<option value=${String(o.value)}>${o.label ?? String(o.value)}</option>`)}
      </select>`;
    }
    if (valueNode.type === "any_of") {
      return args.renderAnyOfInline(`${rowPath}.__any_of`, valueNode, v, setV);
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
    <div class="mapEditor">
      ${entries.length === 0 ? html`<div class="hint">No entries.</div>` : nothing}
      ${entries.map(([k, v]) => {
        const rowPath = `${path}.${k}`;
        return html`
          <div class="mapEntry">
            <div class="mapEntryHeader">
              <input
                class="mapKeyInput"
                .value=${k}
                @input=${(e: Event) => {
                  const nextKey = (e.target as HTMLInputElement).value;
                  if (nextKey === k) return;
                  const next: Record<string, unknown> = { ...value };
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
                  const next: Record<string, unknown> = { ...value };
                  delete next[k];
                  onChange(next);
                }}
              >
                <span class="mdi mdi-trash-can-outline iconImg" aria-hidden="true"></span>
              </button>
            </div>
            <div class="mapEntryBody">
              ${renderValueEditor(rowPath, v, (nextV) => onChange({ ...value, [k]: nextV }))}
            </div>
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
              const key = draft.key.trim();
              if (!key) return;
              onChange({ ...value, [key]: draft.value });
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
  `;
}
