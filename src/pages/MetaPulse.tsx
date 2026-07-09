import { useAppStore } from "../store/useAppStore";
import type { TournamentPlatform } from "../types/meta";
import { canShowResultsLink } from "../services/links";
import { resolveFormatId } from "../services/formatResolve";
import { openExternal } from "../services/openExternal";

function platformClass(p: TournamentPlatform): string {
  return `platform-chip platform-${p}`;
}

function platformLabel(p: TournamentPlatform): string {
  if (p === "mtga") return "Arena";
  if (p === "mtgo") return "MTGO";
  return "Paper";
}

const HIDDEN_SOURCES = new Set(["seed", "spicerack", "placeholder"]);

const SOURCE_LINKS: Record<string, string> = {
  mtggoldfish: "https://www.mtggoldfish.com/metagame/standard",
  untapped: "https://mtga.untapped.gg/constructed/standard/meta",
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
  const sorted = [...meta.tournaments]
    .filter((t) => canShowResultsLink(t.url))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div>
        <p className="eyebrow">Events</p>
        <h2 className="text-2xl font-semibold m-0 tracking-tight">Tournament results</h2>
        <p className="text-sm text-muted mt-2 mb-0 max-w-2xl leading-relaxed">
          Recent paper, MTGO, and Arena events. <strong className="text-foam">Open</strong> loads
          the official page in your browser. Snapshot {meta.date}.
        </p>
      </div>

      <section className="panel">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted m-0 mb-3">
          Data sources
        </h3>
        <div className="flex flex-wrap gap-2">
          {sources.map((s) => {
            const href = SOURCE_LINKS[s.toLowerCase()];
            const label =
              s === "mtggoldfish"
                ? "MTGGoldfish"
                : s === "untapped"
                  ? "Untapped.gg"
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
              >
                {label}
              </span>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        {sorted.length === 0 && (
          <div className="empty-state">No verified tournament links in this feed.</div>
        )}
        {sorted.map((t) => {
          const fid = resolveFormatId(String(t.format));
          const hasFormat = fid && meta.formats.some((f) => f.id === fid);
          return (
            <article key={t.id} className="panel">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={platformClass(t.platform)}>{platformLabel(t.platform)}</span>
                    <span className="text-xs text-muted uppercase tracking-wide">{t.format}</span>
                    <span className="text-xs text-muted">{t.date}</span>
                    {t.source && (
                      <span className="text-xs text-muted capitalize">· {t.source}</span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold m-0">{t.name}</h3>
                  {t.players != null && (
                    <p className="text-xs text-muted m-0 mt-1">{t.players} players</p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {hasFormat && fid && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
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
