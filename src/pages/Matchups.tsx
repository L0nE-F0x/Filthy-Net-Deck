import { useMemo, useState } from "react";
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
import type { MatchResult, TrackedMatch } from "../types/tracker";

const RESULT_LABEL: Record<MatchResult, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  unknown: "?",
};

function winrateFavor(rate: number): "favored" | "even" | "unfavored" {
  if (rate >= 0.55) return "favored";
  if (rate >= 0.45) return "even";
  return "unfavored";
}

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

function RateChip({ wins, losses, rate }: { wins: number; losses: number; rate: number | null }) {
  return (
    <span className="mu-lab-score">
      {wins}W {losses}L
      {rate != null && (
        <strong className={`favor-${winrateFavor(rate)}`}> {(rate * 100).toFixed(0)}%</strong>
      )}
    </span>
  );
}

export function Matchups() {
  const matches = useAppStore((s) => s.trackerMatches);
  const status = useAppStore((s) => s.trackerStatus);
  const [season, setSeason] = useState<string | null>(null);
  const [deckFilter, setDeckFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("recent");
  const [selected, setSelected] = useState<string | null>(null);
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
    return sortGroups(g, sort);
  }, [filtered, notes, tagFilter, sort]);

  const knownTags = useMemo(() => {
    void noteTick;
    return listKnownTags();
  }, [noteTick, matches]);

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

  const saveNotes = () => {
    if (!selectedGroup) return;
    setOpponentNote(selectedGroup.name, { tag: tagDraft, notes: notesDraft });
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
        {status?.logFound && status.detailedLogs !== false ? (
          <div className="empty-state">
            <h2 className="text-lg font-semibold m-0 mb-2">No matches yet</h2>
            <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
              Keep Filthy Net Deck open while you ladder — opponents appear here the moment a
              match ends.
            </p>
          </div>
        ) : (
          <div className="panel">
            <p className="text-sm text-muted m-0 leading-relaxed">
              Match tracking needs the desktop app and Arena detailed logs (Options → Account).
              Open <strong className="text-foam">My Stats</strong> for setup status.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
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
          <div>
            <strong>{groups.length}</strong>
            <span>opponents</span>
          </div>
          <div>
            <strong>{groups.filter((g) => g.tag).length}</strong>
            <span>tagged</span>
          </div>
          <div>
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
              onClick={() => setSeason(s)}
            >
              {seasonLabel(s)}
            </button>
          ))}
          <button
            type="button"
            className={`filter-chip${seasonKey === "all" ? " active" : ""}`}
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
          onClick={() => setDeckFilter(null)}
        >
          All decks
        </button>
        {decks.map((d) => (
          <button
            key={d.key}
            type="button"
            className={`filter-chip${deckFilter === d.key ? " active" : ""}`}
            onClick={() => setDeckFilter(d.key)}
          >
            {d.name}
          </button>
        ))}
      </div>

      <div className="filter-bar mb-0">
        <span className="text-xs text-muted self-center mr-1">Sort</span>
        {(
          [
            ["recent", "Recent"],
            ["matches", "Most played"],
            ["losses", "Most losses"],
            ["rate", "Worst rate"],
            ["name", "Name"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`filter-chip${sort === k ? " active" : ""}`}
            onClick={() => setSort(k)}
          >
            {label}
          </button>
        ))}
        {(knownTags.length > 0 || tagFilter) && (
          <>
            <span className="text-xs text-muted self-center ml-2 mr-1">Tag</span>
            <button
              type="button"
              className={`filter-chip${tagFilter === null ? " active" : ""}`}
              onClick={() => setTagFilter(null)}
            >
              All
            </button>
            <button
              type="button"
              className={`filter-chip${tagFilter === "__untagged__" ? " active" : ""}`}
              onClick={() => setTagFilter("__untagged__")}
            >
              Untagged
            </button>
            {knownTags.map((t) => (
              <button
                key={t}
                type="button"
                className={`filter-chip${tagFilter === t ? " active" : ""}`}
                onClick={() => setTagFilter(t)}
              >
                {t}
              </button>
            ))}
          </>
        )}
      </div>

      <div className={`mu-lab-layout${selectedGroup ? " has-detail" : ""}`}>
        <div className="panel mu-lab-list">
          <h3 className="dash-title">Opponents · {groups.length}</h3>
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
                >
                  <span className="mu-lab-name">
                    <strong>{g.name}</strong>
                    {g.tag ? (
                      <em className="mu-lab-tag">{g.tag}</em>
                    ) : (
                      <em className="mu-lab-tag ghost">untagged</em>
                    )}
                    {g.notes?.trim() && <span className="mu-lab-note-dot" title="Has notes" />}
                  </span>
                  <span className="mu-lab-meta text-muted">
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
                <h3 className="text-lg font-semibold m-0">{selectedGroup.name}</h3>
                <p className="text-xs text-muted m-0 mt-1">
                  {selectedGroup.matches.length} match
                  {selectedGroup.matches.length === 1 ? "" : "es"} · last{" "}
                  {timeAgo(selectedGroup.lastAt)}
                </p>
              </div>
              <RateChip
                wins={selectedGroup.wins}
                losses={selectedGroup.losses}
                rate={selectedGroup.rate}
              />
            </div>

            <div className="mu-lab-fields">
              <label className="mu-lab-field">
                <span>Archetype tag</span>
                <input
                  type="text"
                  list="mu-tag-suggestions"
                  placeholder="e.g. Domain, Izzet Prowess…"
                  value={editingKey === selectedGroup.key ? tagDraft : selectedGroup.tag ?? ""}
                  onChange={(e) => {
                    setEditingKey(selectedGroup.key);
                    setTagDraft(e.target.value);
                  }}
                  onBlur={saveNotes}
                />
                <datalist id="mu-tag-suggestions">
                  {knownTags.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </label>
              <label className="mu-lab-field">
                <span>Prep notes</span>
                <textarea
                  rows={4}
                  placeholder="Sideboard plan, tells, keep priorities…"
                  value={editingKey === selectedGroup.key ? notesDraft : selectedGroup.notes ?? ""}
                  onChange={(e) => {
                    setEditingKey(selectedGroup.key);
                    setNotesDraft(e.target.value);
                  }}
                  onBlur={saveNotes}
                />
              </label>
              <p className="text-[11px] text-muted m-0">Notes save automatically when you leave a field.</p>
            </div>

            {selectedGroup.decks.length > 0 && (
              <div className="mt-3">
                <h4 className="dash-title">Your decks vs them</h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedGroup.decks.map((d) => (
                    <span key={d} className="filter-chip active" style={{ cursor: "default" }}>
                      {d}
                    </span>
                  ))}
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
                      <span className="truncate">
                        {m.deckName ?? "Unknown deck"}
                        {m.games.length > 1 && (
                          <span className="text-muted"> · {gameScore(m)}</span>
                        )}
                      </span>
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
