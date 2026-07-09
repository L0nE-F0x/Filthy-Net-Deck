import { APP_VERSION } from "../version";

export interface RemoteVersion {
  version: string;
  downloadUrl?: string;
  notes?: string;
}

export async function fetchRemoteVersion(
  baseUrl = "https://filthy-net-deck.netlify.app",
): Promise<RemoteVersion | null> {
  try {
    const res = await fetch(`${baseUrl}/version.json`, { cache: "no-cache" });
    if (!res.ok) return null;
    return (await res.json()) as RemoteVersion;
  } catch {
    return null;
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
