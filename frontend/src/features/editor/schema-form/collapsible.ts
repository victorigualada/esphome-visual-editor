import { html, nothing, type TemplateResult } from "lit";
import type { SchemaFormEnv } from "./env";

export function renderCollapsible(
  env: SchemaFormEnv,
  path: string,
  title: string,
  body: TemplateResult,
): TemplateResult {
  const collapsed = env.state.collapsedGroups.get(`${path}:${title}`) ?? false;
  return html`
    <div class=${collapsed ? "group isCollapsed" : "group isExpanded"}>
      <button
        type="button"
        class="groupHeader"
        @click=${() => {
          env.state.collapsedGroups.set(`${path}:${title}`, !collapsed);
          env.requestUpdate();
        }}
      >
        <span class="groupCaret">
          <svg
            class="caretIcon ${collapsed ? "isCollapsed" : "isExpanded"}"
            preserveAspectRatio="xMidYMid meet"
            focusable="false"
            role="img"
            aria-hidden="true"
            viewBox="0 0 24 24"
          >
            <g>
              <path class="primary-path" d="M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z"></path>
            </g>
          </svg>
        </span>
        <span class="groupTitle">${title}</span>
      </button>
      ${collapsed ? nothing : html`<div class="groupBody">${body}</div>`}
    </div>
  `;
}
