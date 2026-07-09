import { APP_VERSION } from "../version";

export interface RemoteVersion {
  version: string;
  downloadUrl?: string;
  notes?: string;
  /** Optional mandatory flag for future hard-force updates */
  mandatory?: boolean;
}

export type VersionCheckResult =
  | { status: "update"; remote: RemoteVersion }
  | { status: "latest"; remote: RemoteVersion }
  | { status: "error"; message: string };

const DEFAULT_BASE = "https://filthy-net-deck.netlify.app";

/** Resolve version.json URL (supports meta-url override host). */
export function versionJsonUrl(baseUrl = DEFAULT_BASE): string {
  try {
    const override = localStorage.getItem("bbi.metaUrl");
    if (override) {
      const u = new URL(override);
      return `${u.origin}/version.json`;
    }
  } catch {
    /* ignore */
  }
  return `${baseUrl.replace(/\/$/, "")}/version.json`;
}

export async function fetchRemoteVersion(
  baseUrl = DEFAULT_BASE,
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

/** Full check with distinct outcomes for Settings UI. */
export async function checkRemoteVersion(
  local: string = APP_VERSION,
): Promise<VersionCheckResult> {
  const url = versionJsonUrl();
  try {
    const res = await fetch(`${url}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return {
        status: "error",
        message: `Could not reach version.json (${res.status}). Check network / CORS.`,
      };
    }
    const remote = (await res.json()) as RemoteVersion;
    if (!remote?.version) {
      return { status: "error", message: "version.json missing a version field." };
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
