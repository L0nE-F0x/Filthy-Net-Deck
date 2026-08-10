/**
 * health-ping — Phase 2 slice 0.
 * Design: docs/BACKEND-PHASE-2.md §7.1
 *
 * The client never touches the database directly: it POSTs here and this
 * function writes with the service-role key. That keeps every privileged
 * credential server-side and lets the schema change without shipping an app
 * update.
 *
 * Deploy:  supabase functions deploy health-ping
 * Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the
 *          platform — do not add them by hand, and never put them in the repo.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

/** Very cheap in-memory IP throttle. Instances are recycled, so this is a speed
 *  bump against a trivial flood, not a security control — the real cap is the
 *  (install_id, day) primary key, which makes repeat writes idempotent. */
const seen = new Map<string, number>();
const MAX_PER_MINUTE = 30;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  const key = `${ip}:${minute}`;
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  if (seen.size > 5_000) seen.clear(); // bound memory
  return n > MAX_PER_MINUTE;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clampInt(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
  if (n === null) return null;
  return Math.min(hi, Math.max(lo, n));
}

function shortStr(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: CORS });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return new Response("slow down", { status: 429, headers: CORS });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400, headers: CORS });
  }

  const installId = shortStr(body.installId, 36);
  if (!installId || !UUID_RE.test(installId)) {
    return new Response("bad installId", { status: 400, headers: CORS });
  }

  // Allowlist + clamp. Anything not named here is dropped on the floor, so a
  // future client that sends extra fields cannot silently start storing them.
  const row = {
    install_id: installId,
    day: new Date().toISOString().slice(0, 10), // server-side date; clients lie
    app_version: shortStr(body.appVersion, 20) ?? "unknown",
    parser_version: shortStr(body.parserVersion, 20),
    os: shortStr(body.os, 16),
    log_found: boolOrNull(body.logFound),
    detailed_logs: boolOrNull(body.detailedLogs),
    parse_errors: clampInt(body.parseErrors, 0, 1_000_000) ?? 0,
    matches_last_24h: clampInt(body.matchesLast24h, 0, 1_000),
    updated_at: new Date().toISOString(),
  };

  // Privileged key. Supabase's newer projects use the `sb_secret_…` key system
  // and inject it under a different name than the legacy service-role key, so
  // accept either. Getting this wrong is silent: `createClient` with an
  // undefined key still builds, then every write lands as `anon` and RLS
  // (correctly) refuses it — which looks like a database fault, not a config one.
  const url = Deno.env.get("SUPABASE_URL");
  const secret =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SERVICE_ROLE_KEY");

  if (!url || !secret) {
    console.error(
      "health-ping: no privileged key in env. Checked " +
        "SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SECRET_KEY, SERVICE_ROLE_KEY.",
    );
    return new Response(
      JSON.stringify({ ok: false, stage: "config", haveUrl: Boolean(url) }),
      { status: 500, headers: { ...CORS, "content-type": "application/json" } },
    );
  }

  const supabase = createClient(url, secret, {
    auth: { persistSession: false },
  });

  const { error } = await supabase
    .from("health_pings")
    .upsert(row, { onConflict: "install_id,day" });

  if (error) {
    // Log the full error server-side; return only the Postgres error code.
    // The endpoint is public, so the message itself stays out of the response.
    console.error("health-ping upsert failed", error.code, error.message);
    return new Response(
      JSON.stringify({ ok: false, stage: "upsert", code: error.code ?? null }),
      { status: 500, headers: { ...CORS, "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS, "content-type": "application/json" },
  });
});
