/**
 * In-app updates (desktop).
 *
 * 1. **Signed (preferred):** Tauri updater plugin checks
 *    `updater/latest.json`, verifies minisign, downloadAndInstall + relaunch.
 * 2. **Browser:** anything else — open the download page and let the user run
 *    the installer themselves.
 *
 * There is deliberately no third path that downloads and executes an installer
 * for you. One used to exist (`install_update_silent`): it fetched the NSIS
 * setup over HTTPS from an allow-listed host and ran it with `/S` **without
 * checking the signature**. Host allow-listing and TLS only prove the bytes
 * arrived intact from that host — they say nothing about what the bytes are if
 * the host itself is serving something malicious, which is the exact scenario
 * minisign exists to survive. A file fetched that way also carries no
 * Mark-of-the-Web, so SmartScreen never evaluates it. The browser fallback
 * gives both protections back.
 */
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** The pending update object must stay out of the store (not serializable). */
let pendingUpdate: Update | null = null;

export type UpdateInstallMode = "signed" | "browser";

export interface AppUpdateInfo {
  version: string;
  notes?: string;
  downloadUrl?: string;
  /** true = one click installs inside the app (signed updater only) */
  canAutoInstall: boolean;
  installMode: UpdateInstallMode;
}

export type SignedCheck =
  /** The updater answered: `update` is null when we're already current. */
  | { ok: true; update: AppUpdateInfo | null }
  /** The updater could not be consulted (offline, bad manifest, plugin error). */
  | { ok: false };

/**
 * Ask the signed updater.
 *
 * Failure is reported, not folded into "no update". The two used to be the
 * same `null`, which meant anything that broke the signed check — including a
 * deliberately corrupt `updater/latest.json` — silently demoted the app to the
 * weaker path. The trust model must not be something the server can turn off.
 */
export async function checkAppUpdateSigned(): Promise<SignedCheck> {
  if (!isTauri()) return { ok: false };
  try {
    const update = await check();
    if (!update) {
      pendingUpdate = null;
      return { ok: true, update: null };
    }
    pendingUpdate = update;
    return {
      ok: true,
      update: {
        version: update.version,
        notes: update.body ?? undefined,
        canAutoInstall: true,
        installMode: "signed",
      },
    };
  } catch {
    pendingUpdate = null;
    return { ok: false };
  }
}

/**
 * Decide what to offer, given the signed check and whatever `version.json`
 * said. Pure, so the security boundary is testable rather than inferred:
 *
 * `canAutoInstall` is true **only** for an offer that came from the signed
 * updater. An offer sourced from `version.json` is information, not authority
 * — it can tell the user a version exists, never authorise installing it.
 */
export function resolveUpdateOffer(
  signed: SignedCheck,
  fallback: { version: string; downloadUrl?: string; notes?: string } | null,
): AppUpdateInfo | null {
  if (signed.ok) {
    // The updater spoke. Trust it in both directions, including "current" —
    // consulting version.json after a successful check could only ever offer
    // a weaker route to an answer we already have.
    return signed.update;
  }
  if (!fallback) return null;
  return {
    version: fallback.version,
    downloadUrl: fallback.downloadUrl,
    notes: fallback.notes,
    canAutoInstall: false,
    installMode: "browser",
  };
}

/**
 * Download + install the pending signed update, then relaunch the app.
 * onProgress receives 0–100 (best effort; -1 when size unknown).
 */
export async function installPendingUpdate(
  onProgress: (pct: number) => void,
): Promise<void> {
  if (!pendingUpdate) throw new Error("No update pending — run check first.");
  let total = 0;
  let received = 0;
  await pendingUpdate.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
      onProgress(total ? 0 : -1);
    } else if (event.event === "Progress") {
      received += event.data.chunkLength;
      onProgress(total ? Math.min(99, Math.round((received / total) * 100)) : -1);
    } else if (event.event === "Finished") {
      onProgress(100);
    }
  });
  await relaunch();
}

