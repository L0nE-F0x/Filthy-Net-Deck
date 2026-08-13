import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import type { FormatId, PlayMode } from "../types/meta";
import {
  clinicReportText,
  fromArenaIds,
  fromNamedLines,
  runListClinic,
  type BoardDiff,
  type ClinicSwap,
  type CountedName,
  type ListClinicReport,
} from "../services/brewLab";
import { copyToClipboard, parseDeckText } from "../services/arenaImport";
import { normalizeCardName, resolveNamedCards, type NamedCardInfo } from "../services/namedCards";
import { resolveArenaCards } from "../services/arenaCards";
import { IconCopy } from "./NavIcons";

function offLabel(n: number): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${s} card${n === 1 ? "" : "s"} off`;
}

function delta(s: ClinicSwap): string {
  const d = s.yours - s.ranked;
  return d > 0 ? `+${d}` : `${d}`;
}

function SwapRow({ s, kind }: { s: ClinicSwap; kind: "extra" | "missing" | "count" }) {
  return (
    <li className={`clinic-row is-${kind}`}>
      <span className="clinic-delta" aria-hidden="true">
        {kind === "missing" ? delta({ ...s, yours: 0, ranked: s.ranked }) : delta(s)}
      </span>
      <strong>{s.name}</strong>
      <span className="clinic-counts">
        you {s.yours} · ranked {s.ranked}
      </span>
    </li>
  );
}

function BoardBlock({ label, board }: { label: string; board: BoardDiff }) {
  if (board.identical) {
    return (
      <p className="text-sm m-0 mt-2">
        {label}: <strong className="text-foam">same {board.rankedTotal}</strong>
      </p>
    );
  }
  return (
    <div className="clinic-board">
      <h4 className="clinic-board-title">
        {label} · {offLabel(board.cardsOff)} the ranked {board.rankedTotal}
      </h4>
      <ul className="clinic-rows">
        {board.extras.map((s) => (
          <SwapRow key={`e-${s.name}`} s={s} kind="extra" />
        ))}
        {board.counts.map((s) => (
          <SwapRow key={`c-${s.name}`} s={s} kind="count" />
        ))}
        {board.missing.map((s) => (
          <SwapRow key={`m-${s.name}`} s={s} kind="missing" />
        ))}
      </ul>
    </div>
  );
}

type ClinicProps = {
  deckName: string;
  main: CountedName[];
  side?: CountedName[];
  preferFormat?: FormatId;
  resolving?: boolean;
  /** Skip the outer panel when already inside one (paste box). */
  embedded?: boolean;
};

/** Card-by-card vs the closest ranked list on today's board. */
export function ListClinic({
  deckName,
  main,
  side,
  preferFormat,
  resolving,
  embedded,
}: ClinicProps) {
  const meta = useAppStore((s) => s.meta);
  const appMode = useAppStore((s) => s.mode);
  const openDeck = useAppStore((s) => s.openDeck);
  const [mode, setMode] = useState<PlayMode>(appMode);
  const [copied, setCopied] = useState(false);

  const report: ListClinicReport = useMemo(
    () =>
      runListClinic({
        deckName,
        main,
        side: side && side.length ? side : undefined,
        meta,
        mode,
        preferFormat,
      }),
    [deckName, main, side, meta, mode, preferFormat],
  );

  const far = !report.emptyReason && report.main.cardsOff > 15;

  return (
    <div className={embedded ? "clinic" : "panel clinic"}>
      <div className="clinic-head">
        <div>
          <p className="eyebrow m-0">vs today’s ranked list</p>
          {report.emptyReason ? (
            <h3 className="dash-title m-0 mt-1">{deckName}</h3>
          ) : (
            <h3 className="dash-title m-0 mt-1">
              {report.main.identical
                ? `Same ${report.main.rankedTotal} as ${report.rankedName}`
                : `${offLabel(report.main.cardsOff)} ${report.rankedName}`}
            </h3>
          )}
          {!report.emptyReason && (
            <p className="text-xs text-muted m-0 mt-1 leading-relaxed">
              Closest {report.formatId} {report.mode.toUpperCase()} list on today’s board
              {report.nameWasOverridden && report.namedMatch
                ? ` · closer than “${report.namedMatch}”`
                : ""}
              . Real ranked cards only.
            </p>
          )}
        </div>
        <div className="filter-bar mb-0" role="group" aria-label="Clinic mode">
          {(["bo1", "bo3"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`filter-chip${mode === m ? " active" : ""}`}
              onClick={() => setMode(m)}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {resolving && (
        <p className="text-xs text-muted m-0 mt-2 loading-pulse">Resolving card names…</p>
      )}

      {report.emptyReason ? (
        <p className="text-sm text-muted m-0 mt-3 leading-relaxed" role="status">
          {report.emptyReason}
        </p>
      ) : (
        <>
          {far && (
            <p className="qa-flag mt-2 mb-0">
              Not a close netdeck — this is just the nearest list on the board.
            </p>
          )}
          <BoardBlock label="Main" board={report.main} />
          {report.side && <BoardBlock label="Sideboard" board={report.side} />}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {report.rankedId && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => openDeck(report.rankedId!)}
              >
                Open ranked list
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              title="Copy the card-by-card diff as plain text"
              onClick={() => {
                void copyToClipboard(clinicReportText(deckName, report)).then((ok) => {
                  setCopied(ok);
                  setTimeout(() => setCopied(false), 2400);
                });
              }}
            >
              <IconCopy className="w-4 h-4" /> {copied ? "Copied!" : "Copy diff"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Tracked deck: resolve Arena ids, then clinic. */
export function TrackedListClinic({
  deckName,
  mainIds,
  sideIds,
  preferFormat,
}: {
  deckName: string;
  mainIds: number[];
  sideIds?: number[];
  preferFormat?: FormatId;
}) {
  const [main, setMain] = useState<CountedName[]>([]);
  const [side, setSide] = useState<CountedName[]>([]);
  const [resolving, setResolving] = useState(false);
  const idsKey = useMemo(
    () => [...mainIds, ...(sideIds ?? [])].join(","),
    [mainIds, sideIds],
  );

  useEffect(() => {
    if (!mainIds.length) {
      setMain([]);
      setSide([]);
      return;
    }
    let alive = true;
    setResolving(true);
    void resolveArenaCards([...new Set([...mainIds, ...(sideIds ?? [])])], { full: true })
      .then((map) => {
        if (!alive) return;
        setMain(fromArenaIds(mainIds, map));
        setSide(sideIds?.length ? fromArenaIds(sideIds, map) : []);
      })
      .finally(() => {
        if (alive) setResolving(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  if (!mainIds.length) return null;
  if (resolving && main.length === 0) {
    return (
      <div className="panel clinic">
        <p className="eyebrow m-0">vs today’s ranked list</p>
        <p className="text-xs text-muted m-0 mt-2 loading-pulse">Resolving card names…</p>
      </div>
    );
  }
  return (
    <ListClinic
      deckName={deckName}
      main={main}
      side={side}
      preferFormat={preferFormat}
      resolving={resolving}
    />
  );
}

/** Compact paste box for the My Stats overview. */
export function PasteListClinic() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [main, setMain] = useState<CountedName[]>([]);
  const [side, setSide] = useState<CountedName[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [resolving, setResolving] = useState(false);
  const [ran, setRan] = useState(false);
  const [skipped, setSkipped] = useState(0);

  const run = () => {
    const parsed = parseDeckText(text);
    setSkipped(parsed.skipped.length);
    setRan(true);
    const names = [...parsed.main, ...parsed.side].map((l) => l.name);
    if (!names.length) {
      setMain([]);
      setSide([]);
      setUnknown([]);
      return;
    }
    setResolving(true);
    void resolveNamedCards(names)
      .then((resolved: Record<string, NamedCardInfo | null>) => {
        const m = fromNamedLines(parsed.main, resolved, normalizeCardName);
        const s = fromNamedLines(parsed.side, resolved, normalizeCardName);
        setMain(m.cards);
        setSide(s.cards);
        setUnknown([...m.unknown, ...s.unknown]);
      })
      .finally(() => setResolving(false));
  };

  return (
    <div className="panel">
      <button
        type="button"
        className="clinic-paste-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          <span className="eyebrow m-0">Paste a list</span>
          <span className="clinic-paste-hint">
            Compare any Arena/MTGO export to today’s closest ranked 75
          </span>
        </span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-2">
          <textarea
            className="clinic-paste-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Deck\n4 Llanowar Elves\n4 Steel Leaf Champion\n…\n\nSideboard\n2 Duress"}
            rows={7}
            spellCheck={false}
          />
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!text.trim() || resolving}
              onClick={run}
            >
              {resolving ? "Resolving…" : "Compare"}
            </button>
            {ran && skipped > 0 && (
              <span className="text-xs text-muted">
                {skipped} line{skipped === 1 ? "" : "s"} skipped
              </span>
            )}
          </div>
          {ran && unknown.length > 0 && !resolving && (
            <p className="qa-flag mt-2 mb-0">
              Not recognized: {unknown.slice(0, 6).join(", ")}
              {unknown.length > 6 ? ` +${unknown.length - 6} more` : ""} — check the spelling;
              those cards are left out.
            </p>
          )}
          {ran && main.length > 0 && (
            <div className="mt-3">
              <ListClinic
                deckName="Pasted list"
                main={main}
                side={side}
                resolving={resolving}
                embedded
              />
            </div>
          )}
          {ran && main.length === 0 && !resolving && (
            <p className="text-sm text-muted m-0 mt-2">
              Nothing usable parsed — paste “4 Card Name” lines (Arena’s Export button) and
              compare again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
