/**
 * /api/fnd-stats — owner-only read of the install counters written by
 * netlify/functions/version.mts.
 *
 * Auth: set FND_STATS_TOKEN in the Netlify site environment, then call
 *   https://filthy-net-deck.com/api/fnd-stats?token=<value>
 * Optional ?days=N (default 30, max 180).
 *
 * There is nothing sensitive in the counters — they are aggregate integers
 * with no identifiers — but the endpoint is gated anyway so competitors can't
 * trivially read install numbers off the site.
 */
import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

interface DayBucket {
  app: number;
  other: number;
  versions: Record<string, number>;
  platforms: Record<string, number>;
}

function mergeInto(target: Record<string, number>, src: Record<string, number>): void {
  for (const [k, v] of Object.entries(src ?? {})) target[k] = (target[k] ?? 0) + v;
}

export default async (req: Request, _context: Context): Promise<Response> => {
  const expected = process.env.FND_STATS_TOKEN;
  const url = new URL(req.url);

  if (!expected) {
    return Response.json(
      { error: "FND_STATS_TOKEN is not set on this site. Add it in Netlify → Environment variables." },
      { status: 503 },
    );
  }
  if (url.searchParams.get("token") !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "30", 10) || 30, 1), 180);

  const store = getStore("fnd-install-counts");
  const { blobs } = await store.list();

  // Keys are `YYYY-MM-DD/<shard>`; fold every shard back into its day.
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const byDay = new Map<string, DayBucket>();

  for (const blob of blobs) {
    const day = blob.key.split("/")[0];
    if (!day || day < cutoff) continue;

    const bucket = (await store.get(blob.key, { type: "json" })) as DayBucket | null;
    if (!bucket) continue;

    const acc = byDay.get(day) ?? { app: 0, other: 0, versions: {}, platforms: {} };
    acc.app += bucket.app ?? 0;
    acc.other += bucket.other ?? 0;
    mergeInto(acc.versions, bucket.versions);
    mergeInto(acc.platforms, bucket.platforms);
    byDay.set(day, acc);
  }

  const daily = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({ date, ...b }));

  const totals: DayBucket = { app: 0, other: 0, versions: {}, platforms: {} };
  for (const d of daily) {
    totals.app += d.app;
    totals.other += d.other;
    mergeInto(totals.versions, d.versions);
    mergeInto(totals.platforms, d.platforms);
  }

  const payload = {
    note: "Counts are approximate (sharded read-modify-write). 'app' = requests carrying the Tauri webview Origin; 'other' = bots/browsers. One app request ≈ one launch, plus at most one per 90 min of continuous use.",
    days,
    totals,
    daily,
  };

  // Indented on purpose: this is read by a human pasting the URL into a
  // browser, and Chrome does not reliably pretty-print application/json.
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

export const config: Config = {
  path: "/api/fnd-stats",
};
