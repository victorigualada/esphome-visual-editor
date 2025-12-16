import { LitElement, html, type TemplateResult } from "lit";
import { css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { EveAppStore } from "../../app/eve-app-store";
import type { EsphomeUiSchemaNode } from "../../types";
import { uiBaseStyles, uiEditorStyles } from "../../styles/ui";

import type { SchemaFormCtx, SchemaFormState } from "./schema-form/env";
import { renderObjectForm } from "./schema-form/object";

import "../../components/eve-search-select";
import "../../components/eve-pin-picker";

@customElement("eve-schema-form")
export class EveSchemaForm extends LitElement {
  static styles = [
    uiBaseStyles,
    uiEditorStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
    `,
  ];

  @property({ attribute: false }) accessor store!: EveAppStore;
  @property({ attribute: false }) accessor schema: Extract<EsphomeUiSchemaNode, { type: "object" }> | undefined =
    undefined;
  @property({ attribute: false }) accessor value: Record<string, unknown> | undefined = undefined;
  @property({ attribute: false }) accessor path: string | undefined = undefined;
  @property({ attribute: false }) accessor hiddenKeys: string[] | undefined = undefined;
  @property({ attribute: false }) accessor ctx: SchemaFormCtx | undefined = undefined;
  @property({ attribute: false }) accessor onChange: ((next: Record<string, unknown>) => void) | undefined = undefined;

  private onStoreChange = () => this.requestUpdate();

  private state: SchemaFormState = {
    collapsedGroups: new Map<string, boolean>(),
    yamlFieldDrafts: new Map<string, string>(),
    anyOfSelection: new Map<string, number>(),
    mapDrafts: new Map<string, { key: string; value: string }>(),
    pendingOpenPinPath: null,
  };

  connectedCallback(): void {
    super.connectedCallback();
    this.store?.addEventListener("change", this.onStoreChange);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.store?.removeEventListener("change", this.onStoreChange);
  }

  render(): TemplateResult {
    const schema = this.schema;
    const value = this.value ?? {};
    const path = this.path ?? "schema";
    const onChange = this.onChange;
    if (!schema || schema.type !== "object") return html`<div class="errorBox">Invalid schema form root</div>`;
    if (!onChange) return html`<div class="errorBox">Missing schema form onChange</div>`;

    const env = { store: this.store, state: this.state, requestUpdate: () => this.requestUpdate() };
    return html`${renderObjectForm(env, path, schema, value, onChange, { hiddenKeys: this.hiddenKeys, ctx: this.ctx })}`;
  }
}
