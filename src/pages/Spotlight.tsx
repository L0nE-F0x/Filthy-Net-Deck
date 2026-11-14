import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { buildArenaImport, copyToClipboard } from "../services/arenaImport";
import { isHealthyUrl } from "../services/links";
import { openExternal } from "../services/openExternal";
import {
  omwPercent,
  spotlightIsStale,
  spotlightPhase,
  spotlightRows,
  type SpotlightDeck,
  type SpotlightRow,
} from "../services/spotlight";
import { useSpotlight } from "../services/useSpotlight";

function cardCount(cards: { count: number }[]): number {
  return cards.reduce((n, c) => n + c.count, 0);
}

function formatDay(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function formatTime(iso: string, locale: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

export function Spotlight() {
  const { t, locale } = useLocale();
  const setPage = useAppStore((s) => s.setPage);
  const { feed } = useSpotlight();
  const event = feed?.event ?? null;
  const phase = spotlightPhase(event);
  const rows = useMemo(() => spotlightRows(event, phase), [event, phase]);
  const decks = useMemo(() => {
    const map = new Map<string, SpotlightDeck>();
    for (const deck of event?.decks ?? []) map.set(deck.id, deck);
    return map;
  }, [event]);

  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [archetype, setArchetype] = useState("all");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSelected(null);
    setQuery("");
    setArchetype("all");
  }, [event?.id]);

  const archetypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.archetype) continue;
      counts.set(row.archetype, (counts.get(row.archetype) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (archetype !== "all" && row.archetype !== archetype) return false;
      if (!q) return true;
      return (
        row.player.toLowerCase().includes(q) ||
        row.archetype.toLowerCase().includes(q)
      );
    });
  }, [rows, query, archetype]);

  const selectedRow: SpotlightRow | null =
    visible.find((row) => row.key === selected) ?? visible[0] ?? null;
  const deck = selectedRow?.deckId ? decks.get(selectedRow.deckId) ?? null : null;

  if (!event || phase === "hidden") {
    return (
      <div className="empty-state">
        <h2 className="text-lg font-semibold m-0 mb-2">{t("spotlight.closed")}</h2>
        <button type="button" className="btn btn-primary mt-2" onClick={() => setPage("daily")}>
          {t("spotlight.back")}
        </button>
      </div>
    );
  }

  const formatLabel = event.format === "pioneer" ? "Pioneer" : "Standard";
  const stale = spotlightIsStale(feed?.generatedAt, phase);
  const updated = feed?.generatedAt ? formatTime(feed.generatedAt, locale) : "";
  const eventHref = isHealthyUrl(event.eventUrl) ? event.eventUrl : "";
  const standingsHref = isHealthyUrl(event.standingsUrl) ? event.standingsUrl : "";

  const copyDeck = () => {
    if (!deck) return;
    const text = buildArenaImport({ mainboard: deck.mainboard, sideboard: deck.sideboard });
    void copyToClipboard(text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{t("spotlight.nav")}</p>
          <h2 className="text-2xl font-semibold m-0 tracking-tight">{event.name}</h2>
          <p className="text-sm text-muted mt-2 mb-0 max-w-2xl leading-relaxed">
            {formatLabel}. {t("spotlight.constructed")}{" "}
            {event.standingsRound != null && (
              <strong className="text-foam">{t("spotlight.round", { n: event.standingsRound })}</strong>
            )}
            {updated && <> · {t("spotlight.updated", { time: updated })}</>}
            {" · "}
            {t("spotlight.through", { date: formatDay(event.showcaseUntil, locale) })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`spotlight-phase spotlight-phase-${phase}`}>
            {phase === "live" ? t("spotlight.live") : t("spotlight.showcase")}
          </span>
          {eventHref && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openExternal(eventHref)}>
              {t("spotlight.openEvent")}
            </button>
          )}
          {standingsHref && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void openExternal(standingsHref)}
            >
              {t("spotlight.openStandings")}
            </button>
          )}
        </div>
      </div>

      {stale && <p className="spotlight-stale">{t("spotlight.stale")}</p>}
      {rows.length === 0 && <p className="text-sm text-muted m-0">{t("spotlight.standingsPending")}</p>}

      <div className="spotlight-layout">
        <section className="panel spotlight-standings">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold m-0">{t("spotlight.players", { n: visible.length })}</h3>
          </div>
          <input
            className="spotlight-search"
            value={query}
            placeholder={t("spotlight.search")}
            onChange={(e) => setQuery(e.target.value)}
          />
          {archetypes.length > 1 && (
            <div className="filter-bar mt-2">
              <button
                type="button"
                className={`filter-chip${archetype === "all" ? " active" : ""}`}
                onClick={() => setArchetype("all")}
              >
                {t("spotlight.all")}
              </button>
              {archetypes.slice(0, 8).map(([name, count]) => (
                <button
                  key={name}
                  type="button"
                  className={`filter-chip${archetype === name ? " active" : ""}`}
                  onClick={() => setArchetype(name)}
                >
                  {name} {count}
                </button>
              ))}
            </div>
          )}
          <div className="spotlight-rows" role="list">
            {visible.length === 0 && <p className="text-sm text-muted m-0 mt-3">{t("spotlight.noMatch")}</p>}
            {visible.map((row) => {
              const pct = omwPercent(row.omw);
              const active = selectedRow?.key === row.key;
              return (
                <button
                  key={row.key}
                  type="button"
                  role="listitem"
                  className={`spotlight-row${active ? " active" : ""}`}
                  onClick={() => setSelected(row.key)}
                >
                  <span className="spotlight-rank">{row.rank ?? "–"}</span>
                  <span className="spotlight-who">
                    <strong>{row.player}</strong>
                    {row.archetype && <small>{row.archetype}</small>}
                  </span>
                  <span className="spotlight-pts">
                    {row.points != null ? row.points : ""}
                    {pct && <small>{pct}</small>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel spotlight-deck">
          {!deck && (
            <p className="text-sm text-muted m-0">
              {selectedRow ? selectedRow.player : t("spotlight.standingsPending")}
            </p>
          )}
          {deck && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-lg font-semibold m-0">{deck.player}</h3>
                  <p className="text-sm text-muted m-0 mt-1">
                    {deck.archetype || formatLabel}
                    {selectedRow?.rank != null && ` · #${selectedRow.rank}`}
                    {selectedRow?.points != null && ` · ${selectedRow.points}`}
                  </p>
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={copyDeck}>
                  {copied ? t("spotlight.copied") : t("spotlight.copy")}
                </button>
              </div>
              <h4 className="spotlight-board-label">
                {t("spotlight.main")} · {cardCount(deck.mainboard)}
              </h4>
              <div className="card-list">
                {deck.mainboard.map((card, i) => (
                  <div key={`m-${i}-${card.name}`} className="card-list-row">
                    <span className="count">{card.count}</span>
                    <span>{card.name}</span>
                  </div>
                ))}
              </div>
              {deck.sideboard.length > 0 && (
                <>
                  <h4 className="spotlight-board-label mt-3">
                    {t("spotlight.side")} · {cardCount(deck.sideboard)}
                  </h4>
                  <div className="card-list">
                    {deck.sideboard.map((card, i) => (
                      <div key={`s-${i}-${card.name}`} className="card-list-row">
                        <span className="count">{card.count}</span>
                        <span>{card.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
