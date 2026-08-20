import { describe, expect, it } from "vitest";
// NOTE: lives OUTSIDE netlify/functions on purpose — Netlify treats every file
// in the functions directory as a deployable function and a dot in the name is
// illegal. See the note in version.test.mts.
import { renderList } from "../functions/deck.mts";
import { slugify } from "../functions/profile.mts";

describe("renderList", () => {
  it("emphasises section headers and passes card lines through", () => {
    expect(renderList("Deck\n4 Mountain\n\nSideboard\n2 Abrade")).toBe(
      ["<b>Deck</b>", "4 Mountain", "", "<b>Sideboard</b>", "2 Abrade"].join("\n"),
    );
  });

  it("escapes the list, which is text an authenticated user uploaded", () => {
    // `set_deck_public(list_in => ...)` takes arbitrary text over the REST API.
    // Nothing between there and this page validates it as a decklist, so this
    // escape is the only thing standing between a forged upload and script
    // running on filthy-net-deck.com.
    const out = renderList('4 <img src=x onerror="alert(1)">\n2 A & B\n1 "Quoted"');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(out).toContain("2 A &amp; B");
    expect(out).toContain("&quot;Quoted&quot;");
  });

  it("does not let a forged header smuggle markup either", () => {
    // The header branch re-emits the line inside <b>; it must escape too.
    expect(renderList("<b>Deck</b>")).toBe("&lt;b&gt;Deck&lt;/b&gt;");
  });

  it("strips CR so a CRLF upload does not render stray whitespace", () => {
    expect(renderList("Deck\r\n4 Mountain\r")).toBe("<b>Deck</b>\n4 Mountain");
  });

  it("caps absurdly long lists", () => {
    const out = renderList(Array.from({ length: 900 }, (_, i) => `1 Card ${i}`).join("\n"));
    expect(out.split("\n")).toHaveLength(400);
  });

  it("handles an empty string without throwing", () => {
    expect(renderList("")).toBe("");
  });
});

describe("slugify", () => {
  it("agrees with public.deck_slugify() and the app's deckSlug()", () => {
    expect(slugify("Dwarven Weapons")).toBe("dwarven-weapons");
    expect(slugify("Mono-Red Dragons!")).toBe("mono-red-dragons");
    expect(slugify("  Azorius  Control  ")).toBe("azorius-control");
    expect(slugify("Bo1 — Mythic 🏆 Rank")).toBe("bo1-mythic-rank");
  });

  it("never returns an empty slug", () => {
    expect(slugify("")).toBe("deck");
    expect(slugify("!!!")).toBe("deck");
  });

  it("caps length without leaving a trailing dash", () => {
    const slug = slugify("a".repeat(40) + " " + "b".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
  });
});
