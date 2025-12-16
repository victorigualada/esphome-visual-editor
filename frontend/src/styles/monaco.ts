import { css, unsafeCSS } from "lit";

import monacoCss from "monaco-editor/min/vs/editor/editor.main.css";

export const monacoStyles = css`
  ${unsafeCSS(monacoCss)}

  /* Eve: validation highlights (Monaco decorations) */
  .monaco-editor .eveValidateErrorLine,
  .eveValidateErrorLine {
    background: rgba(220, 38, 38, 0.12) !important;
    border-left: 3px solid rgba(220, 38, 38, 0.55);
  }

  .monaco-editor .eveValidateWarnLine,
  .eveValidateWarnLine {
    background: rgba(245, 158, 11, 0.1) !important;
    border-left: 3px solid rgba(245, 158, 11, 0.55);
  }

  /* Eve: YAML parse error highlight */
  .monaco-editor .eveParseErrorLine,
  .eveParseErrorLine {
    background: rgba(220, 38, 38, 0.12) !important;
    border-left: 3px solid rgba(220, 38, 38, 0.6);
  }
`;
