import { describe, expect, it } from "vitest";
import { aetherFrameSrc, queryPinsDeck } from "./Aetherfield";

describe("aetherFrameSrc", () => {
  it("opens the title screen when the sidebar launched with no query", () => {
    expect(aetherFrameSrc("")).toBe("/aetherfield/index.html");
  });

  it("keeps shell=play on Sets and DeckView deep links", () => {
    expect(aetherFrameSrc("shell=play&set=fdn&layout=sets")).toBe(
      "/aetherfield/index.html?shell=play&set=fdn&layout=sets",
    );
    expect(aetherFrameSrc("shell=play&cards=Sol%20Ring")).toBe(
      "/aetherfield/index.html?shell=play&cards=Sol%20Ring",
    );
  });
});

describe("queryPinsDeck", () => {
  it("is false for the sidebar launch and for a set deep link", () => {
    expect(queryPinsDeck("")).toBe(false);
    expect(queryPinsDeck("shell=play&set=fdn&layout=sets")).toBe(false);
  });

  it("is true for a deck deep link, so collection overlay cannot replace it", () => {
    expect(queryPinsDeck("shell=play&cards=Sol%20Ring")).toBe(true);
    expect(queryPinsDeck("cards=Narset%2C%20Parter%20of%20Veils")).toBe(true);
  });
});
