/**
 * Sign-in — Phase 2 slice 2. Design: `docs/BACKEND-PHASE-2.md` §6.
 *
 * The app never renders a provider's login form. Sign-in opens the **system
 * browser**, the provider returns to `filthy-net-deck.com/auth/callback`, and
 * that page bounces to `fnd://auth?…` which the desktop app receives.
 *
 * That hop is mandatory, not stylistic: **Google refuses OAuth from embedded
 * webviews**, so an in-app window would simply be rejected. It is also better
 * security — the user types their password into their own browser, where they
 * can see the real URL bar.
 *
 * Nothing here is required to use the app. Every cloud feature is opt-in and
 * the tracker works fully signed out.
 */

import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { isTauri } from "../appUpdater";
import { openExternal } from "../openExternal";
import { SITE_ORIGIN } from "../site";
import { cloudConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";
import { tauriAuthStorage } from "./authStorage";

export type OAuthProvider = "google" | "discord";

/** Where the provider sends the browser back to. Must be allowlisted in the
 *  Supabase dashboard under Authentication → URL Configuration. */
export const AUTH_REDIRECT = `${SITE_ORIGIN}/auth/callback.html`;

let clientPromise: Promise<SupabaseClient> | null = null;

export async function getSupabase(): Promise<SupabaseClient> {
  if (!cloudConfigured()) throw new Error("cloud not configured");
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then((m) =>
      m.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          storage: tauriAuthStorage,
          persistSession: true,
          autoRefreshToken: true,
          // The app is not a browser tab: the callback arrives as a deep link
          // and is exchanged explicitly in `completeSignIn`, so the client must
          // not try to read a code out of window.location.
          detectSessionInUrl: false,
          flowType: "pkce",
        },
      }),
    );
  }
  return clientPromise;
}

/**
 * Begin sign-in. Returns once the browser has been opened — the session
 * arrives later via the deep link, so callers should not await a user here.
 */
export async function startSignIn(provider: OAuthProvider): Promise<void> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: AUTH_REDIRECT,
      // We open the browser ourselves — in Tauri, letting the SDK navigate
      // would replace the app's own webview with the provider's page.
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("no OAuth URL returned");
  await openExternal(data.url);
}

/** True when a URL is the OAuth callback this app expects. */
export function isAuthDeepLink(url: string): boolean {
  return /^fnd:\/\/auth\b/i.test(url.trim());
}

/**
 * Parse the deep link the callback page produced. Query and fragment are both
 * folded into one bag on purpose — PKCE returns `?code=`, the implicit flow
 * returns `#access_token=`, and failures return `?error=`.
 */
export function parseAuthDeepLink(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = url.trim();
  const q = raw.indexOf("?");
  const h = raw.indexOf("#");
  const parts: string[] = [];
  if (q >= 0) parts.push(raw.slice(q + 1, h > q ? h : undefined));
  if (h >= 0) parts.push(raw.slice(h + 1));
  for (const part of parts) {
    if (!part) continue;
    for (const [k, v] of new URLSearchParams(part)) out[k] = v;
  }
  return out;
}

export type SignInResult =
  | { status: "signed-in"; user: User }
  | { status: "error"; message: string };

/**
 * Finish sign-in from the deep-link URL. Idempotent: a duplicate delivery of
 * the same link resolves to the already-established session rather than
 * erroring, which matters because Windows can deliver a link twice (cold start
 * plus the single-instance hook).
 */
export async function completeSignIn(url: string): Promise<SignInResult> {
  const params = parseAuthDeepLink(url);
  if (params.error) {
    return {
      status: "error",
      message: params.error_description || params.error,
    };
  }

  const supabase = await getSupabase();

  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (!error && data?.user) return { status: "signed-in", user: data.user };
    // A second delivery of the same code fails — fall through and check whether
    // the first one already succeeded before reporting an error.
    const existing = await supabase.auth.getUser();
    if (existing.data?.user) return { status: "signed-in", user: existing.data.user };
    return { status: "error", message: error?.message ?? "sign-in failed" };
  }

  if (params.access_token && params.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) return { status: "error", message: error.message };
    if (data.user) return { status: "signed-in", user: data.user };
  }

  return { status: "error", message: "no credentials in callback" };
}

// ---------------------------------------------------------------------------
// Email sign-in — a 6-digit code, deliberately not a password
// ---------------------------------------------------------------------------
//
// No password to store, leak or reset; no "forgot password" flow; and unlike a
// magic *link*, the code is typed into the app so it needs no deep-link hop.
// Same account either way: signing in later with a Google address that matches
// an email account lands on the same user.

/** Basic shape check so obvious typos fail before a network round trip. */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;
}

/** Send the code. Creates the account on first use. */
export async function sendEmailCode(email: string): Promise<void> {
  const address = email.trim().toLowerCase();
  if (!looksLikeEmail(address)) throw new Error("That doesn't look like an email address.");
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email: address,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/** Codes are 6 digits; tolerate spaces people paste in from a mail client. */
export function normalizeCode(code: string): string {
  return code.replace(/\D+/g, "").slice(0, 6);
}

export async function verifyEmailCode(email: string, code: string): Promise<SignInResult> {
  const address = email.trim().toLowerCase();
  const token = normalizeCode(code);
  if (token.length !== 6) {
    return { status: "error", message: "Enter the 6-digit code from the email." };
  }
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.verifyOtp({
      email: address,
      token,
      type: "email",
    });
    if (error) return { status: "error", message: error.message };
    if (data.user) return { status: "signed-in", user: data.user };
    return { status: "error", message: "That code didn't work. Try again." };
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : "Sign-in failed.",
    };
  }
}

export async function getCurrentUser(): Promise<User | null> {
  if (!cloudConfigured() || !isTauri()) return null;
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getUser();
    return data?.user ?? null;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
  } catch {
    /* already gone */
  }
}

/** Display name for the signed-in user — provider metadata, else the email. */
export function displayNameFor(user: User | null): string | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  for (const k of ["full_name", "name", "user_name", "preferred_username"]) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return user.email ?? null;
}

export type { Session, User };
