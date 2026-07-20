import { useEffect, useMemo, useState } from "react";
import { useAppStore, type DecklistView } from "../store/useAppStore";
import { resolveArenaCards, type ArenaCardInfo } from "../services/arenaCards";
import { buildArenaImport, copyToClipboard } from "../services/arenaImport";
import { scryfallCdnUrl } from "../services/scryfall";
import { ManaCurve } from "./ManaCurve";
import { ManaCost } from "./ManaCost";
import { IconCopy } from "./NavIcons";
import type { CardEntry } from "../types/meta";

const TYPE_GROUPS: { key: string; label: string }[] = [
  { key: "creature", label: "Creatures" },
  { key: "planeswalker", label: "Planeswalkers" },
  { key: "instant", label: "Instants" },
  { key: "sorcery", label: "Sorceries" },
  { key: "enchantment", label: "Enchantments" },
  { key: "artifact", label: "Artifacts" },
  { key: "battle", label: "Battles" },
  { key: "other", label: "Other" },
  { key: "land", label: "Lands" },
];

function typeBucket(typeLine: string | undefined): string {
  const t = (typeLine || "").toLowerCase();
  if (t.includes("land")) return "land";
  if (t.includes("creature")) return "creature";
  if (t.includes("planeswalker")) return "planeswalker";
  if (t.includes("battle")) return "battle";
  if (t.includes("instant")) return "instant";
  if (t.includes("sorcery")) return "sorcery";
  if (t.includes("enchantment")) return "enchantment";
  if (t.includes("artifact")) return "artifact";
  return "other";
}

interface ListRow {
  id: number;
  count: number;
  info?: ArenaCardInfo;
}

function toRows(ids: number[]): ListRow[] {
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].map(([id, count]) => ({ id, count }));
}

function withInfo(rows: ListRow[], cards: Record<number, ArenaCardInfo>): ListRow[] {
  return rows.map((r) => ({ ...r, info: cards[r.id] }));
}

function sortRows(rows: ListRow[]): ListRow[] {
  return [...rows].sort(
    (a, b) =>
      (a.info?.cmc ?? 99) - (b.info?.cmc ?? 99) ||
      (a.info?.name ?? "").localeCompare(b.info?.name ?? ""),
  );
}

function Row({ r }: { r: ListRow }) {
  const name = r.info?.name ?? `Card #${r.id}`;
  return (
    <div className="card-list-row card-row-hover tracked-list-row">
      {r.info?.scryfallId ? (
        <img
          src={scryfallCdnUrl(r.info.scryfallId, "art_crop")}
          alt=""
          loading="lazy"
          className="tracked-row-art"
          aria-hidden="true"
        />
      ) : (
        <span className="tracked-row-art tracked-row-art-empty" aria-hidden="true" />
      )}
      <span className="count">{r.count}</span>
      <span className="truncate" title={name}>
        {name}
      </span>
      <span className="ml-auto shrink-0">
        <ManaCost cost={r.info?.manaCost} />
      </span>
      {r.info?.scryfallId ? (
        <span className="card-hover-pop" aria-hidden="true">
          <img src={scryfallCdnUrl(r.info.scryfallId, "normal")} alt="" loading="lazy" />
        </span>
      ) : null}
    </div>
  );
}

/** One overlapping tile in the stacked (Arena-style) view. */
function StackCard({ r }: { r: ListRow }) {
  const name = r.info?.name ?? `Card #${r.id}`;
  return (
    <div className="tracked-stack-card" title={name}>
      {r.info?.scryfallId ? (
        <img
          src={scryfallCdnUrl(r.info.scryfallId, "art_crop")}
          alt=""
          loading="lazy"
          className="tracked-stack-art"
          aria-hidden="true"
        />
      ) : (
        <span className="tracked-stack-art tracked-stack-art-empty" aria-hidden="true" />
      )}
      <span className="tracked-stack-name">{name}</span>
      <span className="tracked-stack-count">{r.count}</span>
      {r.info?.scryfallId ? (
        <span className="card-hover-pop" aria-hidden="true">
          <img src={scryfallCdnUrl(r.info.scryfallId, "normal")} alt="" loading="lazy" />
        </span>
      ) : null}
    </div>
  );
}

/** Arena-style stacked columns: nonlands by mana value, lands + SB at the end. */
function StackedView({
  mainRows,
  sideRows,
}: {
  mainRows: ListRow[];
  sideRows: ListRow[];
}) {
  const cols = useMemo(() => {
    const nonland = new Map<number, ListRow[]>();
    const lands: ListRow[] = [];
    for (const r of mainRows) {
      if (typeBucket(r.info?.typeLine) === "land") {
        lands.push(r);
        continue;
      }
      const mv = Math.min(7, Math.max(0, Math.floor(r.info?.cmc ?? 0)));
      const list = nonland.get(mv) ?? [];
      list.push(r);
      nonland.set(mv, list);
    }
    const out: { key: string; label: string; rows: ListRow[]; count: number }[] = [];
    for (const mv of [...nonland.keys()].sort((a, b) => a - b)) {
      const rows = sortRows(nonland.get(mv)!);
      out.push({
        key: `mv${mv}`,
        label: mv >= 7 ? "7+" : String(mv),
        rows,
        count: rows.reduce((n, r) => n + r.count, 0),
      });
    }
    if (lands.length > 0) {
      const rows = sortRows(lands);
      out.push({
        key: "lands",
        label: "Lands",
        rows,
        count: rows.reduce((n, r) => n + r.count, 0),
      });
    }
    if (sideRows.length > 0) {
      const rows = sortRows(sideRows);
      out.push({
        key: "side",
        label: "SB",
        rows,
        count: rows.reduce((n, r) => n + r.count, 0),
      });
    }
    return out;
  }, [mainRows, sideRows]);

  return (
    <div className="tracked-stacks">
      {cols.map((c) => (
        <div key={c.key} className={`tracked-stack-col${c.key === "side" ? " is-side" : ""}`}>
          <p className="tracked-stack-head" title={`${c.count} card${c.count === 1 ? "" : "s"}`}>
            {c.label} <span>{c.count}</span>
          </p>
          {c.rows.map((r) => (
            <StackCard key={r.id} r={r} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Plain text columns — smallest possible footprint. */
function CompactView({
  mainRows,
  sideRows,
}: {
  mainRows: ListRow[];
  sideRows: ListRow[];
}) {
  const groups = useMemo(() => {
    const byKey = new Map<string, ListRow[]>();
    for (const r of mainRows) {
      const k = typeBucket(r.info?.typeLine);
      const list = byKey.get(k) ?? [];
      list.push(r);
      byKey.set(k, list);
    }
    return TYPE_GROUPS.filter((g) => byKey.has(g.key)).map((g) => {
      const list = sortRows(byKey.get(g.key)!);
      return { ...g, rows: list, count: list.reduce((n, r) => n + r.count, 0) };
    });
  }, [mainRows]);

  return (
    <div className="tracked-compact selectable">
      {groups.map((g) => (
        <div key={g.key} className="tracked-compact-group">
          <p className="card-group-head">
            {g.label} <span className="text-muted">({g.count})</span>
          </p>
          {g.rows.map((r) => (
            <p key={r.id} className="tracked-compact-row">
              <span className="count">{r.count}</span>
              {r.info?.name ?? `Card #${r.id}`}
            </p>
          ))}
        </div>
      ))}
      {sideRows.length > 0 && (
        <div className="tracked-compact-group">
          <p className="card-group-head">
            Sideboard{" "}
            <span className="text-muted">
              ({sideRows.reduce((n, r) => n + r.count, 0)})
            </span>
          </p>
          {sortRows(sideRows).map((r) => (
            <p key={r.id} className="tracked-compact-row">
              <span className="count">{r.count}</span>
              {r.info?.name ?? `Card #${r.id}`}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

const VIEW_OPTIONS: { id: DecklistView; label: string; tip: string }[] = [
  { id: "stacked", label: "Stacked", tip: "Arena-style mana columns — compact, art-forward" },
  { id: "list", label: "List", tip: "Type groups with art rows, curve and sideboard" },
  { id: "compact", label: "Text", tip: "Plain text columns — smallest view" },
];

/**
 * Full decklist for a tracked deck (My Stats) with three view modes:
 * stacked Arena-style columns (default, compact), the classic grouped list,
 * and a plain-text view. One-click copy in Arena import format everywhere.
 * The chosen view persists (Settings → Interface).
 */
export function TrackedDecklist({
  deckName,
  main,
  side,
}: {
  deckName: string;
  main: number[];
  side?: number[];
}) {
  const [cards, setCards] = useState<Record<number, ArenaCardInfo>>({});
  const [toast, setToast] = useState<string | null>(null);
  const view = useAppStore((s) => s.prefs.decklistView);
  const setView = useAppStore((s) => s.setDecklistView);

  const allIds = useMemo(() => [...new Set([...main, ...(side ?? [])])], [main, side]);
  const key = allIds.slice().sort((a, b) => a - b).join(",");
  useEffect(() => {
    let alive = true;
    void resolveArenaCards(allIds, { full: true }).then((map) => {
      if (alive) setCards(map);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const mainRows = useMemo(() => withInfo(toRows(main), cards), [main, cards]);
  const sideRows = useMemo(() => withInfo(toRows(side ?? []), cards), [side, cards]);

  const groups = useMemo(() => {
    const byKey = new Map<string, ListRow[]>();
    for (const r of mainRows) {
      const k = typeBucket(r.info?.typeLine);
      const list = byKey.get(k) ?? [];
      list.push(r);
      byKey.set(k, list);
    }
    return TYPE_GROUPS.filter((g) => byKey.has(g.key)).map((g) => {
      const list = sortRows(byKey.get(g.key)!);
      return { ...g, rows: list, count: list.reduce((n, r) => n + r.count, 0) };
    });
  }, [mainRows]);

  // Curve wants CardEntry-shaped rows; unresolved cards are skipped (never guessed).
  const curveEntries = useMemo<CardEntry[]>(
    () =>
      mainRows
        .filter((r) => r.info)
        .map((r) => ({
          name: r.info!.name,
          count: r.count,
          cmc: r.info!.cmc,
          land: typeBucket(r.info!.typeLine) === "land",
        })),
    [mainRows],
  );

  const mainCount = main.length;
  const sideCount = side?.length ?? 0;
  const resolved = mainRows.filter((r) => r.info).length;
  const resolving = resolved < mainRows.length;

  const onCopy = async () => {
    const entry = (r: ListRow) => ({
      count: r.count,
      name: r.info?.name ?? `Card #${r.id}`,
    });
    const text = buildArenaImport({
      mainboard: sortRows(mainRows).map(entry),
      sideboard: sortRows(sideRows).map(entry),
      commander: undefined,
    });
    const ok = await copyToClipboard(text);
    setToast(
      ok
        ? "Decklist copied — paste it anywhere (Arena, Discord, forums)."
        : "Copy failed — select the list manually.",
    );
    setTimeout(() => setToast(null), 3200);
  };

  if (mainRows.length === 0) return null;

  return (
    <div className="panel">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="dash-title m-0">
          Decklist · {mainCount} main{sideCount ? ` · ${sideCount} SB` : ""}
          <span className="text-muted font-normal text-xs"> · latest build from Arena</span>
        </h3>
        <span className="flex items-center gap-2 flex-wrap">
          <span className="filter-bar mb-0" role="group" aria-label="Decklist view">
            {VIEW_OPTIONS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`filter-chip${view === v.id ? " active" : ""}`}
                title={v.tip}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void onCopy()}
            disabled={resolving}
            title={
              resolving
                ? "Still resolving card names on Scryfall…"
                : `Copy ${deckName} in Arena import format`
            }
          >
            <IconCopy className="w-4 h-4" /> Copy decklist
          </button>
        </span>
      </div>

      {resolving && (
        <p className="text-xs text-muted m-0 mb-2 loading-pulse">
          Resolving {mainRows.length - resolved} card name
          {mainRows.length - resolved === 1 ? "" : "s"} on Scryfall…
        </p>
      )}

      {view === "stacked" && <StackedView mainRows={mainRows} sideRows={sideRows} />}

      {view === "compact" && <CompactView mainRows={mainRows} sideRows={sideRows} />}

      {view === "list" && (
        <div className="tracked-list-layout">
          <div className="card-list selectable">
            {groups.map((g) => (
              <div key={g.key}>
                <p className="card-group-head">
                  {g.label} <span className="text-muted">({g.count})</span>
                </p>
                {g.rows.map((r) => (
                  <Row key={r.id} r={r} />
                ))}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <p className="card-group-head">Mana curve</p>
              <ManaCurve cards={curveEntries} />
            </div>
            {sideRows.length > 0 && (
              <div className="card-list selectable">
                <p className="card-group-head">
                  Sideboard <span className="text-muted">({sideCount})</span>
                </p>
                {sortRows(sideRows).map((r) => (
                  <Row key={r.id} r={r} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
