import { memo, useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  currentSeasonKey,
  deckKey,
  gameScore,
  seasonKeyOf,
  seasonLabel,
  timeAgo,
} from "../services/tracker";
import { winrateFavor } from "../services/ranks";
import { resolveMetaDeckByTag } from "../services/deepLinks";
import type { MatchResult, TrackedMatch } from "../types/tracker";
import type { FormatId } from "../types/meta";
import { TrackerOnboarding } from "../components/TrackerOnboarding";
import { peekSeenCard, resolveArenaMetaBatch } from "../services/arenaMeta";
import {
  formatIdForEvent,
  inferenceCandidatesFromBundle,
} from "../services/deckHelpers";
import { getOpponentNote } from "../services/matchupNotes";
import { archetypeSlug } from "../services/cloud/archetypeSlug";
import {
  archetypeForMatch,
  mergeMatchups,
  personalRecords,
  readDelta,
  subjectArchetype,
  type MergedMatchup,
  type ResolveOpts,
} from "../services/cloud/personalMatchups";
import {
  describe as describeCrowd,
  matchupsFor,
  MIN_GAMES,
  type RollupRow,
} from "../services/cloud/crowdMeta";
import { myArchetypeName } from "../services/cloud/matchSync";
import { fetchRollup } from "../services/cloud/sync";
import { labelFromSlug } from "../services/cloud/archetypeSlug";

const RESULT_LABEL: Record<MatchResult, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  unknown: "?",
};

function formatForMatch(m: TrackedMatch): FormatId {
  return formatIdForEvent(m.eventId) ?? "standard";
}

function RateChip({
  wins,
  losses,
  ratePct,
  tip,
}: {
  wins: number;
  losses: number;
  /** 0-100, or null. */
  ratePct: number | null;
  tip?: string;
}) {
  const decided = wins + losses;
  const rate01 = ratePct != null ? ratePct / 100 : null;
  const defaultTip =
    decided > 0
      ? `${wins}W-${losses}L · ${ratePct != null ? `${Math.round(ratePct)}%` : "—"} of decided games`
      : "No decided games yet";
  return (
    <span className="mu-lab-score" title={tip ?? defaultTip}>
      {wins}W {losses}L
      {ratePct != null && rate01 != null && (
        <strong className={`favor-${winrateFavor(rate01)}`}>
          {" "}
          {ratePct.toFixed(0)}%
        </strong>
      )}
    </span>
  );
}

function favorFromPct(ratePct: number | null): "favored" | "even" | "unfavored" {
  if (ratePct == null) return "even";
  return winrateFavor(ratePct / 100);
}

function focusMatchesTag(row: MergedMatchup, tag: string): boolean {
  const want = tag.trim().toLowerCase();
  if (!want) return false;
  if (row.label.toLowerCase() === want) return true;
  if (row.slug.toLowerCase() === want) return true;
  for (const fmt of ["standard", "pioneer"] as const) {
    const slug = archetypeSlug(fmt, tag);
    if (slug && slug === row.slug) return true;
  }
  const compact = want.replace(/[^a-z0-9]+/g, "");
  const rowCompact = row.label.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return compact.length > 0 && compact === rowCompact;
}

export const Matchups = memo(function Matchups() {
  const matches = useAppStore((s) => s.trackerMatches);
  const refreshTracker = useAppStore((s) => s.refreshTracker);
  const meta = useAppStore((s) => s.meta);
  const mode = useAppStore((s) => s.mode);
  const openDeck = useAppStore((s) => s.openDeck);
  const openStatsDeck = useAppStore((s) => s.openStatsDeck);
  const matchupsFocusTag = useAppStore((s) => s.matchupsFocusTag);
  const clearMatchupsFocus = useAppStore((s) => s.clearMatchupsFocus);

  useEffect(() => {
    void refreshTracker();
  }, [refreshTracker]);


  const [season, setSeason] = useState<string | null>(null);
  const [deckFilter, setDeckFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [namesTick, setNamesTick] = useState(0);

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
    if (!deckFilter) return seasonMatches;
    return seasonMatches.filter((m) => deckKey(m) === deckFilter);
  }, [seasonMatches, deckFilter]);

  // Resolve card names so inference can run (same pattern as MatchHistory).
  useEffect(() => {
    const ids = new Set<number>();
    for (const m of filtered) {
      for (const id of m.opponentSeen ?? []) ids.add(id);
    }
    if (ids.size === 0) return;
    let cancelled = false;
    void resolveArenaMetaBatch([...ids]).then(() => {
      if (!cancelled) setNamesTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [filtered]);

  const candidates = useMemo(
    () => inferenceCandidatesFromBundle(meta, mode),
    [meta, mode],
  );

  const resolveOpts: ResolveOpts = useMemo(() => {
    void namesTick;
    return {
      resolveName: (id) => peekSeenCard(id),
      candidates,
      tagFor: (m) => getOpponentNote(m.opponentName)?.tag?.trim() || null,
      formatFor: formatForMatch,
    };
  }, [candidates, namesTick]);

  const personal = useMemo(
    () => personalRecords(filtered, resolveOpts),
    [filtered, resolveOpts],
  );

  // Which archetype *you* are playing. Community rows are "A vs B", so a
  // comparison is only honest when both sides describe the same deck facing the
  // same opponent — see subjectArchetype. Null on a mixed or unrecognised deck
  // history, and we then show the personal side alone rather than invent one.
  const subject = useMemo(
    () =>
      subjectArchetype(filtered, {
        formatFor: formatForMatch,
        myArchetypeFor: (m) => myArchetypeName(m, candidates),
      }),
    [filtered, candidates],
  );

  const subjectFormat = useMemo<"standard" | "pioneer" | null>(() => {
    if (!subject) return null;
    return subject.startsWith("pioneer-") ? "pioneer" : "standard";
  }, [subject]);

  const [rollup, setRollup] = useState<RollupRow[]>([]);
  const [crowdState, setCrowdState] = useState<"idle" | "loading" | "ready">("idle");

  useEffect(() => {
    if (!subject || !subjectFormat) {
      setRollup([]);
      setCrowdState("idle");
      return;
    }
    let cancelled = false;
    setCrowdState("loading");
    void fetchRollup(subjectFormat, mode === "bo3" ? 3 : 1)
      .then((rows) => {
        if (cancelled) return;
        setRollup(rows);
        setCrowdState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setRollup([]);
          setCrowdState("ready");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [subject, subjectFormat, mode]);

  /** Community rows oriented to your archetype, thin cells already suppressed. */
  const community = useMemo(() => {
    if (!subject || rollup.length === 0) return [];
    return matchupsFor(rollup, subject).shown;
  }, [rollup, subject]);

  const merged = useMemo(
    () => mergeMatchups(personal, community),
    [personal, community],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter(
      (row) =>
        row.label.toLowerCase().includes(q) ||
        row.slug.toLowerCase().includes(q),
    );
  }, [merged, query]);

  // Deep links from Daily / DeckView / Match History (archetype, not player).
  useEffect(() => {
    if (!matchupsFocusTag) return;
    const hit = merged.find((row) => focusMatchesTag(row, matchupsFocusTag));
    if (hit) setSelectedSlug(hit.slug);
    else setSelectedSlug(null);
    setQuery(matchupsFocusTag);
    clearMatchupsFocus();
  }, [matchupsFocusTag, merged, clearMatchupsFocus]);

  const selected =
    visible.find((r) => r.slug === selectedSlug) ??
    merged.find((r) => r.slug === selectedSlug) ??
    null;

  const selectedMatches = useMemo(() => {
    if (!selected) return [] as TrackedMatch[];
    return filtered
      .filter((m) => archetypeForMatch(m, resolveOpts) === selected.slug)
      .sort((a, b) => b.endedAt - a.endedAt);
  }, [selected, filtered, resolveOpts]);

  const knownCount = personal.reduce((n, r) => n + r.games, 0);
  const unknownCount = filtered.length - knownCount;

  if (matches.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="panel">
          <p className="eyebrow">Matchups</p>
          <h2 className="text-xl font-semibold m-0 tracking-tight">
            Your record vs the field
          </h2>
          <p className="text-sm text-muted m-0 mt-2 leading-relaxed max-w-xl">
            After you play with tracking on, every match is scored against the
            archetype the opponent was piloting — inferred from cards seen, no
            tagging required. When community data lands, you will see how your
            rates sit next to the field.
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
      <div className="panel">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="eyebrow m-0 mb-1">Matchups</p>
            <h2 className="text-xl font-semibold m-0 tracking-tight">
              Your record vs the field
            </h2>
            <p className="text-sm text-muted m-0 mt-2 leading-relaxed max-w-2xl">
              Per-archetype win rates, built automatically from cards seen.
              Existing manual tags still override a guess. Biggest gaps sort
              first — that is the coaching end of the list.
            </p>
          </div>
          <div className="text-right text-xs text-muted">
            <div>
              {knownCount} of {filtered.length} match
              {filtered.length === 1 ? "" : "es"} identified
            </div>
            {unknownCount > 0 && (
              <div title="No cards seen, or confidence too low to count">
                {unknownCount} still unknown
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3 items-center">
          <select
            className="filter-chip"
            value={seasonKey}
            onChange={(e) => setSeason(e.target.value === "all" ? "all" : e.target.value)}
            title="Season filter"
            aria-label="Season"
          >
            <option value="all">All seasons</option>
            {seasons.map((s) => (
              <option key={s} value={s}>
                {seasonLabel(s)}
              </option>
            ))}
          </select>

          <select
            className="filter-chip"
            value={deckFilter ?? ""}
            onChange={(e) => setDeckFilter(e.target.value || null)}
            title="Only matches where you piloted this deck"
            aria-label="Your deck"
          >
            <option value="">All your decks</option>
            {decks.map((d) => (
              <option key={d.key} value={d.key}>
                {d.name}
              </option>
            ))}
          </select>

          <input
            type="search"
            className="mu-lab-search"
            placeholder="Filter archetypes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter archetypes"
          />
        </div>
      </div>

      <div className={`mu-lab-layout${selected ? " has-detail" : ""}`}>
        <div className="panel">
          <h3 className="dash-title m-0 mb-2">By archetype</h3>
          {visible.length === 0 ? (
            <p className="text-sm text-muted m-0 leading-relaxed">
              {filtered.length === 0
                ? "No matches in this filter."
                : "No archetypes identified yet for these matches. Play with Detailed Logs on — the more cards an opponent reveals, the better the read."}
            </p>
          ) : (
            <div className="mu-lab-rows">
              {visible.map((row) => {
                const you = row.you;
                const rate = you?.winrate ?? null;
                const active = selectedSlug === row.slug;
                return (
                  <button
                    key={row.slug}
                    type="button"
                    className={`mu-lab-row${active ? " active" : ""}`}
                    onClick={() =>
                      setSelectedSlug((cur) => (cur === row.slug ? null : row.slug))
                    }
                    title={
                      readDelta(row) ??
                      `${row.label}: ${you ? `${you.wins}W-${you.losses}L` : "no personal games"}`
                    }
                  >
                    <span className="mu-lab-name">
                      <strong>{row.label}</strong>
                      {row.delta != null && (
                        <em
                          className={`mu-lab-tag${row.delta >= 0 ? "" : " ghost"}`}
                          title="You vs community, in percentage points"
                        >
                          {row.delta >= 0 ? "+" : ""}
                          {Math.round(row.delta)} vs field
                        </em>
                      )}
                      {row.community == null && you && (
                        <em
                          className="mu-lab-tag ghost"
                          title="Community sample still thin or not yet available"
                        >
                          you only
                        </em>
                      )}
                      {you == null && row.community && (
                        <em
                          className="mu-lab-tag ghost"
                          title="Crowd has data; you have not played this yet"
                        >
                          field only
                        </em>
                      )}
                    </span>
                    <span className="mu-lab-meta text-muted">
                      {you
                        ? `${you.games} game${you.games === 1 ? "" : "s"}`
                        : "not played"}
                      {row.community
                        ? ` · field ${Math.round(row.community.winrate)}% (±${Math.round(
                            (row.community.high - row.community.low) / 2,
                          )})`
                        : ""}
                    </span>
                    <span className="mu-lab-form-wrap">
                      {you ? (
                        <RateChip
                          wins={you.wins}
                          losses={you.losses}
                          ratePct={rate}
                          tip={`Your record vs ${row.label}`}
                        />
                      ) : (
                        <span className="mu-lab-score text-muted">—</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {/*
            Four honest states, because a community number is only comparable to
            yours when both describe the same deck facing the same opponent.
          */}
          <p className="text-xs text-muted m-0 mt-3 leading-relaxed">
            {!subject ? (
              <>
                Community rates need to know which deck <em>you</em> are playing —
                a field winrate is only comparable deck-for-deck. Filter to a
                single recognised deck above and the field column fills in.
                Until then this is your own record, sorted by how much it hurts.
              </>
            ) : crowdState === "loading" ? (
              <>Loading community rates for {labelFromSlug(subject)}…</>
            ) : community.length > 0 ? (
              <>
                Field rates are for <strong>{labelFromSlug(subject)}</strong> —
                the deck you are playing — against each archetype. Cells with
                fewer than {MIN_GAMES} shared games are withheld rather than
                shown as a percentage.
              </>
            ) : (
              <>
                No community data for {labelFromSlug(subject)} yet — it appears
                once enough players opt in to match sharing and a matchup passes{" "}
                {MIN_GAMES} games. Your own record below is unaffected.
              </>
            )}
          </p>
        </div>

        {selected && (
          <div className="panel mu-lab-detail">
            <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
              <div>
                <h3 className="text-lg font-semibold m-0" title={selected.slug}>
                  {selected.label}
                </h3>
                <p className="text-xs text-muted m-0 mt-1">
                  {selected.you
                    ? `${selected.you.games} identified match${
                        selected.you.games === 1 ? "" : "es"
                      }`
                    : "No personal games yet"}
                  {selected.yourSampleThin && selected.you
                    ? " · sample still thin for field comparison"
                    : ""}
                </p>
              </div>
              {selected.you && (
                <RateChip
                  wins={selected.you.wins}
                  losses={selected.you.losses}
                  ratePct={selected.you.winrate}
                  tip={`Your record vs ${selected.label}`}
                />
              )}
            </div>

            <div className="meta-bars mb-3">
              {selected.you && (
                <div className="meta-bar-row">
                  <span className="meta-bar-label">
                    <span className="meta-bar-name">You</span>
                    <span className="text-muted text-[11px]">
                      {selected.you.wins}W-{selected.you.losses}L
                    </span>
                  </span>
                  <span className="mu-track">
                    <span
                      className={`mu-fill favor-${favorFromPct(selected.you.winrate)}`}
                      style={{
                        width: `${Math.max(4, selected.you.winrate ?? 0)}%`,
                        display: "block",
                      }}
                    />
                  </span>
                  <span className="deck-wr-score">
                    {selected.you.winrate != null
                      ? `${Math.round(selected.you.winrate)}%`
                      : "—"}
                  </span>
                </div>
              )}
              {selected.community && (
                <div className="meta-bar-row">
                  <span className="meta-bar-label">
                    <span className="meta-bar-name">Community</span>
                    <span className="text-muted text-[11px]">
                      {describeCrowd(selected.community)}
                    </span>
                  </span>
                  <span className="mu-track">
                    <span
                      className={`mu-fill favor-${favorFromPct(selected.community.winrate)}`}
                      style={{
                        width: `${Math.max(4, selected.community.winrate)}%`,
                        display: "block",
                      }}
                    />
                  </span>
                  <span className="deck-wr-score">
                    {Math.round(selected.community.winrate)}%
                  </span>
                </div>
              )}
            </div>

            {readDelta(selected) && (
              <p className="text-sm m-0 mb-3 leading-relaxed" role="status">
                {readDelta(selected)}
              </p>
            )}
            {!selected.community && (
              <p className="text-xs text-muted m-0 mb-3 leading-relaxed">
                {!subject
                  ? "Filter to a single deck above to compare this against the field — a community winrate only means something deck-for-deck."
                  : `No community sample for ${labelFromSlug(subject)} in this matchup yet (needs ${MIN_GAMES}+ shared games). Opt in to match sharing in Settings to help it fill in.`}
              </p>
            )}

            {(() => {
              const hit = resolveMetaDeckByTag(meta, selected.label);
              if (!hit) return null;
              return (
                <div className="mb-3">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => openDeck(hit.deckId)}
                  >
                    Open meta: {hit.deck.name}
                    {selected.you && selected.you.wins + selected.you.losses > 0
                      ? ` · you ${selected.you.wins}-${selected.you.losses}`
                      : ""}
                  </button>
                </div>
              );
            })()}

            <div className="mt-1">
              <h4 className="dash-title">Matches</h4>
              {selectedMatches.length === 0 ? (
                <p className="text-xs text-muted m-0">No matches in the current filter.</p>
              ) : (
                <div className="mu-lab-matches">
                  {selectedMatches.map((m) => (
                    <div key={m.matchId} className="mu-lab-match">
                      <span className={`result-chip ${m.result}`}>
                        {RESULT_LABEL[m.result]}
                      </span>
                      <button
                        type="button"
                        className="truncate link-btn text-left"
                        onClick={() => openStatsDeck(deckKey(m))}
                        title="Open in My Stats"
                      >
                        {m.deckName ?? "Unknown deck"}
                        {m.games.length > 1 && (
                          <span className="text-muted"> · {gameScore(m)}</span>
                        )}
                        {m.opponentName ? (
                          <span className="text-muted font-normal">
                            {" "}
                            · vs {m.opponentName}
                          </span>
                        ) : null}
                      </button>
                      <span className="text-xs text-muted whitespace-nowrap">
                        {timeAgo(m.endedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-sm mt-3"
              onClick={() => setSelectedSlug(null)}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
});