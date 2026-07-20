import { useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import type { FormatId, PlayMode } from "../types/meta";
import {
  fromArenaIds,
  runBrewClinic,
  type BrewClinicReport,
  type ClinicFinding,
  type ListShape,
} from "../services/brewLab";
import { resolveArenaCards } from "../services/arenaCards";
import { useEffect } from "react";

function severityClass(s: ClinicFinding["severity"]): string {
  if (s === "gap") return "brew-finding is-gap";
  if (s === "nudge") return "brew-finding is-nudge";
  return "brew-finding is-info";
}

function ShapeMini({ label, shape, peer }: { label: string; shape: ListShape; peer: ListShape }) {
  const rows: { k: string; y: number; p: number; tip: string }[] = [
    {
      k: "Lands",
      y: shape.lands,
      p: peer.lands,
      tip: "Land count vs ranked peer average for this mode",
    },
    {
      k: "Creatures",
      y: shape.creatures,
      p: peer.creatures,
      tip: "Creature slots vs peers",
    },
    {
      k: "Inst/Sorc",
      y: shape.instantSorcery,
      p: peer.instantSorcery,
      tip: "Instants + sorceries — proxy for interaction / draw without inventing card text",
    },
    {
      k: "Avg MV",
      y: shape.avgCmc ?? 0,
      p: peer.avgCmc ?? 0,
      tip: "Average mana value of nonlands (when CMC is known)",
    },
  ];
  return (
    <div className="brew-shape" title={`${label} shape vs peer field`}>
      <h4 className="brew-shape-title">{label}</h4>
      <ul className="brew-shape-list">
        {rows.map((r) => {
          const delta = r.y - r.p;
          const show = r.k === "Avg MV" ? r.y > 0 || r.p > 0 : true;
          if (!show) return null;
          return (
            <li key={r.k} title={r.tip}>
              <span>{r.k}</span>
              <strong>
                {r.k === "Avg MV"
                  ? shape.avgCmc != null
                    ? shape.avgCmc.toFixed(2)
                    : "—"
                  : Math.round(r.y)}
              </strong>
              <em title="Peer average">
                peer{" "}
                {r.k === "Avg MV"
                  ? peer.avgCmc != null
                    ? peer.avgCmc.toFixed(2)
                    : "—"
                  : Math.round(r.p * 10) / 10}
                {r.k !== "Avg MV" && Math.abs(delta) >= 1.5
                  ? ` (${delta > 0 ? "+" : ""}${Math.round(delta)})`
                  : ""}
              </em>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CurveBars({ yours, peer }: { yours: ListShape; peer: ListShape }) {
  const labels = ["0", "1", "2", "3", "4", "5", "6+"];
  const max = Math.max(1, ...yours.curve, ...peer.curve);
  return (
    <div className="brew-curve" title="Non-land counts by mana value vs peer average">
      <h4 className="brew-shape-title">Curve (nonlands)</h4>
      <div className="brew-curve-grid">
        {labels.map((lab, i) => (
          <div key={lab} className="brew-curve-col" title={`MV ${lab}: you ${Math.round(yours.curve[i])} · peer ~${(Math.round(peer.curve[i] * 10) / 10)}`}>
            <div className="brew-curve-bars">
              <span
                className="brew-curve-you"
                style={{ height: `${(yours.curve[i] / max) * 100}%` }}
              />
              <span
                className="brew-curve-peer"
                style={{ height: `${(peer.curve[i] / max) * 100}%` }}
              />
            </div>
            <em>{lab}</em>
          </div>
        ))}
      </div>
      <p className="brew-curve-legend text-xs text-muted m-0">
        <span className="brew-leg-you">You</span>
        <span className="brew-leg-peer">Peer avg</span>
      </p>
    </div>
  );
}

type Props = {
  deckName: string;
  mainIds: number[] | undefined;
  sideIds: number[] | undefined;
};

/**
 * Brew Lab panel — meta-grounded list clinic on a tracked deck.
 * Resolves Arena ids with the existing Scryfall cache path only (same as Stats art).
 */
export function BrewLabPanel({ deckName, mainIds, sideIds }: Props) {
  const meta = useAppStore((s) => s.meta);
  const appMode = useAppStore((s) => s.mode);
  const [mode, setMode] = useState<PlayMode>(appMode);
  const [formatId, setFormatId] = useState<FormatId | "auto">("auto");
  const [cardMap, setCardMap] = useState<
    Record<number, { name?: string; typeLine?: string; cmc?: number } | null>
  >({});
  const [loading, setLoading] = useState(false);

  const allIds = useMemo(() => {
    const s = new Set<number>();
    for (const id of mainIds ?? []) s.add(id);
    for (const id of sideIds ?? []) s.add(id);
    return [...s];
  }, [mainIds, sideIds]);

  useEffect(() => {
    if (allIds.length === 0) {
      setCardMap({});
      return;
    }
    let alive = true;
    setLoading(true);
    void resolveArenaCards(allIds, { full: true })
      .then((map) => {
        if (alive) setCardMap(map);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // Joined-id key: reacts to real list changes without refetch loops from
    // per-render array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allIds.join(",")]);

  const report: BrewClinicReport = useMemo(() => {
    if (!mainIds?.length) {
      return runBrewClinic({
        deckName,
        main: [],
        meta,
        mode,
        formatId: formatId === "auto" ? undefined : formatId,
      });
    }
    const main = fromArenaIds(mainIds, cardMap);
    const side =
      sideIds && sideIds.length ? fromArenaIds(sideIds, cardMap) : undefined;
    // Wait until we have names for most of the main
    if (main.length === 0 && loading) {
      return runBrewClinic({
        deckName,
        main: [],
        meta,
        mode,
        formatId: formatId === "auto" ? undefined : formatId,
      });
    }
    return runBrewClinic({
      deckName,
      main,
      side,
      meta,
      mode,
      formatId: formatId === "auto" ? undefined : formatId,
    });
  }, [deckName, mainIds, sideIds, cardMap, meta, mode, formatId, loading]);

  return (
    <div className="panel brew-lab">
      <div className="brew-lab-head">
        <div>
          <h3 className="dash-title m-0" title="Compare your list shape to today’s ranked meta peers">
            Brew Lab
          </h3>
          <p className="text-xs text-muted m-0 mt-1 leading-relaxed max-w-xl">
            Pure list clinic — no AI, no invented cards. Shape and staples come only from ranked
            Standard/Pioneer lists already in today’s feed, plus your Arena-submitted main/side.
          </p>
        </div>
        <div className="brew-lab-controls">
          <div className="filter-bar mb-0" role="group" aria-label="Clinic mode">
            {(["bo1", "bo3"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`filter-chip${mode === m ? " active" : ""}`}
                title={
                  m === "bo1"
                    ? "Clinic against Bo1 ranked board (main only)"
                    : "Clinic against Bo3 board (main + sideboard staples)"
                }
                onClick={() => setMode(m)}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="filter-bar mb-0" role="group" aria-label="Clinic format">
            {(
              [
                ["auto", "Auto"],
                ["standard", "Standard"],
                ["pioneer", "Pioneer"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`filter-chip${formatId === id ? " active" : ""}`}
                title={
                  id === "auto"
                    ? "Pick format from the closest meta name match"
                    : `Force ${label} peer board`
                }
                onClick={() => setFormatId(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <p className="text-xs text-muted m-0 mt-2" title="Resolving card names from local/Scryfall cache">
          Resolving card names…
        </p>
      )}

      {report.emptyReason ? (
        <p className="text-sm text-muted m-0 mt-3 leading-relaxed" role="status">
          {report.emptyReason}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted m-0 mt-2" title="Peers are the ranked 8 for this format and mode">
            Field: <strong className="text-foam">{report.peerCount}</strong> ranked{" "}
            {report.formatId ?? "format"} {report.mode.toUpperCase()} lists
            {report.matchedPeerName ? (
              <>
                {" "}
                · closest meta name:{" "}
                <strong className="text-foam">{report.matchedPeerName}</strong>
              </>
            ) : (
              <> · no exact meta name match — using full board as peers</>
            )}
          </p>

          <div className="brew-lab-grid mt-3">
            <ShapeMini label="Your main" shape={report.yourMain} peer={report.peerMainAvg} />
            <ShapeMini label="Peer main (avg)" shape={report.peerMainAvg} peer={report.yourMain} />
            <CurveBars yours={report.yourMain} peer={report.peerMainAvg} />
          </div>

          <div className="brew-findings mt-3">
            <h4 className="brew-shape-title m-0 mb-2">Clinic notes</h4>
            <ul className="brew-findings-list">
              {report.findings.map((f) => (
                <li key={f.id} className={severityClass(f.severity)} title={f.detail}>
                  <strong>{f.title}</strong>
                  <span>{f.detail}</span>
                </li>
              ))}
            </ul>
          </div>

          {report.lightStaples.length > 0 && (
            <div className="brew-staples mt-3">
              <h4
                className="brew-shape-title m-0 mb-2"
                title="Cards that appear on ranked peer mains — only real feed names"
              >
                Light vs peer staples (main)
              </h4>
              <ul className="brew-staple-list">
                {report.lightStaples.map((s) => (
                  <li
                    key={s.name}
                    title={`${Math.round(s.presence * 100)}% of peers · avg ${s.peerAvg.toFixed(1)} · you ${s.yourCount}`}
                  >
                    <strong>{s.name}</strong>
                    <span>
                      you {s.yourCount} · peer ~{s.peerAvg.toFixed(1)} ·{" "}
                      {Math.round(s.presence * 100)}% lists
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mode === "bo3" && report.lightSideStaples.length > 0 && (
            <div className="brew-staples mt-3">
              <h4 className="brew-shape-title m-0 mb-2" title="Sideboard cards common on Bo3 peer lists">
                Light vs peer sideboard
              </h4>
              <ul className="brew-staple-list">
                {report.lightSideStaples.map((s) => (
                  <li
                    key={s.name}
                    title={`${Math.round(s.presence * 100)}% of peer sideboards · avg ${s.peerAvg.toFixed(1)} · you ${s.yourCount}`}
                  >
                    <strong>{s.name}</strong>
                    <span>
                      you {s.yourCount} · peer ~{s.peerAvg.toFixed(1)} ·{" "}
                      {Math.round(s.presence * 100)}% SB
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.fieldStaples.length > 0 && (
            <details className="brew-field mt-3">
              <summary title="Full high-presence peer mainboard cards from today’s feed">
                Field staples reference ({report.fieldStaples.length})
              </summary>
              <ul className="brew-staple-list mt-2">
                {report.fieldStaples.map((s) => (
                  <li
                    key={s.name}
                    title={`${Math.round(s.presence * 100)}% presence · avg ${s.peerAvg.toFixed(1)} · you ${s.yourCount}`}
                  >
                    <strong>{s.name}</strong>
                    <span>
                      you {s.yourCount} · peer ~{s.peerAvg.toFixed(1)} ·{" "}
                      {Math.round(s.presence * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
