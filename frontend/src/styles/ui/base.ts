import { css, unsafeCSS } from "lit";
import baseCss from "./base.css";
import mdiCss from "@mdi/font/css/materialdesignicons.min.css";

export const uiBaseStyles = css`
  ${unsafeCSS(mdiCss)}
  ${unsafeCSS(baseCss)}
`;
