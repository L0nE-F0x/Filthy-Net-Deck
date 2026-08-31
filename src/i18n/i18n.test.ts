import { describe, expect, it } from "vitest";
import { detectSystemLocale, normalizeLocale } from "./detect";
import { en } from "./en";
import { es } from "./es";
import { interpolate, getPath } from "./path";
import { lookup, registerCatalogs, t, setResolvedLocale } from "./t";
import { ja } from "./ja";
import { ko } from "./ko";
import { de } from "./de";
import { fr } from "./fr";
import { it as itCat } from "./it";
import { ptBR } from "./pt-BR";

registerCatalogs({
  en,
  es,
  fr,
  de,
  it: itCat,
  "pt-BR": ptBR,
  ja,
  ko,
});

describe("normalizeLocale", () => {
  it("maps Arena-shaped tags onto catalogs", () => {
    expect(normalizeLocale("es-MX")).toBe("es");
    expect(normalizeLocale("es-ES")).toBe("es");
    expect(normalizeLocale("pt")).toBe("pt-BR");
    expect(normalizeLocale("pt-PT")).toBe("pt-BR");
    expect(normalizeLocale("pt-BR")).toBe("pt-BR");
    expect(normalizeLocale("ja-JP")).toBe("ja");
    expect(normalizeLocale("ko-KR")).toBe("ko");
    expect(normalizeLocale("fr_CA")).toBe("fr");
    expect(normalizeLocale("de-AT")).toBe("de");
    expect(normalizeLocale("zh-CN")).toBe("en");
    expect(normalizeLocale("ru")).toBe("en");
    expect(normalizeLocale("")).toBe("en");
    expect(normalizeLocale(undefined)).toBe("en");
  });
});

describe("detectSystemLocale", () => {
  it("returns a known catalog", () => {
    const id = detectSystemLocale();
    expect(["en", "es", "fr", "de", "it", "pt-BR", "ja", "ko"]).toContain(id);
  });
});

describe("t / lookup", () => {
  it("interpolates vars", () => {
    expect(interpolate("Turn {n}", { n: 6 })).toBe("Turn 6");
    expect(interpolate("x", {})).toBe("x");
  });

  it("falls back to English on a missing leaf", () => {
    setResolvedLocale("en");
    expect(t("nav.decks")).toBe("Decks");
    setResolvedLocale("es");
    expect(lookup("es", "nav.decks")).toBe("Mazos");
    expect(lookup("es", "does.not.exist")).toBe("");
  });

  it("keeps every locale in lockstep with English keys", () => {
    const keys = (obj: unknown, prefix = ""): string[] => {
      if (typeof obj !== "object" || obj == null) return [];
      const out: string[] = [];
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (typeof v === "string") out.push(path);
        else out.push(...keys(v, path));
      }
      return out;
    };
    const enKeys = keys(en).sort();
    for (const [name, cat] of [
      ["es", es],
      ["fr", fr],
      ["de", de],
      ["it", itCat],
      ["pt-BR", ptBR],
      ["ja", ja],
      ["ko", ko],
    ] as const) {
      expect(keys(cat).sort(), name).toEqual(enKeys);
    }
    expect(typeof getPath(en, "overlay.hudTitle")).toBe("string");
  });
});
