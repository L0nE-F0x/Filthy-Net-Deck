import { describe, expect, it } from "vitest";
import {
  trailerForSet,
  youtubeEmbedUrl,
  youtubeWatchUrl,
} from "./setTrailers";

describe("trailerForSet", () => {
  it("matches Nauctis, Titanbreach, and Zhalfir by name", () => {
    const n = trailerForSet({ name: "Nauctis: The Sunken Realm" });
    expect(n?.youtubeId).toBe("jPaHUxive30");
    const k = trailerForSet({ name: "Kamigawa: Titanbreach" });
    expect(k?.youtubeId).toBe("cC6ebvZg-_Q");
    const z = trailerForSet({ name: "Zhalfir" });
    expect(z?.youtubeId).toBe("ZaUhdKIc-yQ");
  });

  it("prefers feed trailer over client map", () => {
    const t = trailerForSet({
      name: "Nauctis: The Sunken Realm",
      feedTrailer: { youtubeId: "aaaaaaaaaaa", title: "Override" },
    });
    expect(t?.youtubeId).toBe("aaaaaaaaaaa");
    expect(t?.title).toBe("Override");
  });

  it("returns null for unknown / unannounced sets", () => {
    expect(trailerForSet({ name: "Universes Beyond (unannounced)" })).toBeNull();
    expect(trailerForSet({ code: "zzz", name: "No Such Set" })).toBeNull();
  });
});

describe("youtube urls", () => {
  it("builds embed and watch urls", () => {
    expect(youtubeEmbedUrl("jPaHUxive30", "https:")).toContain(
      "youtube-nocookie.com/embed/jPaHUxive30",
    );
    expect(youtubeWatchUrl("jPaHUxive30")).toBe(
      "https://www.youtube.com/watch?v=jPaHUxive30",
    );
  });

  it("sends custom-protocol pages through the site so YouTube gets a Referer", () => {
    expect(youtubeEmbedUrl("cC6ebvZg-_Q", "tauri:")).toBe(
      "https://filthy-net-deck.com/yt-embed.html?v=cC6ebvZg-_Q",
    );
    expect(youtubeEmbedUrl("cC6ebvZg-_Q", "http:")).toContain(
      "youtube-nocookie.com/embed/cC6ebvZg-_Q",
    );
    expect(youtubeEmbedUrl("not a video", "tauri:")).toContain(
      "youtube-nocookie.com/embed/",
    );
  });
});
