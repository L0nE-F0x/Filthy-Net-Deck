import { describe, expect, it } from "vitest";
import {
  looksLikeFriendCode,
  normalizeFriendCode,
  rankFriends,
  winrateOf,
  type FriendLine,
} from "./friends";

function line(over: Partial<FriendLine> = {}): FriendLine {
  return {
    userId: "u1",
    name: "Player",
    handle: null,
    isMe: false,
    matches: 0,
    wins: 0,
    losses: 0,
    bestRank: null,
    lastMatch: null,
    ...over,
  };
}

describe("friend codes", () => {
  it("accepts a code however it was pasted", () => {
    // People copy these out of Discord messages, with whatever came along.
    expect(normalizeFriendCode(" a2c4-e6g8 ")).toBe("A2C4E6G8");
    expect(normalizeFriendCode("a2c4e6g8")).toBe("A2C4E6G8");
    expect(looksLikeFriendCode("a2c4 e6g8")).toBe(true);
  });

  it("rejects the characters the alphabet deliberately excludes", () => {
    // I, L, O, 0 and 1 are the ones people mistype; no code contains them, so
    // a code that does is a typo, not an unknown user.
    expect(looksLikeFriendCode("ABCDEFGI")).toBe(false);
    expect(looksLikeFriendCode("ABCDEFG0")).toBe(false);
    expect(looksLikeFriendCode("ABCDEFG1")).toBe(false);
    expect(looksLikeFriendCode("ABCDEFGL")).toBe(false);
  });

  it("rejects the wrong length", () => {
    expect(looksLikeFriendCode("ABCDEFG")).toBe(false);
    expect(looksLikeFriendCode("")).toBe(false);
    // Over-long input is truncated to 8, so a paste with trailing junk still
    // resolves rather than failing on something the user cannot see.
    expect(normalizeFriendCode("A2C4E6G8XYZ")).toBe("A2C4E6G8");
  });
});

describe("winrateOf", () => {
  it("is null until a game is decided", () => {
    expect(winrateOf(line())).toBeNull();
    expect(winrateOf(line({ matches: 3 }))).toBeNull(); // draws only
    expect(winrateOf(line({ wins: 3, losses: 1 }))).toBeCloseTo(0.75);
  });
});

describe("rankFriends", () => {
  it("puts the most wins on top — this is a race, not a rate table", () => {
    // 2–0 is a perfect record and is NOT ahead of 40–20 in a seasonal climb.
    const ranked = rankFriends([
      line({ userId: "small", name: "Small", wins: 2, losses: 0 }),
      line({ userId: "big", name: "Big", wins: 40, losses: 20 }),
    ]);
    expect(ranked.map((l) => l.userId)).toEqual(["big", "small"]);
  });

  it("breaks a tie on wins with the better record", () => {
    const ranked = rankFriends([
      line({ userId: "worse", name: "Worse", wins: 10, losses: 10 }),
      line({ userId: "better", name: "Better", wins: 10, losses: 2 }),
    ]);
    expect(ranked.map((l) => l.userId)).toEqual(["better", "worse"]);
  });

  it("keeps a friend who has shared nothing, at the bottom", () => {
    // Dropping them would imply they are not on the list. Zeroes are honest.
    const ranked = rankFriends([
      line({ userId: "quiet", name: "Quiet" }),
      line({ userId: "active", name: "Active", wins: 1, losses: 1 }),
    ]);
    expect(ranked.map((l) => l.userId)).toEqual(["active", "quiet"]);
    expect(ranked).toHaveLength(2);
  });

  it("does not mutate the input", () => {
    const input = [line({ wins: 1 }), line({ userId: "u2", wins: 5 })];
    const copy = [...input];
    rankFriends(input);
    expect(input).toEqual(copy);
  });
});
