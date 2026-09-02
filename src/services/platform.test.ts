import { describe, expect, it } from "vitest";
import { detectOs, updatesViaPackageManager } from "./platform";

describe("detectOs", () => {
  it("reads the three desktop webviews", () => {
    expect(detectOs("Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebView2")).toBe("windows");
    expect(detectOs("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15")).toBe(
      "macos",
    );
    expect(detectOs("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15")).toBe("linux");
  });

  it("keeps Windows ahead of an X11 compatibility token", () => {
    expect(detectOs("Mozilla/5.0 (Windows NT 10.0; X11)")).toBe("windows");
  });

  it("falls back to unknown rather than guessing", () => {
    expect(detectOs("")).toBe("unknown");
    expect(detectOs("curl/8.4.0")).toBe("unknown");
  });
});

describe("updatesViaPackageManager", () => {
  it("is Linux only — Windows and macOS install their own updates", () => {
    expect(updatesViaPackageManager("linux")).toBe(true);
    expect(updatesViaPackageManager("windows")).toBe(false);
    expect(updatesViaPackageManager("macos")).toBe(false);
    expect(updatesViaPackageManager("unknown")).toBe(false);
  });
});
