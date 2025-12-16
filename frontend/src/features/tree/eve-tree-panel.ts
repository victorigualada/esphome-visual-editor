import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { EveAppStore } from "../../app/eve-app-store";
import { OPTIONAL_CORE_KEYS } from "../../app/constants";
import { uiBaseStyles, uiTreeStyles } from "../../styles/ui";
import { isObject } from "../../lib/type-guards";
import { extractDisabledComponentBlocks, parseDisabledComponentBlock } from "../../lib/yaml/esphome-yaml";

@customElement("eve-tree-panel")
export class EveTreePanel extends LitElement {
  static styles = [uiBaseStyles, uiTreeStyles];

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

  private renderCollapseCaret(collapsed: boolean): TemplateResult {
    return html`
      <svg
        class="caretIcon ${collapsed ? "isCollapsed" : "isExpanded"}"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
        role="img"
        aria-hidden="true"
        viewBox="0 0 24 24"
      >
        <g>
          <path class="primary-path" d="M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z"></path>
        </g>
      </svg>
    `;
  }

  private renderLeftSection(
    title: string,
    collapsed: boolean,
    onToggle: () => void,
    body: TemplateResult,
  ): TemplateResult {
    return html`
      <div class="treeSection">
        <button type="button" class="treeHeaderBtn" @click=${onToggle}>
          <span class="treeHeaderCaret">${this.renderCollapseCaret(collapsed)}</span>
          <span class="treeHeaderText">${title}</span>
        </button>
        ${collapsed ? nothing : html`<div class="treeSectionBody">${body}</div>`}
      </div>
    `;
  }

  private renderComponentLabel(platform: string, name: string, disabled: boolean): TemplateResult {
    const p = (platform || "unknown").trim() || "unknown";
    const n = (name || "").trim();
    const label = n ? `${p}: ${n}` : p;
    return html` <span class=${disabled ? "treeItemCode treeItemCodeDisabled" : "treeItemCode"}>${label}</span> `;
  }

  private componentTooltip(platform: string, name: string): string {
    const p = (platform || "unknown").trim() || "unknown";
    const n = (name || "").trim();
    return n ? `platform: ${p}\nname: ${n}` : `platform: ${p}`;
  }

  render() {
    const store = this.store;
    if (!store) return nothing;

    const tree = store.getTree();
    const configObj = store.configObj;

    return html`
      <div class="paneTitle">Device</div>
      ${store.startupState === "failed"
        ? html`<div class="errorBox" style="margin-bottom:10px;">
            Failed to load server data; showing local UI state. ${store.startupError ? `(${store.startupError})` : ""}
          </div>`
        : nothing}

      <div class="leftScroll">
        ${this.renderLeftSection(
          "Core",
          store.leftCoreCollapsed,
          () => {
            store.leftCoreCollapsed = !store.leftCoreCollapsed;
            store.notify();
          },
          html`
            ${tree.core.map(
              ({ key, present }) => html`
                <div class="treeRow">
                  <button
                    class=${store.selection.kind === "core" && store.selection.key === key
                      ? "treeItem active"
                      : "treeItem"}
                    @click=${() => store.selectCore(key)}
                  >
                    ${key}
                  </button>
                  ${OPTIONAL_CORE_KEYS.has(key as any)
                    ? html`
                        <label class="switch" title="Enable/disable (comment/uncomment)">
                          <input
                            type="checkbox"
                            .checked=${present}
                            @change=${(e: Event) => {
                              const next = (e.target as HTMLInputElement).checked;
                              store.toggleOptionalCore(key, next);
                            }}
                          />
                          <span class="switchSlider"></span>
                        </label>
                      `
                    : html`<span></span>`}
                </div>
              `,
            )}
          `,
        )}
        ${this.renderLeftSection(
          "Components",
          store.leftComponentsCollapsed,
          () => {
            store.leftComponentsCollapsed = !store.leftComponentsCollapsed;
            store.notify();
          },
          html`
            ${tree.domains.map((domain) => {
              const list = isObject(configObj) ? (configObj as any)[domain] : null;
              const items: any[] = Array.isArray(list) ? list : [];
              const disabledBlocks = extractDisabledComponentBlocks(store.yamlText);
              const disabledForDomain = Object.keys(disabledBlocks)
                .filter((k) => k.startsWith(`${domain}:`))
                .sort()
                .map((k) => {
                  const parts = k.split(":");
                  const fallbackPlatform = parts[1] ?? "unknown";
                  const block = disabledBlocks[k];
                  const parsed = parseDisabledComponentBlock(block, domain);
                  const it = parsed.error ? {} : (parsed.value as any);
                  const platform = typeof it?.platform === "string" ? it.platform : fallbackPlatform;
                  const name = typeof it?.name === "string" ? it.name : "";
                  return { key: k, platform, name, error: parsed.error ?? null };
                });

              return html`
                <div class="domainGroup">
                  <div class="domainTitle">${domain}</div>
                  ${items.map((it, idx) => {
                    const platform = typeof it?.platform === "string" ? it.platform : "unknown";
                    const name = typeof it?.name === "string" ? it.name : "";
                    const active =
                      store.selection.kind === "component" &&
                      store.selection.domain === domain &&
                      store.selection.index === idx;
                    return html`
                      <div class="treeRow">
                        <button
                          class=${active ? "treeItem active" : "treeItem"}
                          title=${this.componentTooltip(platform, name)}
                          @click=${() => {
                            store.selection = { kind: "component", domain, index: idx, platform };
                            store.notify();
                          }}
                        >
                          ${this.renderComponentLabel(platform, name, false)}
                        </button>
                        <label class="switch" title="Enable/disable (comment/uncomment)">
                          <input
                            type="checkbox"
                            .checked=${true}
                            @change=${(e: Event) => {
                              const next = (e.target as HTMLInputElement).checked;
                              if (!next) store.toggleComponent(domain, idx, false);
                            }}
                          />
                          <span class="switchSlider"></span>
                        </label>
                      </div>
                    `;
                  })}
                  ${disabledForDomain.length
                    ? html`
                        <div style="margin-top:6px;">
                          ${disabledForDomain.map((d) => {
                            const active =
                              store.selection.kind === "disabled_component" &&
                              store.selection.domain === domain &&
                              store.selection.key === d.key;
                            return html`
                              <div class="treeRow">
                                <button
                                  class=${active ? "treeItem active treeItemMuted" : "treeItem treeItemMuted"}
                                  title=${this.componentTooltip(d.platform, d.name)}
                                  @click=${() => {
                                    store.selection = {
                                      kind: "disabled_component",
                                      domain,
                                      key: d.key,
                                      platform: d.platform,
                                    };
                                    store.notify();
                                  }}
                                >
                                  ${this.renderComponentLabel(d.platform, d.name, true)}
                                </button>
                                <label class="switch" title="Enable/disable (comment/uncomment)">
                                  <input
                                    type="checkbox"
                                    .checked=${false}
                                    @change=${(e: Event) => {
                                      const next = (e.target as HTMLInputElement).checked;
                                      if (next) store.toggleComponent(domain, d.key, true);
                                    }}
                                  />
                                  <span class="switchSlider"></span>
                                </label>
                              </div>
                            `;
                          })}
                        </div>
                      `
                    : nothing}
                </div>
              `;
            })}
          `,
        )}
      </div>

      <div class="leftFooter">
        <button type="button" class="primaryBtn titleBtn" @click=${() => store.openAddDialog()}>Add Component</button>
      </div>
    `;
  }
}
