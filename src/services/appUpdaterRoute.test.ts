import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The plugin and core are replaced so these tests can see exactly what the
// updater is asked and which restart runs.
const check = vi.fn();
const relaunch = vi.fn();
const invoke = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({ check: (...a: unknown[]) => check(...a) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: (...a: unknown[]) => relaunch(...a) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import {
  checkAppUpdateSigned,
  checkOptionsFor,
  installPendingUpdate,
  resetUpdateRouteForTests,
} from "./appUpdater";

/** A fake `Update` whose install succeeds immediately. */
const fakeUpdate = {
  version: "9.9.9",
  body: "notes",
  downloadAndInstall: vi.fn(async () => undefined),
};

function routeIs(kind: "self" | "package", target: string | null) {
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === "update_route") return { kind, target };
    return undefined;
  });
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = { __TAURI_INTERNALS__: {} };
  resetUpdateRouteForTests();
  check.mockReset();
  relaunch.mockReset();
  invoke.mockReset();
  fakeUpdate.downloadAndInstall.mockClear();
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});

describe("checkOptionsFor", () => {
  it("never consults the updater for a package-managed copy", () => {
    expect(checkOptionsFor({ kind: "package", target: null })).toBeNull();
  });
  it("asks for the Linux self-install key, never the plain one", () => {
    expect(checkOptionsFor({ kind: "self", target: "linux-x86_64-local" })).toEqual({
      target: "linux-x86_64-local",
    });
  });
  it("leaves Windows and macOS on the default lookup", () => {
    expect(checkOptionsFor({ kind: "self", target: null })).toEqual({});
  });
});

describe("checkAppUpdateSigned", () => {
  it("does not call check() at all for a pacman copy", async () => {
    // The whole point: a root-owned /usr/bin binary must never be handed an
    // update it would fail to write.
    routeIs("package", null);
    expect(await checkAppUpdateSigned()).toEqual({ ok: false });
    expect(check).not.toHaveBeenCalled();
  });

  it("passes the self-install target through to the plugin", async () => {
    routeIs("self", "linux-x86_64-local");
    check.mockResolvedValue(fakeUpdate);
    const r = await checkAppUpdateSigned();
    expect(check).toHaveBeenCalledWith({ target: "linux-x86_64-local" });
    expect(r).toEqual({
      ok: true,
      update: { version: "9.9.9", notes: "notes", canAutoInstall: true, installMode: "signed" },
    });
  });

  it("treats a build without update_route as package-managed", async () => {
    // A frontend newer than its Rust side must fail safe.
    invoke.mockRejectedValue(new Error("command update_route not found"));
    expect(await checkAppUpdateSigned()).toEqual({ ok: false });
    expect(check).not.toHaveBeenCalled();
  });
});

describe("installPendingUpdate restart", () => {
  it("Linux self-install restarts through relaunch_after_update, not relaunch()", async () => {
    routeIs("self", "linux-x86_64-local");
    check.mockResolvedValue(fakeUpdate);
    await checkAppUpdateSigned();
    await installPendingUpdate(() => undefined);
    expect(fakeUpdate.downloadAndInstall).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("relaunch_after_update");
    expect(relaunch).not.toHaveBeenCalled();
  });

  it("Windows and macOS keep the plugin's relaunch()", async () => {
    routeIs("self", null);
    check.mockResolvedValue(fakeUpdate);
    await checkAppUpdateSigned();
    await installPendingUpdate(() => undefined);
    expect(relaunch).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalledWith("relaunch_after_update");
  });
});
