import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppStore } from "../store/useAppStore";
import { scryfallCdnUrl } from "../services/scryfall";
import { openExternal } from "../services/openExternal";
import {
  isFormatLegal,
  setGalleryCards,
  type BannedCard,
  type DateConfidence,
  type FormatHub,
  type FormatSetInfo,
  type FutureSet,
  type SetPreviewCard,
  type SetStatus,
  type UpcomingSet,
} from "../types/sets";
import { IconBack } from "../components/NavIcons";
import { ManaCost } from "../components/ManaCost";
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

/** Scryfall marks unreleased cards not_legal until launch day — say so. */
function LegalBadges({ card, unreleased }: { card: SetPreviewCard; unreleased?: boolean }) {
  const std = isFormatLegal(card, "standard");
  const pio = isFormatLegal(card, "pioneer");
  const pendingLabel = unreleased ? "at release" : "—";
  return (
    <div className="legal-badges">
      <span
        className={`legal-badge${std ? " legal-yes" : unreleased ? " legal-pending" : " legal-no"}`}
      >
        Std {std ? "legal" : pendingLabel}
      </span>
      <span
        className={`legal-badge${pio ? " legal-yes" : unreleased ? " legal-pending" : " legal-no"}`}
      >
        Pio {pio ? "legal" : pendingLabel}
      </span>
    </div>
  );
}

function CardDetailDrawer({
  card,
  onClose,
  onStep,
  position,
  unreleased,
}: {
  card: SetPreviewCard;
  onClose: () => void;
  /** Step to the previous (-1) / next (+1) card in the filtered gallery. */
  onStep?: (dir: -1 | 1) => void;
  /** "12 / 250" style position label within the filtered gallery. */
  position?: string;
  /** True when the set hasn't launched — legality reads "at release". */
  unreleased?: boolean;
}): ReactNode {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Modal basics: take focus on open, Escape closes, ←/→ browse, focus back.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    drawerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onStep?.(-1);
      else if (e.key === "ArrowRight") onStep?.(1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose, onStep]);

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
      <div
        className="set-drawer"
        ref={drawerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="set-drawer-art">
          <img src={scryfallCdnUrl(card.scryfallId, "normal")} alt={card.name} />
        </div>
        <div className="set-drawer-body">
          <div className="flex justify-between items-start gap-2">
            <div>
              <h3 className="set-drawer-title m-0">{card.name}</h3>
              <p className="set-drawer-sub m-0 flex items-center gap-1.5 flex-wrap">
                #{card.collectorNumber} · {card.rarity}
                {card.manaCost ? (
                  <>
                    {" · "}
                    <ManaCost cost={card.manaCost} />
                  </>
                ) : null}
                {card.cmc != null ? ` · MV ${card.cmc}` : ""}
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
          {card.typeLine ? (
            <p className="set-drawer-type m-0">{card.typeLine}</p>
          ) : null}
          <LegalBadges card={card} unreleased={unreleased} />
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
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void openExternal(uri)}
            >
              Open on Scryfall
            </button>
            {onStep ? (
              <span className="flex items-center gap-1 ml-auto">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label="Previous card"
                  title="Previous card (←)"
                  onClick={() => onStep(-1)}
                >
                  ‹
                </button>
                {position ? (
                  <span className="text-xs text-muted whitespace-nowrap">{position}</span>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label="Next card"
                  title="Next card (→)"
                  onClick={() => onStep(1)}
                >
                  ›
                </button>
              </span>
            ) : null}
          </div>
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
  // Stable ref so the drawer's focus/Escape effect doesn't re-run per render.
  const closeFocus = useCallback(() => setFocus(null), []);

  const all = useMemo(() => setGalleryCards(set), [set]);
  const unreleased = set.status === "spoiling" || set.status === "announced";
  const filteredRef = useRef<SetPreviewCard[]>([]);
  // ←/→ browse within the CURRENT filter/sort, wrapping at the ends.
  const stepFocus = useCallback((dir: -1 | 1) => {
    setFocus((cur) => {
      const list = filteredRef.current;
      if (!cur || list.length === 0) return cur;
      const i = list.findIndex((c) => c.scryfallId === cur.scryfallId);
      if (i < 0) return list[0];
      return list[(i + dir + list.length) % list.length];
    });
  }, []);

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
    filteredRef.current = list;
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
                      ? unreleased
                        ? "at release"
                        : "—"
                      : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {focus ? (
        <CardDetailDrawer
          card={focus}
          onClose={closeFocus}
          onStep={stepFocus}
          unreleased={unreleased}
          position={(() => {
            const i = filtered.findIndex((c) => c.scryfallId === focus.scryfallId);
            return i >= 0 ? `${i + 1} / ${filtered.length}` : undefined;
          })()}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Format hub — legality, rotation, bans (Standard + Pioneer)
// ---------------------------------------------------------------------------

/** "Q1 2027" / exact ISO date → sortable number so we can find the next exit. */
function exitSortKey(s: FormatSetInfo): number {
  if (s.exitDate) return Number(s.exitDate.replace(/-/g, ""));
  const m = /Q([1-4])\s+(\d{4})/.exec(s.exitRough || "");
  if (m) return Number(m[2]) * 10000 + Number(m[1]) * 300;
  return Number.MAX_SAFE_INTEGER;
}

function exitLabel(s: FormatSetInfo): string {
  if (s.exitDate) return formatDate(s.exitDate);
  return s.exitRough || "TBA";
}

function FormatSetRow({
  s,
  rotatingNext,
}: {
  s: FormatSetInfo;
  rotatingNext?: boolean;
}) {
  return (
    <div className={`fmt-set-row${rotatingNext ? " rotating-next" : ""}`}>
      {s.iconSvg ? (
        <img src={s.iconSvg} alt="" className="set-icon fmt-set-icon" width={22} height={22} />
      ) : (
        <span className="fmt-set-icon" aria-hidden="true" />
      )}
      <span className="fmt-set-name" title={s.name}>
        {s.name}
        <span className="fmt-set-code">{s.code.toUpperCase()}</span>
      </span>
      <span className="fmt-set-meta">
        {s.exitRough || s.exitDate ? (
          <span
            className={`rot-chip${rotatingNext ? " rot-soon" : ""}`}
            title={`Leaves Standard ${exitLabel(s)}${rotatingNext ? " — next rotation" : ""}`}
          >
            rotates {exitLabel(s)}
          </span>
        ) : s.releasedAt ? (
          <span className="text-muted">{formatDate(s.releasedAt)}</span>
        ) : null}
      </span>
    </div>
  );
}

function BanRail({ bans }: { bans: BannedCard[] }) {
  if (bans.length === 0) {
    return <p className="text-sm text-good m-0">No banned cards — the format is clean.</p>;
  }
  return (
    <div className="ban-rail" role="list">
      {bans.map((b) => (
        <button
          key={b.name}
          type="button"
          role="listitem"
          className="ban-card"
          title={`${b.name} — banned${b.reason ? `\n\n${b.reason}` : ""}\nClick for Scryfall`}
          onClick={() =>
            void openExternal(
              b.scryfallId
                ? `https://scryfall.com/card/${b.scryfallId}`
                : `https://scryfall.com/search?q=${encodeURIComponent(`!"${b.name}"`)}`,
            )
          }
        >
          {b.scryfallId ? (
            <img src={scryfallCdnUrl(b.scryfallId, "small")} alt={b.name} loading="lazy" />
          ) : (
            <span className="ban-card-fallback">{b.name.slice(0, 1)}</span>
          )}
          <span className="ban-card-name">{b.name}</span>
          <span className="ban-card-x" aria-hidden="true">
            banned
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Roadmap-announced sets with no Scryfall row yet (curated in the pipeline —
 * every row links to its announcement source). Hidden on older feeds.
 */
function FutureStandardSection({ futureSets }: { futureSets: FutureSet[] }) {
  if (!futureSets.length) return null;
  return (
    <section>
      <h3 className="set-section-title">Future Standard</h3>
      <div className="panel flex flex-col gap-3">
        <div>
          <p className="eyebrow m-0 mb-1">On the roadmap · no cards spoiled yet</p>
          <p className="text-sm text-muted m-0 leading-relaxed max-w-2xl">
            Announced sets beyond the radar, each linked to its announcement source. They
            graduate to the radar above — dates, galleries, countdowns — the moment Scryfall
            catalogs them.
          </p>
        </div>
        <div className="future-set-list">
          {futureSets.map((f) => (
            <div className="future-set-row" key={`${f.name}-${f.sortDate ?? ""}`}>
              <span className="future-set-glyph" aria-hidden="true">
                {f.kind === "universes-beyond" && /^universes beyond/i.test(f.name)
                  ? "UB"
                  : f.name.slice(0, 1)}
              </span>
              <div className="future-set-body">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{f.name}</strong>
                  <span className={`future-set-kind kind-${f.kind}`}>
                    {f.kind === "universes-beyond" ? "Universes Beyond" : "Magic Multiverse"}
                  </span>
                  {f.confidence === "reported" && (
                    <span
                      className="future-set-reported"
                      title="Slot confirmed by WotC; timing from press reports — not yet officially dated"
                    >
                      reported
                    </span>
                  )}
                </div>
                {f.notes && <p className="future-set-notes">{f.notes}</p>}
              </div>
              <div className="future-set-side">
                {f.dateLabel && <span className="future-set-date">{f.dateLabel}</span>}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  title={f.sourceName ? `Announcement source: ${f.sourceName}` : "Announcement source"}
                  onClick={() => void openExternal(f.sourceUrl)}
                >
                  Source{f.sourceName ? `: ${f.sourceName}` : ""}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FormatHubSection({ hub }: { hub: FormatHub }) {
  const [fmt, setFmt] = useState<"standard" | "pioneer">("standard");
  const [showAllPio, setShowAllPio] = useState(false);

  const std = hub.standard;
  const pio = hub.pioneer;
  if (!std && !pio) return null;

  // Standard: the sets sharing the earliest exit window are "rotating next".
  const nextExitKey = std?.sets.length
    ? Math.min(...std.sets.map(exitSortKey))
    : Number.MAX_SAFE_INTEGER;
  const rotatingNext = (std?.sets ?? []).filter((s) => exitSortKey(s) === nextExitKey);

  const active = fmt === "standard" ? std : pio;
  const pioVisible = showAllPio ? (pio?.sets ?? []) : (pio?.sets ?? []).slice(0, 12);

  return (
    <section>
      <h3 className="set-section-title">Format hub</h3>
      <div className="panel flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow m-0 mb-1">Legality · rotation · bans</p>
            <p className="text-sm text-muted m-0 leading-relaxed max-w-2xl">
              {fmt === "standard" ? (
                <>
                  <strong className="text-foam">{std?.sets.length ?? 0} sets</strong> are
                  Standard-legal right now
                  {rotatingNext.length > 0 && rotatingNext[0] ? (
                    <>
                      {" "}
                      · next rotation{" "}
                      <strong className="text-gold-300">{exitLabel(rotatingNext[0])}</strong> (
                      {rotatingNext.length} set{rotatingNext.length === 1 ? "" : "s"} leave
                      {rotatingNext.length === 1 ? "s" : ""}
                      {std?.rotation?.cardNames?.length
                        ? `, ${std.rotation.cardNames.length} cards`
                        : ""}
                      )
                    </>
                  ) : null}
                  .
                </>
              ) : (
                <>
                  Pioneer is every expansion since{" "}
                  <strong className="text-foam">Return to Ravnica</strong>
                  {pio?.sinceDate ? ` (${formatDate(pio.sinceDate)})` : ""} —{" "}
                  <strong className="text-foam">{pio?.sets.length ?? 0} sets</strong> and
                  counting.
                </>
              )}
            </p>
          </div>
          <div className="set-rarity-chips" role="tablist" aria-label="Format">
            {std ? (
              <button
                type="button"
                role="tab"
                aria-selected={fmt === "standard"}
                className={`set-rarity-chip${fmt === "standard" ? " active" : ""}`}
                onClick={() => setFmt("standard")}
              >
                Standard
              </button>
            ) : null}
            {pio ? (
              <button
                type="button"
                role="tab"
                aria-selected={fmt === "pioneer"}
                className={`set-rarity-chip${fmt === "pioneer" ? " active" : ""}`}
                onClick={() => setFmt("pioneer")}
              >
                Pioneer
              </button>
            ) : null}
          </div>
        </div>

        {active ? (
          <>
            <div className="fmt-hub-grid">
              {(fmt === "standard" ? (std?.sets ?? []) : pioVisible).map((s) => (
                <FormatSetRow
                  key={s.code}
                  s={s}
                  rotatingNext={fmt === "standard" && exitSortKey(s) === nextExitKey}
                />
              ))}
            </div>
            {fmt === "pioneer" && (pio?.sets.length ?? 0) > 12 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm self-start"
                onClick={() => setShowAllPio((v) => !v)}
              >
                {showAllPio
                  ? "Show fewer"
                  : `Show all ${pio?.sets.length} Pioneer sets`}
              </button>
            ) : null}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted m-0 mb-2">
                Banned in {fmt === "standard" ? "Standard" : "Pioneer"} ·{" "}
                {active.bans.length}
              </h4>
              <BanRail bans={active.bans} />
            </div>
          </>
        ) : null}
      </div>
    </section>
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

  // Leaving the page baselines "new since last visit" — badges survive
  // background syncs but reset once the user has actually seen the radar.
  useEffect(() => {
    return () => useAppStore.getState().markSetsSeen();
  }, []);

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
          Arena-first spoilers, full galleries, plus the format hub — legality, rotation, and
          ban lists for Standard &amp; Pioneer.{" "}
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

      {sets.futureSets?.length ? <FutureStandardSection futureSets={sets.futureSets} /> : null}

      {sets.formats ? <FormatHubSection hub={sets.formats} /> : null}
    </div>
  );
}
