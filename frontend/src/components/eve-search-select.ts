import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { uiBaseStyles, uiEditorStyles } from "../styles/ui";

type RenderOption = ((opt: string) => TemplateResult) | null;

@customElement("eve-search-select")
export class EveSearchSelect extends LitElement {
  static styles = [uiBaseStyles, uiEditorStyles];

  @property({ type: String }) accessor label = "";
  @property({ type: String }) accessor value = "";
  @property({ attribute: false }) accessor options: string[] = [];
  @property({ type: String }) accessor placeholder = "";
  @property({ type: Number }) accessor maxItems = 80;
  @property({ attribute: false }) accessor renderOption: RenderOption = null;
  @property({ type: String }) accessor leadingIconClass = "";

  @state() accessor open = false;
  @state() accessor query = "";

  private onDocClick: ((ev: MouseEvent) => void) | null = null;

  private filtered(): string[] {
    const q = (this.query || "").trim().toLowerCase();
    const opts = Array.isArray(this.options) ? this.options : [];
    const out = q ? opts.filter((o) => o.toLowerCase().includes(q)) : opts;
    return out.slice(0, Math.max(1, this.maxItems || 80));
  }

  private setValue(next: string) {
    this.dispatchEvent(new CustomEvent("change", { detail: { value: next }, bubbles: true, composed: true }));
  }

  private close() {
    this.open = false;
    this.query = "";
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.onDocClick = (ev: MouseEvent) => {
      const path = ev.composedPath?.() ?? [];
      if (!path.includes(this)) this.close();
    };
    document.addEventListener("click", this.onDocClick);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.onDocClick) document.removeEventListener("click", this.onDocClick);
    this.onDocClick = null;
  }

  render() {
    const filtered = this.open ? this.filtered() : [];
    const renderOpt = this.renderOption;
    const showLeading = !this.open && !!(this.leadingIconClass || "").trim() && !!(this.value || "").trim();
    return html`
      <div class="searchSelect">
        <label class="searchSelectLabel">
          ${this.label ? html`<span>${this.label}</span>` : nothing}
          <div class=${showLeading ? "searchSelectInputWrap hasLeadingIcon" : "searchSelectInputWrap"}>
            ${showLeading
              ? html`<span class=${`searchSelectLeadingIcon ${this.leadingIconClass}`} aria-hidden="true"></span>`
              : nothing}
            <input
              class="searchSelectInput"
              .value=${this.open ? this.query : (this.value ?? "")}
              placeholder=${this.placeholder ?? ""}
              @change=${(e: Event) => e.stopPropagation()}
              @focus=${() => {
                this.open = true;
                this.query = "";
              }}
              @input=${(e: Event) => {
                this.open = true;
                this.query = (e.target as HTMLInputElement).value;
              }}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Escape") this.close();
                if (e.key === "Enter" && this.open) {
                  const first = filtered[0];
                  if (first) {
                    this.setValue(first);
                    this.close();
                  }
                }
              }}
            />
          </div>
        </label>

        ${this.open
          ? html`
              <div class="searchSelectMenu" @click=${(e: Event) => e.stopPropagation()}>
                ${filtered.length === 0
                  ? html`<div class="searchSelectEmpty">No results</div>`
                  : filtered.map((opt) => {
                      const active = (this.value ?? "") === opt;
                      return html`
                        <button
                          type="button"
                          class=${active ? "searchSelectItem active" : "searchSelectItem"}
                          @click=${() => {
                            this.setValue(opt);
                            this.close();
                          }}
                        >
                          ${renderOpt ? renderOpt(opt) : opt}
                        </button>
                      `;
                    })}
              </div>
            `
          : nothing}
      </div>
    `;
  }
}
