/**
 * Official product hosts — dual CDN cutover.
 *
 * Primary: custom domain on Netlify DNS (filthy-net-deck.com).
 * Legacy: original Netlify subdomain — kept forever so already-installed
 * clients (CSP, updater endpoints, silent-install allowlist) keep working.
 *
 * Prefer PRIMARY for new defaults; fall back to LEGACY on fetch failure.
 */

export const SITE_HOST_PRIMARY = "filthy-net-deck.com";
export const SITE_HOST_LEGACY = "filthy-net-deck.netlify.app";

export const SITE_ORIGIN_PRIMARY = `https://${SITE_HOST_PRIMARY}`;
export const SITE_ORIGIN_LEGACY = `https://${SITE_HOST_LEGACY}`;

/** Hostnames allowed for in-app open / Events-style link filters. */
export const SITE_HOSTS = [SITE_HOST_PRIMARY, SITE_HOST_LEGACY] as const;

/** Short brand line for share / recap cards (no scheme). */
export const SITE_BRAND_HOST = SITE_HOST_PRIMARY;

/** Default public site origin for meta, version, sets, user-agent, etc. */
export const SITE_ORIGIN = SITE_ORIGIN_PRIMARY;

/** Ordered CDN bases to try (primary first, then legacy). */
export const SITE_ORIGINS = [SITE_ORIGIN_PRIMARY, SITE_ORIGIN_LEGACY] as const;

/**
 * Tip jar — Ko-fi, which pays straight through to the owner's PayPal.
 * (PayPal.Me is not offered to Indonesian personal accounts.)
 *
 * Optional and entirely passive — no account, no nag, no gated features. The
 * app is free and stays free; this is a "if it helped, buy me a coffee" link
 * in Settings → About and nowhere else.
 *
 * Platform-agnostic on purpose: an empty string hides every donate affordance
 * in the app, and swapping providers is a one-line change here. Keep it in
 * sync with the link in `website/index.html`.
 */
export const DONATE_URL = "https://ko-fi.com/filthynetdeck";

/**
 * Privacy page — publishes the upload field allowlist verbatim
 * (`docs/BACKEND-PHASE-2.md` §8). Linked from Settings → Data & privacy so the
 * full list is one click from the toggle that turns uploading on, rather than
 * something a user has to go looking for on the website.
 */
export const PRIVACY_URL = `${SITE_ORIGIN_PRIMARY}/privacy.html`;

/**
 * Public status page — the "we know, fix incoming" channel for an Arena update
 * that breaks log parsing (`docs/PLATFORM-STRATEGY.md` §2.7). Backed by
 * `website/status.json`, which the in-app banner reads too, so the page and the
 * app can never disagree about whether there is an incident.
 */
export const STATUS_URL = `${SITE_ORIGIN_PRIMARY}/status.html`;

/**
 * Suggest a feature / report a bug. Lands on the public form at
 * `/feedback.html` (Netlify Forms) so people do not need a GitHub account.
 * An empty string hides every feedback affordance in the app.
 */
export const FEEDBACK_URL = `${SITE_ORIGIN_PRIMARY}/feedback.html`;

/** App-originated feedback URL — stamps version so the form can include it. */
export function appFeedbackUrl(version: string): string {
  if (!FEEDBACK_URL) return "";
  const u = new URL(FEEDBACK_URL);
  u.searchParams.set("from", "app");
  if (version) u.searchParams.set("v", version);
  return u.toString();
}
