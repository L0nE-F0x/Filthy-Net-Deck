/**
 * Structural guard for the Stats page extract: the barrel must re-export the
 * real panel components that `src/pages/Stats.tsx` composes. Prevents a bad
 * split from silently dropping a panel (empty barrel / wrong path).
 */
import { describe, expect, it } from "vitest";
import * as stats from "./index";
import { Stats } from "../../pages/Stats";

const REQUIRED = [
  "StatusPanel",
  "SummaryTiles",
  "FormTiles",
  "SplitsPanel",
  "StatsArsenal",
  "DeckBreakdown",
  "MatchHistory",
  "DeckDetail",
] as const;

describe("Stats extract barrel", () => {
  it("exports every My Stats panel as a function component", () => {
    for (const name of REQUIRED) {
      const exp = (stats as Record<string, unknown>)[name];
      expect(exp, `${name} missing from components/stats barrel`).toEqual(
        expect.any(Function),
      );
    }
  });

  it("page entry Stats is still a function component", () => {
    expect(Stats).toEqual(expect.any(Function));
  });
});
