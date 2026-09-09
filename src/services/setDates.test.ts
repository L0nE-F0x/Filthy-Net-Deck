import { describe, expect, it } from "vitest";
import {
  cardHasColor,
  cardMatchesColorFilter,
  cardMatchesSpoiledFilter,
  compareSpoiledNewest,
  countdownLabel,
  daysUntil,
  emptyColorFilter,
  isArenaDropWindow,
  isTokenCard,
  toggleColorLetter,
  toggleColorless,
  toggleMulticolor,
  typeBucket,
  confidenceHint,
  statusLabel,
  uniqueSpoiledDates,
} from "./setDates";

describe("daysUntil / countdownLabel", () => {
  // Fixed "now": 2026-07-20 local noon-ish via explicit nowMs
  const now = Date.parse("2026-07-20T15:30:00");

  it("counts whole days to a future ISO date", () => {
    expect(daysUntil("2026-07-23", now)).toBe(3);
    expect(daysUntil("2026-07-20", now)).toBe(0);
    expect(daysUntil("2026-07-19", now)).toBe(-1);
  });

  it("formats countdown labels", () => {
    expect(countdownLabel(null, now)).toBe("TBA");
    expect(countdownLabel("2026-07-20", now)).toBe("Today");
    expect(countdownLabel("2026-07-21", now)).toBe("Tomorrow");
    expect(countdownLabel("2026-07-25", now)).toBe("5d");
    expect(countdownLabel("2026-07-18", now)).toBe("2d ago");
  });

  it("detects Arena drop window ±1 day", () => {
    expect(isArenaDropWindow("2026-07-20", now)).toBe(true);
    expect(isArenaDropWindow("2026-07-21", now)).toBe(true);
    expect(isArenaDropWindow("2026-07-19", now)).toBe(true);
    expect(isArenaDropWindow("2026-07-22", now)).toBe(false);
  });
});

describe("card helpers", () => {
  it("typeBucket", () => {
    expect(typeBucket("Creature — Human")).toBe("creature");
    expect(typeBucket("Instant")).toBe("instant");
    expect(typeBucket("Legendary Planeswalker — Jace")).toBe("planeswalker");
    expect(typeBucket("Basic Land — Island")).toBe("land");
    expect(typeBucket(undefined)).toBe("other");
  });

  it("cardHasColor treats C as colorless", () => {
    expect(cardHasColor({ colors: [] }, "C")).toBe(true);
    expect(cardHasColor({ colors: ["U"] }, "C")).toBe(false);
    expect(cardHasColor({ colors: ["U", "R"] }, "U")).toBe(true);
  });

  it("isTokenCard reads the flag or the type line", () => {
    expect(isTokenCard({ typeLine: "Token Creature — Illusion", isToken: true })).toBe(true);
    expect(isTokenCard({ typeLine: "Token Planeswalker — Jace" })).toBe(true);
    expect(isTokenCard({ typeLine: "Creature — Human" })).toBe(false);
  });
});

describe("exact colour-identity filter", () => {
  const white = { colors: ["W"] };
  const selesnya = { colors: ["G", "W"] };
  const bant = { colors: ["G", "W", "U"] };
  const gold = { colors: ["U", "R"] };
  const karn = { colors: [] };
  const plains = { colors: [], colorIdentity: ["W"] };

  it("W is mono-white only, not every card that contains W", () => {
    const w = toggleColorLetter(emptyColorFilter(), "W");
    expect(cardMatchesColorFilter(white, w)).toBe(true);
    expect(cardMatchesColorFilter(selesnya, w)).toBe(false);
    expect(cardMatchesColorFilter(bant, w)).toBe(false);
    expect(cardMatchesColorFilter(plains, w)).toBe(true);
    expect(cardMatchesColorFilter(karn, w)).toBe(false);
  });

  it("printed colours beat a broader colour identity", () => {
    const w = toggleColorLetter(emptyColorFilter(), "W");
    const whiteWithGreenAbility = { colors: ["W"], colorIdentity: ["W", "G"] };
    expect(cardMatchesColorFilter(whiteWithGreenAbility, w)).toBe(true);
    const wg = toggleColorLetter(w, "G");
    expect(cardMatchesColorFilter(whiteWithGreenAbility, wg)).toBe(false);
  });

  it("W then G is exactly Selesnya", () => {
    const wg = toggleColorLetter(toggleColorLetter(emptyColorFilter(), "W"), "G");
    expect(cardMatchesColorFilter(selesnya, wg)).toBe(true);
    expect(cardMatchesColorFilter(white, wg)).toBe(false);
    expect(cardMatchesColorFilter(bant, wg)).toBe(false);
    expect(cardMatchesColorFilter(gold, wg)).toBe(false);
  });

  it("click order does not matter — G then W is still Selesnya", () => {
    const gw = toggleColorLetter(toggleColorLetter(emptyColorFilter(), "G"), "W");
    expect(cardMatchesColorFilter(selesnya, gw)).toBe(true);
    expect(cardMatchesColorFilter(bant, gw)).toBe(false);
  });

  it("three letters is that shard/wedge only", () => {
    const wug = toggleColorLetter(
      toggleColorLetter(toggleColorLetter(emptyColorFilter(), "W"), "U"),
      "G",
    );
    expect(cardMatchesColorFilter(bant, wug)).toBe(true);
    expect(cardMatchesColorFilter(selesnya, wug)).toBe(false);
    expect(cardMatchesColorFilter(white, wug)).toBe(false);
  });

  it("clicking a letter again unselects it", () => {
    const off = toggleColorLetter(toggleColorLetter(emptyColorFilter(), "W"), "W");
    expect(off.letters).toEqual([]);
    expect(cardMatchesColorFilter(selesnya, off)).toBe(true);
  });

  it("Multi is every two-or-more-colour card", () => {
    const m = toggleMulticolor(emptyColorFilter());
    expect(cardMatchesColorFilter(selesnya, m)).toBe(true);
    expect(cardMatchesColorFilter(bant, m)).toBe(true);
    expect(cardMatchesColorFilter(gold, m)).toBe(true);
    expect(cardMatchesColorFilter(white, m)).toBe(false);
    expect(cardMatchesColorFilter(karn, m)).toBe(false);
  });

  it("C is colourless only, and picking W clears it", () => {
    const c = toggleColorless(emptyColorFilter());
    expect(cardMatchesColorFilter(karn, c)).toBe(true);
    expect(cardMatchesColorFilter(white, c)).toBe(false);
    const w = toggleColorLetter(c, "W");
    expect(w.colorless).toBe(false);
    expect(cardMatchesColorFilter(white, w)).toBe(true);
  });

  it("Multi and letters are exclusive", () => {
    const w = toggleColorLetter(emptyColorFilter(), "W");
    const m = toggleMulticolor(w);
    expect(m.letters).toEqual([]);
    expect(m.multicolor).toBe(true);
    expect(toggleMulticolor(m).multicolor).toBe(false);
    const wAgain = toggleColorLetter(m, "W");
    expect(wAgain.multicolor).toBe(false);
    expect(wAgain.letters).toEqual(["W"]);
  });
});

describe("labels", () => {
  it("statusLabel + confidenceHint", () => {
    expect(statusLabel("spoiling")).toBe("Spoilers live");
    expect(statusLabel("live_on_arena")).toBe("On Arena");
    expect(confidenceHint("estimated")).toBe("est.");
    expect(confidenceHint("official")).toBe("official");
    expect(confidenceHint(undefined)).toBe("");
  });
});

describe("spoiled-date filter", () => {
  const today = "2026-09-09";

  it("keeps everything on all, drops undated cards on a day filter", () => {
    expect(cardMatchesSpoiledFilter("2026-09-08", "all", today)).toBe(true);
    expect(cardMatchesSpoiledFilter(undefined, "all", today)).toBe(true);
    expect(cardMatchesSpoiledFilter(undefined, "today", today)).toBe(false);
  });

  it("matches today / yesterday / last 3 / this week / a pinned day", () => {
    expect(cardMatchesSpoiledFilter("2026-09-09", "today", today)).toBe(true);
    expect(cardMatchesSpoiledFilter("2026-09-08", "today", today)).toBe(false);
    expect(cardMatchesSpoiledFilter("2026-09-08", "yesterday", today)).toBe(true);
    expect(cardMatchesSpoiledFilter("2026-09-07", "last3", today)).toBe(true);
    expect(cardMatchesSpoiledFilter("2026-09-06", "last3", today)).toBe(false);
    expect(cardMatchesSpoiledFilter("2026-09-03", "week", today)).toBe(true);
    expect(cardMatchesSpoiledFilter("2026-09-02", "week", today)).toBe(false);
    expect(cardMatchesSpoiledFilter("2026-09-08", "on:2026-09-08", today)).toBe(true);
    expect(cardMatchesSpoiledFilter("2026-09-09", "on:2026-09-08", today)).toBe(false);
  });

  it("sorts newest spoiled first and lists unique days newest-first", () => {
    const cards = [
      { name: "Old", spoiledAt: "2026-09-01" },
      { name: "New", spoiledAt: "2026-09-08" },
      { name: "Undated" },
      { name: "Also new", spoiledAt: "2026-09-08" },
    ];
    const sorted = [...cards].sort(compareSpoiledNewest);
    expect(sorted.map((c) => c.name)).toEqual(["Also new", "New", "Old", "Undated"]);
    expect(uniqueSpoiledDates(cards)).toEqual(["2026-09-08", "2026-09-01"]);
  });
});
