/**
 * Supabase project config.
 *
 * The publishable key is **designed to be public** — it identifies the project
 * and nothing more; every table is protected by RLS and the health ping goes
 * through an Edge Function that holds the privileged key server-side. It is the
 * same class of value as a Firebase web config. The *service role* key is a
 * different thing entirely and must never appear in this repo.
 *
 * Empty `SUPABASE_URL` disables every cloud affordance in the app, the same way
 * an empty `DONATE_URL` hides the tip jar (see `site.ts`). That keeps the
 * offline/no-backend path trivially testable.
 */

/**
 * ⚠️ This origin must also appear in `connect-src` in
 * `src-tauri/tauri.conf.json`. The Vite dev server does not enforce that CSP,
 * so a missing entry works perfectly in `tauri:dev` and is blocked for every
 * real user — caught just before shipping 2.7.5. Any new cloud host needs the
 * same treatment, and the check only means something in an installed build.
 */
export const SUPABASE_URL = "https://bzcryoocsapqtyhiwzbe.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tHajCDbl4J4AIvaoWnEpWg_XiQPkESE";

/** True when a backend is configured at all. */
export function cloudConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

/** Absolute URL for an Edge Function by name. */
export function functionUrl(name: string): string {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}
