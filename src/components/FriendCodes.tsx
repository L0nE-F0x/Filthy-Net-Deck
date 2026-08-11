/**
 * Friend codes — the way into Phase 5's light social, in Settings next to the
 * rest of the account surface.
 *
 * A code is not a handle: a handle is a public identity with a page anyone can
 * find, a code is a private token you hand to someone you know. Handing it over
 * is the consent, so there is no request/accept flow. It can be rolled, which
 * is the remedy if it ends up somewhere public.
 */

import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import type { FriendLine } from "../services/cloud/friends";

export function FriendCodes() {
  const authName = useAppStore((s) => s.authName);
  const [code, setCode] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const [friends, setFriends] = useState<FriendLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = async () => {
    const m = await import("../services/cloud/friends");
    const lines = await m.friendLines(null);
    setFriends(lines.filter((l) => !l.isMe));
  };

  useEffect(() => {
    if (!authName) {
      setCode(null);
      setFriends([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const m = await import("../services/cloud/friends");
        // Minting on open is fine: a code is meaningless until it is shared,
        // and having one ready is the difference between sharing it now and
        // "I'll do it later".
        const mine = await m.myFriendCode();
        if (!cancelled) setCode(mine);
        if (!cancelled) await reload();
      } catch {
        /* leave the section quiet rather than showing an error nobody can act on */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authName]);

  if (!authName) return null;

  const add = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const m = await import("../services/cloud/friends");
      await m.addFriendByCode(entry);
      setEntry("");
      await reload();
      setMsg("Added.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not add that code.");
    } finally {
      setBusy(false);
    }
  };

  const drop = async (userId: string) => {
    setBusy(true);
    try {
      const m = await import("../services/cloud/friends");
      await m.removeFriend(userId);
      await reload();
    } catch {
      /* the list below is the source of truth; a failed remove simply stays */
    } finally {
      setBusy(false);
    }
  };

  const roll = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const m = await import("../services/cloud/friends");
      setCode(await m.myFriendCode(true));
      setMsg("New code. The old one no longer works.");
    } catch {
      setMsg("Could not change the code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-note mt-3">
      <p className="m-0 mb-2 text-xs text-muted">
        <strong className="text-foam">Friends</strong> — swap codes with people
        you actually play with and compare seasons on the Climb page. No chat,
        no requests: a code is the invitation.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Your code</span>
          <span className="flex items-center gap-2">
            <code className="friend-code">{code ?? "…"}</code>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!code}
              onClick={() => {
                if (!code) return;
                void navigator.clipboard?.writeText(code).then(
                  () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  },
                  () => setMsg("Could not copy — select it by hand."),
                );
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              title="Issue a new code. Anyone who hasn't added you yet will need the new one."
              onClick={() => void roll()}
            >
              New code
            </button>
          </span>
        </label>
        <label className="flex flex-col gap-1 grow" style={{ minWidth: "11rem" }}>
          <span className="text-xs text-muted">Add a friend&apos;s code</span>
          <span className="flex items-center gap-2">
            <input
              className="input grow"
              value={entry}
              maxLength={12}
              placeholder="ABCD2345"
              spellCheck={false}
              onChange={(e) => setEntry(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && entry.trim()) void add();
              }}
            />
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy || !entry.trim()}
              onClick={() => void add()}
            >
              Add
            </button>
          </span>
        </label>
      </div>
      {msg && <p className="text-xs text-muted m-0 mt-2">{msg}</p>}
      {friends.length > 0 && (
        <ul className="friend-list mt-2">
          {friends.map((f) => (
            <li key={f.userId}>
              <span className="truncate">{f.name}</span>
              <span className="text-xs text-muted">
                {f.matches ? `${f.wins}–${f.losses}` : "nothing shared"}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => void drop(f.userId)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
