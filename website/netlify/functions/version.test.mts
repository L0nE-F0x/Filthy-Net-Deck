import { describe, expect, it } from "vitest";
import { isAppRequest, platformFrom, safeVersion } from "./version.mts";

describe("isAppRequest", () => {
  it("recognises the production Tauri webview origin", () => {
    expect(isAppRequest("https://tauri.localhost")).toBe(true);
  });

  it("recognises the dev server origin", () => {
    expect(isAppRequest("http://localhost:1420")).toBe(true);
  });

  it("treats a missing Origin as not-app", () => {
    // Bots and curl generally send no Origin at all.
    expect(isAppRequest(null)).toBe(false);
  });

  it("does not count a browser visiting the site itself", () => {
    // Someone opening version.json in a tab must not inflate install counts.
    expect(isAppRequest("https://filthy-net-deck.com")).toBe(false);
  });
});

describe("platformFrom", () => {
  it("detects Windows", () => {
    expect(platformFrom("Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebView2")).toBe("windows");
  });

  it("detects macOS", () => {
    expect(platformFrom("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("macos");
  });

  it("falls back to other for anything unrecognised", () => {
    expect(platformFrom("curl/8.4.0")).toBe("other");
    expect(platformFrom("")).toBe("other");
  });
});

describe("safeVersion", () => {
  it("accepts a plain semver", () => {
    expect(safeVersion("2.5.3")).toBe("2.5.3");
    expect(safeVersion("999.999.999")).toBe("999.999.999");
  });

  it("rejects anything that is not exactly three numeric parts", () => {
    expect(safeVersion("1.2.3.4")).toBeNull();
    expect(safeVersion("v2.5.3")).toBeNull();
    expect(safeVersion("2.5")).toBeNull();
    expect(safeVersion("")).toBeNull();
    expect(safeVersion(null)).toBeNull();
  });

  it("rejects hostile input rather than letting it reach a blob key", () => {
    // The value is attacker-controlled (?v= on a public URL). Unbounded or
    // path-shaped values would pollute the counter keyspace.
    expect(safeVersion("../../etc/passwd")).toBeNull();
    expect(safeVersion("2.5.3/../../x")).toBeNull();
    expect(safeVersion("x".repeat(10_000))).toBeNull();
  });
});
