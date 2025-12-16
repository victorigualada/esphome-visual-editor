import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { EspBoardsCatalog } from "../types";
import { uiBaseStyles, uiDialogsStyles, uiPickersStyles } from "../styles/ui";

@customElement("eve-board-picker")
export class EveBoardPicker extends LitElement {
  static styles = [uiBaseStyles, uiDialogsStyles, uiPickersStyles];

  @property({ type: Boolean }) accessor inline = true;
  @property({ type: String }) accessor label = "Board";
  @property({ type: String }) accessor target: "esp32" | "esp8266" = "esp32";
  @property({ attribute: false }) accessor catalog: EspBoardsCatalog | null = null;
  @property({ type: String }) accessor selectedSlug = "";

  @state() accessor open = false;
  @state() accessor query = "";

  private selectedBoard() {
    const slug = (this.selectedSlug || "").trim();
    const boards = this.catalog?.boards ?? [];
    return boards.find((b) => b.slug === slug) ?? null;
  }

  private filtered() {
    const q = (this.query || "").trim().toLowerCase();
    const boards = this.catalog?.boards ?? [];
    if (!q) return boards;
    return boards.filter((b) => `${b.name} ${b.slug} ${b.microcontroller ?? ""}`.toLowerCase().includes(q));
  }

  private setOpen(next: boolean) {
    this.open = next;
    if (!next) this.query = "";
    this.dispatchEvent(new CustomEvent("open-changed", { detail: { open: this.open }, bubbles: true, composed: true }));
  }

  private openPickerInternal = () => {
    this.query = "";
    this.setOpen(true);
  };

  private closePickerInternal = () => {
    this.setOpen(false);
  };

  openPicker(): void {
    this.openPickerInternal();
  }

  render() {
    const selected = this.selectedBoard();
    const isEmpty = !(this.selectedSlug || "").trim();
    return html`
      ${this.inline
        ? html`
            <div class="formRow">
              <div class="fieldLabel">${this.label}</div>
              <div class="boardPickerRow">
                <button
                  type="button"
                  class=${isEmpty ? "boardPickerBtn isEmpty" : "boardPickerBtn"}
                  @click=${this.openPickerInternal}
                  title=${selected?.name ?? this.selectedSlug ?? ""}
                >
                  <span class="boardPickerBtnMain">
                    ${selected
                      ? html`
                          <span class="boardPickerName">${selected.name}</span>
                          <span class="boardPickerSep" aria-hidden="true"></span>
                          <span class="boardPickerSlug">${selected.slug}</span>
                        `
                      : nothing}
                    ${!selected && !isEmpty ? html`<span class="boardPickerName">${this.selectedSlug}</span>` : nothing}
                    ${isEmpty ? html`<span class="boardPickerPlaceholder">Select board…</span>` : nothing}
                  </span>
                  <span class="boardPickerBtnRight">
                    ${selected?.microcontroller
                      ? html`<span class="boardPickerChip">${selected.microcontroller}</span>`
                      : nothing}
                    <span class="boardPickerChevron" aria-hidden="true"></span>
                  </span>
                </button>
              </div>
            </div>
          `
        : nothing}
      ${this.open
        ? html`
            <div class="modalOverlay" @click=${this.closePickerInternal}>
              <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
                <div class="addDialogHeader">
                  <div>
                    <div class="addDialogTitle">Select board (${this.target})</div>
                    <div class="addDialogSub">Images and pinouts powered by espboards.dev</div>
                  </div>
                  <button
                    type="button"
                    class="iconBtn"
                    title="Close"
                    aria-label="Close"
                    @click=${this.closePickerInternal}
                  >
                    <span class="mdi mdi-close iconImg" aria-hidden="true"></span>
                  </button>
                </div>

                <input
                  class="boardPickerSearch"
                  placeholder="Search boards…"
                  .value=${this.query}
                  @input=${(e: Event) => (this.query = (e.target as HTMLInputElement).value)}
                />

                ${this.catalog
                  ? html`
                      <div style="margin-top:12px;">
                        <div class="boardGrid">
                          ${this.filtered().map((b) => {
                            const active = b.slug === this.selectedSlug;
                            return html`
                              <button
                                type="button"
                                class=${active ? "boardCard active" : "boardCard"}
                                @click=${() => {
                                  this.dispatchEvent(
                                    new CustomEvent("select", { detail: { board: b }, bubbles: true, composed: true }),
                                  );
                                  this.closePickerInternal();
                                }}
                              >
                                <img class="boardImg" src=${b.imageUrl} alt="" loading="lazy" decoding="async" />
                                <div class="boardMeta">
                                  <div class="boardName">${b.name}</div>
                                  <div class="boardSlug">${b.slug}</div>
                                  ${b.microcontroller
                                    ? html`<div class="boardChip">${b.microcontroller}</div>`
                                    : nothing}
                                </div>
                              </button>
                            `;
                          })}
                        </div>
                      </div>
                    `
                  : html`<div class="hint" style="margin-top:12px;">Loading boards…</div>`}
              </div>
            </div>
          `
        : nothing}
    `;
  }
}
