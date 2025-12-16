import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { EveAppStore } from "../../app/eve-app-store";
import type { EspBoardsCatalog } from "../../types";
import {
  esphomeBoardIdToEspBoardsSlug,
  getEspBoardsSelectionForUi,
  getRootBoardId,
} from "../../lib/esphome-config/boards";
import { isObject } from "../../lib/type-guards";
import { uiBaseStyles } from "../../styles/ui";

import "../../components/eve-board-picker";

@customElement("eve-board-picker-dialog")
export class EveBoardPickerDialog extends LitElement {
  static styles = [uiBaseStyles];

  @property({ attribute: false }) accessor store!: EveAppStore;

  private openedOnce = false;

  private onStoreChange = () => this.requestUpdate();

  connectedCallback(): void {
    super.connectedCallback();
    this.store?.addEventListener("change", this.onStoreChange);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.store?.removeEventListener("change", this.onStoreChange);
  }

  protected updated(): void {
    const store = this.store;
    if (!store?.boardPickerDialogOpen) {
      this.openedOnce = false;
      return;
    }
    if (this.openedOnce) return;
    const picker = this.renderRoot.querySelector<any>("eve-board-picker");
    picker?.openPicker?.();
    this.openedOnce = true;
  }

  private esp32VariantFromMicrocontroller(microcontroller: string | null | undefined): string | undefined {
    const mc = (microcontroller ?? "").trim().toLowerCase();
    const map: Record<string, string> = {
      esp32: "ESP32",
      esp32s2: "ESP32S2",
      esp32s3: "ESP32S3",
      esp32c3: "ESP32C3",
      esp32c6: "ESP32C6",
      esp32h2: "ESP32H2",
    };
    return map[mc];
  }

  render(): TemplateResult | typeof nothing {
    const store = this.store;
    if (!store?.boardPickerDialogOpen) return nothing;

    const configObj = store.configObj;
    const root = isObject(configObj) ? (configObj as any) : {};
    const hasEsp8266 = isObject(root.esp8266);
    const hasEsp32 = isObject(root.esp32);
    const espBoardsSel = getEspBoardsSelectionForUi(configObj);
    const target: "esp32" | "esp8266" = espBoardsSel?.target ?? (hasEsp8266 ? "esp8266" : hasEsp32 ? "esp32" : "esp32");

    const targetObj = root[target];
    const boardValue =
      isObject(targetObj) && typeof (targetObj as any).board === "string"
        ? String((targetObj as any).board).trim()
        : "";
    const selectedSlug =
      espBoardsSel?.target === target ? espBoardsSel.slug : esphomeBoardIdToEspBoardsSlug(target, boardValue);

    const catalog = store.getEspBoardsCached(target) ?? null;
    if (!catalog) void store.ensureEspBoards(target);

    const ctx = { boardId: getRootBoardId(configObj), espBoards: espBoardsSel };
    void ctx;

    return html`
      <eve-board-picker
        .inline=${false}
        .target=${target as any}
        .catalog=${catalog as EspBoardsCatalog | null}
        .selectedSlug=${selectedSlug}
        @open-changed=${(e: CustomEvent) => {
          if (!e.detail?.open) store.closeBoardPickerDialog();
        }}
        @select=${(e: CustomEvent) => {
          const b = e.detail.board as EspBoardsCatalog["boards"][number];
          const variant = this.esp32VariantFromMicrocontroller(b.microcontroller ?? null);
          const esphomeBoardId = b.slug;
          store.updateConfig((draft) => {
            if (target === "esp8266") {
              delete draft.esp32;
              draft.esp8266 ??= {};
              draft.esp8266.board = esphomeBoardId;
              return;
            }
            delete draft.esp8266;
            draft.esp32 ??= {};
            draft.esp32.board = esphomeBoardId;
            if (variant) draft.esp32.variant = variant;
          });
          store.closeBoardPickerDialog();
        }}
      ></eve-board-picker>
    `;
  }
}
