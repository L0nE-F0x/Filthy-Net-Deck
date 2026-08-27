import { describe, expect, it } from "vitest";
import {
  personalRecords,
  mergeMatchups,
  readDelta,
  archetypeForMatch,
  subjectArchetype,
  MIN_PERSONAL_GAMES,
  type PersonalRecord,
  type ResolveOpts,
} from "./personalMatchups";
import type { Matchup } from "./crowdMeta";
import type { TrackedMatch } from "../../types/tracker";
import type { Deck, FormatId } from "../../types/meta";
import { localFormatOf } from "../arenaFormat";

const STANDARD = "standard" as FormatId;

function match(over: Partial<TrackedMatch> = {}): TrackedMatch {
  return {
    matchId: Math.random().toString(36).slice(2),
    startedAt: 1,
    endedAt: 2,
    eventId: "Ladder",
    bestOf: 1,
    myTeamId: 1,
    games: [],
    result: "win",
    ...over,
  };
}

/** Minimal deck the inference can latch onto — it reads `mainboard`. */
const redDeck = {
  id: "d1",
  name: "Mono-Red Aggro",
  archetype: "Mono-Red Aggro",
  format: STANDARD,
  mode: "bo1",
  tier: 1,
  mainboard: [
    { name: "Monastery Swiftspear", count: 4 },
    { name: "Kumano Faces Kakkazan", count: 4 },
    { name: "Play with Fire", count: 4 },
  ],
} as unknown as Deck;

/** A second candidate so the inference has something to discriminate against. */
const blueDeck = {
  id: "d2",
  name: "Azorius Control",
  archetype: "Azorius Control",
  format: STANDARD,
  mode: "bo1",
  tier: 1,
  mainboard: [
    { name: "Wrath of the Skies", count: 4 },
    { name: "Restless Anchorage", count: 4 },
    { name: "Get Lost", count: 4 },
  ],
} as unknown as Deck;

/** No inference — forces the manual-tag path. */
const noInfer: ResolveOpts = {
  resolveName: () => null,
  candidates: [],
  formatFor: () => STANDARD,
};

describe("archetypeForMatch", () => {
  it("uses a manual tag when one exists — the user's label beats a guess", () => {
    const opts: ResolveOpts = { ...noInfer, tagFor: () => "Azorius Control" };
    expect(archetypeForMatch(match(), opts)).toBe("standard-azorius-control");
  });

  it("returns null rather than guessing when nothing is known", () => {
    expect(archetypeForMatch(match(), noInfer)).toBeNull();
  });

  it("returns null when the format is unknown", () => {
    const opts: ResolveOpts = { ...noInfer, tagFor: () => "Azorius Control", formatFor: () => null };
    expect(archetypeForMatch(match(), opts)).toBeNull();
  });

  it("keeps a Historic game out of the Standard record, tag and all", () => {
    // End-to-end guard on the bug this page shipped with: the queue resolver
    // matched `"ladder"` inside `Historic_Ladder` and called it Standard, so a
    // Historic win against Mono-Red inflated the *Standard* Mono-Red row. The
    // manual-tag path is used here because it is the strongest input there is —
    // even an explicit user label must not create a row in the wrong format.
    const opts: ResolveOpts = {
      ...noInfer,
      tagFor: () => "Mono-Red Aggro",
      formatFor: (m) => localFormatOf(m.eventId, STANDARD),
    };
    expect(archetypeForMatch(match({ eventId: "Ladder" }), opts)).toBe(
      "standard-mono-red-aggro",
    );
    for (const eventId of ["Historic_Ladder", "Alchemy_Ladder", "Historic_Brawl"]) {
      expect(archetypeForMatch(match({ eventId }), opts)).toBeNull();
    }
  });

  it("falls back to inference when no tag is set", () => {
    const names: Record<number, string> = {
      1: "Monastery Swiftspear",
      2: "Kumano Faces Kakkazan",
      3: "Play with Fire",
    };
    const opts: ResolveOpts = {
      resolveName: (id) => names[id] ?? null,
      candidates: [redDeck, blueDeck],
      formatFor: () => STANDARD,
    };
    const slug = archetypeForMatch(match({ opponentSeen: [1, 2, 3] }), opts);
    expect(slug).toBe("standard-mono-red-aggro");
  });
});

describe("personalRecords", () => {
  const tagged = (tag: string): ResolveOpts => ({ ...noInfer, tagFor: () => tag });

  it("counts only the covered-format games, and leaves the rest out entirely", () => {
    // Six wins tagged the same archetype; two of them are Historic. The row
    // must read 4 games, not 6 — an inflated personal winrate is the thing the
    // user actually acts on when they pick a deck for the ladder.
    const rows = personalRecords(
      [
        match({ eventId: "Ladder", result: "win" }),
        match({ eventId: "Ladder", result: "win" }),
        match({ eventId: "Traditional_Ladder", result: "loss" }),
        match({ eventId: "Unknown", result: "win" }),
        match({ eventId: "Historic_Ladder", result: "win" }),
        match({ eventId: "Historic_Brawl", result: "win" }),
      ],
      {
        ...tagged("Mono-Red Aggro"),
        formatFor: (m) => localFormatOf(m.eventId, STANDARD),
      },
    );
    expect(rows).toHaveLength(1);
    // The unnamed queue still counts — unknown is not known-wrong.
    expect(rows[0]).toMatchObject({ wins: 3, losses: 1, games: 4 });
  });

  it("tallies wins and losses per archetype", () => {
    const rows = personalRecords(
      [match({ result: "win" }), match({ result: "loss" }), match({ result: "win" })],
      tagged("Mono-Red Aggro"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ wins: 2, losses: 1, games: 3 });
    expect(Math.round(rows[0].winrate!)).toBe(67);
  });

  it("counts a draw as played but leaves it out of the rate", () => {
    const rows = personalRecords(
      [match({ result: "win" }), match({ result: "draw" })],
      tagged("Mono-Red Aggro"),
    );
    expect(rows[0].games).toBe(2);
    expect(rows[0].winrate).toBe(100);
  });

  it("skips matches whose archetype cannot be determined", () => {
    expect(personalRecords([match(), match()], noInfer)).toEqual([]);
  });
});

function rec(over: Partial<PersonalRecord> = {}): PersonalRecord {
  return {
    slug: "standard-mono-red-aggro",
    label: "Mono Red Aggro",
    wins: 3,
    losses: 12,
    games: 15,
    winrate: 20,
    ...over,
  };
}

function comm(over: Partial<Matchup> = {}): Matchup {
  return {
    subject: "standard-azorius-control",
    subjectLabel: "Azorius Control",
    opponent: "standard-mono-red-aggro",
    opponentLabel: "Mono Red Aggro",
    games: 1200,
    wins: 564,
    winrate: 47,
    low: 44,
    high: 50,
    contributors: 80,
    ...over,
  };
}

describe("mergeMatchups", () => {
  it("computes the delta that the page exists for", () => {
    const [m] = mergeMatchups([rec()], [comm()]);
    expect(m.you).not.toBeNull();
    expect(m.community).not.toBeNull();
    expect(Math.round(m.delta!)).toBe(-27);
  });

  it("withholds a delta when your own sample is thin", () => {
    const [m] = mergeMatchups([rec({ wins: 1, losses: 2, games: 3, winrate: 33 })], [comm()]);
    expect(m.yourSampleThin).toBe(true);
    expect(m.delta).toBeNull();
  });

  it("keeps archetypes only one side knows about", () => {
    const merged = mergeMatchups(
      [rec({ slug: "standard-only-mine", label: "Only Mine" })],
      [comm({ opponent: "standard-only-theirs", opponentLabel: "Only Theirs" })],
    );
    expect(merged.map((m) => m.slug).sort()).toEqual([
      "standard-only-mine",
      "standard-only-theirs",
    ]);
    expect(merged.find((m) => m.slug === "standard-only-mine")!.community).toBeNull();
    expect(merged.find((m) => m.slug === "standard-only-theirs")!.you).toBeNull();
  });

  it("sorts the biggest gap first — the actionable end", () => {
    const merged = mergeMatchups(
      [
        rec({ slug: "standard-a", label: "A", wins: 5, losses: 5, games: 10, winrate: 50 }),
        rec({ slug: "standard-b", label: "B", wins: 1, losses: 14, games: 15, winrate: 7 }),
      ],
      [
        comm({ opponent: "standard-a", winrate: 50 }),
        comm({ opponent: "standard-b", winrate: 50 }),
      ],
    );
    expect(merged[0].slug).toBe("standard-b");
  });

  it("requires at least MIN_PERSONAL_GAMES decided games for a delta", () => {
    const justUnder = MIN_PERSONAL_GAMES - 1;
    const [m] = mergeMatchups(
      [rec({ wins: 0, losses: justUnder, games: justUnder, winrate: 0 })],
      [comm()],
    );
    expect(m.delta).toBeNull();
  });
});

describe("subjectArchetype", () => {
  const opts = (arch: (m: TrackedMatch) => string | null) => ({
    formatFor: () => STANDARD,
    myArchetypeFor: arch,
  });

  it("returns the archetype you actually play", () => {
    const ms = Array.from({ length: 10 }, () => match());
    expect(subjectArchetype(ms, opts(() => "Azorius Control"))).toBe(
      "standard-azorius-control",
    );
  });

  it("returns null on a mixed deck history — no honest comparison exists", () => {
    const ms = Array.from({ length: 10 }, (_, i) => match({ matchId: `m${i}` }));
    let i = 0;
    const mixed = subjectArchetype(
      ms,
      opts(() => (i++ % 2 === 0 ? "Azorius Control" : "Mono-Red Aggro")),
    );
    expect(mixed).toBeNull();
  });

  it("tolerates a minority of other decks", () => {
    const ms = Array.from({ length: 10 }, (_, i) => match({ matchId: `m${i}` }));
    let i = 0;
    // 8 of 10 on one deck — above the 0.6 share floor.
    expect(
      subjectArchetype(ms, opts(() => (i++ < 8 ? "Azorius Control" : "Mono-Red Aggro"))),
    ).toBe("standard-azorius-control");
  });

  it("returns null when the deck is not a recognised archetype", () => {
    const ms = Array.from({ length: 5 }, () => match());
    expect(subjectArchetype(ms, opts(() => null))).toBeNull();
  });

  it("returns null for an empty history", () => {
    expect(subjectArchetype([], opts(() => "Azorius Control"))).toBeNull();
  });
});

describe("readDelta", () => {
  it("says nothing confident when the intervals overlap", () => {
    const [m] = mergeMatchups(
      [rec({ wins: 6, losses: 6, games: 12, winrate: 50 })],
      [comm({ winrate: 47, low: 44, high: 50 })],
    );
    expect(readDelta(m)).toMatch(/in line with the field|samples/i);
  });

  it("hedges on a small sample even when the gap looks large", () => {
    // 3-12 is 20% against a field of 47%, but the Wilson upper bound still
    // touches the community's lower bound, so no confident claim is made.
    const [m] = mergeMatchups([rec()], [comm()]);
    expect(readDelta(m)).toMatch(/samples still overlap/i);
  });

  it("calls out a real gap once the sample supports it", () => {
    const [m] = mergeMatchups(
      [rec({ wins: 12, losses: 48, games: 60, winrate: 20 })],
      [comm()],
    );
    expect(readDelta(m)).toMatch(/worth practising/i);
  });

  it("returns null when there is nothing to compare", () => {
    const [m] = mergeMatchups([rec({ wins: 1, losses: 1, games: 2, winrate: 50 })], []);
    expect(readDelta(m)).toBeNull();
  });
});
