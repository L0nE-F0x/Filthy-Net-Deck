/**
 * Fixture tests for the Untapped.gg Bo1 ladder decoding (v2.0.3 Bo1 fix).
 *
 * The fixture is the REAL free-tier API payload pair (tags trimmed to the ids
 * the trend references), fetched 2026-07-21 and gzipped verbatim into
 * pipeline/__fixtures__/. It freezes the payload shape so a decoder refactor
 * that changes extraction behavior fails here first. The live pipeline
 * soft-fails to the Bo3 mirror when the API drifts — this suite is the
 * regression net for the code itself.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBo1BoardFromPayloads,
  decodeUntappedDeckString,
  normalizeArchetypeName,
} from "./sources/untapped.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  gunzipSync(
    readFileSync(join(here, "__fixtures__", "untapped-bo1-trend-2026-07-21.json.gz")),
  ).toString("utf-8"),
);

describe("normalizeArchetypeName", () => {
  it("maps Untapped 4-color nicknames onto Goldfish's 4c", () => {
    expect(normalizeArchetypeName("Glint-Eye Reanimator")).toBe("4c reanimator");
    expect(normalizeArchetypeName("Yore Control")).toBe("4c control");
    expect(normalizeArchetypeName("4c Reanimator")).toBe("4c reanimator");
    expect(normalizeArchetypeName("4-Color Control")).toBe("4c control");
    expect(normalizeArchetypeName("Five-Color Ramp")).toBe("5c ramp");
  });

  it("is punctuation/case insensitive", () => {
    expect(normalizeArchetypeName("Mono-White Auras")).toBe(
      normalizeArchetypeName("mono white auras"),
    );
    expect(normalizeArchetypeName("Selesnya Ouroboroid")).toBe(
      "selesnya ouroboroid",
    );
  });
});

describe("buildBo1BoardFromPayloads", () => {
  const board = buildBo1BoardFromPayloads(fixture.tags, fixture.trend);

  it("ranks the real Bo1 ladder board by current popularity", () => {
    expect(board.length).toBeGreaterThanOrEqual(8);
    // 2026-07-21 ladder truth: Mono-White Auras is the most-played Bo1 deck
    // (17.6%) while the tournament (Bo3) board leads with Selesnya Ouroboroid
    // — the whole point of the per-mode boards.
    expect(board[0].name).toBe("Mono-White Auras");
    expect(board[0].sharePct).toBeGreaterThan(10);
    expect(board[0].colors).toEqual(["W"]);
    const names = board.map((b) => b.name);
    expect(names).toContain("Glint-Eye Reanimator");
    // Share must be descending.
    for (let i = 1; i < board.length; i++) {
      expect(board[i].sharePct).toBeLessThanOrEqual(board[i - 1].sharePct);
    }
  });

  it("carries winrate and sample size for every row", () => {
    for (const row of board.slice(0, 8)) {
      expect(row.matches).toBeGreaterThan(1000);
      expect(row.winratePct).toBeGreaterThan(30);
      expect(row.winratePct).toBeLessThan(70);
      expect(row.norm).toBe(normalizeArchetypeName(row.name));
    }
  });

  it("drops junk rows and never throws on empty payloads", () => {
    expect(buildBo1BoardFromPayloads([], {})).toEqual([]);
    expect(buildBo1BoardFromPayloads(null, null)).toEqual([]);
  });
});

describe("decodeUntappedDeckString", () => {
  // Real "ds" payloads from the free decks endpoint, 2026-07-21 (period 722).
  const GOLGARI_CONTROL_DS =
    "AAQAAQ2HBc0_lZAZxv0ShAS0Kv5byziuA4m0A_j8BsPnCKa6AgWnriHxqAuohgHIxATDpQYBltc1B6QumL0BnPcjr_UH9_QD-p8Q4gMBBo0FAA";
  const SECOND_DS =
    "AAQAAQ2HBQUB-l6jyiC90gu9XBkDyfMDkoYEvfYCi58LBrXrAfLCH4nnDObBB8nyAtSiCwW86wG8gUC--QGvAroCBYfYLc5C_bEK9p4LlAEAAA";

  it("decodes a real Bo1 deck string into a 60-card list", () => {
    const cards = decodeUntappedDeckString(GOLGARI_CONTROL_DS);
    expect(cards).not.toBeNull();
    expect(cards.reduce((n, c) => n + c.count, 0)).toBe(60);
    expect(cards.length).toBe(27); // distinct titleIds
    // Quantity-group structure: 13×1, 5×2, 1×3, 7×4 + one 6-of (basics).
    const byQty = {};
    for (const c of cards) byQty[c.count] = (byQty[c.count] || 0) + 1;
    expect(byQty).toEqual({ 1: 13, 2: 5, 3: 1, 4: 7, 6: 1 });
    // Delta decoding: known titleIds — Forest opens, Swamp is the 6-of.
    expect(cards[0]).toEqual({ titleId: 647, count: 1 });
    expect(cards[cards.length - 1]).toEqual({ titleId: 653, count: 6 });
    // Every titleId positive and sane.
    for (const c of cards) expect(c.titleId).toBeGreaterThan(0);
  });

  it("decodes a second real payload to a legal-size deck", () => {
    const cards = decodeUntappedDeckString(SECOND_DS);
    expect(cards).not.toBeNull();
    expect(cards.reduce((n, c) => n + c.count, 0)).toBeGreaterThanOrEqual(60);
  });

  it("returns null for junk instead of throwing", () => {
    expect(decodeUntappedDeckString("")).toBeNull();
    expect(decodeUntappedDeckString("AAAA")).toBeNull();
    expect(decodeUntappedDeckString("not base64 at all!!")).toBeNull();
    expect(decodeUntappedDeckString(GOLGARI_CONTROL_DS.slice(0, 20))).toBeNull();
  });
});
