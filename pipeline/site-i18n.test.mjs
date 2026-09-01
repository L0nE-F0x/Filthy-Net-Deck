/**
 * The marketing site's translations are keyed off `data-i18n` attributes in
 * `website/index.html`, with the English copy left inline as the fallback.
 *
 * That design makes English edits free — you change the markup and nothing
 * else — but it also means a *new* key, or a renamed one, silently ships as
 * English to all seven translated locales with no error anywhere: the page
 * renders, the console is clean, and only a reader of that language notices.
 * AGENTS.md already treats "public copy that doesn't match" as a real defect,
 * so this asserts the catalogs and the markup stay in step.
 *
 * The locale set must equal the app's — src/i18n/locales.ts, the Arena client
 * languages. If Arena adds one, both lists move together.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(root, "website");
const html = readFileSync(join(SITE, "index.html"), "utf8");

/** Non-English catalogs. English is the markup itself, so it has no file. */
const LOCALES = ["es", "fr", "de", "it", "pt-BR", "ja", "ko"];

/** Keys the runtime asks for that never appear as an attribute in the markup. */
const RUNTIME_KEYS = [
  "page.title",
  "page.description",
  "lang.switch",
  "fan.verified",
  "fan.sideboard",
  "fan.deckN",
];

function markupKeys() {
  const keys = new Set(RUNTIME_KEYS);
  for (const m of html.matchAll(/data-i18n(?:-label|-title)?="([^"]+)"/g)) {
    keys.add(m[1]);
  }
  return keys;
}

function catalog(id) {
  return JSON.parse(readFileSync(join(SITE, "i18n", `${id}.json`), "utf8"));
}

describe("marketing site i18n", () => {
  it("ships a catalog for every Arena locale the app supports", () => {
    const appLocales = readFileSync(join(root, "src", "i18n", "locales.ts"), "utf8");
    for (const id of LOCALES) {
      expect(appLocales, `${id} missing from src/i18n/locales.ts`).toContain(`"${id}"`);
      expect(existsSync(join(SITE, "i18n", `${id}.json`)), `${id}.json missing`).toBe(true);
    }
  });

  it.each(LOCALES)("%s translates every key the page can ask for", (id) => {
    const missing = [...markupKeys()].filter((k) => !catalog(id)[k]);
    expect(missing, `untranslated keys in ${id}.json`).toEqual([]);
  });

  it.each(LOCALES)("%s has no keys the page never uses", (id) => {
    const keys = markupKeys();
    const stale = Object.keys(catalog(id)).filter((k) => !keys.has(k));
    expect(stale, `stale keys in ${id}.json — renamed or deleted in index.html`).toEqual([]);
  });

  it.each(LOCALES)("%s keeps the version out of the title", (id) => {
    // The release checklist bumps the version in index.html only. A literal
    // vX.Y.Z baked into a catalog would go stale on the next release.
    const title = catalog(id)["page.title"];
    expect(title).toContain("{version}");
    expect(title).not.toMatch(/v\d+\.\d+\.\d+/);
  });

  it("every catalog agrees on the key set", () => {
    const [first, ...rest] = LOCALES.map((id) => Object.keys(catalog(id)).sort());
    for (const other of rest) expect(other).toEqual(first);
  });
});
