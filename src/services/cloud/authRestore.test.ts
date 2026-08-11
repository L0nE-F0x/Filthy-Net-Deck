/**
 * Regression: the signed-in user must survive a relaunch or a webview reload.
 *
 * The session was always persisted to `auth.json` — what was missing is that
 * nothing ever *read* it back into the store, so `authName` started null on
 * every boot and the app looked signed out. `refreshAuth` existed and had no
 * callers at all. These tests pin both halves: the store restores from the
 * stored session, and it does so without a server round trip.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const getStoredUser = vi.fn<() => Promise<User | null>>();
const getCurrentUser = vi.fn<() => Promise<User | null>>();

vi.mock("../../services/cloud/auth", () => ({
  getStoredUser,
  getCurrentUser,
  displayNameFor: (u: User | null) =>
    u ? ((u.user_metadata?.name as string) ?? u.email ?? null) : null,
  onAuthChange: async () => () => {},
}));

const someone = {
  email: "player@example.com",
  user_metadata: { name: "L0nE-F0x" },
} as unknown as User;

async function store() {
  const { useAppStore } = await import("../../store/useAppStore");
  return useAppStore;
}

describe("restoring the session into the store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStoredUser.mockResolvedValue(null);
    getCurrentUser.mockResolvedValue(null);
  });

  it("puts the stored user back in the store", async () => {
    getStoredUser.mockResolvedValue(someone);
    const s = await store();
    s.setState({ authName: null });
    await s.getState().refreshAuth();
    expect(s.getState().authName).toBe("L0nE-F0x");
  });

  it("never validates against the server to answer 'who is signed in'", async () => {
    // getUser() needs network. A launch with wifi still coming up would report
    // a signed-in user as signed out, which is the bug wearing a new hat.
    getStoredUser.mockResolvedValue(someone);
    const s = await store();
    await s.getState().refreshAuth();
    expect(getStoredUser).toHaveBeenCalled();
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("reports nobody when there is no stored session", async () => {
    const s = await store();
    s.setState({ authName: "stale" });
    await s.getState().refreshAuth();
    expect(s.getState().authName).toBeNull();
  });
});
