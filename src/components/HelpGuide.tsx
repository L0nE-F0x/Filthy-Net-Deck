import { useEffect, useState, type ReactNode } from "react";
import { useAppStore } from "../store/useAppStore";
import type { Page } from "../types/meta";

/** One-shot first-run flag — the tour auto-opens once per PC, then never again. */
const SEEN_KEY = "bbi.helpSeen.v1";

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

function wasSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

interface Topic {
  id: string;
  label: string;
  /** Optional nav page this topic can jump to. */
  page?: Page;
  body: ReactNode;
}

function K({ children }: { children: ReactNode }) {
  return <kbd className="settings-kbd">{children}</kbd>;
}

const TOPICS: Topic[] = [
  {
    id: "welcome",
    label: "Welcome",
    body: (
      <>
        <p>
          <strong>Filthy Net Deck</strong> is a desktop MTG Arena companion: today’s real ranked
          Standard &amp; Pioneer meta, plus a private match tracker that reads Arena’s own log on
          this PC. Nothing you play is ever uploaded.
        </p>
        <p className="help-steps-head">Three steps and you’re rolling:</p>
        <ol>
          <li>
            In Arena, turn on <em>Options → Account → Detailed Logs (Plugin Support)</em> — that’s
            the whole setup.
          </li>
          <li>
            Keep FND running (or in the tray) while you play. Every match lands in{" "}
            <strong>My Stats</strong> the moment it ends, and the in-game overlay tracks your
            library live.
          </li>
          <li>
            Browse <strong>Decks</strong> for today’s board, copy any list with one click, and
            watch <strong>Climb</strong> chart your ladder by deck.
          </li>
        </ol>
        <p>
          Everything below is a page-by-page tour — reopen it anytime with the{" "}
          <strong>Help</strong> button in the top bar.
        </p>
      </>
    ),
  },
  {
    id: "decks",
    label: "Decks & Events",
    page: "daily",
    body: (
      <>
        <p>
          <strong>Decks</strong> is the daily home: the current ranked board for Standard and
          Pioneer, Bo1/Bo3 aware (toggle in the top bar). Open any deck for the full 75, matchup
          notes, sideboard guide, and a one-click Arena import copy.
        </p>
        <p>
          Lists come from real tournament and ladder results via a daily pipeline — there are no
          placeholder decks. The feed refreshes itself; the dot in the top bar shows live vs
          cached.
        </p>
        <p>
          <strong>Events</strong> tracks tournament results and meta movement over time —
          share-of-field timelines and movers.
        </p>
      </>
    ),
  },
  {
    id: "stats",
    label: "My Stats",
    page: "stats",
    body: (
      <>
        <p>
          Your private tracker. Win rates by season, queue, and deck; play/draw and mulligan
          splits; opponent archetypes inferred from cards actually seen. Click any deck for its
          full story: decklist (switch <em>Stacked / List / Text</em> views), version history with
          card-by-card diffs, and match history.
        </p>
        <p>
          <strong>Fresh runs</strong> hide a deck’s older matches without deleting anything —
          perfect for “new season, new me”. Share cards (deck, week recap) render as branded PNGs
          for Discord or X.
        </p>
      </>
    ),
  },
  {
    id: "climb",
    label: "Climb",
    page: "climb",
    body: (
      <>
        <p>
          Your ladder, charted by deck: every rank stamp Arena writes becomes a point, colored by
          the deck you piloted. Hover for rank + deck, click to open that deck’s stats. Once
          you’re in <strong>Mythic</strong> the chart zooms into your percentile (or leaderboard
          place) so the line keeps moving instead of flatlining at the top.
        </p>
        <p>
          The <strong>Climb path</strong> below lists each stretch on a deck — newest first by
          default, flip the order with the toggle. “Matches to next rank” is estimated from your
          own history, not a made-up constant.
        </p>
      </>
    ),
  },
  {
    id: "matchups",
    label: "Matchup Lab",
    page: "matchups",
    body: (
      <>
        <p>
          Book-keeping on opponents: tag them by archetype (FND suggests a tag from cards seen),
          jot matchup notes, and read your personal win rate against each archetype. The overlay
          uses this — mid-match it shows your historical record versus the deck it thinks you’re
          facing.
        </p>
      </>
    ),
  },
  {
    id: "brewlab",
    label: "Brew Lab",
    page: "brewlab",
    body: (
      <>
        <p>
          The list clinic. Pick any tracked deck — or <strong>paste any list</strong> (Arena
          export, MTGO text) — and it’s graded against today’s ranked peer field: mana base,
          curve, interaction density, staple alignment, sideboard readiness, rolled into an
          honest letter grade.
        </p>
        <p>
          Everything is arithmetic on real ranked lists already in the feed — no AI, no invented
          cards. Clinic a brew <em>before</em> you spend wildcards, then copy the report as plain
          text.
        </p>
      </>
    ),
  },
  {
    id: "overlay",
    label: "In-game overlay",
    body: (
      <>
        <p>
          A slim always-on-top tracker during matches: cards left in your library with next-draw
          odds, lands remaining, opponent archetype guess, and your record versus it. Drag to
          move, resize from the edges; it snaps to screen edges.
        </p>
        <p>
          It starts as a minimal bar — <K>▾</K> expands the full list. The minimized bar shows
          library / lands / record / clock; the <K>⚙</K> pill in the expanded footer changes
          opacity and toggles <em>without alt-tabbing</em>. Careful with{" "}
          <strong>click-through</strong>: the overlay stops taking mouse input entirely — turn it
          back off in Settings in the main app.
        </p>
        <p>
          If Arena runs exclusive fullscreen and hides the overlay, switch Arena to borderless
          windowed.
        </p>
        <p>
          <strong>Alerts mid-match.</strong> Windows mutes its own notification banners while a
          game — or any app — runs fullscreen, and no app can opt out of that. So match-end and
          the other alerts are also painted in a small always-on-top card, top-right for 7s
          (Settings → Notifications → <em>Show alerts over fullscreen Arena</em>). It is
          click-through, so it never steals a click from Arena.
        </p>
      </>
    ),
  },
  {
    id: "world",
    label: "Sets & Format Hub",
    page: "formats",
    body: (
      <>
        <p>
          <strong>Sets</strong> is the set radar: spoiler galleries, Arena drop dates (with a
          countdown badge on the nav), and what’s new since your last visit.{" "}
          <strong>Format Hub</strong> answers “is this legal?” — rotation timelines and ban lists
          for Standard and Pioneer, with desktop pings when a B&amp;R announcement lands (toggle in
          Settings).
        </p>
      </>
    ),
  },
  {
    id: "settings",
    label: "Settings & shortcuts",
    page: "settings",
    body: (
      <>
        <p>
          Settings has grown a full <strong>Interface</strong> card: launch page, decklist view
          default, climb order, overlay bar widgets, reduced motion, themes, sounds,
          notifications — nearly everything is a toggle now.
        </p>
        <ul className="help-kbd-list">
          <li>
            <K>1–9</K> jump straight to each nav page (in sidebar order)
          </li>
          <li>
            <K>Ctrl+K</K> command palette — search cards, decks, pages
          </li>
          <li>
            <K>F11</K> fullscreen on/off
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "privacy",
    label: "Data & privacy",
    body: (
      <>
        <p>
          The tracker tails Arena’s own <em>Player.log</em> on this PC. Matches, ranks, and
          opponents are stored locally (<em>tracker-matches.jsonl</em> in the app’s data folder)
          and never uploaded anywhere. Card names and art are cached locally for offline use.
        </p>
        <p>
          Export everything as CSV from My Stats, or delete per-deck / all history — deletion is
          real (tombstoned so backfills can’t resurrect it). Fan project, not affiliated with
          Wizards of the Coast.
        </p>
      </>
    ),
  },
];

/**
 * Help center + first-run tour (v2.0). Opens automatically once on a fresh
 * install, afterwards from the top-bar Help button or Settings.
 */
export function HelpGuide() {
  const open = useAppStore((s) => s.helpOpen);
  const setOpen = useAppStore((s) => s.setHelpOpen);
  const setPage = useAppStore((s) => s.setPage);
  const [topicId, setTopicId] = useState<string>("welcome");

  // First run: open the tour once, shortly after boot so it never fights the
  // splash screen.
  useEffect(() => {
    if (wasSeen()) return;
    const t = window.setTimeout(() => {
      markSeen();
      useAppStore.getState().setHelpOpen(true);
    }, 900);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const topic = TOPICS.find((t) => t.id === topicId) ?? TOPICS[0];
  const idx = TOPICS.indexOf(topic);

  return (
    <div
      className="help-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="help-modal" role="dialog" aria-modal="true" aria-label="Help and tour">
        <header className="help-head">
          <h2 className="m-0">Help &amp; tour</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setOpen(false)}
            aria-label="Close help"
          >
            ✕ Close
          </button>
        </header>
        <div className="help-body">
          <nav className="help-nav" aria-label="Help topics">
            {TOPICS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`help-nav-btn${t.id === topic.id ? " active" : ""}`}
                onClick={() => setTopicId(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <article className="help-content selectable" key={topic.id}>
            <h3 className="m-0 mb-2">{topic.label}</h3>
            {topic.body}
            <div className="help-content-actions">
              {topic.page && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setOpen(false);
                    setPage(topic.page!);
                  }}
                >
                  Take me there →
                </button>
              )}
            </div>
          </article>
        </div>
        <footer className="help-foot">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={idx === 0}
            onClick={() => setTopicId(TOPICS[Math.max(0, idx - 1)].id)}
          >
            ‹ Back
          </button>
          <span className="help-foot-dots" aria-hidden="true">
            {TOPICS.map((t, i) => (
              <i key={t.id} className={i === idx ? "on" : ""} />
            ))}
          </span>
          {idx < TOPICS.length - 1 ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setTopicId(TOPICS[idx + 1].id)}
            >
              Next ›
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setOpen(false)}
            >
              Done — go play
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
