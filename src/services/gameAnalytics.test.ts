import { describe, expect, it } from "vitest";
import type { Deck } from "../types/meta";
import type { TrackedGame, TrackedMatch } from "../types/tracker";
import {
  deckMatchupMatrix,
  gamePlayDrawSplit,
  pct,
  pts,
  recentFormString,
  sideboardSplit,
} from "./gameAnalytics";

function deck(
  id: string,
  archetype: string,
  cards: { name: string; land?: boolean }[],
  keyCards: string[] = [],
): Deck {
  return {
    id,
    name: archetype,
    format: "standard",
    mode: "bo1",
    tier: 1,
    colors: ["U", "R"],
    archetype,
    description: "",
    mainboard: cards.map((c) => ({ count: 4, name: c.name, land: c.land })),
    sideboard: [],
    matchups: [],
    sideboardGuide: [],
    arenaImport: "",
    sources: [],
    keyCards,
  };
}

const izzet = deck(
  "std-izzet",
  "Izzet Prowess",
  [
    { name: "Monastery Swiftspear" },
    { name: "Slickshot Show-Off" },
    { name: "Play with Fire" },
    { name: "Mountain", land: true },
  ],
  ["Monastery Swiftspear"],
);

const domain = deck("std-domain", "Domain", [
  { name: "Leyline Binding" },
  { name: "Atraxa, Grand Unifier" },
  { name: "Herd Migration" },
  { name: "Forest", land: true },
]);

const NAMES: Record<number, string> = {
  1: "Monastery Swiftspear",
  2: "Slickshot Show-Off",
  3: "Play with Fire",
  9: "Mountain",
  11: "Leyline Binding",
  12: "Atraxa, Grand Unifier",
  13: "Herd Migration",
};
const resolve = (id: number) => NAMES[id] ?? null;

let seq = 0;
function match(
  over: Partial<TrackedMatch> & { games: TrackedGame[] },
): TrackedMatch {
  seq++;
  return {
    matchId: `m${seq}`,
    startedAt: seq * 1000,
    endedAt: seq * 1000 + 1,
    eventId: over.bestOf === 3 ? "Traditional_Ladder" : "Ladder",
    bestOf: 1,
    myTeamId: 1,
    result: "win",
    ...over,
  };
}

describe("gamePlayDrawSplit", () => {
  it("counts every stamped, decided game — including post-board games", () => {
    const s = gamePlayDrawSplit([
      match({
        bestOf: 3,
        result: "win",
        games: [
          { winningTeamId: 1, onPlay: true }, // play win
          { winningTeamId: 2, onPlay: false }, // draw loss
          { winningTeamId: 1, onPlay: false }, // draw win
        ],
      }),
      match({
        result: "loss",
        games: [{ winningTeamId: 2, onPlay: true }], // play loss
      }),
    ]);
    expect(s.play).toEqual({ wins: 1, games: 2, rate: 0.5 });
    expect(s.draw).toEqual({ wins: 1, games: 2, rate: 0.5 });
    expect(s.gap).toBe(0);
  });

  it("excludes games missing a winner or an on-play stamp, never guessing", () => {
    const s = gamePlayDrawSplit([
      match({
        games: [
          { winningTeamId: 1 }, // no onPlay → excluded
          { onPlay: true }, // no winner → excluded
          { winningTeamId: 1, onPlay: true },
        ],
      }),
    ]);
    expect(s.play).toEqual({ wins: 1, games: 1, rate: 1 });
    expect(s.draw.games).toBe(0);
    expect(s.draw.rate).toBeNull();
    expect(s.gap).toBeNull();
  });

  it("is empty-safe", () => {
    const s = gamePlayDrawSplit([]);
    expect(s.play.rate).toBeNull();
    expect(s.gap).toBeNull();
  });
});

describe("sideboardSplit", () => {
  it("splits Bo3 into game 1 vs post-board and reports the delta", () => {
    const s = sideboardSplit([
      match({
        bestOf: 3,
        result: "win",
        games: [
          { winningTeamId: 2 }, // g1 loss
          { winningTeamId: 1 }, // post win
          { winningTeamId: 1 }, // post win
        ],
      }),
      match({
        bestOf: 3,
        result: "win",
        games: [
          { winningTeamId: 1 }, // g1 win
          { winningTeamId: 1 }, // post win
        ],
      }),
    ]);
    expect(s.g1).toEqual({ wins: 1, games: 2, rate: 0.5 });
    expect(s.post).toEqual({ wins: 3, games: 3, rate: 1 });
    expect(s.delta).toBe(0.5);
    expect(s.matchesConsidered).toBe(2);
  });

  it("ignores Bo1 matches entirely", () => {
    const s = sideboardSplit([
      match({ games: [{ winningTeamId: 1 }] }),
      match({ games: [{ winningTeamId: 2 }] }),
    ]);
    expect(s.g1.games).toBe(0);
    expect(s.post.games).toBe(0);
    expect(s.matchesConsidered).toBe(0);
  });

  it("skips Bo3 matches whose games carry no winners", () => {
    const s = sideboardSplit([match({ bestOf: 3, games: [{}, {}] })]);
    expect(s.matchesConsidered).toBe(0);
    expect(s.delta).toBeNull();
  });
});

describe("deckMatchupMatrix", () => {
  it("aggregates match record and game splits per inferred archetype", () => {
    const rows = deckMatchupMatrix(
      [
        match({
          bestOf: 3,
          result: "win",
          opponentSeen: [1, 2, 3],
          games: [
            { winningTeamId: 1 },
            { winningTeamId: 2 },
            { winningTeamId: 1 },
          ],
        }),
        match({
          bestOf: 3,
          result: "loss",
          opponentSeen: [1, 2],
          games: [{ winningTeamId: 2 }, { winningTeamId: 2 }],
        }),
        match({
          result: "win",
          opponentSeen: [11, 12, 13],
          games: [{ winningTeamId: 1 }],
        }),
      ],
      resolve,
      [izzet, domain],
    );

    expect(rows.map((r) => r.archetype)).toEqual(["Izzet Prowess", "Domain"]);
    const iz = rows[0];
    expect(iz.deckId).toBe("std-izzet");
    expect([iz.wins, iz.losses]).toEqual([1, 1]);
    expect(iz.rate).toBe(0.5);
    expect(iz.g1).toEqual({ wins: 1, games: 2, rate: 0.5 });
    expect(iz.post).toEqual({ wins: 1, games: 3, rate: 1 / 3 });
    expect(iz.form).toBe("WL"); // win then loss chronological
    const dom = rows[1];
    expect([dom.wins, dom.losses]).toEqual([1, 0]);
    expect(dom.g1).toEqual({ wins: 1, games: 1, rate: 1 });
  });

  it("tracks play/draw tallies when onPlay is stamped", () => {
    const rows = deckMatchupMatrix(
      [
        match({
          result: "win",
          opponentSeen: [1, 2, 3],
          games: [{ winningTeamId: 1, onPlay: true }],
        }),
        match({
          result: "loss",
          opponentSeen: [1, 2, 3],
          games: [{ winningTeamId: 2, onPlay: false }],
        }),
      ],
      resolve,
      [izzet],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].play).toEqual({ wins: 1, games: 1, rate: 1 });
    expect(rows[0].draw).toEqual({ wins: 0, games: 1, rate: 0 });
    expect(rows[0].form).toBe("WL");
  });

  it("skips matches with too little evidence instead of inventing an Unknown bucket", () => {
    const rows = deckMatchupMatrix(
      [
        match({ result: "win", opponentSeen: [9], games: [{ winningTeamId: 1 }] }),
        match({ result: "loss", opponentSeen: [], games: [{ winningTeamId: 2 }] }),
      ],
      resolve,
      [izzet, domain],
    );
    expect(rows).toEqual([]);
  });

  it("skips draws/unknown results and returns [] without candidates", () => {
    const drawMatch = match({
      result: "draw",
      opponentSeen: [1, 2, 3],
      games: [{ winningTeamId: 1 }],
    });
    expect(deckMatchupMatrix([drawMatch], resolve, [izzet])).toEqual([]);
    expect(deckMatchupMatrix([drawMatch], resolve, [])).toEqual([]);
  });
});

describe("formatting", () => {
  it("pct", () => {
    expect(pct(null)).toBe("—");
    expect(pct(0.615)).toBe("62%");
  });
  it("pts is signed", () => {
    expect(pts(0.09)).toBe("+9 pts");
    expect(pts(-0.04)).toBe("−4 pts");
    expect(pts(0)).toBe("±0 pts");
    expect(pts(null)).toBe("—");
  });
});

describe("recentFormString", () => {
  it("builds oldest→newest W/L over the window", () => {
    const s = recentFormString(
      [
        match({ result: "win", games: [] }),
        match({ result: "loss", games: [] }),
        match({ result: "draw", games: [] }),
        match({ result: "win", games: [] }),
      ],
      10,
    );
    expect(s).toBe("WLW");
  });
});
