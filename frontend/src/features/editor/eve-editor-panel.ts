import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { EveAppStore } from "../../app/eve-app-store";
import { OPTIONAL_CORE_KEYS } from "../../app/constants";
import { componentDocsUrl, coreDocsUrl } from "../../lib/docs";
import { getEspBoardsSelectionForUi, getRootBoardId } from "../../lib/esphome-config/boards";
import { isObject } from "../../lib/type-guards";
import {
  buildDisabledCoreBlock,
  extractDisabledComponentBlocks,
  extractDisabledCoreBlocks,
  parseDisabledComponentBlock,
  parseDisabledCoreBlock,
} from "../../lib/yaml/esphome-yaml";
import { uiBaseStyles, uiEditorStyles } from "../../styles/ui";
import type { EsphomeUiSchemaNode } from "../../types";

import "./eve-board-editor";
import "./eve-schema-form";

const CORE_SCHEMA_OVERRIDES: Record<string, { kind: "component_schema"; domain: string; platform: string }> = {
  ota: { kind: "component_schema", domain: "ota", platform: "esphome" },
};

@customElement("eve-editor-panel")
export class EveEditorPanel extends LitElement {
  static styles = [uiBaseStyles, uiEditorStyles];

  @property({ attribute: false }) accessor store!: EveAppStore;

  private onStoreChange = () => this.requestUpdate();

  connectedCallback(): void {
    super.connectedCallback();
    this.store?.addEventListener("change", this.onStoreChange);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.store?.removeEventListener("change", this.onStoreChange);
  }

  private pillLink(label: string, url: string | null): TemplateResult {
    if (!url) return html`<span class="pill">${label}</span>`;
    return html`<a class="pill pillLink" href=${url} target="_blank" rel="noreferrer noopener">
      <span class="pillLinkText">${label}</span>
      <span class="pillLinkIcon mdi mdi-open-in-new" aria-hidden="true"></span>
    </a>`;
  }

  private renderSchemaForm(args: {
    path: string;
    schema: Extract<EsphomeUiSchemaNode, { type: "object" }>;
    value: unknown;
    ctx: { boardId: any; espBoards: any };
    onChange: (next: Record<string, unknown>) => void;
    hiddenKeys?: string[];
  }): TemplateResult {
    return html`
      <eve-schema-form
        .store=${this.store}
        .schema=${args.schema}
        .value=${isObject(args.value) ? (args.value as any) : {}}
        .path=${args.path}
        .hiddenKeys=${args.hiddenKeys}
        .ctx=${args.ctx}
        .onChange=${args.onChange}
      ></eve-schema-form>
    `;
  }

  private renderEditor(): TemplateResult {
    const store = this.store;
    const yamlErrBanner = store.yamlError
      ? html`<div class="yamlErrorOverlay">
          <div class="errorBox yamlErrorBox">YAML parse error: ${store.yamlError}</div>
        </div>`
      : nothing;

    const configObj = store.configObj;
    const ctx = { boardId: getRootBoardId(configObj), espBoards: getEspBoardsSelectionForUi(configObj) };

    if (store.selection.kind === "core") {
      const key = store.selection.key;

      if (key === "board") {
        return html`
          <div class="form">
            ${yamlErrBanner}
            <eve-board-editor .store=${store} .configObj=${configObj}></eve-board-editor>
          </div>
        `;
      }

      const coreEnabled = isObject(configObj) && key in configObj;
      if (OPTIONAL_CORE_KEYS.has(key as any) && !coreEnabled) {
        const disabledBlock = extractDisabledCoreBlocks(store.yamlText)[key];
        const parsed = disabledBlock ? parseDisabledCoreBlock(disabledBlock, key) : {};

        const override = CORE_SCHEMA_OVERRIDES[key];
        const cached = override
          ? (store.getSchemaCached(override.domain, override.platform) as any)
          : (store.getCoreSchemaCached(key) ?? null);
        if (!cached) {
          const err = override
            ? store.getSchemaError(override.domain, override.platform)
            : store.getCoreSchemaError(key);
          if (err) {
            return html`<div class="errorBox">
              ${override ? "Schema" : "Core schema"} load error: ${err}
              <button
                style="margin-left:10px;"
                @click=${() => {
                  if (override) {
                    store.clearSchemaError(override.domain, override.platform);
                    void store.ensureSchema(override.domain, override.platform);
                    return;
                  }
                  store.clearCoreSchemaError(key);
                  void store.ensureCoreSchema(key);
                }}
              >
                Retry
              </button>
            </div>`;
          }
          if (override) void store.ensureSchema(override.domain, override.platform);
          else void store.ensureCoreSchema(key);
          return html`<div class="hint">Loading schema for <code>${key}</code>…</div>`;
        }

        const node = cached.schema;
        if (node.type !== "object") return html`<div class="errorBox">Unsupported root schema type: ${node.type}</div>`;
        if (parsed.error) return html`<div class="errorBox">Invalid disabled YAML: ${parsed.error}</div>`;
        const value = parsed.value === undefined ? {} : parsed.value;

        return html`
          <div class="form">
            ${yamlErrBanner}
            <div class="editorHeader" style="margin-bottom:8px;">
              <div class="pillRow">
                ${this.pillLink(key, coreDocsUrl(key))}
                <span class="pill">disabled</span>
              </div>
              <button
                type="button"
                class="iconBtn danger"
                title="Delete core component"
                @click=${() => store.openDeleteDialog({ kind: "core", key })}
              >
                <span class="mdi mdi-trash-can-outline iconImg" aria-hidden="true"></span>
              </button>
            </div>

            ${disabledBlock
              ? this.renderSchemaForm({
                  path: `disabled_core.${key}`,
                  schema: node,
                  value,
                  ctx,
                  onChange: (nextObj) =>
                    store.updateConfig((_draft) => void _draft, {
                      mutateDisabledCoreBlocks: (blocks) => (blocks[key] = buildDisabledCoreBlock(key, nextObj ?? {})),
                    }),
                })
              : html`<div class="hint">Toggle it on from the sidebar to enable.</div>`}
          </div>
        `;
      }

      const override = CORE_SCHEMA_OVERRIDES[key];
      const cached = override
        ? (store.getSchemaCached(override.domain, override.platform) as any)
        : (store.getCoreSchemaCached(key) ?? null);
      if (!cached) {
        const err = override ? store.getSchemaError(override.domain, override.platform) : store.getCoreSchemaError(key);
        if (err) {
          return html`<div class="errorBox">
            ${override ? "Schema" : "Core schema"} load error: ${err}
            <button
              style="margin-left:10px;"
              @click=${() => {
                if (override) {
                  store.clearSchemaError(override.domain, override.platform);
                  void store.ensureSchema(override.domain, override.platform);
                  return;
                }
                store.clearCoreSchemaError(key);
                void store.ensureCoreSchema(key);
              }}
            >
              Retry
            </button>
          </div>`;
        }
        if (override) void store.ensureSchema(override.domain, override.platform);
        else void store.ensureCoreSchema(key);
        return html`<div class="hint">Loading schema for <code>${key}</code>…</div>`;
      }

      const node = cached.schema;
      if (node.type !== "object") return html`<div class="errorBox">Unsupported root schema type: ${node.type}</div>`;
      const value = isObject(configObj) ? ((configObj as any)[key] ?? {}) : {};

      return html`
        <div class="form">
          ${yamlErrBanner}
          <div class="editorHeader" style="margin-bottom:8px;">
            <div class="pillRow">${this.pillLink(key, coreDocsUrl(key))}</div>
            ${key !== "esphome"
              ? html`
                  <button
                    type="button"
                    class="iconBtn danger"
                    title="Delete core component"
                    @click=${() => store.openDeleteDialog({ kind: "core", key })}
                  >
                    <span class="mdi mdi-trash-can-outline iconImg" aria-hidden="true"></span>
                  </button>
                `
              : nothing}
          </div>

          ${this.renderSchemaForm({
            path: `core.${key}`,
            schema: node,
            value,
            ctx,
            onChange: (nextObj) => store.writeSelectedValue(nextObj),
          })}
        </div>
      `;
    }

    if (store.selection.kind === "disabled_component") {
      const { domain, platform, key } = store.selection;
      const blocks = extractDisabledComponentBlocks(store.yamlText);
      const block = blocks[key];
      const parsed = block ? parseDisabledComponentBlock(block, domain) : { error: "Missing disabled block" };
      if (parsed.error) return html`<div class="errorBox">Invalid disabled YAML: ${parsed.error}</div>`;

      const cached = store.getSchemaCached(domain, platform) ?? null;
      if (!cached) {
        const err = store.getSchemaError(domain, platform);
        if (err) {
          return html`<div class="errorBox">
            Schema load error: ${err}
            <button
              style="margin-left:10px;"
              @click=${() => (store.clearSchemaError(domain, platform), void store.ensureSchema(domain, platform))}
            >
              Retry
            </button>
          </div>`;
        }
        void store.ensureSchema(domain, platform);
        return html`<div class="hint">Loading schema for ${domain}.${platform}…</div>`;
      }
      const node = cached.schema;
      if (node.type !== "object") return html`<div class="errorBox">Unsupported root schema type: ${node.type}</div>`;
      const value = parsed.value ?? {};

      return html`
        <div class="form">
          ${yamlErrBanner}
          <div class="editorHeader" style="margin-bottom:8px;">
            <div class="pillRow">
              ${this.pillLink(domain, componentDocsUrl(domain))}
              ${this.pillLink(platform, componentDocsUrl(domain, platform))}
              <span class="pill">disabled</span>
            </div>
            <button
              type="button"
              class="iconBtn danger"
              title="Delete component"
              @click=${() => store.openDeleteDialog({ kind: "disabled_component", domain, platform, key })}
            >
              <span class="mdi mdi-trash-can-outline iconImg" aria-hidden="true"></span>
            </button>
          </div>

          ${this.renderSchemaForm({
            path: `disabled_component.${domain}.${platform}.${key}`,
            schema: node,
            value,
            ctx,
            onChange: (nextObj) => store.writeSelectedValue(nextObj),
          })}
        </div>
      `;
    }

    if (store.selection.kind !== "component") return html`<div class="errorBox">Invalid selection</div>`;

    const { domain, platform, index } = store.selection;
    const cached = store.getSchemaCached(domain, platform) ?? null;
    if (!cached) {
      const err = store.getSchemaError(domain, platform);
      if (err) {
        return html`<div class="errorBox">
          Schema load error: ${err}
          <button
            style="margin-left:10px;"
            @click=${() => (store.clearSchemaError(domain, platform), void store.ensureSchema(domain, platform))}
          >
            Retry
          </button>
        </div>`;
      }
      void store.ensureSchema(domain, platform);
      return html`<div class="hint">Loading schema for ${domain}.${platform}…</div>`;
    }
    const node = cached.schema;
    if (node.type !== "object") return html`<div class="errorBox">Unsupported root schema type: ${node.type}</div>`;
    const value = store.readSelectedValue();

    return html`
      <div class="form">
        ${yamlErrBanner}
        <div class="editorHeader" style="margin-bottom:8px;">
          <div class="pillRow">
            ${this.pillLink(domain, componentDocsUrl(domain))}
            ${this.pillLink(platform, componentDocsUrl(domain, platform))}
          </div>
          <button
            type="button"
            class="iconBtn danger"
            title="Delete component"
            @click=${() => store.openDeleteDialog({ kind: "component", domain, index, platform })}
          >
            <span class="mdi mdi-trash-can-outline iconImg" aria-hidden="true"></span>
          </button>
        </div>

        ${this.renderSchemaForm({
          path: `component.${domain}.${platform}`,
          schema: node,
          value,
          ctx,
          onChange: (nextObj) => store.writeSelectedValue(nextObj),
        })}
      </div>
    `;
  }

  render() {
    const store = this.store;
    if (!store) return nothing;
    return html`
      <div class="paneTitle">Editor</div>
      ${this.renderEditor()}
    `;
  }
}
