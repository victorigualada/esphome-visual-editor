import { html, nothing, type TemplateResult } from "lit";
import type { EsphomeUiSchemaNode } from "../../../types";
import { isObject } from "../../../lib/type-guards";
import type { SchemaFormCtx, SchemaFormEnv } from "./env";
import { renderAnyOfInline, type RenderObjectForm } from "./anyof";
import { renderCollapsible } from "./collapsible";
import { isMapLikeObjectSchema, renderMapLikeObjectForm } from "./map";
import { renderField } from "./fields";

export function renderObjectForm(
  env: SchemaFormEnv,
  path: string,
  node: Extract<EsphomeUiSchemaNode, { type: "object" }>,
  value: Record<string, unknown>,
  onChange: (next: Record<string, unknown>) => void,
  opts?: { hiddenKeys?: string[]; ctx?: SchemaFormCtx },
): TemplateResult {
  const required = new Set(node.required ?? []);
  const properties = node.properties ?? {};
  const hidden = new Set(opts?.hiddenKeys ?? []);
  const keys = Object.keys(properties).filter((k) => !hidden.has(k));

  const renderObjectFormBare: RenderObjectForm = (p, n, v, oc) =>
    renderObjectForm(env, p, n, v, oc, { ctx: opts?.ctx });
  const renderAnyOfInlineForMap = (
    rowPath: string,
    n: Extract<EsphomeUiSchemaNode, { type: "any_of" }>,
    v: unknown,
    oc: (next: unknown) => void,
  ) => renderAnyOfInline(env, renderObjectFormBare, rowPath, n, v, oc);

  if (isMapLikeObjectSchema(properties, keys)) {
    const valueNode = properties[keys[0]] as EsphomeUiSchemaNode;
    return renderMapLikeObjectForm({
      env,
      path,
      value,
      valueNode,
      onChange,
      renderAnyOfInline: renderAnyOfInlineForMap,
    });
  }

  // Keep backend-provided property order: required first (in schema order), then everything else (in schema order).
  const requiredKeys = keys.filter((k) => k !== "platform" && required.has(k));

  const configKeys = keys.filter((k) => k !== "platform" && !required.has(k));

  const mqttEnabled = (() => {
    const root = env.store?.configObj;
    return isObject(root) && "mqtt" in root;
  })();

  const originsFor = (n: EsphomeUiSchemaNode): string[] => {
    const ui = (n as any)?.ui;
    const out: string[] = [];
    const origin = ui?.origin;
    if (typeof origin === "string" && origin) out.push(origin);
    const origins = ui?.origins;
    if (Array.isArray(origins)) {
      for (const o of origins) if (typeof o === "string" && o) out.push(o);
    }
    // Stable unique
    return Array.from(new Set(out));
  };

  const isMqttField = (fieldKey: string, n: EsphomeUiSchemaNode): boolean => {
    const ui = (n as any)?.ui;
    const onlyWith = typeof ui?.only_with === "string" ? ui.only_with.toLowerCase() : "";
    const group = typeof ui?.group === "string" ? ui.group.toLowerCase() : "";
    if (onlyWith === "mqtt" || group === "mqtt") return true;

    const origins = originsFor(n).map((s) => s.toLowerCase());
    if (origins.some((o) => o.includes("mqtt"))) return true;

    void fieldKey;
    return false;
  };

  const mqttKeys = configKeys.filter((k) => isMqttField(k, properties[k] as EsphomeUiSchemaNode));
  const visibleConfigKeys = mqttEnabled ? configKeys : configKeys.filter((k) => !mqttKeys.includes(k));

  return html`
    ${requiredKeys.map((k) =>
      renderField({
        env,
        path,
        fieldKey: k,
        node: properties[k] as EsphomeUiSchemaNode,
        value: value[k],
        required: true,
        onChange: (nextVal) => {
          const next = { ...value } as Record<string, unknown>;
          if (nextVal === undefined) delete next[k];
          else next[k] = nextVal as any;
          onChange(next);
        },
        ctx: opts?.ctx,
        renderObjectForm: (p, n, v, oc, o) => renderObjectForm(env, p, n, v, oc, o),
      }),
    )}
    ${requiredKeys.length && visibleConfigKeys.length
      ? html`<div class="formDivider" aria-hidden="true"></div>`
      : nothing}
    ${(() => {
      // If mqtt isn't enabled in YAML, hide MQTT-specific fields.
      if (!mqttEnabled) {
        return visibleConfigKeys.map((k) =>
          renderField({
            env,
            path,
            fieldKey: k,
            node: properties[k] as EsphomeUiSchemaNode,
            value: value[k],
            required: false,
            onChange: (nextVal) => {
              const next = { ...value } as Record<string, unknown>;
              if (nextVal === undefined) delete next[k];
              else next[k] = nextVal as any;
              onChange(next);
            },
            ctx: opts?.ctx,
            renderObjectForm: (p, n, v, oc, o) => renderObjectForm(env, p, n, v, oc, o),
          }),
        );
      }

      if (!mqttKeys.length) {
        return configKeys.map((k) =>
          renderField({
            env,
            path,
            fieldKey: k,
            node: properties[k] as EsphomeUiSchemaNode,
            value: value[k],
            required: false,
            onChange: (nextVal) => {
              const next = { ...value } as Record<string, unknown>;
              if (nextVal === undefined) delete next[k];
              else next[k] = nextVal as any;
              onChange(next);
            },
            ctx: opts?.ctx,
            renderObjectForm: (p, n, v, oc, o) => renderObjectForm(env, p, n, v, oc, o),
          }),
        );
      }

      const firstIdx = configKeys.findIndex((k) => mqttKeys.includes(k));
      const mqttGroup = renderCollapsible(
        env,
        `${path}.__mqtt`,
        "MQTT",
        html`<div class="formGroupBody">
          ${mqttKeys.map((k) =>
            renderField({
              env,
              path,
              fieldKey: k,
              node: properties[k] as EsphomeUiSchemaNode,
              value: value[k],
              required: false,
              onChange: (nextVal) => {
                const next = { ...value } as Record<string, unknown>;
                if (nextVal === undefined) delete next[k];
                else next[k] = nextVal as any;
                onChange(next);
              },
              ctx: opts?.ctx,
              renderObjectForm: (p, n, v, oc, o) => renderObjectForm(env, p, n, v, oc, o),
            }),
          )}
        </div>`,
      );

      const out: TemplateResult[] = [];
      for (let i = 0; i < configKeys.length; i++) {
        const k = configKeys[i]!;
        if (mqttKeys.includes(k)) {
          if (i === firstIdx) out.push(mqttGroup);
          continue;
        }
        out.push(
          renderField({
            env,
            path,
            fieldKey: k,
            node: properties[k] as EsphomeUiSchemaNode,
            value: value[k],
            required: false,
            onChange: (nextVal) => {
              const next = { ...value } as Record<string, unknown>;
              if (nextVal === undefined) delete next[k];
              else next[k] = nextVal as any;
              onChange(next);
            },
            ctx: opts?.ctx,
            renderObjectForm: (p, n, v, oc, o) => renderObjectForm(env, p, n, v, oc, o),
          }),
        );
      }
      return out;
    })()}
  `;
}
