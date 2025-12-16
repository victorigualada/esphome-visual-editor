import { LitElement, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { EveAppStore } from "../../app/eve-app-store";
import { uiBaseStyles, uiEditorStyles } from "../../styles/ui";

@customElement("eve-yaml-pane")
export class EveYamlPane extends LitElement {
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

  render() {
    const store = this.store;
    if (!store) return nothing;

    return html`
      <div class="paneTitle">YAML</div>
      <div class="yamlEditor">
        ${store.monacoState === "ready"
          ? html`
              <eve-monaco-editor
                height="100%"
                language="yaml"
                .value=${store.yamlText}
                @mounted=${(e: CustomEvent) => {
                  store.setYamlEditor(e.detail?.editor ?? null);
                }}
                @value-changed=${(e: CustomEvent) => {
                  store.setYamlText(e.detail.value ?? "");
                }}
              ></eve-monaco-editor>
            `
          : html`
              <textarea
                class="plainYaml"
                .value=${store.yamlText}
                @input=${(e: Event) => {
                  store.setYamlText((e.target as HTMLTextAreaElement).value ?? "");
                }}
              ></textarea>
            `}
      </div>
      <div class="bottomPanel">
        <div class="paneTitle">Output</div>
        ${store.monacoState === "failed"
          ? html`<div class="errorBox" style="margin-bottom:10px;">
              Monaco failed to load: ${store.monacoError ?? "unknown error"}.
              <button style="margin-left:10px;" @click=${() => void store.loadMonacoEditor()}>Retry</button>
            </div>`
          : nothing}
        <pre class="output">${store.validateOutput}</pre>
      </div>
    `;
  }
}
