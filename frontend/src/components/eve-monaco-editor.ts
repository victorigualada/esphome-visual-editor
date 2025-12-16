import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { uiBaseStyles } from "../styles/ui";
import { monacoStyles } from "../styles/monaco";

type Monaco = typeof import("monaco-editor");

let monacoReady: Promise<Monaco> | null = null;

declare global {
  interface Window {
    // Monaco's AMD loader (from monaco-editor/min/vs/loader.js)
    require?: any;
    monaco?: Monaco;
  }
}

@customElement("eve-monaco-editor")
export class EveMonacoEditor extends LitElement {
  static styles = [
    uiBaseStyles,
    monacoStyles,
    css`
      :host {
        display: block;
        width: 100%;
      }

      .monacoHost {
        width: 100%;
        height: 100%;
      }
    `,
  ];

  @property({ type: String }) accessor value = "";
  @property({ type: String }) accessor language = "yaml";
  @property({ type: String }) accessor height = "240px";

  private monaco: Monaco | null = null;
  private editor: import("monaco-editor").editor.IStandaloneCodeEditor | null = null;
  private model: import("monaco-editor").editor.ITextModel | null = null;
  private suppress = false;

  render() {
    return html`<div class="monacoHost"></div>`;
  }

  private applyHostHeight() {
    // Make the host itself the sizing box so percent heights (e.g. "100%") work.
    this.style.height = this.height;
  }

  async firstUpdated() {
    this.applyHostHeight();
    const host = this.renderRoot.querySelector(".monacoHost") as HTMLDivElement | null;
    if (!host) return;

    const monaco = await this.loadMonaco();
    this.monaco = monaco;

    this.ensureFoldingProviders(monaco);

    this.model = monaco.editor.createModel(this.value ?? "", this.normalizeLang(monaco, this.language));
    this.editor = monaco.editor.create(host, {
      model: this.model,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: "on",
      fontSize: 13,
      lineNumbersMinChars: 3,
      renderWhitespace: "none",
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      folding: true,
      showFoldingControls: "always",
    });

    this.dispatchEvent(new CustomEvent("mounted", { detail: { editor: this.editor }, bubbles: true, composed: true }));

    this.model.onDidChangeContent(() => {
      if (this.suppress) return;
      const next = this.model?.getValue() ?? "";
      this.dispatchEvent(new CustomEvent("value-changed", { detail: { value: next }, bubbles: true, composed: true }));
    });
  }

  private async loadMonaco(): Promise<Monaco> {
    if (monacoReady) return await monacoReady;

    monacoReady = (async () => {
      // Ensure AMD loader is present.
      if (!window.require) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.async = true;
          s.src = new URL("./vs/loader.js", window.location.href).toString();
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load Monaco AMD loader (vs/loader.js)"));
          document.head.appendChild(s);
        });
      }

      const vsBase = new URL("./vs", window.location.href).toString().replace(/\/$/, "");
      window.require.config({ paths: { vs: vsBase } });

      await new Promise<void>((resolve, reject) => {
        try {
          window.require(["vs/editor/editor.main"], () => resolve());
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
        // Some require implementations surface errors via onError.
        if (window.require?.onError) {
          window.require.onError = (err: any) => reject(err instanceof Error ? err : new Error(String(err)));
        }
      });

      if (!window.monaco) throw new Error("Monaco loaded but window.monaco is missing");
      return window.monaco;
    })();

    return await monacoReady;
  }

  updated(changed: Map<string, unknown>) {
    if (!this.monaco || !this.model) return;

    if (changed.has("height")) {
      this.applyHostHeight();
      try {
        this.editor?.layout();
      } catch {
        // ignore
      }
    }

    if (changed.has("language")) {
      const monaco = this.monaco;
      const lang = this.normalizeLang(monaco, this.language);
      monaco.editor.setModelLanguage(this.model, lang);
    }

    if (changed.has("value")) {
      const next = this.value ?? "";
      if (next === this.model.getValue()) return;
      this.suppress = true;
      this.model.setValue(next);
      this.suppress = false;
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    try {
      this.editor?.dispose();
    } catch {
      // ignore
    }
    this.editor = null;
    try {
      this.model?.dispose();
    } catch {
      // ignore
    }
    this.model = null;
  }

  private normalizeLang(monaco: Monaco, requested: string): string {
    const req = (requested || "").trim().toLowerCase();
    const langs = monaco.languages.getLanguages().map((l) => l.id);
    if (langs.includes(req)) return req;
    if (req === "yaml" && langs.includes("yml")) return "yml";
    return "plaintext";
  }

  private ensureFoldingProviders(monaco: Monaco) {
    const provide = (model: import("monaco-editor").editor.ITextModel) => {
      const lines = model.getLinesContent();
      const ranges: import("monaco-editor").languages.FoldingRange[] = [];
      const marker = /^#\s*eve:disabled_(core|component):/;
      for (let i = 0; i < lines.length; i++) {
        if (!marker.test(lines[i] ?? "")) continue;
        const start = i + 1;
        let end = i + 1;
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j] ?? "";
          if (marker.test(l)) break;
          if (!l.startsWith("#")) break;
          end = j + 1;
        }
        if (end > start) {
          ranges.push({
            start,
            end,
            kind: monaco.languages.FoldingRangeKind.Comment,
          });
        }
      }
      return ranges;
    };

    const provider = { provideFoldingRanges: (model: any) => provide(model) };

    // Register for common ids we might use for YAML.
    for (const lang of ["yaml", "yml", "plaintext"]) {
      try {
        monaco.languages.registerFoldingRangeProvider(lang, provider as any);
      } catch {
        // ignore duplicate registration
      }
    }
  }
}
