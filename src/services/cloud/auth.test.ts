import { describe, expect, it } from "vitest";
import {
  isAuthDeepLink,
  parseAuthDeepLink,
  displayNameFor,
  looksLikeEmail,
  normalizeCode,
  AUTH_REDIRECT,
} from "./auth";
import type { User } from "@supabase/supabase-js";

function user(meta: Record<string, unknown>, email?: string): User {
  return { user_metadata: meta, email } as unknown as User;
}

describe("isAuthDeepLink", () => {
  it("accepts the callback link in either case", () => {
    expect(isAuthDeepLink("fnd://auth?code=abc")).toBe(true);
    expect(isAuthDeepLink("FND://AUTH?code=abc")).toBe(true);
    expect(isAuthDeepLink("  fnd://auth#access_token=x  ")).toBe(true);
  });

  it("rejects other links so future fnd:// routes don't hit the auth path", () => {
    expect(isAuthDeepLink("fnd://deck/standard-mono-red")).toBe(false);
    expect(isAuthDeepLink("https://filthy-net-deck.com/auth")).toBe(false);
    expect(isAuthDeepLink("")).toBe(false);
    // Must not match a prefix of a longer word.
    expect(isAuthDeepLink("fnd://authorize?x=1")).toBe(false);
  });
});

describe("parseAuthDeepLink", () => {
  it("reads PKCE query params", () => {
    expect(parseAuthDeepLink("fnd://auth?code=abc123&state=xyz")).toEqual({
      code: "abc123",
      state: "xyz",
    });
  });

  it("reads implicit-flow fragment params", () => {
    const out = parseAuthDeepLink("fnd://auth#access_token=at&refresh_token=rt");
    expect(out.access_token).toBe("at");
    expect(out.refresh_token).toBe("rt");
  });

  it("merges query and fragment when both are present", () => {
    const out = parseAuthDeepLink("fnd://auth?code=c#access_token=at");
    expect(out).toEqual({ code: "c", access_token: "at" });
  });

  it("surfaces provider errors", () => {
    const out = parseAuthDeepLink(
      "fnd://auth?error=access_denied&error_description=User%20cancelled",
    );
    expect(out.error).toBe("access_denied");
    expect(out.error_description).toBe("User cancelled");
  });

  it("is empty for a link with no params", () => {
    expect(parseAuthDeepLink("fnd://auth")).toEqual({});
  });
});

describe("displayNameFor", () => {
  it("prefers provider display names in order", () => {
    expect(displayNameFor(user({ full_name: "Ada L", name: "ada" }))).toBe("Ada L");
    expect(displayNameFor(user({ name: "ada" }))).toBe("ada");
    expect(displayNameFor(user({ preferred_username: "ada_l" }))).toBe("ada_l");
  });

  it("falls back to email, then null", () => {
    expect(displayNameFor(user({}, "a@b.com"))).toBe("a@b.com");
    expect(displayNameFor(user({}))).toBeNull();
    expect(displayNameFor(null)).toBeNull();
  });

  it("ignores blank metadata rather than showing an empty name", () => {
    expect(displayNameFor(user({ full_name: "   " }, "a@b.com"))).toBe("a@b.com");
  });
});

describe("looksLikeEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(looksLikeEmail("a@b.com")).toBe(true);
    expect(looksLikeEmail("  first.last+tag@sub.example.co.uk  ")).toBe(true);
  });

  it("rejects the common typos before a network round trip", () => {
    expect(looksLikeEmail("")).toBe(false);
    expect(looksLikeEmail("nope")).toBe(false);
    expect(looksLikeEmail("a@b")).toBe(false); // no TLD
    expect(looksLikeEmail("a b@c.com")).toBe(false); // space
    expect(looksLikeEmail("a@@b.com")).toBe(false);
    expect(looksLikeEmail(`${"x".repeat(250)}@b.com`)).toBe(false); // too long
  });
});

describe("normalizeCode", () => {
  it("strips whatever the mail client pasted in", () => {
    expect(normalizeCode("123456")).toBe("123456");
    expect(normalizeCode(" 123 456 ")).toBe("123456");
    expect(normalizeCode("123-456")).toBe("123456");
  });

  it("caps at six digits and drops letters", () => {
    expect(normalizeCode("1234567890")).toBe("123456");
    expect(normalizeCode("abc123")).toBe("123");
    expect(normalizeCode("")).toBe("");
  });
});

describe("AUTH_REDIRECT", () => {
  it("points at the hosted bounce page (must be allowlisted in Supabase)", () => {
    expect(AUTH_REDIRECT).toBe("https://filthy-net-deck.com/auth/callback.html");
  });
});
