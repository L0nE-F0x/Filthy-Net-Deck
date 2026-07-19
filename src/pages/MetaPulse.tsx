import { useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import type { TournamentPlatform, TournamentResult } from "../types/meta";
import { canShowResultsLink } from "../services/links";
import { resolveFormatId } from "../services/formatResolve";
import { openExternal } from "../services/openExternal";
import { filterFreshTournaments } from "../services/eventFreshness";

function platformClass(p: TournamentPlatform): string {
  return `platform-chip platform-${p}`;
}

function platformLabel(p: TournamentPlatform): string {
  if (p === "mtga") return "Arena";
  if (p === "mtgo") return "MTGO";
  return "Paper";
}

/** "2026-07-15" → "2d ago" / "today" (falls back to the raw date). */
function relativeDate(iso: string): string {
  const t = new Date(`${iso}T12:00:00`).getTime();
  if (Number.isNaN(t)) return iso;
  const days = Math.round((Date.now() - t) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return iso;
}

/** Untapped "meta" hub links are not real tournaments — drop them from Events. */
function isTrackerRow(t: TournamentResult): boolean {
  return t.source === "untapped" && /-meta$/.test(t.id);
}

const HIDDEN_SOURCES = new Set(["seed", "spicerack", "placeholder", "untapped"]);

const SOURCE_LINKS: Record<string, string> = {
  mtggoldfish: "https://www.mtggoldfish.com/metagame/standard",
  melee: "https://melee.gg/Tournament/Search",
  "magic.gg": "https://magic.gg/decklists",
  mtgo: "https://www.mtgo.com/decklists",
  scryfall: "https://scryfall.com",
  wizards: "https://magic.wizards.com/en/mtgarena",
};

export function MetaPulse() {
  const meta = useAppStore((s) => s.meta);
  const setDailyFormatId = useAppStore((s) => s.setDailyFormatId);
  const setPage = useAppStore((s) => s.setPage);
  const [fmtFilter, setFmtFilter] = useState<"all" | "standard" | "pioneer">("all");
  const [platFilter, setPlatFilter] = useState<"all" | TournamentPlatform>("all");

  const sorted = useMemo(() => {
    const linked = (meta?.tournaments ?? []).filter((t) => canShowResultsLink(t.url));
    // Drop ancient Melee/etc. rows + Untapped meta hubs (not real events).
    return filterFreshTournaments(linked)
      .filter((t) => !isTrackerRow(t))
      .filter((t) => fmtFilter === "all" || resolveFormatId(String(t.format)) === fmtFilter)
      .filter((t) => platFilter === "all" || t.platform === platFilter)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [meta, fmtFilter, platFilter]);

  if (!meta) {
    return (
      <div className="empty-state">
        <div className="skel skel-line w-64" style={{ margin: "0 auto" }} />
        <p className="mt-3 loading-pulse">Loading events…</p>
      </div>
    );
  }

  const sources = (meta.sources || []).filter(
    (s) => !HIDDEN_SOURCES.has(s.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div>
        <p className="eyebrow">Events</p>
        <h2 className="text-2xl font-semibold m-0 tracking-tight">Tournament results</h2>
        <p className="text-sm text-muted mt-2 mb-0 max-w-2xl leading-relaxed">
          Recent paper, MTGO, and Arena events (last ~4 months).{" "}
          <strong className="text-foam">Open</strong> loads the official page in your browser.
          Snapshot {meta.date}.
        </p>
      </div>

      <div className="filter-bar">
        {(
          [
            ["all", "All formats"],
            ["standard", "Standard"],
            ["pioneer", "Pioneer"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`filter-chip${fmtFilter === k ? " active" : ""}`}
            onClick={() => setFmtFilter(k)}
          >
            {label}
          </button>
        ))}
        <span className="mx-1" />
        {(
          [
            ["all", "All platforms"],
            ["mtga", "Arena"],
            ["mtgo", "MTGO"],
            ["paper", "Paper"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`filter-chip${platFilter === k ? " active" : ""}`}
            onClick={() => setPlatFilter(k)}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="panel">
        <h3
          className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3"
          title="Where this app’s tournament + meta pipeline pulls from"
        >
          Data sources
        </h3>
        <div className="flex flex-wrap gap-2">
          {sources.map((s) => {
            const href = SOURCE_LINKS[s.toLowerCase()];
            const label =
              s === "mtggoldfish"
                ? "MTGGoldfish"
                : s === "magic.gg"
                  ? "magic.gg"
                  : s === "mtgo"
                    ? "MTGO"
                    : s;
            if (href) {
              return (
                <button
                  key={s}
                  type="button"
                  className="text-xs px-2.5 py-1 rounded-lg bg-ink-800 border border-ink-600/50 capitalize hover:border-gold-500/40 text-foam cursor-pointer"
                  title={`Open ${label} in your browser`}
                  onClick={() => void openExternal(href)}
                >
                  {label}
                </button>
              );
            }
            return (
              <span
                key={s}
                className="text-xs px-2.5 py-1 rounded-lg bg-ink-800 border border-ink-600/50 capitalize"
                title={label}
              >
                {label}
              </span>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        {sorted.length === 0 && (
          <div className="empty-state">
            No recent Standard/Pioneer tournament results in this snapshot. The app
            re-syncs meta automatically — check back after the next daily publish.
          </div>
        )}
        {sorted.map((t) => {
          const fid = resolveFormatId(String(t.format));
          const hasFormat = fid && meta.formats.some((f) => f.id === fid);
          return (
            <article key={t.id} className="panel">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span
                      className={platformClass(t.platform)}
                      title={
                        t.platform === "mtga"
                          ? "MTG Arena event"
                          : t.platform === "mtgo"
                            ? "Magic Online event"
                            : "Paper / in-person event"
                      }
                    >
                      {platformLabel(t.platform)}
                    </span>
                    <span
                      className="text-xs text-muted uppercase tracking-wide"
                      title={`Format: ${t.format}`}
                    >
                      {t.format}
                    </span>
                    <span className="text-xs text-muted" title={`Event date ${t.date}`}>
                      {relativeDate(t.date)}
                    </span>
                    {t.source && (
                      <span
                        className="text-xs text-muted capitalize"
                        title={`Listed by ${t.source}`}
                      >
                        · {t.source}
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold m-0" title={t.name}>
                    {t.name}
                  </h3>
                  {t.players != null && (
                    <p className="text-xs text-muted m-0 mt-1" title="Registered / reported players">
                      {t.players} players
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {hasFormat && fid && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title={`Open today’s ${fid} deck board in Decks`}
                      onClick={() => {
                        setDailyFormatId(fid);
                        setPage("daily");
                      }}
                    >
                      See decks
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    title="Open the official results page in your browser"
                    onClick={() => void openExternal(t.url)}
                  >
                    Open
                  </button>
                </div>
              </div>
              {t.notes && <p className="text-sm text-muted m-0 mb-3 leading-relaxed">{t.notes}</p>}
              {t.topDecks.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {t.topDecks.map((d) => (
                    <span
                      key={`${t.id}-${d.place}-${d.archetype}`}
                      className="text-xs px-2 py-1 rounded-md bg-ink-900 border border-ink-600/40"
                    >
                      <span className="text-gold-400 font-semibold">#{d.place}</span> {d.archetype}
                      {d.pilot ? ` · ${d.pilot}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
