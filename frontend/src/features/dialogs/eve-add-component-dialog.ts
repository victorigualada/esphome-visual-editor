import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ComponentRef } from "../../types";
import type { EveAppStore } from "../../app/eve-app-store";
import { uiBaseStyles, uiDialogsStyles } from "../../styles/ui";

@customElement("eve-add-component-dialog")
export class EveAddComponentDialog extends LitElement {
  static styles = [uiBaseStyles, uiDialogsStyles];

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

  private filtered(): ComponentRef[] {
    const store = this.store;
    const q = (store?.addQuery ?? "").trim().toLowerCase();
    const list = q
      ? (store?.availableComponents ?? []).filter((c) => `${c.domain}:${c.platform}`.toLowerCase().includes(q))
      : (store?.availableComponents ?? []);
    return list.slice(0, 1200);
  }

  render(): TemplateResult | typeof nothing {
    const store = this.store;
    if (!store?.addDialogOpen) return nothing;

    const filtered = this.filtered();
    const domainCounts = new Map<string, number>();
    for (const c of filtered) {
      if (!c.domain) continue;
      domainCounts.set(c.domain, (domainCounts.get(c.domain) ?? 0) + 1);
    }
    const domains = Array.from(domainCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([domain, count]) => ({ domain, count }));

    const selectedDomain = store.addSelectedDomain || "";
    const platforms = selectedDomain
      ? Array.from(new Set(filtered.filter((c) => c.domain === selectedDomain).map((c) => c.platform))).sort((a, b) =>
          a.localeCompare(b),
        )
      : [];
    const selectedPlatform = store.addSelectedPlatform || "";
    void selectedPlatform;

    return html`
      <div class="modalOverlay" @click=${() => store.closeAddDialog()}>
        <div class="modal addDialog" @click=${(e: Event) => e.stopPropagation()}>
          <div class="addDialogHeader">
            <div>
              <div class="addDialogTitle">Add Component</div>
              <div class="addDialogSub">Search and pick a platform to add.</div>
            </div>
            <button
              type="button"
              class="iconBtn"
              title="Close"
              aria-label="Close"
              @click=${() => store.closeAddDialog()}
            >
              <span class="mdi mdi-close iconImg" aria-hidden="true"></span>
            </button>
          </div>

          <div class="addDialogToolbar">
            <input
              class="addDialogSearch"
              .value=${store.addQuery}
              @input=${(e: Event) => {
                store.addQuery = (e.target as HTMLInputElement).value;
                store.addSelectedDomain = "";
                store.addSelectedPlatform = "";
                store.notify();
              }}
              placeholder="Search: sensor:bme280, switch:gpio…"
            />
          </div>

          <div class="addDialogGrid">
            <div class="addDialogCol">
              <div class="addDialogColTitle">Domain</div>
              <div class="addDialogList">
                ${domains.map(
                  (d) => html`
                    <button
                      type="button"
                      class=${d.domain === selectedDomain ? "addDialogItem active" : "addDialogItem"}
                      @click=${() => {
                        store.addSelectedDomain = d.domain;
                        store.addSelectedPlatform = "";
                        store.notify();
                      }}
                    >
                      <span>${d.domain}</span>
                      <span class="addDialogCount">${d.count}</span>
                    </button>
                  `,
                )}
                ${domains.length === 0 ? html`<div class="addDialogEmpty">No matches</div>` : nothing}
              </div>
            </div>

            <div class="addDialogCol">
              <div class="addDialogColTitle">
                Platform ${selectedDomain ? html`<span class="addDialogColHint">(${selectedDomain})</span>` : nothing}
              </div>
              <div class="addDialogPlatforms">
                ${platforms.map(
                  (p) => html`
                    <button
                      type="button"
                      class=${p === selectedPlatform ? "addDialogPlatform active" : "addDialogPlatform"}
                      @click=${() => {
                        store.addSelectedPlatform = p;
                        store.notify();
                        store.addComponent(selectedDomain, p);
                        store.closeAddDialog();
                      }}
                    >
                      <span class="addDialogPlatformLabel">${p}</span>
                      <span class="mdi mdi-plus addDialogAddIcon" aria-hidden="true"></span>
                    </button>
                  `,
                )}
                ${selectedDomain && platforms.length === 0
                  ? html`<div class="addDialogEmpty">No platforms</div>`
                  : nothing}
                ${!selectedDomain ? html`<div class="addDialogEmpty">Pick a domain</div>` : nothing}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
