import { useMemo, useState, type ReactNode } from "react";
import { useAppStore } from "../store/useAppStore";
import { scryfallCdnUrl } from "../services/scryfall";
import { openExternal } from "../services/openExternal";
import {
  isFormatLegal,
  setGalleryCards,
  type DateConfidence,
  type SetPreviewCard,
  type SetStatus,
  type UpcomingSet,
} from "../types/sets";
import { IconBack } from "../components/NavIcons";
import { totalNewCount } from "../services/setPulse";

type RarityFilter = "all" | "mythic" | "rare" | "uncommon" | "common" | "special";
type ColorFilter = "all" | "W" | "U" | "B" | "R" | "G" | "C";
type SortKey = "collector" | "name" | "cmc" | "rarity" | "newest";
type TypeFilter = "all" | "creature" | "instant" | "sorcery" | "enchantment" | "artifact" | "planeswalker" | "land" | "other";

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

const RARITY_RANK: Record<string, number> = {
  mythic: 0,
  rare: 1,
  uncommon: 2,
  common: 3,
};

function typeBucket(typeLine: string | undefined): TypeFilter {
  const t = (typeLine || "").toLowerCase();
  if (t.includes("creature")) return "creature";
  if (t.includes("planeswalker")) return "planeswalker";
  if (t.includes("instant")) return "instant";
  if (t.includes("sorcery")) return "sorcery";
  if (t.includes("enchantment")) return "enchantment";
  if (t.includes("artifact")) return "artifact";
  if (t.includes("land")) return "land";
  return "other";
}

function cardIsColorless(c: SetPreviewCard): boolean {
  return !c.colors?.length;
}

function cardHasColor(c: SetPreviewCard, col: string): boolean {
  if (col === "C") return cardIsColorless(c);
  return (c.colors || []).includes(col);
}

function LegalBadges({ card }: { card: SetPreviewCard }) {
  const std = isFormatLegal(card, "standard");
  const pio = isFormatLegal(card, "pioneer");
  return (
    <div className="legal-badges">
      <span className={`legal-badge${std ? " legal-yes" : " legal-no"}`}>
        Std {std ? "legal" : "—"}
      </span>
      <span className={`legal-badge${pio ? " legal-yes" : " legal-no"}`}>
        Pio {pio ? "legal" : "—"}
      </span>
    </div>
  );
}

function CardDetailDrawer({
  card,
  onClose,
}: {
  card: SetPreviewCard;
  onClose: () => void;
}): ReactNode {
  const uri =
    card.scryfallUri || `https://scryfall.com/card/${card.scryfallId}`;
  return (
    <div
      className="set-drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={card.name}
      onClick={onClose}
    >
      <div className="set-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="set-drawer-art">
          <img src={scryfallCdnUrl(card.scryfallId, "normal")} alt={card.name} />
        </div>
        <div className="set-drawer-body">
          <div className="flex justify-between items-start gap-2">
            <div>
              <h3 className="set-drawer-title m-0">{card.name}</h3>
              <p className="set-drawer-sub m-0">
                #{card.collectorNumber} · {card.rarity}
                {card.manaCost ? ` · ${card.manaCost}` : ""}
                {card.cmc != null ? ` · CMC ${card.cmc}` : ""}
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
          {card.typeLine ? (
            <p className="set-drawer-type m-0">{card.typeLine}</p>
          ) : null}
          <LegalBadges card={card} />
          {card.oracleText ? (
            <div className="set-drawer-oracle">
              {card.oracleText.split("\n").map((line, i) => (
                <p key={i} className="m-0">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted m-0">No oracle text in feed.</p>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm mt-2"
            onClick={() => void openExternal(uri)}
          >
            Open on Scryfall
          </button>
        </div>
      </div>
    </div>
  );
}

function SetGallery({
  set,
  newIds,
  onBack,
}: {
  set: UpcomingSet;
  newIds: Set<string>;
  onBack: () => void;
}): ReactNode {
  const [rarity, setRarity] = useState<RarityFilter>("all");
  const [color, setColor] = useState<ColorFilter>("all");
  const [typeF, setTypeF] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<SortKey>("collector");
  const [query, setQuery] = useState("");
  const [newOnly, setNewOnly] = useState(false);
  const [focus, setFocus] = useState<SetPreviewCard | null>(null);

  const all = useMemo(() => setGalleryCards(set), [set]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = all.filter((c) => {
      if (newOnly && !newIds.has(c.scryfallId)) return false;
      if (rarity !== "all") {
        const r = (c.rarity || "").toLowerCase();
        if (rarity === "special") {
          if (["mythic", "rare", "uncommon", "common"].includes(r)) return false;
        } else if (r !== rarity) return false;
      }
      if (color !== "all" && !cardHasColor(c, color)) return false;
      if (typeF !== "all" && typeBucket(c.typeLine) !== typeF) return false;
      if (
        q &&
        !c.name.toLowerCase().includes(q) &&
        !(c.typeLine || "").toLowerCase().includes(q) &&
        !(c.oracleText || "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    list = [...list];
    if (sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "cmc") {
      list.sort((a, b) => (a.cmc ?? 99) - (b.cmc ?? 99) || a.name.localeCompare(b.name));
    } else if (sort === "rarity") {
      list.sort(
        (a, b) =>
          (RARITY_RANK[a.rarity?.toLowerCase()] ?? 9) -
            (RARITY_RANK[b.rarity?.toLowerCase()] ?? 9) ||
          a.name.localeCompare(b.name),
      );
    } else if (sort === "newest") {
      list.reverse();
    } else {
      // collector order as shipped
    }
    return list;
  }, [all, rarity, color, typeF, sort, query, newOnly, newIds]);

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

  const newCount = newIds.size;

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
              {all.length} card{all.length === 1 ? "" : "s"}
              {set.cardCount > 0 && all.length < set.cardCount
                ? ` · ${set.cardCount} expected`
                : ""}
              {newCount > 0 ? ` · ${newCount} new since last visit` : ""}
            </span>
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void openExternal(set.scryfallUri)}
        >
          Open on Scryfall
        </button>
      </div>

      <div className="set-gallery-toolbar panel !p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="search"
            className="set-gallery-search"
            placeholder="Search name, type, or text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter cards"
          />
          <label className="set-sort-label">
            Sort
            <select
              className="set-sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="collector">Collector #</option>
              <option value="name">Name</option>
              <option value="cmc">CMC</option>
              <option value="rarity">Rarity</option>
              <option value="newest">Newest first</option>
            </select>
          </label>
          {newCount > 0 ? (
            <button
              type="button"
              className={`set-rarity-chip${newOnly ? " active" : ""}`}
              onClick={() => setNewOnly((v) => !v)}
            >
              New only
              <span className="set-rarity-n">{newCount}</span>
            </button>
          ) : null}
        </div>

        <div className="set-rarity-chips" role="group" aria-label="Rarity">
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
              className={`set-rarity-chip${rarity === id ? " active" : ""}`}
              onClick={() => setRarity(id)}
            >
              {label}
              <span className="set-rarity-n">{counts[id]}</span>
            </button>
          ))}
        </div>

        <div className="set-rarity-chips" role="group" aria-label="Color">
          {(
            [
              ["all", "Any color"],
              ["W", "W"],
              ["U", "U"],
              ["B", "B"],
              ["R", "R"],
              ["G", "G"],
              ["C", "C"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`set-rarity-chip${color === id ? " active" : ""}`}
              onClick={() => setColor(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="set-rarity-chips" role="group" aria-label="Type">
          {(
            [
              ["all", "Any type"],
              ["creature", "Creature"],
              ["instant", "Instant"],
              ["sorcery", "Sorcery"],
              ["enchantment", "Ench"],
              ["artifact", "Art"],
              ["planeswalker", "PW"],
              ["land", "Land"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`set-rarity-chip${typeF === id ? " active" : ""}`}
              onClick={() => setTypeF(id)}
            >
              {label}
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
          {filtered.map((c) => {
            const isNew = newIds.has(c.scryfallId);
            return (
              <button
                key={c.scryfallId}
                type="button"
                className={`set-gallery-cell${isNew ? " is-new" : ""}`}
                onClick={() => setFocus(c)}
                title={c.name}
              >
                {isNew ? <span className="set-new-pill">New</span> : null}
                <img
                  src={scryfallCdnUrl(c.scryfallId, "normal")}
                  alt={c.name}
                  loading="lazy"
                />
                <span className={`set-gallery-rarity ${rarityClass(c.rarity)}`} />
                <span className="set-gallery-caption">
                  <span className="set-gallery-cn">
                    #{c.collectorNumber}
                    {c.cmc != null ? ` · ${c.cmc}` : ""}
                  </span>
                  <span className="set-gallery-name">{c.name}</span>
                  <span className="set-gallery-legal-mini">
                    {isFormatLegal(c, "standard") ? "Std" : ""}
                    {isFormatLegal(c, "standard") && isFormatLegal(c, "pioneer")
                      ? " · "
                      : ""}
                    {isFormatLegal(c, "pioneer") ? "Pio" : ""}
                    {!isFormatLegal(c, "standard") && !isFormatLegal(c, "pioneer")
                      ? "—"
                      : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {focus ? <CardDetailDrawer card={focus} onClose={() => setFocus(null)} /> : null}
    </div>
  );
}

function SetCard({
  set,
  newCount,
  onOpenGallery,
}: {
  set: UpcomingSet;
  newCount: number;
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
        </div>

        <div className="set-spoiler-meter">
          <div className="set-spoiler-meter-head">
            <span>Spoilers</span>
            <span>
              {set.spoiledCount}
              {set.cardCount > 0 ? ` / ${set.cardCount}` : ""}
              {newCount > 0 ? ` · +${newCount} new` : ""}
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
  const setsNewByCode = useAppStore((s) => s.setsNewByCode);
  const refreshSets = useAppStore((s) => s.refreshSets);
  const [openCode, setOpenCode] = useState<string | null>(null);

  const { upcoming, live } = useMemo(() => {
    const list = sets?.sets ?? [];
    return {
      upcoming: list.filter((s) => s.status === "spoiling" || s.status === "announced"),
      live: list.filter((s) => s.status === "live_on_arena" || s.status === "released"),
    };
  }, [sets]);

  const openSet = useMemo(
    () => (openCode ? (sets?.sets.find((s) => s.code === openCode) ?? null) : null),
    [openCode, sets],
  );

  const newTotal = totalNewCount(setsNewByCode);

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
    return (
      <SetGallery
        set={openSet}
        newIds={new Set(setsNewByCode[openSet.code] || [])}
        onBack={() => setOpenCode(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div>
        <p className="eyebrow">Sets</p>
        <h2 className="text-2xl font-semibold m-0 tracking-tight">Set radar</h2>
        <p className="text-sm text-muted mt-2 mb-0 max-w-2xl leading-relaxed">
          Arena-first spoilers, full galleries, Std/Pio legality.{" "}
          <strong className="text-foam">No Alchemy.</strong> Snapshot {sets.date}
          {newTotal > 0 ? (
            <>
              {" "}
              · <strong className="text-gold-300">{newTotal} new</strong> since last visit
            </>
          ) : null}
          .
        </p>
      </div>

      {upcoming.length > 0 ? (
        <section>
          <h3 className="set-section-title">Coming to Arena</h3>
          <div className="set-grid">
            {upcoming.map((s) => (
              <SetCard
                key={s.code}
                set={s}
                newCount={setsNewByCode[s.code]?.length ?? 0}
                onOpenGallery={(x) => setOpenCode(x.code)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {live.length > 0 ? (
        <section>
          <h3 className="set-section-title">Recently live</h3>
          <div className="set-grid">
            {live.map((s) => (
              <SetCard
                key={s.code}
                set={s}
                newCount={setsNewByCode[s.code]?.length ?? 0}
                onOpenGallery={(x) => setOpenCode(x.code)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
