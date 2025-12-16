import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { getEspBoardDetails } from "../api";
import type { EspBoardDetails } from "../types";
import { uiBaseStyles, uiDialogsStyles, uiPickersStyles } from "../styles/ui";

@customElement("eve-pin-picker")
export class EvePinPicker extends LitElement {
  static styles = [uiBaseStyles, uiDialogsStyles, uiPickersStyles];

  @property({ type: String }) accessor value = "";
  @property({ type: String }) accessor boardId = "";
  @property({ type: String }) accessor espBoardsTarget: "esp32" | "esp8266" | "" = "";
  @property({ type: String }) accessor espBoardsSlug = "";

  @state() accessor open = false;
  @state() accessor query = "";
  @state() accessor loading = false;
  @state() accessor error: string | null = null;
  @state() accessor details: EspBoardDetails | null = null;

  private detailsKey: string | null = null;

  protected updated(changed: Map<string, unknown>) {
    const target = (this.espBoardsTarget || "").trim();
    const slug = (this.espBoardsSlug || "").trim();
    const key = target && slug ? `${target}:${slug}` : null;

    if (changed.has("espBoardsTarget") || changed.has("espBoardsSlug")) {
      if (!key) {
        this.detailsKey = null;
        this.details = null;
        this.error = null;
        this.loading = false;
        return;
      }
      if (this.detailsKey !== key) {
        this.detailsKey = key;
        void this.loadDetails();
      }
    }
  }

  private async loadDetails() {
    const target = (this.espBoardsTarget || "").trim() as any;
    const slug = (this.espBoardsSlug || "").trim();
    if (!target || !slug) {
      this.details = null;
      return;
    }
    this.loading = true;
    this.error = null;
    try {
      this.details = await getEspBoardDetails(target, slug);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.details = null;
    } finally {
      this.loading = false;
    }
  }

  private isBoardNotFoundError(msg: string): boolean {
    const m = (msg || "").toLowerCase();
    // Backend wraps espboards.dev failures like:
    // 400 Bad Request: {"detail":"Failed to load board details: HTTP Error 404: Not Found"}
    return m.includes("failed to load board details") && m.includes("404");
  }

  private openBoardSettings = () => {
    this.dispatchEvent(
      new CustomEvent("open-board-settings", {
        detail: {
          boardId: this.boardId ?? "",
          espBoardsTarget: this.espBoardsTarget ?? "",
          espBoardsSlug: this.espBoardsSlug ?? "",
        },
        bubbles: true,
        composed: true,
      }),
    );
    this.open = false;
  };

  private selectedPin() {
    const v = (this.value ?? "").trim();
    if (!v) return null;
    const pins = this.details?.pins ?? [];
    return pins.find((p) => (p.value ?? "").trim() === v) ?? null;
  }

  private pinBadgeText(): string | null {
    const selected = this.selectedPin();
    if (selected?.label) return String(selected.label);
    const v = (this.value ?? "").trim();
    const m = v.match(/gpio\s*(\d+)/i);
    if (m?.[1]) return m[1];
    if (/^\d+$/.test(v)) return v;
    return null;
  }

  private filteredPins() {
    const pins = this.details?.pins ?? [];
    const q = (this.query || "").trim().toLowerCase();
    if (!q) return pins;
    return pins.filter((p) => `${p.label} ${p.value} ${p.description ?? ""}`.toLowerCase().includes(q));
  }

  private pick(val: string) {
    this.dispatchEvent(new CustomEvent("change", { detail: { value: val }, bubbles: true, composed: true }));
  }

  public openPicker(): void {
    void this.openPickerInternal();
  }

  private openPickerInternal = async () => {
    // If we don't have a board, open the board picker dialog first.
    if (!(this.espBoardsTarget || "").trim() || !(this.espBoardsSlug || "").trim()) {
      this.openBoardSettings();
      return;
    }
    this.open = true;
    this.query = "";
    await this.loadDetails();
  };

  private isWarningPin(
    meta: Record<string, string> | null | undefined,
    description: string | null | undefined,
  ): boolean {
    const combined = `${description ?? ""} ${
      meta
        ? Object.entries(meta)
            .map(([k, v]) => `${k}:${v}`)
            .join(" ")
        : ""
    }`.toLowerCase();
    return /boot|strap|strapping|flash|reserved|warning|danger|do not|not recommended|input only|5v/.test(combined);
  }

  render() {
    const boardInfo =
      this.espBoardsTarget && this.espBoardsSlug
        ? `${this.espBoardsTarget}:${this.espBoardsSlug}`
        : this.boardId
          ? this.boardId
          : "no board";

    const selected = this.selectedPin();
    const badge = this.pinBadgeText();
    const warn = selected ? this.isWarningPin(selected.meta ?? null, selected.description ?? null) : false;
    const desc = (selected?.description ?? "").trim();
    const valueText = String(this.value ?? "");
    const isEmpty = !valueText.trim();
    const widthCh = Math.max(6, Math.min(14, valueText.trim() ? valueText.trim().length + 1 : 6));

    return html`
      <div class="boardPickerRow">
        <div class=${warn ? "pinInlineControl pinInlineControlWarn" : "pinInlineControl"}>
          ${badge
            ? html`<div class=${warn ? "pinInlineBadge pinInlineBadgeWarn" : "pinInlineBadge"}>${badge}</div>`
            : nothing}
          <div class="pinInlineRow">
            <button
              type="button"
              class=${isEmpty ? "pinInlineValueBtn isEmpty" : "pinInlineValueBtn"}
              title=${desc}
              style=${isEmpty ? "" : `width:${widthCh}ch;`}
              @click=${this.openPickerInternal}
            >
              ${isEmpty ? "Select pin…" : (this.value ?? "").trim()}
            </button>
            ${desc
              ? html`
                  <span class=${warn ? "pinInlineSep pinInlineSepWarn" : "pinInlineSep"} aria-hidden="true"></span>
                  <div class=${warn ? "pinInlineDescInline pinInlineDescWarn" : "pinInlineDescInline"} title=${desc}>
                    ${desc}
                  </div>
                `
              : nothing}
          </div>
        </div>
      </div>

      ${this.open
        ? html`
            <div class="modalOverlay" @click=${() => (this.open = false)}>
              <div
                class=${this.error ? "modal pinPickerModal pinPickerModalError" : "modal pinPickerModal"}
                @click=${(e: Event) => e.stopPropagation()}
              >
                <div class="addDialogHeader">
                  <div>
                    <div class="addDialogTitle">Select pin</div>
                    <div class="addDialogSub">Board: ${boardInfo}</div>
                  </div>
                  <button
                    type="button"
                    class="iconBtn"
                    title="Close"
                    aria-label="Close"
                    @click=${() => (this.open = false)}
                  >
                    <span class="mdi mdi-close iconImg" aria-hidden="true"></span>
                  </button>
                </div>

                ${this.loading ? html`<div class="hint">Loading pinout…</div>` : nothing}
                ${this.error
                  ? (() => {
                      const msg = String(this.error ?? "");
                      if (this.isBoardNotFoundError(msg)) {
                        const slug = (this.espBoardsSlug || "").trim();
                        const target = (this.espBoardsTarget || "").trim();
                        return html`
                          <div class="errorBox">
                            <div>
                              Pin details aren’t available for this board
                              <span class="boardPickerChip">${target} | ${slug || "unknown"}</span>.
                            </div>
                            <div style="margin-top:8px;">
                              This usually means the selected board doesn’t exist on espboards.dev. Please double-check
                              your board selection.
                            </div>
                            <div style="margin-top:10px;">
                              <button type="button" class="pill pillLink" @click=${this.openBoardSettings}>
                                <span class="pillLinkText">Open board settings</span>
                                <span class="pillLinkIcon mdi mdi-open-in-new" aria-hidden="true"></span>
                              </button>
                            </div>
                          </div>
                        `;
                      }
                      return html`<div class="errorBox">${msg}</div>`;
                    })()
                  : nothing}
                ${!this.espBoardsTarget || !this.espBoardsSlug
                  ? html`<div class="hint">Select a board first to get pin descriptions and pinout image.</div>`
                  : nothing}
                ${this.details?.pinoutImageUrl
                  ? html`<img
                      class="pinoutImg"
                      src=${this.details.pinoutImageUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />`
                  : nothing}
                ${this.details
                  ? html`
                      <div style="margin-top:12px;">
                        <input
                          class="pinSearch"
                          placeholder="Search pins…"
                          .value=${this.query}
                          @input=${(e: Event) => (this.query = (e.target as HTMLInputElement).value)}
                        />
                        <div class="pinGrid" style="margin-top:12px;">
                          ${this.filteredPins().map((p) => {
                            const warn = this.isWarningPin(p.meta ?? null, p.description ?? null);
                            return html`
                              <button
                                type="button"
                                class=${warn ? "pin pinWarn" : "pin"}
                                @click=${() => {
                                  this.pick(p.value);
                                  this.open = false;
                                }}
                              >
                                <div class="pinHeader">
                                  <div class="pinNum">${p.label}</div>
                                  <div class="pinMain">
                                    <div class="pinValue">${p.value}</div>
                                    ${p.description ? html`<div class="pinDesc">${p.description}</div>` : nothing}
                                  </div>
                                </div>
                              </button>
                            `;
                          })}
                        </div>
                      </div>
                    `
                  : nothing}
              </div>
            </div>
          `
        : nothing}
    `;
  }
}
