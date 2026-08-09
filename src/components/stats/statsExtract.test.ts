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

  it("page entry Stats is still a function (or memo) component", () => {
    // memo() wraps the page export for parent-render bailout — still a valid
    // component (function or React.memo object with .type).
    const ok =
      typeof Stats === "function" ||
      (typeof Stats === "object" &&
        Stats != null &&
        typeof (Stats as { type?: unknown }).type === "function");
    expect(ok).toBe(true);
  });
});
