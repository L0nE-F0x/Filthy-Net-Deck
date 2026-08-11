import { describe, expect, it } from "vitest";
import { handleProblem, RESERVED_HANDLES } from "./sync";

describe("handleProblem", () => {
  it("accepts ordinary handles", () => {
    for (const h of ["lonefox", "L0nE-F0x", "a_b", "player-99", "abc"]) {
      expect(handleProblem(h), h).toBeNull();
    }
  });

  it("enforces the length bounds the server also checks", () => {
    expect(handleProblem("ab")).toMatch(/short/i);
    expect(handleProblem("a".repeat(25))).toMatch(/long/i);
    expect(handleProblem("a".repeat(24))).toBeNull();
  });

  it("rejects shapes that would break or spoof a URL", () => {
    expect(handleProblem("-lead")).toMatch(/letters, numbers/i);
    expect(handleProblem("trail-")).toMatch(/letters, numbers/i);
    expect(handleProblem("has space")).toMatch(/letters, numbers/i);
    expect(handleProblem("has/slash")).toMatch(/letters, numbers/i);
    expect(handleProblem("dots.here")).toMatch(/letters, numbers/i);
    expect(handleProblem("emoji🎴")).toMatch(/letters, numbers/i);
  });

  it("blocks reserved names that could impersonate the project", () => {
    for (const h of ["admin", "official", "fnd", "filthynetdeck", "support"]) {
      expect(handleProblem(h), h).toMatch(/reserved/i);
    }
  });

  it("is case- and whitespace-insensitive, matching the server's lowercasing", () => {
    expect(handleProblem("  ADMIN  ")).toMatch(/reserved/i);
    expect(handleProblem("  LoneFox  ")).toBeNull();
  });

  it("asks for something rather than nothing when empty", () => {
    expect(handleProblem("")).toMatch(/pick a name/i);
    expect(handleProblem("   ")).toMatch(/pick a name/i);
  });

  it("keeps the reserved list aligned with the SQL constraint", () => {
    // These are the ones the migration's CHECK also rejects; drifting apart
    // would mean the UI accepts a name the database refuses.
    for (const h of ["admin", "root", "api", "www", "app", "u", "null"]) {
      expect(RESERVED_HANDLES.has(h), h).toBe(true);
    }
  });
});
