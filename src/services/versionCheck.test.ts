import { describe, expect, it } from "vitest";
import { isNewer, versionJsonUrl } from "./versionCheck";

describe("isNewer", () => {
  it("compares semver-ish triples", () => {
    expect(isNewer("0.18.0", "0.17.0")).toBe(true);
    expect(isNewer("0.17.0", "0.17.0")).toBe(false);
    expect(isNewer("0.16.9", "0.17.0")).toBe(false);
    expect(isNewer("v1.0.0", "0.99.0")).toBe(true);
  });
});

describe("versionJsonUrl", () => {
  it("points at the official CDN path", () => {
    expect(versionJsonUrl()).toBe(
      "https://filthy-net-deck.com/version.json",
    );
    expect(versionJsonUrl("https://example.com/")).toBe(
      "https://example.com/version.json",
    );
  });
});
