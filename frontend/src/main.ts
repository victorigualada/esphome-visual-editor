import appCss from "./index.css";

function ensureGlobalCss(cssText: string) {
  const id = "eveGlobalCss";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = cssText;
  document.head.appendChild(style);
}

function ensureMdiFontFace() {
  const id = "eveMdiFontFace";
  if (document.getElementById(id)) return;

  // IMPORTANT: We cannot rely on @mdi/font's default "../fonts/..." URLs because our CSS is
  // injected into Shadow DOM (constructed stylesheets), and HA ingress serves the app from
  // a subpath. Compute absolute URLs from the current page URL so the font always loads.
  const woff2 = new URL("fonts/materialdesignicons-webfont.woff2", window.location.href).toString();
  const woff = new URL("fonts/materialdesignicons-webfont.woff", window.location.href).toString();
  const ttf = new URL("fonts/materialdesignicons-webfont.ttf", window.location.href).toString();

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
@font-face {
  font-family: "Material Design Icons";
  src:
    url("${woff2}") format("woff2"),
    url("${woff}") format("woff"),
    url("${ttf}") format("truetype");
  font-weight: normal;
  font-style: normal;
}
  `.trim();
  document.head.appendChild(style);
}

ensureMdiFontFace();
ensureGlobalCss(appCss);

const root = document.getElementById("root");
if (root) {
  root.innerHTML = "<eve-app></eve-app>";
}

function formatError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}\n${e.stack ?? ""}`.trim();
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function showBootError(e: unknown) {
  const msg = formatError(e);
  let el = document.getElementById("eveBootError");
  if (!el) {
    el = document.createElement("pre");
    el.id = "eveBootError";
    document.body.appendChild(el);
  }
  el.textContent = `EVE (Lit) boot error:\n\n${msg}`;
}

window.addEventListener("error", (ev) => showBootError((ev as any).error ?? (ev as any).message ?? ev));
window.addEventListener("unhandledrejection", (ev) => showBootError((ev as any).reason ?? ev));

import("./eve-app").catch(showBootError);
