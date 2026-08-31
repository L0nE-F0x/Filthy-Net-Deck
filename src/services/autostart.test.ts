import { describe, expect, it } from "vitest";
import { shouldShowAutostartPrompt } from "./autostart";

const ready = {
  isDesktop: true,
  asked: false,
  autostart: false as boolean | null,
  helpOpen: false,
  tourSettled: true,
};

describe("shouldShowAutostartPrompt", () => {
  it("shows once on the desktop after the help tour, while autostart is off", () => {
    expect(shouldShowAutostartPrompt(ready)).toBe(true);
  });

  it("never shows in the browser", () => {
    expect(shouldShowAutostartPrompt({ ...ready, isDesktop: false })).toBe(false);
  });

  it("does not show after the user has answered", () => {
    expect(shouldShowAutostartPrompt({ ...ready, asked: true })).toBe(false);
  });

  it("does not show when login-item is already on", () => {
    expect(shouldShowAutostartPrompt({ ...ready, autostart: true })).toBe(false);
  });

  it("waits until the OS flag is known", () => {
    expect(shouldShowAutostartPrompt({ ...ready, autostart: null })).toBe(false);
  });

  it("does not stack on the help tour", () => {
    expect(shouldShowAutostartPrompt({ ...ready, helpOpen: true })).toBe(false);
  });

  it("waits until the help tour has settled so the ask is informed", () => {
    expect(shouldShowAutostartPrompt({ ...ready, tourSettled: false })).toBe(
      false,
    );
  });
});
