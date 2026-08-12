// @vitest-environment jsdom
//
// The rest of the suite runs in `environment: "node"` (pure logic, no DOM).
// This file opts itself into jsdom rather than changing the global config,
// because it has to test *effect wiring*, not a pure function.
//
// That distinction is the whole reason this file exists. The bug it guards
// against was not a wrong calculation — it was an effect that cancelled its own
// timer:
//
//     useEffect(() => {
//       if (!ready || !minElapsed || fadeOut || gone) return;
//       setFadeOut(true);
//       const t = setTimeout(() => setGone(true), FADE_MS);
//       return () => clearTimeout(t);
//     }, [ready, minElapsed, fadeOut, gone]);
//
// Setting `fadeOut` re-runs the effect; the cleanup clears the pending timeout;
// the `|| fadeOut` guard then returns before scheduling another. `gone` never
// became true, so the splash stayed mounted for the life of the process — and
// with it a 900 ms tips interval that re-rendered the entire app tree, forever.
// The CSS still faded it to opacity 0, so nothing looked wrong.
//
// No pure-logic test could have caught that, which is why the previous fix for
// this same class of bug (v2.7.3 audit) did not hold.

import { render, screen, act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SplashScreen } from "./SplashScreen";

// Matches the constants in SplashScreen.tsx.
const MIN_MS = 1600;
const FADE_MS = 520;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Advance timers inside act() so React flushes the resulting state updates. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function renderSplash(ready: boolean) {
  return render(
    <SplashScreen ready={ready}>
      <main data-testid="app">the app</main>
    </SplashScreen>,
  );
}

describe("SplashScreen", () => {
  it("renders children underneath from the very first frame", () => {
    // The app tree is not gated behind the splash — it mounts and boots while
    // the splash covers it.
    renderSplash(false);
    expect(screen.getByTestId("app")).toBeTruthy();
    expect(document.querySelector(".splash-root")).toBeTruthy();
  });

  it("unmounts completely once boot is done and the fade has run", () => {
    // The regression. Before the fix this stayed mounted forever.
    const { container } = renderSplash(true);
    expect(container.querySelector(".splash-root")).toBeTruthy();

    advance(MIN_MS + 50); // minimum display time elapses -> fade starts
    expect(container.querySelector(".splash-exit")).toBeTruthy();

    advance(FADE_MS + 50); // fade completes -> unmount
    expect(container.querySelector(".splash-root")).toBeNull();
    expect(screen.getByTestId("app")).toBeTruthy();
  });

  it("stops re-rendering once gone — the reason the bug mattered", () => {
    // The splash wraps the whole app, so a live interval here re-renders
    // everything under it. After unmount there must be no scheduled work left.
    renderSplash(true);
    // Two steps, not one: the fade timer does not exist until React has run
    // the effect that reacts to `minElapsed`, so a single combined advance
    // never schedules it and the splash appears stuck for the wrong reason.
    advance(MIN_MS + 50);
    advance(FADE_MS + 50);

    expect(document.querySelector(".splash-root")).toBeNull();
    // Every timer the component owns should have been cleared on unmount.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("holds until boot finishes, however long that takes", () => {
    // `ready` gates the fade: the minimum is a floor, not a ceiling.
    const { container, rerender } = renderSplash(false);
    advance(MIN_MS + FADE_MS + 5000);
    expect(container.querySelector(".splash-root")).toBeTruthy();

    rerender(
      <SplashScreen ready>
        <main data-testid="app">the app</main>
      </SplashScreen>,
    );
    advance(FADE_MS + 50);
    expect(container.querySelector(".splash-root")).toBeNull();
  });

  it("does not advertise a feature that no longer exists", () => {
    // Matchup Lab was replaced by Matchups in v2.7.6; the splash went on
    // naming it for four releases because nothing pointed at this array.
    renderSplash(false);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/Matchup Lab/i);
  });
});
