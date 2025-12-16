import { html, nothing, type TemplateResult } from "lit";
import type { EsphomeUiSchemaNode } from "../../../types";
import { isObject } from "../../../lib/type-guards";
import type { SchemaFormCtx, SchemaFormEnv } from "./env";
import { renderCollapsible } from "./collapsible";

export type RenderObjectFormWithOpts = (
  path: string,
  node: Extract<EsphomeUiSchemaNode, { type: "object" }>,
  value: Record<string, unknown>,
  onChange: (next: Record<string, unknown>) => void,
  opts?: { hiddenKeys?: string[]; ctx?: SchemaFormCtx },
) => TemplateResult;

export function renderArrayInline(args: {
  env: SchemaFormEnv;
  path: string;
  node: Extract<EsphomeUiSchemaNode, { type: "array" }>;
  value: unknown;
  onChange: (next: unknown) => void;
  ctx?: SchemaFormCtx;
  renderObjectForm: RenderObjectFormWithOpts;
}): TemplateResult {
  const { env, path, node, value, onChange, ctx, renderObjectForm } = args;
  const itemsSchema = node.items;
  const items = Array.isArray(value) ? value : [];
  const setItems = (next: unknown[]) => onChange(next);
  const addBtn = (label: string, onClick: () => void) => html`
    <div class="arrayActions">
      <button type="button" class="arrayAddBtn" @click=${onClick}>
        <span class="mdi mdi-plus arrayAddIcon" aria-hidden="true"></span>
        ${label}
      </button>
    </div>
  `;

  const canString = itemsSchema.type === "string" || itemsSchema.type === "id";
  if (canString) {
    const strings = items.map((x) => (typeof x === "string" ? x : x === null || x === undefined ? "" : String(x)));
    return html`
      <div class="arrayEditor">
        ${strings.length === 0 ? html`<div class="hint">No items.</div>` : nothing}
        ${strings.map(
          (s, i) => html`
            <div class="arrayRow">
              <input
                class="mapValueInput"
                .value=${s}
                @input=${(e: Event) => {
                  const next = [...strings];
                  next[i] = (e.target as HTMLInputElement).value;
                  setItems(next);
                }}
              />
              <button
                type="button"
                class="iconBtn danger"
                title="Remove"
                @click=${() => {
                  const next = strings.filter((_, idx) => idx !== i);
                  setItems(next);
                }}
              >
                <span class="mdi mdi-close iconImg" aria-hidden="true"></span>
              </button>
            </div>
          `,
        )}
        ${addBtn("Add item", () => setItems([...strings, ""]))}
      </div>
    `;
  }

  if (itemsSchema.type === "object") {
    const objects = items.map((x) => (isObject(x) ? (x as Record<string, unknown>) : {}));
    return html`
      <div class="arrayEditor">
        ${objects.length === 0 ? html`<div class="hint">No items.</div>` : nothing}
        ${objects.map((obj, i) => {
          const itemPath = `${path}[${i}]`;
          return renderCollapsible(
            env,
            `${itemPath}`,
            `Item ${i + 1}`,
            html`
              <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
                <button
                  type="button"
                  class="iconBtn danger"
                  title="Remove item"
                  @click=${() => {
                    const next = objects.filter((_, idx) => idx !== i);
                    setItems(next);
                  }}
                >
                  <span class="mdi mdi-trash-can-outline iconImg" aria-hidden="true"></span>
                </button>
              </div>
              ${renderObjectForm(
                `${itemPath}.__obj`,
                itemsSchema,
                obj,
                (nextObj) => {
                  const next = [...objects];
                  next[i] = nextObj;
                  setItems(next);
                },
                { ctx },
              )}
            `,
          );
        })}
        ${addBtn("Add item", () => setItems([...objects, {}]))}
      </div>
    `;
  }

  const asStrings = items.map((x) =>
    typeof x === "string" ? x : x === null || x === undefined ? "" : JSON.stringify(x),
  );
  return html`
    <div class="arrayEditor">
      ${asStrings.length === 0 ? html`<div class="hint">No items.</div>` : nothing}
      ${asStrings.map(
        (s, i) => html`
          <div class="arrayRow">
            <input
              class="mapValueInput"
              .value=${s}
              @input=${(e: Event) => {
                const next = [...asStrings];
                next[i] = (e.target as HTMLInputElement).value;
                setItems(next);
              }}
            />
            <button
              type="button"
              class="iconBtn danger"
              title="Remove"
              @click=${() => {
                const next = asStrings.filter((_, idx) => idx !== i);
                setItems(next);
              }}
            >
              <span class="mdi mdi-close iconImg" aria-hidden="true"></span>
            </button>
          </div>
        `,
      )}
      ${addBtn("Add item", () => setItems([...asStrings, ""]))}
    </div>
  `;
}

export function renderArrayField(args: {
  env: SchemaFormEnv;
  path: string;
  fieldKey: string;
  label: string;
  node: Extract<EsphomeUiSchemaNode, { type: "array" }>;
  value: unknown;
  onChange: (next: unknown) => void;
  ctx?: SchemaFormCtx;
  renderObjectForm: RenderObjectFormWithOpts;
}): TemplateResult {
  const { env, path, fieldKey, label, node, value, onChange, ctx, renderObjectForm } = args;
  // Use a stable per-field path so collapse state doesn't change when array items change.
  const editorPath = `${path}.${fieldKey}`;
  return html`
    <div class="formRow">
      <div class="fieldLabel">${label}</div>
      ${renderArrayInline({ env, path: editorPath, node, value, onChange, ctx, renderObjectForm })}
    </div>
  `;
}
