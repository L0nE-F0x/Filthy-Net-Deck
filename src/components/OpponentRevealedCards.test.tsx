// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpponentRevealedCards } from "./OpponentRevealedCards";

const peek = vi.fn<(id: number) => unknown>();
const resolveBatch = vi.fn<(ids: number[]) => Promise<void>>(async () => undefined);
const copy = vi.fn<(text: string) => Promise<boolean>>(async () => true);

vi.mock("../services/arenaMeta", () => ({
  peekArenaMeta: (id: number) => peek(id),
  resolveArenaMetaBatch: (ids: number[]) => resolveBatch(ids),
}));

vi.mock("../services/arenaImport", async (orig) => {
  const actual = await orig<typeof import("../services/arenaImport")>();
  return {
    ...actual,
    copyToClipboard: (text: string) => copy(text),
  };
});

afterEach(() => {
  cleanup();
  peek.mockReset();
  resolveBatch.mockClear();
  copy.mockClear();
});

describe("OpponentRevealedCards", () => {
  it("explains when a match recorded no opponent cards", () => {
    render(<OpponentRevealedCards opponentName="Andrea" />);
    expect(
      screen.getByText(/No opponent cards recorded for this match/i),
    ).toBeTruthy();
    expect(resolveBatch).not.toHaveBeenCalled();
  });

  it("lists revealed names and copies an Arena Deck block", async () => {
    peek.mockImplementation((id: number) => {
      if (id === 20)
        return { name: "Slickshot Show-Off", isLand: false, artUrl: null };
      if (id === 10) return { name: "Mountain", isLand: true, artUrl: null };
      return undefined;
    });
    render(
      <OpponentRevealedCards grpIds={[20, 10]} opponentName="hanky555" />,
    );
    expect(screen.getByText("Slickshot Show-Off")).toBeTruthy();
    expect(screen.getByText("Mountain")).toBeTruthy();
    expect(screen.getByText(/2 cards revealed/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /copy list/i }));
    expect(copy).toHaveBeenCalledWith(
      ["Deck", "1 Slickshot Show-Off", "1 Mountain"].join("\n"),
    );
    expect(await screen.findByText("Copied ✓")).toBeTruthy();
  });

  it("shows how many of each card and copies those counts", async () => {
    peek.mockImplementation((id: number) => {
      if (id === 20)
        return { name: "Slickshot Show-Off", isLand: false, artUrl: null };
      if (id === 10) return { name: "Mountain", isLand: true, artUrl: null };
      return undefined;
    });
    render(
      <OpponentRevealedCards
        grpIds={[20, 20, 20, 10, 10]}
        opponentName="ruthless"
      />,
    );
    expect(screen.getByText(/2 cards revealed · 5 copies/)).toBeTruthy();
    expect(screen.getByLabelText("3 copies")).toBeTruthy();
    expect(screen.getByLabelText("2 copies")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /copy list/i }));
    expect(copy).toHaveBeenCalledWith(
      ["Deck", "3 Slickshot Show-Off", "2 Mountain"].join("\n"),
    );
  });
});
