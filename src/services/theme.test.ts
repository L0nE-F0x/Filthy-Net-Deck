import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isSkinId, SKINS } from "./theme";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../index.css"), "utf8");
const themeSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "theme.ts"),
  "utf8",
);
const indexHtml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../index.html"),
  "utf8",
);

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
    for (const s of SKINS) {
      if (s.id === "classic") continue;
      expect(css).toContain(`html[data-skin="${s.id}"]`);
      expect(css).toContain(`html[data-theme="light"][data-skin="${s.id}"]`);
    }
  });
});

describe("native form controls follow the app theme", () => {
  it("declares dark color-scheme by default and light when themed", () => {
    expect(css).toMatch(/html\s*\{[^}]*color-scheme:\s*dark/s);
    expect(css).toMatch(/html\[data-theme="light"\][\s\S]*?color-scheme:\s*light/);
    expect(indexHtml).toMatch(/name="color-scheme"/);
  });

  it("strips native <select> appearance so WebKitGTK cannot paint a white combo", () => {
    expect(css).toMatch(/select\s*\{[^}]*appearance:\s*none/s);
    expect(css).toMatch(/\.fnd-select\s*\{[^}]*appearance:\s*none/s);
    expect(css).not.toMatch(/\.fnd-select\s*\{[^}]*appearance:\s*auto/s);
    expect(themeSrc).toMatch(/root\.style\.colorScheme\s*=/);
  });
});
