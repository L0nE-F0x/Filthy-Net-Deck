import { useMemo, useState, type ReactNode } from "react";
import { useAppStore } from "../store/useAppStore";
import { scryfallCdnUrl } from "../services/scryfall";
import { openExternal } from "../services/openExternal";
import {
  setGalleryCards,
  type DateConfidence,
  type SetPreviewCard,
  type SetStatus,
  type UpcomingSet,
} from "../types/sets";
import { IconBack } from "../components/NavIcons";

type RarityFilter = "all" | "mythic" | "rare" | "uncommon" | "common" | "special";

function statusLabel(s: SetStatus): string {
  switch (s) {
    case "spoiling":
      return "Spoilers live";
    case "announced":
      return "Announced";
    case "live_on_arena":
      return "On Arena";
    case "released":
      return "Released";
    default:
      return s;
  }
}

function statusClass(s: SetStatus): string {
  return `set-status set-status-${s}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "TBA";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(`${iso}T12:00:00`).getTime();
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.round((t - now.getTime()) / 86400000);
}

function countdownLabel(iso: string | null | undefined): string {
  const d = daysUntil(iso);
  if (d == null) return "TBA";
  if (d < 0) return `${Math.abs(d)}d ago`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `${d}d`;
}

function confidenceHint(c: DateConfidence | undefined): string {
  if (c === "estimated") return "est.";
  if (c === "official" || c === "override") return "official";
  return "";
}

function DateRow({
  label,
  date,
  confidence,
  emphasize,
}: {
  label: string;
  date: string | null;
  confidence?: DateConfidence;
  emphasize?: boolean;
}) {
  const hint = confidenceHint(confidence);
  return (
    <div className={`set-date-row${emphasize ? " set-date-arena" : ""}`}>
      <span className="set-date-label">{label}</span>
      <span className="set-date-value">
        {formatDate(date)}
        {hint ? <span className="set-date-hint"> · {hint}</span> : null}
      </span>
      <span className="set-date-count">{countdownLabel(date)}</span>
    </div>
  );
}

function rarityClass(r: string): string {
  const x = r.toLowerCase();
  if (x === "mythic") return "rarity-mythic";
  if (x === "rare") return "rarity-rare";
  if (x === "uncommon") return "rarity-uncommon";
  if (x === "common") return "rarity-common";
  return "rarity-special";
}

function SetGallery({
  set,
  onBack,
}: {
  set: UpcomingSet;
  onBack: () => void;
}): ReactNode {
  const [rarity, setRarity] = useState<RarityFilter>("all");
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<SetPreviewCard | null>(null);

  const all = useMemo(() => setGalleryCards(set), [set]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((c) => {
      if (rarity !== "all") {
        const r = (c.rarity || "").toLowerCase();
        if (rarity === "special") {
          if (r === "mythic" || r === "rare" || r === "uncommon" || r === "common") return false;
        } else if (r !== rarity) return false;
      }
      if (q && !c.name.toLowerCase().includes(q) && !c.typeLine?.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [all, rarity, query]);

  const counts = useMemo(() => {
    const m = { all: all.length, mythic: 0, rare: 0, uncommon: 0, common: 0, special: 0 };
    for (const c of all) {
      const r = (c.rarity || "").toLowerCase();
      if (r === "mythic") m.mythic++;
      else if (r === "rare") m.rare++;
      else if (r === "uncommon") m.uncommon++;
      else if (r === "common") m.common++;
      else m.special++;
    }
    return m;
  }, [all]);

  return (
    <div className="set-gallery flex flex-col gap-4 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" className="btn btn-ghost btn-sm mb-2" onClick={onBack}>
            <IconBack className="w-4 h-4 inline-block mr-1 align-text-bottom" />
            All sets
          </button>
          <p className="eyebrow m-0">Gallery</p>
          <h2 className="text-2xl font-semibold m-0 tracking-tight flex items-center gap-2">
            {set.iconSvg ? (
              <img src={set.iconSvg} alt="" className="set-icon" width={28} height={28} />
            ) : null}
            {set.name}
          </h2>
          <p className="text-sm text-muted mt-1 mb-0">
            <span className={statusClass(set.status)}>{statusLabel(set.status)}</span>
            <span className="ml-2">
              {all.length} card{all.length === 1 ? "" : "s"} on Scryfall
              {set.cardCount > 0 && all.length < set.cardCount
                ? ` · ${set.cardCount} expected`
                : ""}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void openExternal(set.scryfallUri)}
          >
            Open on Scryfall
          </button>
        </div>
      </div>

      <div className="set-gallery-toolbar panel !p-3">
        <input
          type="search"
          className="set-gallery-search"
          placeholder="Filter by name or type…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter cards"
        />
        <div className="set-rarity-chips" role="group" aria-label="Rarity filter">
          {(
            [
              ["all", "All"],
              ["mythic", "Mythic"],
              ["rare", "Rare"],
              ["uncommon", "Unc"],
              ["common", "Common"],
              ["special", "Other"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`set-rarity-chip${rarity === id ? " active" : ""} ${id !== "all" ? rarityClass(id) : ""}`}
              onClick={() => setRarity(id)}
            >
              {label}
              <span className="set-rarity-n">{counts[id]}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p className="text-sm text-muted m-0">No cards match this filter.</p>
        </div>
      ) : (
        <div className="set-gallery-grid">
          {filtered.map((c) => (
            <button
              key={c.scryfallId}
              type="button"
              className="set-gallery-cell"
              onClick={() => setFocus(c)}
              title={c.name}
            >
              <img
                src={scryfallCdnUrl(c.scryfallId, "normal")}
                alt={c.name}
                loading="lazy"
              />
              <span className={`set-gallery-rarity ${rarityClass(c.rarity)}`} />
              <span className="set-gallery-caption">
                <span className="set-gallery-cn">#{c.collectorNumber}</span>
                <span className="set-gallery-name">{c.name}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {focus ? (
        <div
          className="set-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={focus.name}
          onClick={() => setFocus(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setFocus(null);
          }}
        >
          <button
            type="button"
            className="set-lightbox-close btn btn-ghost btn-sm"
            onClick={() => setFocus(null)}
          >
            Close
          </button>
          <img
            src={scryfallCdnUrl(focus.scryfallId, "normal")}
            alt={focus.name}
            className="set-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="set-lightbox-meta" onClick={(e) => e.stopPropagation()}>
            <strong>{focus.name}</strong>
            <span>
              #{focus.collectorNumber} · {focus.rarity}
              {focus.manaCost ? ` · ${focus.manaCost}` : ""}
            </span>
            {focus.typeLine ? <span className="text-muted">{focus.typeLine}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SetCard({
  set,
  onOpenGallery,
}: {
  set: UpcomingSet;
  onOpenGallery: (s: UpcomingSet) => void;
}) {
  const gallery = setGalleryCards(set);
  const heroUrl = set.heroScryfallId
    ? scryfallCdnUrl(set.heroScryfallId, "art_crop")
    : null;
  const progress =
    set.cardCount > 0
      ? Math.min(100, Math.round((set.spoiledCount / set.cardCount) * 100))
      : set.spoiledCount > 0
        ? 100
        : 0;

  return (
    <article className="set-card">
      <div className="set-card-hero">
        {heroUrl ? (
          <img src={heroUrl} alt="" className="set-card-hero-img" />
        ) : (
          <div className="set-card-hero-fallback" />
        )}
        <div className="set-card-hero-fade" />
        <div className="set-card-hero-top">
          <span className={statusClass(set.status)}>{statusLabel(set.status)}</span>
          {set.iconSvg ? (
            <img src={set.iconSvg} alt="" className="set-icon" width={28} height={28} />
          ) : null}
        </div>
        <div className="set-card-hero-bottom">
          <h3 className="set-card-name">{set.name}</h3>
          <p className="set-card-code">{set.code.toUpperCase()}</p>
        </div>
      </div>

      <div className="set-card-body">
        <div className="set-countdown-strip">
          <div className="set-countdown-main">
            <span className="set-countdown-eyebrow">Arena</span>
            <strong>{countdownLabel(set.dates.arena)}</strong>
            <span className="set-countdown-sub">
              {!set.dates.arena
                ? "Date TBA"
                : `${formatDate(set.dates.arena)}${
                    set.datesConfidence.arena === "estimated" ? " · estimated" : ""
                  }`}
            </span>
          </div>
          <div className="set-countdown-side">
            <span className="set-countdown-eyebrow">Paper</span>
            <strong>{countdownLabel(set.dates.tabletop)}</strong>
            <span className="set-countdown-sub">{formatDate(set.dates.tabletop)}</span>
          </div>
        </div>

        <div className="set-dates">
          <DateRow
            label="Arena drop"
            date={set.dates.arena}
            confidence={set.datesConfidence.arena}
            emphasize
          />
          <DateRow
            label="Prerelease"
            date={set.dates.prerelease}
            confidence={set.datesConfidence.prerelease}
          />
          <DateRow
            label="Tabletop"
            date={set.dates.tabletop}
            confidence={set.datesConfidence.tabletop}
          />
          {set.dates.spoilerStart ? (
            <DateRow
              label="Spoilers start"
              date={set.dates.spoilerStart}
              confidence={set.datesConfidence.spoilerStart}
            />
          ) : null}
        </div>

        <div className="set-spoiler-meter">
          <div className="set-spoiler-meter-head">
            <span>Spoilers</span>
            <span>
              {set.spoiledCount}
              {set.cardCount > 0 ? ` / ${set.cardCount}` : ""} cards
            </span>
          </div>
          <div className="set-spoiler-track">
            <div className="set-spoiler-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {gallery.length > 0 ? (
          <div className="set-preview-rail" aria-label="Recent spoilers">
            {gallery
              .slice()
              .reverse()
              .slice(0, 10)
              .map((c) => (
                <div key={c.scryfallId} className="set-preview-thumb" title={c.name}>
                  <img
                    src={scryfallCdnUrl(c.scryfallId, "small")}
                    alt={c.name}
                    loading="lazy"
                  />
                </div>
              ))}
          </div>
        ) : (
          <p className="set-no-spoilers">No cards spoiled on Scryfall yet.</p>
        )}

        <div className="set-card-actions">
          {gallery.length > 0 ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onOpenGallery(set)}
            >
              Browse full gallery ({gallery.length})
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void openExternal(set.scryfallUri)}
          >
            Scryfall
          </button>
        </div>
      </div>
    </article>
  );
}

export function Sets() {
  const sets = useAppStore((s) => s.sets);
  const setsLoading = useAppStore((s) => s.setsLoading);
  const setsError = useAppStore((s) => s.setsError);
  const refreshSets = useAppStore((s) => s.refreshSets);
  const [openCode, setOpenCode] = useState<string | null>(null);

  const { upcoming, live } = useMemo(() => {
    const list = sets?.sets ?? [];
    const upcoming = list.filter(
      (s) => s.status === "spoiling" || s.status === "announced",
    );
    const live = list.filter(
      (s) => s.status === "live_on_arena" || s.status === "released",
    );
    return { upcoming, live };
  }, [sets]);

  const openSet = useMemo(
    () => (openCode ? sets?.sets.find((s) => s.code === openCode) ?? null : null),
    [openCode, sets],
  );

  if (setsLoading && !sets) {
    return (
      <div className="empty-state">
        <div className="skel skel-line w-64" style={{ margin: "0 auto" }} />
        <p className="mt-3 loading-pulse">Scanning the set radar…</p>
      </div>
    );
  }

  if (!sets && setsError) {
    return (
      <div className="empty-state">
        <h2 className="text-lg font-semibold m-0 mb-2">Set radar offline</h2>
        <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">{setsError}</p>
        <button type="button" className="btn btn-primary mt-4" onClick={() => void refreshSets()}>
          Retry
        </button>
      </div>
    );
  }

  if (!sets?.sets.length) {
    return (
      <div className="empty-state">
        <h2 className="text-lg font-semibold m-0 mb-2">No sets in range</h2>
        <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
          The radar only shows Standard/Pioneer-facing expansions — no Alchemy.
        </p>
      </div>
    );
  }

  if (openSet) {
    return <SetGallery set={openSet} onBack={() => setOpenCode(null)} />;
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div>
        <p className="eyebrow">Sets</p>
        <h2 className="text-2xl font-semibold m-0 tracking-tight">Set radar</h2>
        <p className="text-sm text-muted mt-2 mb-0 max-w-2xl leading-relaxed">
          Arena-first release radar — spoilers, full card galleries, drop dates.{" "}
          <strong className="text-foam">No Alchemy.</strong> Snapshot {sets.date}.
        </p>
      </div>

      {upcoming.length > 0 ? (
        <section>
          <h3 className="set-section-title">Coming to Arena</h3>
          <div className="set-grid">
            {upcoming.map((s) => (
              <SetCard key={s.code} set={s} onOpenGallery={(x) => setOpenCode(x.code)} />
            ))}
          </div>
        </section>
      ) : null}

      {live.length > 0 ? (
        <section>
          <h3 className="set-section-title">Recently live</h3>
          <div className="set-grid">
            {live.map((s) => (
              <SetCard key={s.code} set={s} onOpenGallery={(x) => setOpenCode(x.code)} />
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-[11px] text-muted m-0 leading-relaxed max-w-2xl">
        Full galleries ship from Scryfall via the daily pipeline. Paper dates from Scryfall; Arena
        dates official when known, otherwise estimated and labeled.
      </p>
    </div>
  );
}
