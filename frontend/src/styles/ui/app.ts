import { css, unsafeCSS } from "lit";
import appCss from "./app.css";

export const uiAppStyles = css`
  ${unsafeCSS(appCss)}
`;
