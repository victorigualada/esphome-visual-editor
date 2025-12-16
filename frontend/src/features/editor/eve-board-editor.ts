import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { EveAppStore } from "../../app/eve-app-store";
import type { EspBoardsCatalog, EsphomeUiSchemaNode } from "../../types";
import { coreDocsUrl } from "../../lib/docs";
import {
  esphomeBoardIdToEspBoardsSlug,
  getEspBoardsSelectionForUi,
  getRootBoardId,
} from "../../lib/esphome-config/boards";
import { isObject } from "../../lib/type-guards";
import { uiBaseStyles, uiEditorStyles, uiPickersStyles } from "../../styles/ui";

import "../../components/eve-board-picker";
import "./eve-schema-form";

@customElement("eve-board-editor")
export class EveBoardEditor extends LitElement {
  static styles = [uiBaseStyles, uiEditorStyles, uiPickersStyles];

  @property({ attribute: false }) accessor store!: EveAppStore;
  @property({ attribute: false }) accessor configObj: unknown = null;

  private onStoreChange = () => this.requestUpdate();

  connectedCallback(): void {
    super.connectedCallback();
    this.store?.addEventListener("change", this.onStoreChange);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.store?.removeEventListener("change", this.onStoreChange);
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

  private pillLink(label: string, url: string | null): TemplateResult {
    if (!url) return html`<span class="pill">${label}</span>`;
    return html`<a class="pill pillLink" href=${url} target="_blank" rel="noreferrer noopener">
      <span class="pillLinkText">${label}</span>
      <span class="pillLinkIcon mdi mdi-open-in-new" aria-hidden="true"></span>
    </a>`;
  }

  render(): TemplateResult | typeof nothing {
    const store = this.store;
    if (!store) return nothing;
    const configObj = this.configObj;
    const root = isObject(configObj) ? (configObj as any) : {};
    const hasEsp8266 = isObject(root.esp8266);
    const hasEsp32 = isObject(root.esp32);
    const target: "esp32" | "esp8266" = hasEsp8266 ? "esp8266" : hasEsp32 ? "esp32" : "esp32";

    const catalog = store.getEspBoardsCached(target) ?? null;
    if (!catalog) void store.ensureEspBoards(target);

    const targetObj = root[target];
    const boardValue =
      isObject(targetObj) && typeof (targetObj as any).board === "string"
        ? String((targetObj as any).board).trim()
        : "";
    const espBoardsSel = getEspBoardsSelectionForUi(configObj);
    const boardSlug =
      espBoardsSel?.target === target ? espBoardsSel.slug : esphomeBoardIdToEspBoardsSlug(target, boardValue);

    const selectedBoard = catalog?.boards.find((b) => b.slug === boardSlug) ?? null;
    const selectedBoardImage = selectedBoard?.imageUrl ?? null;

    const setTarget = (next: "esp32" | "esp8266") => {
      store.updateConfig((draft) => {
        if (next === "esp8266") {
          delete draft.esp32;
          draft.esp8266 ??= { board: "nodemcuv2" };
          draft.esp8266.board ??= "nodemcuv2";
        } else {
          delete draft.esp8266;
          draft.esp32 ??= { board: "esp32dev" };
          draft.esp32.board ??= "esp32dev";
        }
      });
    };

    const ctx = { boardId: getRootBoardId(configObj), espBoards: espBoardsSel };

    const cached = store.getCoreSchemaCached(target) ?? null;
    if (!cached) {
      const err = store.getCoreSchemaError(target);
      if (!err) void store.ensureCoreSchema(target);
    }
    const schemaNode = cached?.schema;
    const canRender = schemaNode && schemaNode.type === "object";

    return html`
      <div class="boardEditorFields">
        <div class="boardEditorTopRow">
          <div class="boardEditorTopLeft">
            <div class="pillRow" style="margin-bottom:8px;">${this.pillLink("board", coreDocsUrl(target))}</div>

            <div class="formRow" style="margin-top:30px;">
              <div class="fieldLabel">Target</div>
              <div class="segmented" role="group" aria-label="Target platform">
                <button
                  type="button"
                  class=${target === "esp32" ? "toggleBtn active" : "toggleBtn"}
                  @click=${() => setTarget("esp32")}
                >
                  ESP32
                </button>
                <button
                  type="button"
                  class=${target === "esp8266" ? "toggleBtn active" : "toggleBtn"}
                  @click=${() => setTarget("esp8266")}
                >
                  ESP8266
                </button>
              </div>
            </div>
          </div>

          ${selectedBoardImage
            ? html`<img class="boardEditorImg" src=${selectedBoardImage} alt="" loading="lazy" decoding="async" />`
            : nothing}
        </div>

        <eve-board-picker
          label="Board"
          .target=${target as any}
          .catalog=${catalog}
          .selectedSlug=${boardSlug}
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
          }}
        ></eve-board-picker>
      </div>

      <div class="formGroup">
        <div class="groupTitle">${target} options</div>
        ${canRender
          ? html`<eve-schema-form
              .store=${store}
              .schema=${schemaNode as Extract<EsphomeUiSchemaNode, { type: "object" }>}
              .value=${isObject(targetObj) ? (targetObj as any) : {}}
              .path=${`core.${target}`}
              .hiddenKeys=${["board"]}
              .ctx=${ctx}
              .onChange=${(nextObj: Record<string, unknown>) =>
                store.updateConfig((draft) => {
                  draft[target] = nextObj;
                })}
            ></eve-schema-form>`
          : (() => {
              const err = store.getCoreSchemaError(target);
              if (err) {
                return html`<div class="errorBox">
                  Core schema load error: ${err}
                  <button
                    style="margin-left:10px;"
                    @click=${() => {
                      store.clearCoreSchemaError(target);
                      void store.ensureCoreSchema(target);
                    }}
                  >
                    Retry
                  </button>
                </div>`;
              }
              return html`<div class="hint">Loading schema for <code>${target}</code>…</div>`;
            })()}
      </div>
    `;
  }
}
