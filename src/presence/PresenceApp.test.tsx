// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/appUpdater", () => ({ isTauri: () => false }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

import { PresenceApp } from "./PresenceApp";

afterEach(() => cleanup());

describe("PresenceApp", () => {
  it("exposes a drag handle and keeps the mark and cog as buttons", () => {
    const { container } = render(<PresenceApp />);
    const bar = container.querySelector(".fnd-presence-bar");
    const grip = container.querySelector(".fnd-presence-grip");
    const mark = container.querySelector("button.fnd-presence-mark");
    const cog = container.querySelector("button.fnd-presence-cog");
    expect(grip?.getAttribute("data-tauri-drag-region")).not.toBeNull();
    expect(bar?.getAttribute("data-tauri-drag-region")).toBeNull();
    expect(mark?.getAttribute("data-tauri-drag-region")).toBe("false");
    expect(cog?.getAttribute("data-tauri-drag-region")).toBe("false");
  });
});
