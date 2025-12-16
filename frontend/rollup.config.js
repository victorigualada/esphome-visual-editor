import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import { string } from "rollup-plugin-string";
import copy from "rollup-plugin-copy";
import del from "rollup-plugin-delete";
import terser from "@rollup/plugin-terser";

const isWatch = Boolean(process.env.ROLLUP_WATCH);

/** @type {import("rollup").RollupOptions} */
export default {
  input: "src/main.ts",
  output: {
    dir: "dist",
    format: "es",
    sourcemap: true,
    entryFileNames: "assets/app.js",
    chunkFileNames: "assets/chunk-[hash].js",
    assetFileNames: "assets/[name]-[hash][extname]",
  },
  plugins: [
    // IMPORTANT: Do not wipe dist on every watch rebuild; it causes temporary/permanent 404s
    // when the backend serves `frontend/dist` while Rollup is rebuilding.
    !isWatch ? del({ targets: "dist/*" }) : null,

    string({
      include: [
        "**/src/index.css",
        "**/src/styles/ui/*.css",
        "**/node_modules/@mdi/font/css/materialdesignicons.min.css",
        "**/node_modules/monaco-editor/min/vs/editor/editor.main.css",
      ],
    }),

    resolve({ browser: true }),
    commonjs(),

    typescript({
      tsconfig: "tsconfig.json",
      exclude: ["**/*.test.ts", "**/*.spec.ts"],
    }),

    copy({
      targets: [
        { src: "index.html", dest: "dist" },
        { src: "public/*", dest: "dist" },
        // Monaco runtime assets (AMD loader + workers).
        { src: "node_modules/monaco-editor/min/vs", dest: "dist" },
        // MDI font assets (woff2/woff/ttf/eot) referenced by the injected CSS.
        { src: "node_modules/@mdi/font/fonts/*", dest: "dist/fonts" },
      ],
    }),

    terser(),
  ].filter(Boolean),
};
