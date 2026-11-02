import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { ArrowRight, Check, Copy, Minus } from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { Intro } from "@/components/intro";
import { Configurator } from "@/components/landing/configurator";
import { Terminal } from "@/components/landing/terminal";
import { TestRun } from "@/components/landing/test-run";
import { Logo } from "@/components/logo";
import { baseOptions } from "@/lib/layout.shared";
import { gitConfig } from "@/lib/shared";
import { templateCode } from "@/lib/template-code";

export const Route = createFileRoute("/")({
  component: Home,
  loader: () => templateCode(),
});

const COMMAND = "npm create b7@preview my-app";
const GITHUB = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;
const VERIFICATION = `${GITHUB}/blob/main/templates/fullstack/README.md#verification-status`;

// From STRATEGY.md › The market: keep both in sync. true = included, false = not, a string = partly or planned.
const COMPARISON: [string, ...(boolean | string)[]][] = [
  ["Email sign-up with verification and reset", true, false, "partly", true],
  ["Organizations, roles, invitations", true, false, false, true],
  ["Tenant isolation covered by tests", true, false, false, "varies"],
  ["Stripe with verified webhooks", true, false, false, true],
  [
    "Duplicate and out-of-order webhooks, reconciliation",
    true,
    false,
    false,
    "varies",
  ],
  [
    "Production deploy (Compose, Caddy, TLS)",
    true,
    false,
    "some targets",
    "varies",
  ],
  ["Acceptance tests you run yourself", true, false, false, "varies"],
  ["Updates after you generate", "planned", false, false, "varies"],
  ["Open source", true, true, true, false],
  ["Price", "free", "free", "free", "$200–300"],
];
const COLUMNS = ["B7", "create-t3-app", "Better-T-Stack", "Paid boilerplates"];

const TARGETS = [
  {
    name: "Docker Compose",
    tag: "available",
    text: "PostgreSQL, migrations, the app and Caddy with automatic HTTPS. The same stack on a laptop, a $5 VPS or any container platform.",
    stack: ["TanStack Start", "oRPC", "PostgreSQL", "Caddy"],
  },
  {
    name: "Serverless",
    tag: "planned",
    text: "The same app built through a Nitro preset, with a managed PostgreSQL. No server to run.",
    stack: ["Nitro", "Vercel · Netlify · Cloudflare", "Neon · Supabase"],
  },
];

const LATER = [
  ["Web", "stacks/web"],
  ["API", "stacks/api"],
  ["Systems", "stacks/systems"],
  ["Intelligence", "stacks/intelligence"],
];

function Home() {
  const files = Route.useLoaderData();
  return (
    <HomeLayout {...baseOptions()}>
      <Intro />
      <main className="mx-auto w-full max-w-[1344px] px-4 sm:px-8 lg:px-12">
        <Hero />
        <Section
          index="01"
          title="Toggle a feature. Watch the code change."
          lead="This runs create-b7's own rules and region engine in your browser, on the real template files. What you see is what you get."
        >
          <Configurator files={files} />
        </Section>
        <Section
          index="02"
          title="Proof, not promises."
          lead="The hard parts of a SaaS are the ones that fail quietly. Each claim below is an acceptance test in the generated project."
        >
          <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
            <TestRun />
            <div className="flex flex-col gap-4 text-fd-muted-foreground text-sm">
              <p>
                <span className="text-fd-foreground">
                  Tenant scoping is not a convention.
                </span>{" "}
                Every procedure gets its scope from the session, never from
                input, and isolation is tested.
              </p>
              <p>
                <span className="text-fd-foreground">
                  Billing state comes from Stripe, not from event payloads.
                </span>{" "}
                Webhooks are verified, deduplicated in an inbox, serialized with
                a row lock and repaired daily.
              </p>
              <p>
                Labels say where each test ran. Deployed runs on a public host
                are still pending,{" "}
                <a
                  href={VERIFICATION}
                  className="text-fd-foreground underline underline-offset-4"
                >
                  see the verification status
                </a>
                .
              </p>
            </div>
          </div>
        </Section>
        <Section
          index="03"
          title="What you would otherwise pay for."
          lead="Free starters stop at the skeleton. Paid boilerplates ship the features once and never again."
        >
          <Comparison />
        </Section>
        <Section
          index="04"
          title="Ship it anywhere."
          lead="One app, two targets. Same modules, same rules, same tests."
        >
          <div className="grid gap-px overflow-hidden rounded-xl border border-fd-border bg-fd-border md:grid-cols-2">
            {TARGETS.map((t) => (
              <a
                key={t.name}
                href="/docs/stacks/fullstack#targets"
                className="group flex flex-col gap-4 bg-fd-background p-8 transition-colors hover:bg-fd-accent/40"
              >
                <span className="flex items-center justify-between gap-4">
                  <h3 className="font-medium text-2xl tracking-tight">
                    {t.name}
                  </h3>
                  <span className="rounded-full border border-fd-border px-2 py-0.5 font-mono text-fd-muted-foreground text-xs">
                    {t.tag}
                  </span>
                </span>
                <p className="max-w-md text-fd-muted-foreground text-sm">
                  {t.text}
                </p>
                <ul className="mt-auto flex flex-wrap gap-2 font-mono text-xs">
                  {t.stack.map((s) => (
                    <li
                      key={s}
                      className="rounded-full bg-fd-accent px-2.5 py-1"
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              </a>
            ))}
          </div>
        </Section>
        <Section
          index="05"
          title="Built for the agent in your editor."
          lead="Explicit layers and written rules are what coding agents need to get it right the first time."
        >
          <ul className="grid gap-px overflow-hidden rounded-xl border border-fd-border bg-fd-border sm:grid-cols-3">
            {[
              ["/llms.txt", "An index of every doc, for agents", true],
              ["/llms-full.txt", "The whole documentation in one file", true],
              [
                "AGENTS.md",
                "Module boundaries, the authorization chain, tenant and billing rules in every project",
                false,
              ],
            ].map(([name, text, live]) => (
              <li
                key={name as string}
                className="flex flex-col gap-2 bg-fd-background p-6"
              >
                {live ? (
                  <a
                    href={name as string}
                    className="font-mono text-sm underline underline-offset-4"
                  >
                    {name}
                  </a>
                ) : (
                  <span className="flex items-center gap-2 font-mono text-sm">
                    {name}
                    <span className="rounded-full border border-fd-border px-2 py-0.5 text-[11px] text-fd-muted-foreground">
                      next
                    </span>
                  </span>
                )}
                <p className="text-fd-muted-foreground text-sm">{text}</p>
              </li>
            ))}
          </ul>
        </Section>
        <section className="flex flex-col items-center gap-6 border-fd-border border-t py-32 text-center">
          <h2 className="max-w-3xl font-medium text-4xl tracking-tight sm:text-5xl">
            Stop rebuilding auth and billing. Ship the product.
          </h2>
          <Command />
          <p className="text-fd-muted-foreground text-sm">
            Later: B7{" "}
            {LATER.map(([name, href], i) => (
              <span key={name}>
                <a
                  href={`/docs/${href}`}
                  className="underline underline-offset-4 hover:text-fd-foreground"
                >
                  {name}
                </a>
                {i < LATER.length - 1 ? ", " : ""}
              </span>
            ))}{" "}
            profiles, after Fullstack 1.0.
          </p>
        </section>
      </main>
      <footer className="border-fd-border border-t">
        <div className="mx-auto flex w-full max-w-[1344px] flex-col gap-4 px-4 py-8 text-fd-muted-foreground text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <span className="flex items-center gap-2">
            <Logo className="h-3" /> MIT License
          </span>
          <span className="flex gap-6">
            <Link
              to="/docs/$"
              params={{ _splat: "" }}
              className="hover:text-fd-foreground"
            >
              Docs
            </Link>
            <a href={GITHUB} className="hover:text-fd-foreground">
              GitHub
            </a>
          </span>
        </div>
      </footer>
    </HomeLayout>
  );
}

function Hero() {
  const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;
  return (
    <section className="grid items-center gap-12 py-20 sm:py-28 lg:grid-cols-[1fr_minmax(0,34rem)]">
      <div className="flex flex-col items-start gap-8">
        <span
          style={delay(0)}
          className="reveal rounded-full border border-fd-border px-3 py-1 font-mono text-fd-muted-foreground text-xs"
        >
          v0.2 preview · MIT
        </span>
        <h1
          style={delay(80)}
          className="reveal max-w-3xl font-medium text-5xl tracking-tight sm:text-7xl"
        >
          The SaaS starter
          <br />
          <span className="font-pixel text-fd-muted-foreground">
            you'd otherwise pay for.
          </span>
        </h1>
        <p
          style={delay(160)}
          className="reveal max-w-xl text-fd-muted-foreground text-lg"
        >
          Organizations, Stripe billing, email and a production deploy, each
          backed by an acceptance test. Open source, no lock-in, and a project
          you own line by line.
        </p>
        <div
          style={delay(240)}
          className="reveal flex flex-wrap items-center gap-3"
        >
          <a
            href="#configure"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-fd-foreground px-5 font-medium text-fd-background text-sm transition hover:bg-fd-foreground/90 active:scale-[0.98]"
          >
            Configure yours <ArrowRight className="size-4" />
          </a>
          <Link
            to="/docs/$"
            params={{ _splat: "" }}
            className="inline-flex h-10 items-center rounded-full border border-fd-border px-5 font-medium text-sm transition hover:bg-fd-accent active:scale-[0.98]"
          >
            Docs
          </Link>
          <a
            href={GITHUB}
            className="inline-flex h-10 items-center rounded-full border border-fd-border px-5 font-medium text-sm transition hover:bg-fd-accent active:scale-[0.98]"
          >
            GitHub
          </a>
        </div>
        <div style={delay(320)} className="reveal max-w-full">
          <Command />
        </div>
      </div>
      <div style={delay(400)} className="reveal min-w-0">
        <Terminal />
      </div>
    </section>
  );
}

function Comparison() {
  const cell = (v: boolean | string) =>
    v === true ? (
      <Check className="mx-auto size-4 text-emerald-500" aria-label="Yes" />
    ) : v === false ? (
      <Minus
        className="mx-auto size-4 text-fd-muted-foreground/40"
        aria-label="No"
      />
    ) : (
      <span className="font-mono text-xs">{v}</span>
    );
  return (
    <div className="overflow-x-auto rounded-xl border border-fd-border">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-fd-border border-b">
            <th className="p-4 text-left font-normal text-fd-muted-foreground">
              <span className="sr-only">Feature</span>
            </th>
            {COLUMNS.map((c, i) => (
              <th
                key={c}
                className={`p-4 text-center font-medium ${i === 0 ? "bg-fd-accent/50" : ""}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-fd-border">
          {COMPARISON.map(([feature, ...values]) => (
            <tr key={feature}>
              <th scope="row" className="p-4 text-left font-normal">
                {feature}
              </th>
              {values.map((v, i) => (
                <td
                  key={COLUMNS[i]}
                  className={`p-4 text-center ${i === 0 ? "bg-fd-accent/50" : ""}`}
                >
                  {cell(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Command() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(COMMAND).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      className="inline-flex max-w-full items-center gap-3 rounded-full border border-fd-border bg-fd-card px-4 py-2 font-mono text-sm transition hover:border-fd-muted-foreground/40"
    >
      <span className="text-fd-muted-foreground">$</span>
      <span className="truncate">{COMMAND}</span>
      {copied ? (
        <Check className="size-4 shrink-0" />
      ) : (
        <Copy className="size-4 shrink-0 text-fd-muted-foreground" />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : "Copy command"}
      </span>
    </button>
  );
}

function Section({
  index,
  title,
  lead,
  children,
}: {
  index: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  // The configurator is the hero's "Configure yours" target.
  const id = index === "01" ? "configure" : undefined;
  return (
    <section
      id={id}
      className="flex scroll-mt-16 flex-col gap-10 border-fd-border border-t py-24"
    >
      <div className="flex flex-col gap-3">
        <span className="font-pixel text-fd-muted-foreground text-sm">
          {index}
        </span>
        <h2 className="font-medium text-3xl tracking-tight sm:text-4xl">
          {title}
        </h2>
        <p className="max-w-2xl text-fd-muted-foreground">{lead}</p>
      </div>
      {children}
    </section>
  );
}
