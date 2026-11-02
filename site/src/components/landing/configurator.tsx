import { Check, Copy, FileMinus, FilePlus, TriangleAlert } from "lucide-react";
import { type CSSProperties, useRef, useState } from "react";
import type { CodeFile } from "@/lib/template-code";
import { resolveConfig } from "../../../../cli/config.js";
import { holds } from "../../../../cli/regions.js";
import manifest from "../../../../templates/fullstack/b7.features.json";

type Options = { email: string; organizations: boolean; billing: string };

const DEFAULTS: Options = {
  email: "resend",
  organizations: false,
  billing: "none",
};

const SWITCHES = [
  {
    key: "email",
    label: "Email",
    hint: "Verification, password reset, invitations (Resend)",
    on: "resend",
    off: "none",
  },
  {
    key: "organizations",
    label: "Organizations",
    hint: "Members, roles, invitations, tenant isolation",
    on: true,
    off: false,
  },
  {
    key: "billing",
    label: "Stripe billing",
    hint: "Checkout, verified webhooks, reconciliation",
    on: "stripe",
    off: "none",
  },
] as const;

function command(o: Options) {
  const flags = [
    o.email !== DEFAULTS.email && `--email ${o.email}`,
    o.organizations && "--organizations",
    o.billing !== DEFAULTS.billing && `--billing ${o.billing}`,
  ].filter(Boolean);
  return `npm create b7@preview my-app${flags.length ? ` -- ${flags.join(" ")}` : ""}`;
}

/** Toggles the template's options and shows what create-b7 generates, with the CLI's own rules and region engine. */
export function Configurator({ files }: { files: CodeFile[] }) {
  const [options, setOptions] = useState<Options>({
    email: "resend",
    organizations: true,
    billing: "stripe",
  });
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  // Lines that appear after a toggle flash; `version` restarts the animation on every change.
  const previous = useRef<Options>(options);
  const [version, setVersion] = useState(0);

  let error: string | null = null;
  try {
    resolveConfig("fullstack", manifest, options);
  } catch (e) {
    error = (e as Error).message;
  }
  const cmd = command(options);
  const features = Object.entries(manifest.features) as [
    string,
    { files: string[]; dependencies?: string[] },
  ][];
  const file = files[tab];

  const toggle = (
    key: keyof Options,
    on: Options[keyof Options],
    off: Options[keyof Options],
  ) => {
    previous.current = options;
    setOptions({ ...options, [key]: options[key] === on ? off : on });
    setVersion((v) => v + 1);
  };

  return (
    <div className="grid overflow-hidden rounded-xl border border-fd-border lg:grid-cols-[22rem_1fr]">
      <div className="flex flex-col gap-6 border-fd-border border-b bg-fd-card p-6 lg:border-r lg:border-b-0">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-3 font-mono text-fd-muted-foreground text-xs">
            OPTIONS
          </legend>
          {SWITCHES.map((s) => {
            const checked = options[s.key] === s.on;
            return (
              <label
                key={s.key}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-fd-border p-3 transition-colors hover:bg-fd-accent/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-fd-ring"
              >
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={checked}
                  className="peer sr-only"
                  checked={checked}
                  onChange={() => toggle(s.key, s.on, s.off)}
                />
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full bg-fd-muted p-0.5 ring-1 ring-fd-border transition-colors peer-checked:bg-emerald-500 [&>span]:transition-transform peer-checked:[&>span]:translate-x-4"
                >
                  <span className="size-4 rounded-full bg-white shadow" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-sm">{s.label}</span>
                  <span className="text-fd-muted-foreground text-xs">
                    {s.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-fd-muted-foreground text-xs">
            COMMAND
          </span>
          {error ? (
            <p
              role="alert"
              className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-700 text-xs dark:text-amber-300"
            >
              <TriangleAlert className="size-4 shrink-0" />
              <span>
                {error}
                <span className="mt-1 block text-fd-muted-foreground">
                  The same check create-b7 runs.
                </span>
              </span>
            </p>
          ) : (
            <button
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(cmd).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
              className="group flex items-start gap-2 rounded-lg border border-fd-border bg-fd-background p-3 text-left font-mono text-xs transition hover:border-fd-muted-foreground/40"
            >
              <span className="text-fd-muted-foreground">$</span>
              <span className="flex-1 break-words">{cmd}</span>
              {copied ? (
                <Check className="size-4 shrink-0" />
              ) : (
                <Copy className="size-4 shrink-0 text-fd-muted-foreground" />
              )}
              <span className="sr-only" aria-live="polite">
                {copied ? "Copied" : "Copy command"}
              </span>
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-fd-muted-foreground text-xs">
            FILES
          </span>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto font-mono text-xs lg:max-h-none">
            {features.flatMap(([name, f]) => {
              const on = holds(name, options);
              return f.files.map((path) => (
                <li
                  key={path}
                  className={`flex items-center gap-2 ${on ? "" : "text-fd-muted-foreground/50 line-through"}`}
                >
                  {on ? (
                    <FilePlus className="size-3.5 shrink-0 text-emerald-500" />
                  ) : (
                    <FileMinus className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{path}</span>
                </li>
              ));
            })}
          </ul>
        </div>
      </div>

      <div className="flex min-w-0 flex-col bg-fd-background">
        <div
          role="tablist"
          aria-label="Generated files"
          className="flex overflow-x-auto border-fd-border border-b"
        >
          {files.map((f, i) => (
            <button
              key={f.path}
              type="button"
              role="tab"
              aria-selected={i === tab}
              onClick={() => setTab(i)}
              className={`shrink-0 border-fd-border border-r px-4 py-2.5 font-mono text-xs transition-colors ${
                i === tab
                  ? "bg-fd-card text-fd-foreground"
                  : "text-fd-muted-foreground hover:text-fd-foreground"
              }`}
            >
              {f.path.split("/").pop()}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between px-4 pt-3 font-mono text-[11px] text-fd-muted-foreground">
          <span>{file.path}</span>
          <span className="hidden sm:inline">
            regions applied by cli/regions.js
          </span>
        </div>
        <pre className="max-h-[32rem] min-h-[24rem] overflow-auto p-4 font-mono text-[13px] leading-6">
          <code>
            {file.lines.map((line, i) => {
              if (line.cond && !holds(line.cond, options)) return null;
              const added =
                line.cond !== null && !holds(line.cond, previous.current);
              return (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines of a fixed file; the version restarts the flash
                  key={`${file.path}:${i}:${added ? version : 0}`}
                  className={`block ${added ? "line-added" : ""} ${line.cond ? "border-emerald-500/50 border-l-2 -ml-4 pl-[14px]" : ""}`}
                >
                  {line.tokens.length
                    ? line.tokens.map((t, j) => (
                        <span
                          // biome-ignore lint/suspicious/noArrayIndexKey: tokens of a fixed line
                          key={j}
                          className="tok"
                          style={
                            { "--l": t.light, "--d": t.dark } as CSSProperties
                          }
                        >
                          {t.text}
                        </span>
                      ))
                    : " "}
                </span>
              );
            })}
          </code>
        </pre>
      </div>
    </div>
  );
}
