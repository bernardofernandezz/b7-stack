import { useEffect, useRef, useState } from "react";

// From templates/fullstack/README.md › Verification status and RELEASE.md 5.4b: keep in sync. `where` says how it ran.
const TESTS = [
  ["M-T1", "a member of org A never reads org B's notes", "local"],
  ["H-T2", "a removed member is rejected on the very next request", "local"],
  ["H-T1", "a session is dead immediately after sign-out", "local"],
  ["BA-T2", "rate limits hold across 2 app replicas", "Compose"],
  ["C-T2", "a forged X-Forwarded-For does not bypass the limit", "Compose"],
  ["D-T2", "30,000 requests, PostgreSQL connections flat at 3", "Compose"],
  ["S-T1", "webhooks with a bad signature are rejected", "Stripe faked"],
  ["B-T1", "a duplicate webhook changes nothing", "Stripe faked"],
  ["S-T2", "webhooks in reverse order end in the right state", "Stripe faked"],
  [
    "B-T4",
    "50 concurrent webhooks for one subscription serialize",
    "Stripe faked",
  ],
  ["B-T5", "reconciliation repairs a missed webhook", "Stripe faked"],
  [
    "B-T6",
    "no access is granted before Stripe confirms payment",
    "Stripe faked",
  ],
] as const;

/** Ticks through the acceptance tests once the block scrolls into view. */
export function TestRun() {
  const ref = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState<number>(TESTS.length);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setDone(0);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        let n = 0;
        const timer = setInterval(() => {
          n += 1;
          setDone(n);
          if (n >= TESTS.length) clearInterval(timer);
        }, 170);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const finished = done >= TESTS.length;
  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-xl border border-fd-border bg-fd-card font-mono text-[13px]"
    >
      <div className="flex items-center justify-between border-fd-border border-b px-4 py-2.5 text-fd-muted-foreground text-xs">
        <span>$ pnpm test && pnpm exec playwright test</span>
        <span aria-live="polite">
          {finished ? `${TESTS.length} passed` : `${done}/${TESTS.length}`}
        </span>
      </div>
      <ul className="divide-y divide-fd-border">
        {TESTS.map(([id, claim, where], i) => {
          const passed = i < done;
          return (
            <li
              key={id}
              className="grid grid-cols-[1.25rem_4rem_1fr] items-center gap-3 px-4 py-2.5 sm:grid-cols-[1.25rem_4rem_1fr_auto]"
            >
              <span
                className={
                  passed ? "text-emerald-500" : "text-fd-muted-foreground/40"
                }
              >
                {passed ? "✓" : "○"}
              </span>
              <span className="text-fd-muted-foreground">{id}</span>
              <span className={passed ? "" : "text-fd-muted-foreground/60"}>
                {claim}
              </span>
              <span className="hidden rounded-full border border-fd-border px-2 py-0.5 text-[11px] text-fd-muted-foreground sm:inline">
                {where}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
