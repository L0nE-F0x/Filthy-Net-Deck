import { APP_VERSION } from "../version";
import { detectOs, type OsName } from "./platform";
import { SITE_ORIGIN, SITE_ORIGINS } from "./site";

export interface RemoteVersion {
  version: string;
  /**
   * What a client older than the `downloads` map reads. Those clients read it
   * on every OS, so it points at the download page rather than any one
   * platform's installer — see the note in `scripts/bump-version.mjs`.
   */
  downloadUrl?: string;
  /**
   * Per-OS installers. Absent entries are deliberate, not gaps: Linux ships
   * through a package manager and has nothing to hand a browser.
   */
  downloads?: Partial<Record<OsName, string>>;
  notes?: string;
  /** Optional mandatory flag for future hard-force updates */
  mandatory?: boolean;
}

export type VersionCheckResult =
  | { status: "update"; remote: RemoteVersion }
  | { status: "latest"; remote: RemoteVersion }
  | { status: "error"; message: string };

const DEFAULT_BASE = SITE_ORIGIN;

/** Resolve version.json URL — official CDN (primary custom domain). */
export function versionJsonUrl(baseUrl = DEFAULT_BASE): string {
  return `${baseUrl.replace(/\/$/, "")}/version.json`;
}

async function fetchVersionFromBase(
  baseUrl: string,
): Promise<RemoteVersion | null> {
  const url = `${versionJsonUrl(baseUrl)}?t=${Date.now()}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RemoteVersion;
    if (!data?.version) return null;
    return data;
  } catch {
    return null;
  }
}

export async function fetchRemoteVersion(
  baseUrl = DEFAULT_BASE,
): Promise<RemoteVersion | null> {
  const first = await fetchVersionFromBase(baseUrl);
  if (first) return first;
  for (const origin of SITE_ORIGINS) {
    if (origin === baseUrl.replace(/\/$/, "")) continue;
    const alt = await fetchVersionFromBase(origin);
    if (alt) return alt;
  }
  return null;
}

/** Full check with distinct outcomes for Settings UI. */
export async function checkRemoteVersion(
  local: string = APP_VERSION,
): Promise<VersionCheckResult> {
  try {
    const remote = await fetchRemoteVersion();
    if (!remote?.version) {
      return {
        status: "error",
        message:
          "Could not reach version.json on filthy-net-deck.com (or legacy Netlify host). Check network / CORS.",
      };
    }
    if (isNewer(remote.version, local)) {
      return { status: "update", remote };
    }
    return { status: "latest", remote };
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof Error
          ? `Update check failed: ${e.message}`
          : "Update check failed (network or CORS).",
    };
  }
}

/**
 * The installer to offer *this* machine, or undefined when there is none.
 *
 * Falling back to the bare `downloadUrl` for every OS is what shipped through
 * 3.4.0, and it offered macOS and Linux users a Windows `.exe`. An OS with no
 * entry in `downloads` now gets nothing, so Settings can show it the right
 * route instead of a wrong download — Linux has no entry by design.
 */
export function pickDownloadUrl(
  remote: RemoteVersion,
  os: OsName = detectOs(),
): string | undefined {
  const perOs = remote.downloads?.[os];
  if (perOs) return perOs;
  return os === "windows" ? remote.downloadUrl : undefined;
}

/** Returns true if remote is newer than local (simple semver-ish compare). */
export function isNewer(remote: string, local: string = APP_VERSION): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/i, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const a = parse(remote);
  const b = parse(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}
