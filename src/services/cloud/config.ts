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

/**
 * Email sign-in (6-digit OTP) is **hidden until custom SMTP is configured**.
 *
 * Supabase's built-in mailer is rate-limited per project, and it fails by
 * silently not delivering rather than by returning an error. Under any traffic
 * spike — a video, a launch post — a share of users would enter their address,
 * see "code sent", and never receive one. That reads as a broken app, and the
 * app cannot detect it or tell them.
 *
 * Google and Discord are both verified live and cover the audience, so the
 * honest move is to offer only the routes that work. The email code path
 * (`sendEmailCode` / `verifyEmailCode` in `auth.ts`) is left intact — flip this
 * to `true` once an SMTP provider is set in the Supabase dashboard.
 *
 * Two things to do before flipping it, neither optional:
 *  1. Verify a real code actually arrives in an installed build. This route has
 *     never been exercised end-to-end against production.
 *  2. Write tests for it. `sendEmailCode` / `verifyEmailCode` currently have
 *     **no coverage at all** — unlike the OAuth path, which `auth.test.ts` and
 *     `authRestore.test.ts` do cover.
 */
export const EMAIL_SIGN_IN_ENABLED = false;

/** Absolute URL for an Edge Function by name. */
export function functionUrl(name: string): string {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}
