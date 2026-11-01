// Feature regions (ADR-014): lines between `#if <cond>` and `#endif` markers, in any comment style
// (`// #if x`, `# #if x`, `-- #if x`, `{/* #if x */}`, `<!-- #if x -->`), are kept only when <cond> holds. Marker lines are always removed.
// <cond> is `name`, `!name` or `name=value`. Regions do not nest.

const MARKER = /^\s*(?:\/\/|#|\{\/\*|<!--|--)\s*#(if|endif)\b\s*([^*\s]*)/;

/** Whether a region condition holds for the enabled features ({ email: "resend", organizations: true, ... }). */
export function holds(cond, features) {
  if (cond.startsWith("!")) return !holds(cond.slice(1), features);
  const [name, value] = cond.split("=");
  const actual = features[name];
  return value === undefined ? Boolean(actual) && actual !== "none" : String(actual) === value;
}

/** Applies the regions in `text`. Throws on unbalanced or nested markers, naming the line. */
export function applyRegions(text, features, file = "<text>") {
  const out = [];
  let open = null;
  text.split("\n").forEach((line, i) => {
    const m = line.match(MARKER);
    if (m?.[1] === "if") {
      if (open) throw new Error(`${file}:${i + 1}: nested #if (regions do not nest)`);
      if (!m[2]) throw new Error(`${file}:${i + 1}: #if without a condition`);
      open = { keep: holds(m[2], features), line: i + 1 };
    } else if (m?.[1] === "endif") {
      if (!open) throw new Error(`${file}:${i + 1}: #endif without #if`);
      open = null;
    } else if (!open || open.keep) {
      out.push(line);
    }
  });
  if (open) throw new Error(`${file}:${open.line}: #if without #endif`);
  return out.join("\n");
}
