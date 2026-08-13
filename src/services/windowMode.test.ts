import { describe, expect, it } from "vitest";
import { restoreFullscreenIfPreferred } from "./windowMode";

describe("restoreFullscreenIfPreferred", () => {
  it("is a no-op when the user prefers windowed (never touches Tauri)", async () => {
    await expect(restoreFullscreenIfPreferred(false)).resolves.toBeUndefined();
  });
});
