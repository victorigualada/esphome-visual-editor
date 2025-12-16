import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";

import { EveAppStore } from "./app/eve-app-store";
import { uiAppStyles, uiBaseStyles, uiLayoutStyles } from "./styles/ui";

import "./features/layout/eve-topbar";
import "./features/tree/eve-tree-panel";
import "./features/editor/eve-editor-panel";
import "./features/editor/eve-yaml-pane";
import "./features/dialogs/eve-add-component-dialog";
import "./features/dialogs/eve-delete-dialog";
import "./features/dialogs/eve-board-picker-dialog";

@customElement("eve-app")
export class EveApp extends LitElement {
  static styles = [uiBaseStyles, uiLayoutStyles, uiAppStyles];

  private store = new EveAppStore();
  private onStoreChange = () => this.requestUpdate();

  private onWindowKeyDown = (e: KeyboardEvent) => {
    // Dialog close
    if (this.store.addDialogOpen && e.key === "Escape") {
      this.store.closeAddDialog();
      return;
    }

    // Save shortcut: Cmd+S (macOS) / Ctrl+S (win/linux)
    const isSave = (e.key === "s" || e.key === "S") && (e.metaKey || e.ctrlKey) && !e.altKey;
    if (isSave) {
      e.preventDefault();
      e.stopPropagation();
      if (this.store.yamlError) {
        this.store.validateOutput = `Cannot save: YAML parse error (${this.store.yamlError})`;
        this.store.notify();
        return;
      }
      void this.store.save();
    }
  };

  connectedCallback() {
    super.connectedCallback();
    this.store.addEventListener("change", this.onStoreChange);
    window.addEventListener("keydown", this.onWindowKeyDown);
    void this.store.loadMonacoEditor();
    void this.store.loadStartup();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.store.removeEventListener("change", this.onStoreChange);
    window.removeEventListener("keydown", this.onWindowKeyDown);
  }

  render() {
    const store = this.store;

    if (store.startupState === "loading") {
      return html`
        <div class="loadingScreen">
          <div class="loadingCard">
            <div class="spinner"></div>
            <div>
              <div class="loadingTitle">Loading ESPHome Visual Editor</div>
              <div class="loadingSub">Fetching schemas and devices…</div>
            </div>
          </div>
        </div>
      `;
    }

    return html`
      <div class="app">
        <eve-topbar .store=${store}></eve-topbar>
        <div class="main">
          <eve-tree-panel class="pane left" .store=${store}></eve-tree-panel>
          <eve-editor-panel class="pane center" .store=${store}></eve-editor-panel>
          <eve-yaml-pane class="pane right" .store=${store}></eve-yaml-pane>
        </div>
      </div>

      <eve-add-component-dialog .store=${store}></eve-add-component-dialog>
      <eve-delete-dialog .store=${store}></eve-delete-dialog>
      <eve-board-picker-dialog .store=${store}></eve-board-picker-dialog>
    `;
  }
}
