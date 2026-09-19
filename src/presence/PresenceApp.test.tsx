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
    expect(container.querySelector("[data-tauri-drag-region]")).toBeTruthy();
    expect(container.querySelector(".fnd-presence-grip")).toBeTruthy();
    expect(container.querySelector("button.fnd-presence-mark")).toBeTruthy();
    expect(container.querySelector("button.fnd-presence-cog")).toBeTruthy();
  });
});
