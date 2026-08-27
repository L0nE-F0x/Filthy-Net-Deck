// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FormatChip } from "./statsUi";

afterEach(cleanup);

describe("FormatChip", () => {
  it("names the format a deck was last played in", () => {
    render(<FormatChip format="historic" />);
    expect(screen.getByText("Historic")).toBeTruthy();
  });

  it("calls Pioneer 'Explorer' — the name on Arena's own queue", () => {
    render(<FormatChip format="pioneer" />);
    expect(screen.getByText("Explorer")).toBeTruthy();
  });

  it("renders nothing at all when Arena never named the queue", () => {
    // A blank is honest here; "Unknown" as a chip would just be visual noise
    // on every deck from a match the parser could not label.
    const { container } = render(<FormatChip format="unknown" />);
    expect(container.innerHTML).toBe("");
  });

  it("marks the two covered formats apart from library-only labels", () => {
    // Standard/Explorer read as "you can look this meta up in here". Historic
    // is tracked and archived, but the app ships no Historic metagame, and the
    // chip must not imply otherwise.
    const { container: covered } = render(<FormatChip format="standard" />);
    expect(covered.querySelector(".fmt-chip.is-covered")).toBeTruthy();

    const { container: library } = render(<FormatChip format="brawl" />);
    expect(library.querySelector(".fmt-chip")).toBeTruthy();
    expect(library.querySelector(".is-covered")).toBeNull();
    expect(library.querySelector(".fmt-chip")?.getAttribute("title")).toContain(
      "no Brawl metagame",
    );
  });
});
