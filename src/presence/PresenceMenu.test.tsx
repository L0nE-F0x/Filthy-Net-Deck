// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PresenceMenu } from "./PresenceMenu";
import { readOverlayPrefs } from "../overlay/overlayPrefs";

afterEach(() => cleanup());

describe("PresenceMenu", () => {
  it("renders the overlay knobs the cog used to inline", () => {
    render(
      <PresenceMenu
        prefs={readOverlayPrefs()}
        patch={() => undefined}
        onRequestClose={() => undefined}
      />,
    );
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByText("In-game overlay")).toBeTruthy();
    expect(screen.getByText("HUD over Arena")).toBeTruthy();
    expect(screen.getByText("Open Filthy Net Deck →")).toBeTruthy();
    // jsdom is not Windows/macOS, so the Linux-unavailable control stays off.
    expect(screen.queryByText("Enable click-through")).toBeNull();
  });

  it("hides the measure clone from assistive tech", () => {
    render(
      <PresenceMenu
        prefs={readOverlayPrefs()}
        patch={() => undefined}
        onRequestClose={() => undefined}
        inert
      />,
    );
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
