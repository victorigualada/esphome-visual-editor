import { html, nothing, type TemplateResult } from "lit";
import { createRef, ref, type Ref } from "lit/directives/ref.js";
import type { EsphomeUiSchemaNode } from "../../../types";
import { isObject } from "../../../lib/type-guards";
import type { SchemaFormCtx, SchemaFormEnv } from "./env";
import { readSearchSelectValueFromEvent, schemaTitle } from "./env";
import { ENTITY_CATEGORIES, MDI_ICON_NAMES, SENSOR_DEVICE_CLASSES, SENSOR_STATE_CLASSES } from "../../../ha/options";
import { renderAnyOfInline, type RenderObjectForm } from "./anyof";
import { renderRawYamlField } from "./yaml";
import { renderArrayField } from "./array";
import { renderMapField } from "./map-field";
import { renderCollapsible } from "./collapsible";

export type RenderObjectFormWithOpts = (
  path: string,
  node: Extract<EsphomeUiSchemaNode, { type: "object" }>,
  value: Record<string, unknown>,
  onChange: (next: Record<string, unknown>) => void,
  opts?: { hiddenKeys?: string[]; ctx?: SchemaFormCtx },
) => TemplateResult;

export function renderField(args: {
  env: SchemaFormEnv;
  path: string;
  fieldKey: string;
  node: EsphomeUiSchemaNode;
  value: unknown;
  required: boolean;
  onChange: (next: unknown) => void;
  ctx?: SchemaFormCtx;
  renderObjectForm: RenderObjectFormWithOpts;
}): TemplateResult {
  const { env, path, fieldKey, node, value, required, onChange, ctx, renderObjectForm } = args;

  const title = schemaTitle(node, fieldKey);
  const label = required ? `${title} *` : title;
  const isCodeLikeKey = fieldKey.toLowerCase().includes("code") || fieldKey.toLowerCase().includes("lambda");
  const inferredPin = fieldKey.toLowerCase().includes("pin");

  const readSecretKey = (val: unknown): string | null => {
    if (!isObject(val)) return null;
    if ((val as any).__eveTag !== "secret") return null;
    return typeof (val as any).key === "string" ? String((val as any).key) : null;
  };

  const parseStringOrSecretInput = (raw: string): unknown => {
    const t = String(raw ?? "");
    if (t.trim() === "") return undefined;

    // Preferred UX: allow typing `!secret wifi_ssid` directly.
    const m = t.match(/^\s*!secret\s+(.+)\s*$/i);
    if (m) {
      const key = String(m[1] ?? "").trim();
      return key ? ({ __eveTag: "secret", key } as any) : undefined;
    }

    return t;
  };

  if (fieldKey === "device_class") {
    return html`
      <div class="formRow">
        <eve-search-select
          .label=${label}
          .value=${typeof value === "string" ? value : ""}
          .options=${SENSOR_DEVICE_CLASSES}
          placeholder="e.g. temperature"
          @change=${(e: Event) => {
            const v = readSearchSelectValueFromEvent(e);
            onChange(v && v.trim() ? v.trim() : undefined);
          }}
        ></eve-search-select>
      </div>
    `;
  }

  if (fieldKey === "state_class") {
    return html`
      <div class="formRow">
        <eve-search-select
          .label=${label}
          .value=${typeof value === "string" ? value : ""}
          .options=${SENSOR_STATE_CLASSES}
          placeholder="measurement / total / total_increasing"
          @change=${(e: Event) => {
            const v = readSearchSelectValueFromEvent(e);
            onChange(v && v.trim() ? v.trim() : undefined);
          }}
        ></eve-search-select>
      </div>
    `;
  }

  if (fieldKey === "entity_category") {
    return html`
      <div class="formRow">
        <eve-search-select
          .label=${label}
          .value=${typeof value === "string" ? value : ""}
          .options=${ENTITY_CATEGORIES}
          placeholder="config / diagnostic"
          @change=${(e: Event) => {
            const v = readSearchSelectValueFromEvent(e);
            onChange(v && v.trim() ? v.trim() : undefined);
          }}
        ></eve-search-select>
      </div>
    `;
  }

  if (fieldKey === "icon") {
    const iconOptions = MDI_ICON_NAMES.map((n) => `mdi:${n}`);
    const renderOption = (opt: string) => {
      const name = opt.startsWith("mdi:") ? opt.slice("mdi:".length) : opt;
      return html`<span style="display:flex; align-items:center; gap:8px;">
        <span class=${`mdi mdi-${name} mdiOptIcon`} aria-hidden="true"></span>
        <span>${opt}</span>
      </span>`;
    };
    const valueStr = typeof value === "string" ? value : "";
    const selectedName = valueStr.startsWith("mdi:") ? valueStr.slice("mdi:".length) : "";
    const safeName = selectedName.replace(/[^a-z0-9-]/g, "");
    const leadingIconClass = safeName ? `mdi mdi-${safeName}` : "";
    return html`
      <div class="formRow">
        <eve-search-select
          .label=${label}
          .value=${valueStr}
          .options=${iconOptions}
          placeholder="mdi:thermometer"
          .renderOption=${renderOption}
          .leadingIconClass=${leadingIconClass}
          @change=${(e: Event) => {
            const v = readSearchSelectValueFromEvent(e);
            onChange(v && v.trim() ? v.trim() : undefined);
          }}
        ></eve-search-select>
      </div>
    `;
  }

  if (node.type === "const") {
    return html`
      <div class="formRow">
        <div class="fieldLabel">${label}</div>
        <div class="pill">${String(node.value)}</div>
      </div>
    `;
  }

  if (node.type === "boolean") {
    return html`
      <div class="formRow">
        <label class="switchRow">
          <span class="switchLabel">${label}</span>
          <span class="switch">
            <input
              type="checkbox"
              .checked=${Boolean(value)}
              @change=${(e: Event) => onChange((e.target as HTMLInputElement).checked)}
            />
            <span class="switchSlider"></span>
          </span>
        </label>
      </div>
    `;
  }

  if (node.type === "enum") {
    const v = typeof value === "string" || typeof value === "number" ? String(value) : "";
    const options = node.options ?? [];
    return html`
      <div class="formRow">
        <div class="fieldLabel">${label}</div>
        <div class="toggleRow">
          ${options.map((o) => {
            const ov = String(o.value);
            const active = v === ov;
            return html`
              <button
                type="button"
                class=${active ? "toggleBtn active" : "toggleBtn"}
                @click=${() => onChange(o.value)}
              >
                ${o.label ?? ov}
              </button>
            `;
          })}
        </div>
      </div>
    `;
  }

  if (node.type === "pin" || inferredPin) {
    const v = typeof value === "string" ? value : "";
    const fullPath = `${path}.${fieldKey}`;
    const pinRef: Ref<any> = createRef();
    const hasBoard = Boolean((ctx?.espBoards?.target ?? "").trim() && (ctx?.espBoards?.slug ?? "").trim());
    const shouldAutoOpen = hasBoard && env.state.pendingOpenPinPath === fullPath;
    if (shouldAutoOpen) {
      queueMicrotask(() => {
        try {
          pinRef.value?.openPicker?.();
        } finally {
          env.state.pendingOpenPinPath = null;
          env.requestUpdate();
        }
      });
    }
    return html`
      <div class="formRow">
        <div class="fieldLabel">${label}</div>
        <eve-pin-picker
          ${ref(pinRef)}
          .boardId=${(ctx?.boardId ?? "") as any}
          .espBoardsTarget=${(ctx?.espBoards?.target ?? "") as any}
          .espBoardsSlug=${ctx?.espBoards?.slug ?? ""}
          .value=${v}
          @change=${(e: CustomEvent) => onChange(e.detail.value)}
          @open-board-settings=${() => {
            env.state.pendingOpenPinPath = fullPath;
            env.store.openBoardPickerDialog();
            env.requestUpdate();
          }}
        ></eve-pin-picker>
      </div>
    `;
  }

  if (node.type === "string" || node.type === "id") {
    const secretKey = readSecretKey(value);
    const v = secretKey ? `!secret ${secretKey}` : typeof value === "string" ? value : "";
    if (node.type === "string" && isCodeLikeKey) {
      return html`
        <div class="formRow">
          <label>
            ${label}
            <textarea
              class="codeArea"
              rows="1"
              .value=${v}
              @input=${(e: Event) => {
                const el = e.target as HTMLTextAreaElement;
                el.style.height = "0px";
                el.style.height = `${el.scrollHeight}px`;
                onChange(parseStringOrSecretInput(el.value));
              }}
            ></textarea>
          </label>
        </div>
      `;
    }
    const isSecretField = Boolean((node as any)?.ui?.secret) || fieldKey.toLowerCase().includes("password");
    return html`
      <div class="formRow">
        <label>
          ${label}
          <input
            .value=${v}
            type=${isSecretField ? "password" : "text"}
            @input=${(e: Event) => onChange(parseStringOrSecretInput((e.target as HTMLInputElement).value))}
          />
        </label>
      </div>
    `;
  }

  if (node.type === "raw_yaml") {
    const isAutomationField = fieldKey.startsWith("on_") || fieldKey === "then";
    const onJumpToYaml =
      env.store && typeof (env.store as any).focusYamlForFieldPath === "function"
        ? () => (env.store as any).focusYamlForFieldPath(path, fieldKey)
        : null;
    if (isAutomationField) {
      return renderRawYamlField(env, `${path}.${fieldKey}`, label, value, onChange, isCodeLikeKey, {
        useYamlEditor: true,
        onJumpToYaml,
      });
    }
    const secretKey = readSecretKey(value);
    const v = secretKey
      ? `!secret ${secretKey}`
      : value === undefined || value === null
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
    return html`
      <div class="formRow">
        <div class="fieldLabelRow">
          <div class="fieldLabel">${label}</div>
          ${onJumpToYaml
            ? html`
                <div class="fieldLabelActions">
                  <button type="button" class="fieldLabelIconBtn" title="Jump to YAML" @click=${onJumpToYaml}>
                    <span class="mdi mdi-code-tags fieldLabelIcon" aria-hidden="true"></span>
                  </button>
                </div>
              `
            : nothing}
        </div>
        <input
          .value=${v}
          @input=${(e: Event) => {
            const next = (e.target as HTMLInputElement).value;
            onChange(parseStringOrSecretInput(next));
          }}
        />
      </div>
    `;
  }

  if (node.type === "any_of") {
    const renderObjectFormBare: RenderObjectForm = (p, n, v, oc) => renderObjectForm(p, n, v, oc, { ctx });
    return html`
      <div class="formRow">
        <div class="fieldLabel">${label}</div>
        ${renderAnyOfInline(env, renderObjectFormBare, `${path}.${fieldKey}.__any_of`, node, value, onChange)}
      </div>
    `;
  }

  if (node.type === "array") {
    return renderArrayField({ env, path, fieldKey, label, node, value, onChange, ctx, renderObjectForm });
  }

  if (node.type === "map") {
    return renderMapField({ env, path, fieldKey, label, node, value, onChange, ctx, renderObjectForm });
  }

  if (node.type === "int" || node.type === "float" || node.type === "number") {
    const v = typeof value === "number" ? String(value) : value === 0 ? "0" : "";
    return html`
      <div class="formRow">
        <label>
          ${label}
          <input
            type="number"
            .value=${v}
            @input=${(e: Event) => {
              const raw = (e.target as HTMLInputElement).value;
              if (raw === "") return onChange(undefined);
              const n = node.type === "int" ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
              if (Number.isFinite(n)) onChange(n);
            }}
          />
        </label>
      </div>
    `;
  }

  if (node.type === "object") {
    const obj = isObject(value) ? (value as Record<string, unknown>) : {};
    const titleText = label;
    const childPath = `${path}.${fieldKey}`;
    return renderCollapsible(
      env,
      childPath,
      titleText,
      html`<div class="formGroupBody">
        ${renderObjectForm(childPath, node, obj, (nextObj) => onChange(nextObj), { ctx })}
      </div>`,
    );
  }

  const unsupportedType = (node as any)?.type ?? "unknown";
  return html`
    <div class="formRow">
      <label>
        ${label}
        <input
          .value=${typeof value === "string" ? value : ""}
          @input=${(e: Event) => onChange((e.target as HTMLInputElement).value)}
        />
      </label>
      <div class="hint">Unsupported field type: ${unsupportedType}</div>
    </div>
  `;
}
