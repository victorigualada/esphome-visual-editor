import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { EveAppStore } from "../../app/eve-app-store";
import { uiBaseStyles, uiDialogsStyles } from "../../styles/ui";

@customElement("eve-delete-dialog")
export class EveDeleteDialog extends LitElement {
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

  private renderBody(): TemplateResult | typeof nothing {
    const store = this.store;
    if (!store?.deleteDialogOpen || !store.deleteTarget) return nothing;

    const t = store.deleteTarget;
    const title =
      t.kind === "core"
        ? "Delete core component"
        : t.kind === "disabled_component"
          ? "Delete disabled component"
          : "Delete component";
    const subtitle = (() => {
      if (t.kind === "core") return `${t.key}`;
      if (t.kind === "disabled_component") return `${t.domain}.${t.platform} (commented out block)`;
      return `${t.domain}.${t.platform} (in YAML)`;
    })();

    return html`
      <div class="modalOverlay" @click=${() => store.closeDeleteDialog()}>
        <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
          <div class="addDialogHeader">
            <div>
              <div class="addDialogTitle">${title}</div>
              <div class="addDialogSub">${subtitle}</div>
            </div>
            <button
              type="button"
              class="iconBtn"
              title="Close"
              aria-label="Close"
              @click=${() => store.closeDeleteDialog()}
            >
              <span class="mdi mdi-close iconImg" aria-hidden="true"></span>
            </button>
          </div>

          <div class="hint">This will remove the component from the YAML entirely.</div>

          <div class="addDialogFooter">
            <button type="button" @click=${() => store.closeDeleteDialog()}>Cancel</button>
            <button type="button" class="dangerBtn" @click=${() => store.confirmDelete()}>Delete</button>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    return this.renderBody();
  }
}
