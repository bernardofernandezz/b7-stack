import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

type Line = {
  text: string;
  tone?: "cmd" | "dim" | "ok" | "accent";
  wait: number;
};

// A replay of create-b7's real prompts (cli/index.js) and the Compose services of configuration 2.
const SCRIPT: Line[] = [
  { text: "$ npm create b7@preview my-saas", tone: "cmd", wait: 900 },
  { text: "┌  create-b7", wait: 350 },
  { text: "│", tone: "dim", wait: 120 },
  { text: "◇  email", tone: "accent", wait: 500 },
  { text: "│  resend", tone: "dim", wait: 350 },
  { text: "◇  Add organizations?", tone: "accent", wait: 500 },
  { text: "│  Yes", tone: "dim", wait: 350 },
  { text: "◇  billing", tone: "accent", wait: 500 },
  { text: "│  stripe", tone: "dim", wait: 400 },
  {
    text: "◆  Created my-saas (fullstack: organizations, resend, stripe)",
    tone: "ok",
    wait: 500,
  },
  { text: "◇  Dependencies installed", tone: "ok", wait: 900 },
  {
    text: "└  Preview release: see README.md › Verification status",
    tone: "dim",
    wait: 700,
  },
  {
    text: "$ cd my-saas && docker compose up -d --build",
    tone: "cmd",
    wait: 1100,
  },
  { text: " ✔ postgres   Healthy", tone: "ok", wait: 300 },
  { text: " ✔ migrate    Exited (0)", tone: "ok", wait: 300 },
  { text: " ✔ app        Healthy", tone: "ok", wait: 300 },
  { text: " ✔ scheduler  Started", tone: "ok", wait: 300 },
  { text: " ✔ caddy      Started", tone: "ok", wait: 500 },
  {
    text: "→ http://localhost   sign up · create an org · subscribe",
    tone: "accent",
    wait: 4000,
  },
];

const TONE = {
  cmd: "text-fd-foreground",
  dim: "text-fd-muted-foreground",
  ok: "text-emerald-600 dark:text-emerald-400",
  accent: "text-sky-600 dark:text-sky-400",
};

/** Replays a create-b7 session line by line and loops. Shows the whole session at once with reduced motion. */
export function Terminal() {
  const [shown, setShown] = useState<number>(SCRIPT.length);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(0);
      setPlaying(true);
    }
  }, []);

  useEffect(() => {
    if (!playing) return;
    const wait = shown === 0 ? 600 : SCRIPT[shown - 1].wait;
    const timer = setTimeout(
      () => setShown((n) => (n >= SCRIPT.length ? 0 : n + 1)),
      wait,
    );
    return () => clearTimeout(timer);
  }, [playing, shown]);

  return (
    <div className="w-full overflow-hidden rounded-xl border border-fd-border bg-fd-card shadow-2xl shadow-black/5 dark:shadow-black/40">
      <div className="flex items-center gap-2 border-fd-border border-b px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-fd-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-fd-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-fd-muted-foreground/25" />
        <span className="ml-2 flex-1 font-mono text-fd-muted-foreground text-xs">
          ~/projects
        </span>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause the replay" : "Play the replay"}
          className="rounded p-1 text-fd-muted-foreground transition hover:bg-fd-accent hover:text-fd-foreground"
        >
          {playing ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setShown(0);
            setPlaying(true);
          }}
          aria-label="Restart the replay"
          className="rounded p-1 text-fd-muted-foreground transition hover:bg-fd-accent hover:text-fd-foreground"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>
      {/* Fixed height so the hero does not jump while lines appear. */}
      <pre
        aria-hidden
        className="h-[30rem] overflow-hidden p-4 font-mono text-[12.5px] leading-6 sm:text-[13px]"
      >
        {SCRIPT.slice(0, shown).map((line) => (
          <div
            key={line.text}
            className={`term-line ${TONE[line.tone ?? "cmd"]}`}
          >
            {line.text}
          </div>
        ))}
        {shown < SCRIPT.length && (
          <span className="term-cursor inline-block h-4 w-2 translate-y-0.5 bg-fd-foreground" />
        )}
      </pre>
    </div>
  );
}
