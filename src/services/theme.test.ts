import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isSkinId, SKINS } from "./theme";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("planeswalker skins", () => {
  it("lists Classic plus ten walkers", () => {
    expect(SKINS.map((s) => s.id)).toEqual([
      "classic",
      "chandra",
      "teferi",
      "liliana",
      "ajani",
      "elspeth",
      "ugin",
      "garruk",
      "jace",
      "kaito",
      "tezzeret",
    ]);
  });

  it("validates skin ids", () => {
    expect(isSkinId("chandra")).toBe(true);
    expect(isSkinId("classic")).toBe(true);
    expect(isSkinId("ugin")).toBe(true);
    expect(isSkinId("garruk")).toBe(true);
    expect(isSkinId("jace")).toBe(true);
    expect(isSkinId("kaito")).toBe(true);
    expect(isSkinId("tezzeret")).toBe(true);
    expect(isSkinId("nissa")).toBe(false);
    expect(isSkinId("")).toBe(false);
  });

  it("every skin has three preview swatches", () => {
    for (const s of SKINS) {
      expect(s.swatches).toHaveLength(3);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(0);
    }
  });

  it("every non-classic skin has dark and light CSS palettes", () => {
    const css = readFileSync(join(__dirname, "../index.css"), "utf8");
    for (const s of SKINS) {
      if (s.id === "classic") continue;
      expect(css).toContain(`html[data-skin="${s.id}"]`);
      expect(css).toContain(`html[data-theme="light"][data-skin="${s.id}"]`);
    }
  });
});
