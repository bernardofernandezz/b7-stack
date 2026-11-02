import { useEffect, useRef } from "react";
import { Logo } from "./logo";

const KEY = "b7-intro";
const HOLD = 350; // ms the logo sits still before it grows
const GROW = 1400; // ms of exponential growth
const FROM = 1;
const TO = 140; // big enough that the gap between "B" and "7" covers any screen

// Runs before first paint (SSR markup), so a repeat visit never flashes the overlay.
const skipScript = `try{if(sessionStorage.getItem('${KEY}')||matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.dataset.intro='done'}catch(e){document.documentElement.dataset.intro='done'}`;

/** The logo grows exponentially until the screen falls through it, then reveals the page. */
export function Intro() {
  const overlay = useRef<HTMLDivElement>(null);
  const logo = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.intro === "done") return;
    // Client-side navigation does not run skipScript, so check again here.
    let seen = true;
    try {
      seen = !!sessionStorage.getItem(KEY);
    } catch {}
    // Mark as seen only when finished: StrictMode runs this effect twice.
    const done = () => {
      root.dataset.intro = "done";
      try {
        sessionStorage.setItem(KEY, "1");
      } catch {}
    };
    if (seen || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return done();

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(Math.max((now - start - HOLD) / GROW, 0), 1);
      const scale = FROM * (TO / FROM) ** p;
      if (logo.current) logo.current.style.transform = `scale(${scale})`;
      if (overlay.current)
        overlay.current.style.opacity = String(Math.min(1, (1 - p) / 0.25));
      if (p < 1) frame = requestAnimationFrame(tick);
      else done();
    };
    frame = requestAnimationFrame(tick);

    const skip = () => {
      cancelAnimationFrame(frame);
      done();
    };
    addEventListener("pointerdown", skip, { once: true });
    addEventListener("keydown", skip, { once: true });
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("pointerdown", skip);
      removeEventListener("keydown", skip);
    };
  }, []);

  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static string, no user input */}
      <script dangerouslySetInnerHTML={{ __html: skipScript }} />
      <noscript>
        <style>{"#intro{display:none}.reveal{opacity:1;transform:none}"}</style>
      </noscript>
      <div
        id="intro"
        ref={overlay}
        aria-hidden
        className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-fd-background text-fd-foreground"
      >
        <Logo ref={logo} className="w-24" />
      </div>
    </>
  );
}
