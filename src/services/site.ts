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
