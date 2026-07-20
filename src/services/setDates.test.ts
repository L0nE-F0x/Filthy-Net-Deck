import { describe, expect, it } from "vitest";
import {
  cardHasColor,
  countdownLabel,
  daysUntil,
  isArenaDropWindow,
  typeBucket,
  confidenceHint,
  statusLabel,
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
