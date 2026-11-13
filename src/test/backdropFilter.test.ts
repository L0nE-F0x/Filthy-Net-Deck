import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `backdrop-filter` is only allowed on window chrome and full-screen scrims —
 * things that exist once — plus the three fixed stat tiles on the Daily hero.
 *
 * Why this is a test and not a style note: every element with a backdrop
 * filter is its own compositor layer, and WebKitGTK does not cope with many of
 * them on one page. On 2026-11-13 a blur on the +/− badges in a deck's version
 * history (one badge per swapped card, ~20 on a well-tuned deck) made the main
 * window's renderer allocate ~800 MB/s the moment the deck page opened. Four
 * badges were harmless; twenty were not. So the rule is about *repetition*:
 * never put a backdrop filter on something rendered once per row, card, chip or
 * list item, where the count is decided by the user's data.
 *
 * Adding a selector here means you have checked it renders a fixed, small
 * number of times no matter what the data looks like.
 */
const ALLOWED = new Set([
  ".trailer-backdrop",
  ".sidebar",
  ".topbar",
  ".set-lightbox",
  ".set-drawer-backdrop",
  ".help-backdrop",
  ".daily-hero-stat", // exactly three tiles on the Daily hero
]);

const SRC = join(__dirname, "..");

/** Selectors of every rule whose declarations set a backdrop filter. */
function backdropFilterSelectors(css: string): string[] {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = rule.exec(noComments))) {
    const on = m[2].split(";").some((decl) => {
      const d = /^\s*(?:-webkit-)?backdrop-filter\s*:\s*(.+?)\s*$/i.exec(decl);
      return d !== null && !/^none\b/i.test(d[1]);
    });
    if (!on) continue;
    for (const sel of m[1].split(",")) out.push(sel.trim());
  }
  return out;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("backdrop-filter stays off repeated elements", () => {
  it("finds the rules it is supposed to police", () => {
    // Guards the parser itself: an empty result would pass the next test
    // while checking nothing.
    const found = backdropFilterSelectors(readFileSync(join(SRC, "index.css"), "utf8"));
    expect(found).toContain(".sidebar");
    expect(found).toContain(".topbar");
    expect(
      backdropFilterSelectors(".a, .b { color: red; -webkit-backdrop-filter: blur(2px) } .c { backdrop-filter: none; }"),
    ).toEqual([".a", ".b"]);
  });

  it("only allowlisted selectors use it in the stylesheets", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC).filter((f) => f.endsWith(".css"))) {
      for (const sel of backdropFilterSelectors(readFileSync(file, "utf8"))) {
        if (!ALLOWED.has(sel)) offenders.push(`${sel} (${file.slice(SRC.length + 1)})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no component sets it inline or through a utility class", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC).filter((f) => /\.tsx?$/.test(f))) {
      const text = readFileSync(file, "utf8");
      if (/backdropFilter|WebkitBackdropFilter|backdrop-blur|backdrop-filter/.test(text)) {
        offenders.push(file.slice(SRC.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });
});
