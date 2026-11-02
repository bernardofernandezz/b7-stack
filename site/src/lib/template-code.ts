import { createServerFn } from "@tanstack/react-start";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { IMPORT_PRAGMA, MARKER } from "../../../cli/regions.js";
import compose from "../../../templates/fullstack/compose.yaml?raw";
import scope from "../../../templates/fullstack/src/lib/scope.ts?raw";
import procedures from "../../../templates/fullstack/src/modules/notes/procedures.ts?raw";
import middleware from "../../../templates/fullstack/src/rpc/middleware.ts?raw";

export type Token = { text: string; light?: string; dark?: string };
/** `cond` is the feature region the line sits in (ADR-014), null outside any region. */
export type CodeLine = { cond: string | null; tokens: Token[] };
export type CodeFile = { path: string; lines: CodeLine[] };

// The real template files, region markers included, so the landing shows what create-b7 generates.
const FILES = [
  ["src/lib/scope.ts", scope, "typescript"],
  ["src/modules/notes/procedures.ts", procedures, "typescript"],
  ["src/rpc/middleware.ts", middleware, "typescript"],
  ["compose.yaml", compose, "yaml"],
] as const;

/** Highlights each file once on the server (prerendered), keeping each line's region so the browser only filters. */
export const templateCode = createServerFn({ method: "GET" }).handler(
  async (): Promise<CodeFile[]> => {
    // The JavaScript regex engine and explicit grammars: no WASM to bundle into the server function.
    const highlighter = await createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
      langs: [
        import("shiki/langs/typescript.mjs"),
        import("shiki/langs/yaml.mjs"),
      ],
      themes: [
        import("shiki/themes/github-light.mjs"),
        import("shiki/themes/github-dark.mjs"),
      ],
    });
    return FILES.map(([path, text, lang]) => {
      const tokens = highlighter.codeToTokensWithThemes(text.trimEnd(), {
        lang,
        themes: { light: "github-light", dark: "github-dark" },
      });
      const lines: CodeLine[] = [];
      let cond: string | null = null;
      text
        .trimEnd()
        .split("\n")
        .forEach((line, i) => {
          const m = line.match(MARKER);
          if (m) {
            cond = m[1] === "if" ? m[2] : null;
            return;
          }
          if (line === IMPORT_PRAGMA) return;
          lines.push({
            cond,
            tokens: (tokens[i] ?? []).map((t) => ({
              text: t.content,
              light: t.variants.light?.color,
              dark: t.variants.dark?.color,
            })),
          });
        });
      return { path, lines };
    });
  },
);
