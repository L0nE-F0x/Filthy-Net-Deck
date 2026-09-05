import { describe, expect, it } from "vitest";
import { aetherFrameSrc } from "./Aetherfield";

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
