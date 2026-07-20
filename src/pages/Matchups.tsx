import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  currentSeasonKey,
  deckKey,
  gameScore,
  seasonKeyOf,
  seasonLabel,
  timeAgo,
} from "../services/tracker";
import {
  getOpponentNote,
  listKnownTags,
  loadAllOpponentNotes,
  opponentKey,
  setOpponentNote,
} from "../services/matchupNotes";
import { winrateFavor } from "../services/ranks";
import { resolveMetaDeckByTag } from "../services/deepLinks";
import type { MatchResult, TrackedMatch } from "../types/tracker";
import { TrackerOnboarding } from "../components/TrackerOnboarding";

const RESULT_LABEL: Record<MatchResult, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  unknown: "?",
};

interface OppGroup {
  key: string;
  name: string;
  matches: TrackedMatch[];
  wins: number;
  losses: number;
  rate: number | null;
  lastAt: number;
  decks: string[];
  tag?: string;
  notes?: string;
}

type SortKey = "recent" | "matches" | "rate" | "losses" | "name";

function groupOpponents(
  matches: TrackedMatch[],
  notes: ReturnType<typeof loadAllOpponentNotes>,
): OppGroup[] {
  const by = new Map<string, TrackedMatch[]>();
  for (const m of matches) {
    const k = opponentKey(m.opponentName);
    let list = by.get(k);
    if (!list) {
      list = [];
      by.set(k, list);
    }
    list.push(m);
  }
  const out: OppGroup[] = [];
  for (const [key, list] of by) {
    const wins = list.filter((m) => m.result === "win").length;
    const losses = list.filter((m) => m.result === "loss").length;
    const decided = wins + losses;
    const decks = [
      ...new Set(list.map((m) => m.deckName).filter((n): n is string => Boolean(n))),
    ];
    const note = notes[key];
    const name =
      list.find((m) => m.opponentName)?.opponentName?.trim() ||
      (key === "unknown" ? "Unknown" : key);
    out.push({
      key,
      name,
      matches: list,
      wins,
      losses,
      rate: decided > 0 ? wins / decided : null,
      lastAt: Math.max(...list.map((m) => m.endedAt)),
      decks,
      tag: note?.tag,
      notes: note?.notes,
    });
  }
  return out;
}

function sortGroups(groups: OppGroup[], key: SortKey): OppGroup[] {
  return [...groups].sort((a, b) => {
    if (key === "recent") return b.lastAt - a.lastAt;
    if (key === "matches") return b.matches.length - a.matches.length || b.lastAt - a.lastAt;
    if (key === "losses") return b.losses - a.losses || b.matches.length - a.matches.length;
    if (key === "rate") {
      if (a.rate == null && b.rate == null) return b.matches.length - a.matches.length;
      if (a.rate == null) return 1;
      if (b.rate == null) return -1;
      return a.rate - b.rate || b.matches.length - a.matches.length; // worst first
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function RateChip({
  wins,
  losses,
  rate,
  tip,
}: {
  wins: number;
  losses: number;
  rate: number | null;
  tip?: string;
}) {
  const decided = wins + losses;
  const defaultTip =
    decided > 0
      ? `${wins}W–${losses}L · ${rate != null ? `${Math.round(rate * 100)}%` : "—"} of decided games`
      : "No decided games yet";
  return (
    <span className="mu-lab-score" title={tip ?? defaultTip}>
      {wins}W {losses}L
      {rate != null && (
        <strong className={`favor-${winrateFavor(rate)}`}> {(rate * 100).toFixed(0)}%</strong>
      )}
    </span>
  );
}

/** Your record against each archetype tag — the payoff for tagging opponents. */
function TagMatchupPanel({
  matches,
  notes,
  onPickTag,
}: {
  matches: TrackedMatch[];
  notes: ReturnType<typeof loadAllOpponentNotes>;
  onPickTag: (tag: string) => void;
}) {
  const rows = useMemo(() => {
    const byTag = new Map<string, { wins: number; losses: number; total: number }>();
    for (const m of matches) {
      const tag = notes[opponentKey(m.opponentName)]?.tag;
      if (!tag) continue;
      let r = byTag.get(tag);
      if (!r) {
        r = { wins: 0, losses: 0, total: 0 };
        byTag.set(tag, r);
      }
      r.total++;
      if (m.result === "win") r.wins++;
      else if (m.result === "loss") r.losses++;
    }
    return [...byTag.entries()]
      .map(([tag, r]) => ({
        tag,
        ...r,
        rate: r.wins + r.losses > 0 ? r.wins / (r.wins + r.losses) : null,
      }))
      .sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag));
  }, [matches, notes]);

  if (rows.length === 0) return null;

  return (
    <div className="panel">
      <h3
        className="dash-title"
        title="Aggregated from opponents you’ve tagged with an archetype"
      >
        Matchups by archetype
      </h3>
      <div className="meta-bars">
        {rows.map((r) => (
          <button
            key={r.tag}
            type="button"
            className="meta-bar-row deck-wr-row deck-row-btn"
            title={`${r.tag}: ${r.wins}W–${r.losses}L of ${r.total} · ${r.rate != null ? `${Math.round(r.rate * 100)}%` : "—"} — filter opponents with this tag`}
            onClick={() => onPickTag(r.tag)}
          >
            <span className="meta-bar-label">
              <span className="meta-bar-name">{r.tag}</span>
              <span className="text-muted text-[11px]">{r.total} match{r.total === 1 ? "" : "es"}</span>
            </span>
            <span
              className="mu-track"
              title={`${r.wins}W–${r.losses}L vs ${r.tag}`}
            >
              <span
                className={`mu-fill favor-${winrateFavor(r.rate ?? 0)}`}
                style={{ width: `${Math.max(4, (r.rate ?? 0) * 100)}%`, display: "block" }}
              />
            </span>
            <span
              className="deck-wr-score"
              title={
                r.rate != null
                  ? `${Math.round(r.rate * 100)}% vs ${r.tag}`
                  : `No decided games vs ${r.tag}`
              }
            >
              {r.wins}W {r.losses}L
              {r.rate != null && (
                <strong className={`favor-${winrateFavor(r.rate)}`}>
                  {" "}
                  {(r.rate * 100).toFixed(0)}%
                </strong>
              )}
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted m-0 mt-2">
        Built from your archetype tags — tag more opponents to sharpen it. Click a row to filter.
      </p>
    </div>
  );
}

export function Matchups() {
  const matches = useAppStore((s) => s.trackerMatches);
  const refreshTracker = useAppStore((s) => s.refreshTracker);
  const meta = useAppStore((s) => s.meta);
  const openDeck = useAppStore((s) => s.openDeck);
  const openStatsDeck = useAppStore((s) => s.openStatsDeck);
  const matchupsFocusOpponent = useAppStore((s) => s.matchupsFocusOpponent);
  const matchupsFocusTag = useAppStore((s) => s.matchupsFocusTag);
  const clearMatchupsFocus = useAppStore((s) => s.clearMatchupsFocus);
  const tagNudgeOpponent = useAppStore((s) => s.tagNudgeOpponent);
  const clearTagNudge = useAppStore((s) => s.clearTagNudge);
  useEffect(() => {
    void refreshTracker();
  }, [refreshTracker]);
  const [season, setSeason] = useState<string | null>(null);
  const [deckFilter, setDeckFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("recent");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [noteTick, setNoteTick] = useState(0);

  const notes = useMemo(() => {
    void noteTick;
    return loadAllOpponentNotes();
  }, [noteTick]);

  const seasons = useMemo(
    () => [...new Set(matches.map((m) => seasonKeyOf(m.endedAt)))].sort().reverse(),
    [matches],
  );
  const seasonKey =
    season ?? (seasons.includes(currentSeasonKey()) ? currentSeasonKey() : "all");

  const seasonMatches = useMemo(
    () =>
      seasonKey === "all"
        ? matches
        : matches.filter((m) => seasonKeyOf(m.endedAt) === seasonKey),
    [matches, seasonKey],
  );

  const decks = useMemo(() => {
    const names = new Map<string, string>();
    for (const m of seasonMatches) {
      const k = deckKey(m);
      if (!names.has(k) && m.deckName) names.set(k, m.deckName);
    }
    return [...names.entries()].map(([key, name]) => ({ key, name }));
  }, [seasonMatches]);

  const filtered = useMemo(() => {
    let list = seasonMatches;
    if (deckFilter) list = list.filter((m) => deckKey(m) === deckFilter);
    return list;
  }, [seasonMatches, deckFilter]);

  const groups = useMemo(() => {
    let g = groupOpponents(filtered, notes);
    if (tagFilter === "__untagged__") g = g.filter((x) => !x.tag);
    else if (tagFilter) g = g.filter((x) => x.tag === tagFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      g = g.filter(
        (x) =>
          x.name.toLowerCase().includes(q) ||
          (x.tag ?? "").toLowerCase().includes(q) ||
          (x.notes ?? "").toLowerCase().includes(q),
      );
    }
    return sortGroups(g, sort);
  }, [filtered, notes, tagFilter, sort, query]);

  const knownTags = useMemo(() => {
    void noteTick;
    void matches;
    return listKnownTags();
  }, [noteTick, matches]);

  // Tag suggestions: your own tags first, then today's meta archetype names.
  const tagSuggestions = useMemo(() => {
    const seen = new Set(knownTags.map((t) => t.toLowerCase()));
    const out = [...knownTags];
    for (const d of Object.values(meta?.decks ?? {})) {
      const k = d.archetype.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(d.archetype);
      }
    }
    return out;
  }, [knownTags, meta]);

  const selectedGroup = groups.find((g) => g.key === selected) ?? null;

  // Live note fields for the selected opponent
  const [tagDraft, setTagDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const openOpponent = (g: OppGroup) => {
    setSelected(g.key);
    const n = getOpponentNote(g.name);
    setTagDraft(n?.tag ?? g.tag ?? "");
    setNotesDraft(n?.notes ?? g.notes ?? "");
    setEditingKey(g.key);
  };

  // Deep links from Stats / Daily / tag nudge (I1, M2)
  useEffect(() => {
    if (matchupsFocusTag) {
      setTagFilter(matchupsFocusTag);
      clearMatchupsFocus();
    }
  }, [matchupsFocusTag, clearMatchupsFocus]);

  useEffect(() => {
    if (!matchupsFocusOpponent) return;
    const key = opponentKey(matchupsFocusOpponent);
    const g = groups.find((x) => x.key === key);
    if (g) openOpponent(g);
    else {
      setSelected(key);
      setTagDraft("");
      setNotesDraft("");
      setEditingKey(key);
    }
    clearMatchupsFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchupsFocusOpponent, groups.length]);

  useEffect(() => {
    if (!tagNudgeOpponent) return;
    const key = opponentKey(tagNudgeOpponent);
    const g = groups.find((x) => x.key === key);
    if (g) openOpponent(g);
    else {
      setSelected(key);
      setTagDraft("");
      setNotesDraft("");
      setEditingKey(key);
    }
    // leave nudge until dismissed so banner can show
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagNudgeOpponent]);

  const saveNotes = (tag: string, notes: string) => {
    if (!selectedGroup) return;
    setOpponentNote(selectedGroup.name, { tag, notes });
    setNoteTick((t) => t + 1);
  };

  if (matches.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="panel">
          <p className="eyebrow">Matchup Lab</p>
          <h2 className="text-xl font-semibold m-0 tracking-tight">Know your enemies</h2>
          <p className="text-sm text-muted m-0 mt-2 leading-relaxed max-w-xl">
            After you play matches with tracking on, every opponent lands here with win rates,
            the decks you piloted, and room for archetype tags plus prep notes. 100% local.
          </p>
        </div>
        <div className="panel">
          <TrackerOnboarding />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {tagNudgeOpponent && (
        <div className="panel tag-nudge" role="status">
          <div>
            <p className="eyebrow m-0 mb-1">Tag last opponent</p>
            <p className="text-sm m-0">
              You just played <strong className="text-foam">{tagNudgeOpponent}</strong> — add an
              archetype tag so Decks can show your record vs them.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const key = opponentKey(tagNudgeOpponent);
                const g = groups.find((x) => x.key === key);
                if (g) openOpponent(g);
                else {
                  setSelected(key);
                  setTagDraft("");
                  setNotesDraft("");
                  setEditingKey(key);
                }
                clearTagNudge();
              }}
            >
              Tag now
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => clearTagNudge()}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="panel lab-intro">
        <div>
          <p className="eyebrow m-0">Matchup Lab</p>
          <h2 className="text-lg font-semibold m-0 tracking-tight">Opponents &amp; prep notes</h2>
          <p className="text-sm text-muted m-0 mt-1 leading-relaxed">
            Tag recurring foes with archetypes, jot sideboard plans, and sort by who actually
            beats you. Tags and notes never leave this PC.
          </p>
        </div>
        <div className="lab-intro-stats">
          <div title={`${groups.length} unique opponents in this filter`}>
            <strong>{groups.length}</strong>
            <span>opponents</span>
          </div>
          <div title={`${groups.filter((g) => g.tag).length} opponents with an archetype tag`}>
            <strong>{groups.filter((g) => g.tag).length}</strong>
            <span>tagged</span>
          </div>
          <div
            title="Opponents with ≥2 matches and under 45% WR — your problem matchups"
          >
            <strong>{groups.filter((g) => (g.rate ?? 1) < 0.45 && g.matches.length >= 2).length}</strong>
            <span>trouble</span>
          </div>
        </div>
      </div>

      {seasons.length > 1 && (
        <div className="filter-bar mb-0">
          {seasons.map((s) => (
            <button
              key={s}
              type="button"
              className={`filter-chip${seasonKey === s ? " active" : ""}`}
              title={`Show opponents from ${seasonLabel(s)}`}
              onClick={() => setSeason(s)}
            >
              {seasonLabel(s)}
            </button>
          ))}
          <button
            type="button"
            className={`filter-chip${seasonKey === "all" ? " active" : ""}`}
            title="Show opponents across all seasons"
            onClick={() => setSeason("all")}
          >
            All time
          </button>
        </div>
      )}

      <div className="filter-bar mb-0">
        <button
          type="button"
          className={`filter-chip${deckFilter === null ? " active" : ""}`}
          title="Show matches on every deck you piloted"
          onClick={() => setDeckFilter(null)}
        >
          All decks
        </button>
        {decks.map((d) => (
          <button
            key={d.key}
            type="button"
            className={`filter-chip${deckFilter === d.key ? " active" : ""}`}
            title={`Only when you piloted ${d.name}`}
            onClick={() => setDeckFilter(d.key)}
          >
            {d.name}
          </button>
        ))}
      </div>

      <div className="filter-bar mb-0">
        <span className="text-xs text-muted self-center mr-1" title="Order the opponent list">
          Sort
        </span>
        {(
          [
            ["recent", "Recent", "Most recently played first"],
            ["matches", "Most played", "Most matches against first"],
            ["losses", "Most losses", "Opponents who beat you most"],
            ["rate", "Worst rate", "Lowest win rate first (needs decided games)"],
            ["name", "Name", "Alphabetical"],
          ] as const
        ).map(([k, label, tip]) => (
          <button
            key={k}
            type="button"
            className={`filter-chip${sort === k ? " active" : ""}`}
            title={tip}
            onClick={() => setSort(k)}
          >
            {label}
          </button>
        ))}
        {(knownTags.length > 0 || tagFilter) && (
          <>
            <span className="text-xs text-muted self-center ml-2 mr-1" title="Filter by archetype tag">
              Tag
            </span>
            <button
              type="button"
              className={`filter-chip${tagFilter === null ? " active" : ""}`}
              title="Show all tags"
              onClick={() => setTagFilter(null)}
            >
              All
            </button>
            <button
              type="button"
              className={`filter-chip${tagFilter === "__untagged__" ? " active" : ""}`}
              title="Opponents you haven’t tagged yet"
              onClick={() => setTagFilter("__untagged__")}
            >
              Untagged
            </button>
            {knownTags.map((t) => (
              <button
                key={t}
                type="button"
                className={`filter-chip${tagFilter === t ? " active" : ""}`}
                title={`Only opponents tagged “${t}”`}
                onClick={() => setTagFilter(t)}
              >
                {t}
              </button>
            ))}
          </>
        )}
      </div>

      <TagMatchupPanel matches={filtered} notes={notes} onPickTag={setTagFilter} />

      <div className={`mu-lab-layout${selectedGroup ? " has-detail" : ""}`}>
        <div className="panel mu-lab-list">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="dash-title">Opponents · {groups.length}</h3>
            <input
              type="search"
              className="mu-lab-search"
              placeholder="Search opponents, tags, notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search opponents"
              title="Search by name, tag, or note text"
            />
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-muted m-0">No opponents match these filters.</p>
          ) : (
            <div className="mu-lab-rows">
              {groups.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className={`mu-lab-row${selected === g.key ? " active" : ""}`}
                  onClick={() => openOpponent(g)}
                  title={[
                    g.name,
                    g.tag ? `Tag: ${g.tag}` : "Untagged",
                    `${g.wins}W–${g.losses}L${g.rate != null ? ` · ${Math.round(g.rate * 100)}%` : ""}`,
                    `${g.matches.length} match${g.matches.length === 1 ? "" : "es"}`,
                    `Last played ${new Date(g.lastAt).toLocaleString()}`,
                    g.notes?.trim() ? "Has prep notes" : null,
                    "Click to open detail",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <span className="mu-lab-name">
                    <strong>{g.name}</strong>
                    {g.tag ? (
                      <em className="mu-lab-tag" title={`Archetype tag: ${g.tag}`}>
                        {g.tag}
                      </em>
                    ) : (
                      <em className="mu-lab-tag ghost" title="No archetype tag yet">
                        untagged
                      </em>
                    )}
                    {g.notes?.trim() && (
                      <span className="mu-lab-note-dot" title="Has prep notes" />
                    )}
                  </span>
                  <span
                    className="mu-lab-meta text-muted"
                    title={`Last match ${new Date(g.lastAt).toLocaleString()}`}
                  >
                    {g.matches.length} match{g.matches.length === 1 ? "" : "es"}
                    {g.decks[0] ? ` · ${g.decks[0]}${g.decks.length > 1 ? "…" : ""}` : ""}
                    {" · "}
                    {timeAgo(g.lastAt)}
                  </span>
                  <RateChip wins={g.wins} losses={g.losses} rate={g.rate} />
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedGroup && (
          <div className="panel mu-lab-detail">
            <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
              <div>
                <h3 className="text-lg font-semibold m-0" title={selectedGroup.name}>
                  {selectedGroup.name}
                </h3>
                <p
                  className="text-xs text-muted m-0 mt-1"
                  title={`Last match ${new Date(selectedGroup.lastAt).toLocaleString()}`}
                >
                  {selectedGroup.matches.length} match
                  {selectedGroup.matches.length === 1 ? "" : "es"} · last{" "}
                  {timeAgo(selectedGroup.lastAt)}
                </p>
              </div>
              <RateChip
                wins={selectedGroup.wins}
                losses={selectedGroup.losses}
                rate={selectedGroup.rate}
                tip={`Your record vs ${selectedGroup.name}`}
              />
            </div>

            <div className="mu-lab-fields">
              <label className="mu-lab-field" title="Powers Matchup Lab filters and Decks “you vs” chips">
                <span>Archetype tag</span>
                <input
                  type="text"
                  list="mu-tag-suggestions"
                  placeholder="e.g. Domain, Izzet Prowess…"
                  title="Tag this opponent with a meta archetype (saved locally)"
                  value={editingKey === selectedGroup.key ? tagDraft : selectedGroup.tag ?? ""}
                  onChange={(e) => {
                    setEditingKey(selectedGroup.key);
                    setTagDraft(e.target.value);
                    saveNotes(e.target.value, notesDraft);
                  }}
                  onBlur={() => saveNotes(tagDraft, notesDraft)}
                />
                <datalist id="mu-tag-suggestions">
                  {tagSuggestions.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </label>
              <label className="mu-lab-field" title="Private prep notes — never leave this PC">
                <span>Prep notes</span>
                <textarea
                  rows={4}
                  placeholder="Sideboard plan, tells, keep priorities…"
                  title="Sideboard plans, tells, keep priorities — saved as you type"
                  value={editingKey === selectedGroup.key ? notesDraft : selectedGroup.notes ?? ""}
                  onChange={(e) => {
                    setEditingKey(selectedGroup.key);
                    setNotesDraft(e.target.value);
                    saveNotes(tagDraft, e.target.value);
                  }}
                  onBlur={() => saveNotes(tagDraft, notesDraft)}
                />
              </label>
              <p className="text-[11px] text-muted m-0" title="Nothing is uploaded — notes stay in local storage">
                Tags and notes save as you type.
              </p>
            </div>

            {(selectedGroup.tag || tagDraft.trim()) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {(() => {
                  const tag = (editingKey === selectedGroup.key ? tagDraft : selectedGroup.tag) ?? "";
                  const hit = resolveMetaDeckByTag(meta, tag);
                  if (!hit) {
                    return (
                      <p className="text-xs text-muted m-0">
                        No ranked meta list matches tag &quot;{tag.trim() || "…"}&quot; today.
                      </p>
                    );
                  }
                  const rec = selectedGroup;
                  const rate =
                    rec.wins + rec.losses > 0
                      ? Math.round((rec.wins / (rec.wins + rec.losses)) * 100)
                      : null;
                  return (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => openDeck(hit.deckId)}
                    >
                      Open meta: {hit.deck.name}
                      {rate != null ? ` · you ${rec.wins}–${rec.losses} (${rate}%)` : ""}
                    </button>
                  );
                })()}
              </div>
            )}

            {selectedGroup.decks.length > 0 && (
              <div className="mt-3">
                <h4 className="dash-title">Your decks vs them</h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedGroup.decks.map((d) => {
                    const sample = selectedGroup.matches.find((m) => m.deckName === d);
                    const key = sample ? deckKey(sample) : d;
                    return (
                      <button
                        key={d}
                        type="button"
                        className="filter-chip active"
                        title="Open in My Stats"
                        onClick={() => openStatsDeck(key)}
                      >
                        {d} →
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-3">
              <h4 className="dash-title">Match history</h4>
              <div className="mu-lab-matches">
                {[...selectedGroup.matches]
                  .sort((a, b) => b.endedAt - a.endedAt)
                  .map((m) => (
                    <div key={m.matchId} className="mu-lab-match">
                      <span className={`result-chip ${m.result}`}>{RESULT_LABEL[m.result]}</span>
                      <button
                        type="button"
                        className="truncate link-btn text-left"
                        onClick={() => openStatsDeck(deckKey(m))}
                      >
                        {m.deckName ?? "Unknown deck"}
                        {m.games.length > 1 && (
                          <span className="text-muted"> · {gameScore(m)}</span>
                        )}
                      </button>
                      <span className="text-xs text-muted whitespace-nowrap">
                        {timeAgo(m.endedAt)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-sm mt-3"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
