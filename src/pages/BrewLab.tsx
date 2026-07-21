import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { BrewClinic } from "../components/BrewLabPanel";
import { deckKey } from "../services/tracker";
import { loadDeckRuns } from "../services/deckRuns";
import { groupDecks, sortDecks, type DeckGroup } from "../services/deckStats";
import { latestDecklist } from "../services/deckVersions";
import { resolveArenaCards } from "../services/arenaCards";
import {
  fromArenaIds,
  fromNamedLines,
  type CountedName,
} from "../services/brewLab";
import { parseDeckText, type ParsedDeckText } from "../services/arenaImport";
import {
  normalizeCardName,
  resolveNamedCards,
  type NamedCardInfo,
} from "../services/namedCards";

type Source =
  | { kind: "deck"; key: string }
  | { kind: "paste" }
  | null;

/** Clinic input resolved from a tracked deck's stored Arena ids. */
function useTrackedClinic(deck: DeckGroup | null) {
  const [cards, setCards] = useState<CountedName[]>([]);
  const [side, setSide] = useState<CountedName[]>([]);
  const [resolving, setResolving] = useState(false);

  const list = useMemo(
    () => (deck ? latestDecklist(deck.matches) : undefined),
    [deck],
  );
  const idsKey = useMemo(() => {
    if (!list) return "";
    return [...list.main, ...(list.side ?? [])].sort((a, b) => a - b).join(",");
  }, [list]);

  useEffect(() => {
    if (!list?.main.length) {
      setCards([]);
      setSide([]);
      return;
    }
    let alive = true;
    setResolving(true);
    void resolveArenaCards([...new Set([...list.main, ...(list.side ?? [])])], {
      full: true,
    })
      .then((map) => {
        if (!alive) return;
        setCards(fromArenaIds(list.main, map));
        setSide(list.side?.length ? fromArenaIds(list.side, map) : []);
      })
      .finally(() => {
        if (alive) setResolving(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return { cards, side, resolving, hasList: !!list?.main.length };
}

function PasteClinic({ seedText }: { seedText?: string | null }) {
  const [text, setText] = useState(seedText ?? "");
  const [parsed, setParsed] = useState<ParsedDeckText | null>(null);
  const [resolved, setResolved] = useState<Record<string, NamedCardInfo | null>>({});
  const [resolving, setResolving] = useState(false);
  const [ran, setRan] = useState(false);

  const run = (source?: string) => {
    const p = parseDeckText(source ?? text);
    setParsed(p);
    setRan(true);
    const names = [...p.main, ...p.side].map((l) => l.name);
    if (!names.length) return;
    setResolving(true);
    void resolveNamedCards(names)
      .then(setResolved)
      .finally(() => setResolving(false));
  };

  // Seeded from "Improve in Brew Lab": prefill and auto-run the clinic once.
  useEffect(() => {
    if (!seedText) return;
    setText(seedText);
    run(seedText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedText]);

  const { main, side, unknown } = useMemo(() => {
    if (!parsed) return { main: [] as CountedName[], side: [] as CountedName[], unknown: [] as string[] };
    const m = fromNamedLines(parsed.main, resolved, normalizeCardName);
    const s = fromNamedLines(parsed.side, resolved, normalizeCardName);
    return { main: m.cards, side: s.cards, unknown: [...m.unknown, ...s.unknown] };
  }, [parsed, resolved]);

  const mainCount = parsed?.main.reduce((n, l) => n + l.count, 0) ?? 0;
  const sideCount = parsed?.side.reduce((n, l) => n + l.count, 0) ?? 0;

  return (
    <>
      <div className="panel">
        <h3 className="dash-title">Paste any list</h3>
        <p className="text-xs text-muted m-0 mb-2 leading-relaxed max-w-2xl">
          Arena export, MTGO text, or plain “4 Card Name” lines — clinic a brew{" "}
          <strong className="text-foam">before</strong> you spend a single wildcard. Card names
          resolve on Scryfall (cached, exact-name only); unknown names are skipped, never guessed.
        </p>
        <textarea
          className="brew-paste-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Deck\n4 Llanowar Elves\n4 Steel Leaf Champion\n…\n\nSideboard\n2 Duress"}
          rows={9}
          spellCheck={false}
        />
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!text.trim() || resolving}
            onClick={() => run()}
          >
            {resolving ? "Resolving…" : "Run clinic"}
          </button>
          {ran && parsed && (
            <span className="text-xs text-muted">
              Parsed {mainCount} main{sideCount ? ` + ${sideCount} SB` : ""}
              {parsed.skipped.length > 0 &&
                ` · ${parsed.skipped.length} line${parsed.skipped.length === 1 ? "" : "s"} skipped`}
            </span>
          )}
        </div>
        {ran && unknown.length > 0 && !resolving && (
          <p className="qa-flag mt-2 mb-0">
            Scryfall doesn’t know: {unknown.slice(0, 6).join(", ")}
            {unknown.length > 6 ? ` +${unknown.length - 6} more` : ""} — check the spelling; those
            cards are left out of the clinic.
          </p>
        )}
      </div>
      {ran && main.length > 0 && (
        <BrewClinic deckName="Pasted brew" main={main} side={side} resolving={resolving} />
      )}
      {ran && main.length === 0 && !resolving && (
        <div className="panel">
          <p className="text-sm text-muted m-0">
            Nothing usable parsed yet — paste “4 Card Name” lines (Arena’s Export button produces
            exactly that) and run again.
          </p>
        </div>
      )}
    </>
  );
}

/**
 * Brew Lab — standalone list clinic (v2.0). Grade any tracked deck or any
 * pasted list against today's ranked peer field.
 */
export function BrewLab() {
  const matches = useAppStore((s) => s.trackerMatches);
  const refreshTracker = useAppStore((s) => s.refreshTracker);
  const focusKey = useAppStore((s) => s.brewLabFocusDeckKey);
  const clearFocus = useAppStore((s) => s.clearBrewLabFocus);
  const seedText = useAppStore((s) => s.brewLabSeedText);
  const clearSeed = useAppStore((s) => s.clearBrewLabSeed);
  const [source, setSource] = useState<Source>(null);
  // Snapshot the seed once so clearing store state doesn't unmount the clinic.
  const [pasteSeed, setPasteSeed] = useState<string | null>(null);

  useEffect(() => {
    void refreshTracker();
  }, [refreshTracker]);

  // Deep link from My Stats deck detail.
  useEffect(() => {
    if (!focusKey) return;
    setSource({ kind: "deck", key: focusKey });
    clearFocus();
  }, [focusKey, clearFocus]);

  // Seeded from Matchup Lab "Improve in Brew Lab": open paste mode pre-filled.
  useEffect(() => {
    if (!seedText) return;
    setPasteSeed(seedText);
    setSource({ kind: "paste" });
    clearSeed();
  }, [seedText, clearSeed]);

  const decks = useMemo(() => {
    const groups = groupDecks(matches, loadDeckRuns());
    // Only decks with a stored list can be clinicked; most-played first.
    return sortDecks(groups, "matches", "desc").filter((d) =>
      d.matches.some((m) => (m.deckMain?.length ?? 0) > 0),
    );
  }, [matches]);

  // Default: most-played tracked deck, else paste mode.
  useEffect(() => {
    if (source) return;
    setSource(decks.length ? { kind: "deck", key: decks[0].key } : { kind: "paste" });
  }, [source, decks]);

  const activeDeck = useMemo(
    () =>
      source?.kind === "deck"
        ? (decks.find((d) => d.key === source.key) ??
          // Deep-linked deck may sit outside the filtered list (no stored list).
          groupDecks(
            matches.filter((m) => deckKey(m) === source.key),
            {},
          )[0] ??
          null)
        : null,
    [source, decks, matches],
  );

  const tracked = useTrackedClinic(activeDeck);

  return (
    <div className="flex flex-col gap-3">
      <div className="panel lab-intro">
        <div>
          <p className="eyebrow m-0">Brew Lab</p>
          <h2 className="text-lg font-semibold m-0 tracking-tight">
            List clinic with a grade
          </h2>
          <p className="text-sm text-muted m-0 mt-1 leading-relaxed max-w-2xl">
            Compare any list — tracked deck or pasted brew — against today’s ranked{" "}
            <strong className="text-foam">Standard</strong> /{" "}
            <strong className="text-foam">Pioneer</strong> peer field: shape, curve, staples, and
            an honest letter grade. No AI, no invented cards — only real ranked lists.
          </p>
        </div>
      </div>

      <div className="filter-bar mb-0" role="group" aria-label="Clinic source">
        {decks.map((d) => (
          <button
            key={d.key}
            type="button"
            className={`filter-chip${source?.kind === "deck" && source.key === d.key ? " active" : ""}`}
            title={`${d.name} · ${d.matches.length} match${d.matches.length === 1 ? "" : "es"} tracked`}
            onClick={() => setSource({ kind: "deck", key: d.key })}
          >
            {d.name}
          </button>
        ))}
        <button
          type="button"
          className={`filter-chip${source?.kind === "paste" ? " active" : ""}`}
          title="Clinic a list that isn't tracked yet — paste it"
          onClick={() => setSource({ kind: "paste" })}
        >
          ✎ Paste a list
        </button>
      </div>

      {source?.kind === "paste" && <PasteClinic seedText={pasteSeed} />}

      {source?.kind === "deck" && activeDeck && (
        <>
          {tracked.hasList ? (
            <BrewClinic
              deckName={activeDeck.name}
              main={tracked.cards}
              side={tracked.side}
              resolving={tracked.resolving}
            />
          ) : (
            <div className="panel">
              <p className="text-sm text-muted m-0 leading-relaxed">
                No stored Arena list for <strong className="text-foam">{activeDeck.name}</strong>{" "}
                yet — play one match with it (game-1 submission is recorded), or paste the list
                instead.
              </p>
            </div>
          )}
        </>
      )}

      {source?.kind === "deck" && !activeDeck && (
        <div className="panel">
          <p className="text-sm text-muted m-0">
            That deck isn’t in the tracker anymore — pick another source above.
          </p>
        </div>
      )}
    </div>
  );
}
