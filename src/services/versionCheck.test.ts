import { describe, expect, it } from "vitest";
import { isNewer, pickDownloadUrl, versionJsonUrl } from "./versionCheck";

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

describe("pickDownloadUrl", () => {
  const remote = {
    version: "3.4.0",
    downloadUrl: "https://x/Setup-3.4.0.exe",
    downloads: {
      windows: "https://x/Setup-3.4.0.exe",
      macos: "https://x/3.4.0-universal.dmg",
    },
  };

  it("hands each OS its own installer", () => {
    expect(pickDownloadUrl(remote, "windows")).toBe("https://x/Setup-3.4.0.exe");
    expect(pickDownloadUrl(remote, "macos")).toBe("https://x/3.4.0-universal.dmg");
  });

  it("offers Linux nothing — it updates from the package manager", () => {
    expect(pickDownloadUrl(remote, "linux")).toBeUndefined();
  });

  it("never falls back to the bare field for an OS the map does not list", () => {
    // The 3.4.0 shape: one bare downloadUrl and no map. macOS and Linux users
    // were offered a .exe; they must now be offered nothing instead, so
    // Settings can show them the route that actually works.
    const legacy = { version: "3.4.0", downloadUrl: "https://x/#download" };
    expect(pickDownloadUrl(legacy, "windows")).toBe("https://x/#download");
    expect(pickDownloadUrl(legacy, "macos")).toBeUndefined();
    expect(pickDownloadUrl(legacy, "linux")).toBeUndefined();
    expect(pickDownloadUrl(legacy, "unknown")).toBeUndefined();
  });
});
