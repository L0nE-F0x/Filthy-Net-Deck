import { useEffect, useMemo, useState } from "react";
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

/**
 * Full decklist for a tracked deck (My Stats): type groups with card art,
 * mana curve, sideboard, and one-click copy in Arena import format.
 * Card data comes from the Arena ids the tracker stored for the latest build.
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
      </div>

      {resolving && (
        <p className="text-xs text-muted m-0 mb-2 loading-pulse">
          Resolving {mainRows.length - resolved} card name
          {mainRows.length - resolved === 1 ? "" : "s"} on Scryfall…
        </p>
      )}

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

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
