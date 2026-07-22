import { describe, expect, it, vi, afterEach } from "vitest";
import { resolveImageById, scryfallCdnUrl } from "./scryfall";

const ID = "b3c1ebd6-967f-4b8c-8f1f-442ce8c1da24";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scryfallCdnUrl", () => {
  it("shards the path by the first two id characters", () => {
    expect(scryfallCdnUrl(ID, "normal")).toBe(
      `https://cards.scryfall.io/normal/front/b/3/${ID}.jpg`,
    );
  });

  it("appends the image version when the pipeline captured one", () => {
    // Without the stamp this exact card 404s on the CDN — that was the bug.
    expect(scryfallCdnUrl(ID, "small", "1784631939")).toBe(
      `https://cards.scryfall.io/small/front/b/3/${ID}.jpg?1784631939`,
    );
  });

  it("leaves the URL bare for a null/absent version", () => {
    expect(scryfallCdnUrl(ID, "normal", null)).not.toContain("?");
  });
});

describe("resolveImageById", () => {
  it("recovers a versioned URL from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          image_uris: { normal: `https://cards.scryfall.io/normal/front/b/3/${ID}.jpg?1784631939` },
        }),
      }),
    );
    await expect(resolveImageById(ID, "normal")).resolves.toBe(
      `https://cards.scryfall.io/normal/front/b/3/${ID}.jpg?1784631939`,
    );
  });

  it("resolves null when the card is unknown, and caches the miss", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", f);
    const missId = "00000000-0000-0000-0000-000000000000";
    await expect(resolveImageById(missId, "small")).resolves.toBeNull();
    await expect(resolveImageById(missId, "small")).resolves.toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("falls back to the front face for a double-faced card", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          card_faces: [{ image_uris: { art_crop: "https://cards.scryfall.io/art/front.jpg?1" } }],
        }),
      }),
    );
    await expect(resolveImageById("11111111-2222-3333-4444-555555555555", "art_crop")).resolves.toBe(
      "https://cards.scryfall.io/art/front.jpg?1",
    );
  });
});
