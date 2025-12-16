import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { EveAppStore } from "../../app/eve-app-store";
import { appBaseUrl } from "../../lib/app-base-url";
import { uiBaseStyles, uiTopbarStyles } from "../../styles/ui";

@customElement("eve-topbar")
export class EveTopbar extends LitElement {
  static styles = [uiBaseStyles, uiTopbarStyles];

  @property({ attribute: false }) accessor store!: EveAppStore;
  @state() accessor projectOpen = false;
  @state() accessor projectQuery = "";

  private onStoreChange = () => this.requestUpdate();
  private onDocClick: ((ev: MouseEvent) => void) | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.store?.addEventListener("change", this.onStoreChange);
    this.onDocClick = (ev: MouseEvent) => {
      const path = ev.composedPath?.() ?? [];
      if (!path.includes(this)) {
        this.projectOpen = false;
        this.projectQuery = "";
      }
    };
    document.addEventListener("click", this.onDocClick);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.store?.removeEventListener("change", this.onStoreChange);
    if (this.onDocClick) document.removeEventListener("click", this.onDocClick);
    this.onDocClick = null;
  }

  render() {
    const store = this.store;
    if (!store) return nothing;

    const logoSrc = `${appBaseUrl()}logo.svg`;

    const q = (this.projectQuery || "").trim().toLowerCase();
    const projects = Array.isArray(store.projects) ? store.projects : [];
    const candidates = projects.filter((p) => p !== store.projectName);
    const filtered = this.projectOpen
      ? (q ? candidates.filter((p) => p.toLowerCase().includes(q)) : candidates).slice(0, 120)
      : [];

    const selectProject = async (name: string) => {
      this.projectOpen = false;
      this.projectQuery = "";
      await store.selectProject(name);
    };

    return html`
      <header class="topbar">
        <div class="brand">
          <img class="brandLogo" src=${logoSrc} alt="" />
          <div class="brandText">
            <div class="title">ESPHome Visual Editor</div>
            <div class="subtitle">Schema service: v0.1 · ESPHome: ${store.meta?.esphomeVersion ?? "unknown"}</div>
          </div>
        </div>
        <div class="controls">
          <div class="field">
            <span>Device</span>
            <div class="topbarProjectSelect">
              <button
                type="button"
                class="topbarProjectBtn"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  this.projectOpen = !this.projectOpen;
                  this.projectQuery = "";
                  if (this.projectOpen) {
                    queueMicrotask(() => {
                      const el = this.renderRoot.querySelector<HTMLInputElement>(".topbarProjectSearch");
                      el?.focus();
                    });
                  }
                }}
              >
                <span class="topbarProjectBtnText">${store.projectName}</span>
                <span class="topbarProjectChevron" aria-hidden="true"></span>
              </button>

              ${this.projectOpen
                ? html`
                    <div class="topbarProjectMenu" @click=${(e: Event) => e.stopPropagation()}>
                      <input
                        class="topbarProjectSearch"
                        placeholder="Search devices…"
                        .value=${this.projectQuery}
                        @input=${(e: Event) => (this.projectQuery = (e.target as HTMLInputElement).value)}
                        @keydown=${(e: KeyboardEvent) => {
                          if (e.key === "Escape") {
                            this.projectOpen = false;
                            this.projectQuery = "";
                          }
                          if (e.key === "Enter") {
                            const first = filtered[0];
                            if (first) void selectProject(first);
                          }
                        }}
                      />
                      <div class="topbarProjectList">
                        ${filtered.length === 0
                          ? html`<div class="topbarProjectEmpty">No results</div>`
                          : filtered.map((p) => {
                              const active = p === store.projectName;
                              return html`
                                <button
                                  type="button"
                                  class=${active ? "topbarProjectItem active" : "topbarProjectItem"}
                                  @click=${() => void selectProject(p)}
                                >
                                  ${p}
                                </button>
                              `;
                            })}
                      </div>
                    </div>
                  `
                : nothing}
            </div>
          </div>
          <button @click=${() => void store.save()} ?disabled=${!!store.yamlError}>Save</button>
          <button @click=${() => void store.validate()} ?disabled=${!!store.yamlError}>Validate</button>
        </div>
      </header>
    `;
  }
}
