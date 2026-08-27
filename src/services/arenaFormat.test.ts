import { describe, expect, it } from "vitest";
import {
  arenaFormatLabel,
  arenaFormatOf,
  isArchivableFormat,
  isUncoveredFormat,
  localFormatOf,
  metaFormatOf,
} from "./arenaFormat";

describe("arenaFormatOf", () => {
  it("reads Standard's bare queue names", () => {
    expect(arenaFormatOf("Ladder")).toBe("standard");
    expect(arenaFormatOf("Traditional_Ladder")).toBe("standard");
    expect(arenaFormatOf("Play")).toBe("standard");
    expect(arenaFormatOf("Traditional_Play")).toBe("standard");
    expect(arenaFormatOf("Standard_Challenge_20260827")).toBe("standard");
  });

  it("no longer calls every prefixed ladder Standard", () => {
    // The regression this module exists for: `includes("ladder")` swallowed
    // all four of these, so they uploaded as Standard.
    expect(arenaFormatOf("Historic_Ladder")).toBe("historic");
    expect(arenaFormatOf("Historic_Traditional_Ladder")).toBe("historic");
    expect(arenaFormatOf("Alchemy_Ladder")).toBe("alchemy");
    expect(arenaFormatOf("Timeless_Ladder")).toBe("timeless");
  });

  it("files Brawl as Brawl even when the id says Historic", () => {
    // Arena's commander queue was `Historic_Brawl` before the rename, and the
    // old id still turns up in logs. Matching "historic" first would file a
    // singleton commander deck as a 60-card Historic list.
    expect(arenaFormatOf("Historic_Brawl")).toBe("brawl");
    expect(arenaFormatOf("Brawl")).toBe("brawl");
    expect(arenaFormatOf("Play_Brawl")).toBe("brawl");
  });

  it("maps Explorer onto Pioneer, the way the meta feed already does", () => {
    expect(arenaFormatOf("Explorer_Ladder")).toBe("pioneer");
    expect(arenaFormatOf("Explorer_Traditional_Ladder")).toBe("pioneer");
    expect(arenaFormatOf("Pioneer_Ladder")).toBe("pioneer");
  });

  it("recognises limited so draft pools stay out of the deck library", () => {
    expect(arenaFormatOf("QuickDraft_TDM_20260801")).toBe("limited");
    expect(arenaFormatOf("PremierDraft_TDM")).toBe("limited");
    expect(arenaFormatOf("TradDraft_TDM")).toBe("limited");
    expect(arenaFormatOf("Sealed_TDM")).toBe("limited");
    expect(arenaFormatOf("TradSealed_TDM")).toBe("limited");
  });

  it("says unknown rather than guessing Standard", () => {
    expect(arenaFormatOf("Unknown")).toBe("unknown");
    expect(arenaFormatOf("")).toBe("unknown");
    expect(arenaFormatOf(null)).toBe("unknown");
    expect(arenaFormatOf(undefined)).toBe("unknown");
    expect(arenaFormatOf("Momir_Event")).toBe("unknown");
    expect(arenaFormatOf("Pauper_Event")).toBe("unknown");
  });

  it("does not match a queue name embedded in a word", () => {
    // "Displayed" contains "play"; the word-boundary guard keeps it out.
    expect(arenaFormatOf("Displayed_Event")).toBe("unknown");
  });
});

describe("metaFormatOf", () => {
  it("only ever answers with a format the app ships a metagame for", () => {
    expect(metaFormatOf("Ladder")).toBe("standard");
    expect(metaFormatOf("Explorer_Ladder")).toBe("pioneer");
  });

  it("returns null for everything else, so crowd data stays clean", () => {
    // A Historic match counted in a Standard matchup cell is exactly the kind
    // of noise the honest-aggregates rule forbids.
    for (const id of [
      "Historic_Ladder",
      "Alchemy_Ladder",
      "Timeless_Ladder",
      "Historic_Brawl",
      "QuickDraft_TDM",
      "Unknown",
      "",
    ]) {
      expect(metaFormatOf(id)).toBeNull();
    }
  });
});

describe("localFormatOf", () => {
  it("answers with the covered format itself", () => {
    expect(localFormatOf("Ladder", "pioneer")).toBe("standard");
    expect(localFormatOf("Explorer_Ladder", "standard")).toBe("pioneer");
  });

  it("returns null for a format we know is not the page's — never the fallback", () => {
    // The bug: `?? "standard"` made these count as Standard, so a Historic
    // game landed in the Standard matchup table and the overlay named a
    // Standard archetype mid-match.
    for (const id of ["Historic_Ladder", "Alchemy_Ladder", "Timeless_Ladder", "Historic_Brawl", "QuickDraft_TDM"]) {
      expect(localFormatOf(id, "standard")).toBeNull();
    }
  });

  it("falls back only when Arena never named the queue", () => {
    // "We never saw a queue id" is a different state from "we saw one and it
    // was Brawl". The page the user is looking at is the best prior for the
    // first; there is no honest prior for the second.
    expect(localFormatOf("Unknown", "pioneer")).toBe("pioneer");
    expect(localFormatOf("", "standard")).toBe("standard");
    expect(localFormatOf(null, "standard")).toBe("standard");
    expect(localFormatOf("Unknown", null)).toBeNull();
  });

  it("is deliberately weaker than the upload rule on unnamed queues", () => {
    // A wrong row in the crowd rollup is everyone's problem; a wrong row in
    // your own local record is only yours, and visible in the match list.
    expect(metaFormatOf("Unknown")).toBeNull();
    expect(localFormatOf("Unknown", "standard")).toBe("standard");
  });
});

describe("isUncoveredFormat", () => {
  it("flags exactly the queues a Standard/Pioneer page must leave out", () => {
    expect(isUncoveredFormat("Historic_Ladder")).toBe(true);
    expect(isUncoveredFormat("Historic_Brawl")).toBe(true);
    expect(isUncoveredFormat("Alchemy_Ladder")).toBe(true);
    expect(isUncoveredFormat("Timeless_Ladder")).toBe(true);
    expect(isUncoveredFormat("PremierDraft_TDM")).toBe(true);
  });

  it("does not flag covered formats", () => {
    expect(isUncoveredFormat("Ladder")).toBe(false);
    expect(isUncoveredFormat("Traditional_Ladder")).toBe(false);
    expect(isUncoveredFormat("Explorer_Ladder")).toBe(false);
  });

  it("does not flag an unnamed queue as excluded", () => {
    // It drives a count shown to the user ("N matches aren't counted here").
    // Calling an unnamed queue excluded would be a claim we cannot back.
    expect(isUncoveredFormat("Unknown")).toBe(false);
    expect(isUncoveredFormat("")).toBe(false);
    expect(isUncoveredFormat(null)).toBe(false);
  });
});

describe("isArchivableFormat", () => {
  it("accepts every constructed format the tracker can see", () => {
    expect(isArchivableFormat("standard")).toBe(true);
    expect(isArchivableFormat("pioneer")).toBe(true);
    expect(isArchivableFormat("historic")).toBe(true);
    expect(isArchivableFormat("alchemy")).toBe(true);
    expect(isArchivableFormat("timeless")).toBe(true);
    expect(isArchivableFormat("brawl")).toBe(true);
  });

  it("rejects limited and unknown", () => {
    // A draft deck cannot be reimported — the pool is gone — and an unknown
    // queue has no honest label to file the deck under.
    expect(isArchivableFormat("limited")).toBe(false);
    expect(isArchivableFormat("unknown")).toBe(false);
    expect(isArchivableFormat(null)).toBe(false);
    expect(isArchivableFormat(undefined)).toBe(false);
  });
});

describe("arenaFormatLabel", () => {
  it("labels pioneer as Explorer, the name Arena players use", () => {
    expect(arenaFormatLabel("pioneer")).toBe("Explorer");
    expect(arenaFormatLabel("standard")).toBe("Standard");
    expect(arenaFormatLabel("brawl")).toBe("Brawl");
    expect(arenaFormatLabel("unknown")).toBe("Unknown");
  });
});
