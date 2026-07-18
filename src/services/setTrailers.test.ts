import { describe, expect, it } from "vitest";
import {
  trailerForSet,
  youtubeEmbedUrl,
  youtubeWatchUrl,
} from "./setTrailers";

describe("trailerForSet", () => {
  it("matches Nauctis and Titanbreach by name", () => {
    const n = trailerForSet({ name: "Nauctis: The Sunken Realm" });
    expect(n?.youtubeId).toBe("jPaHUxive30");
    const k = trailerForSet({ name: "Kamigawa: Titanbreach" });
    expect(k?.youtubeId).toBe("cC6ebvZg-_Q");
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
    expect(youtubeEmbedUrl("jPaHUxive30")).toContain(
      "youtube-nocookie.com/embed/jPaHUxive30",
    );
    expect(youtubeWatchUrl("jPaHUxive30")).toBe(
      "https://www.youtube.com/watch?v=jPaHUxive30",
    );
  });
});
