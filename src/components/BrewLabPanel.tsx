import { useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import type { FormatId, PlayMode } from "../types/meta";
import {
  clinicGrade,
  clinicReportText,
  runBrewClinic,
  type BrewClinicReport,
  type ClinicFinding,
  type CountedName,
  type ListShape,
} from "../services/brewLab";
import { copyToClipboard } from "../services/arenaImport";
import { IconCopy } from "./NavIcons";

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

/** v2.0 — letter-grade scorecard from the same peer-field arithmetic. */
function GradeCard({ report, deckName }: { report: BrewClinicReport; deckName: string }) {
  const grade = useMemo(() => clinicGrade(report), [report]);
  const [copied, setCopied] = useState(false);
  if (!grade) return null;
  const tone =
    grade.score >= 80 ? "is-good" : grade.score >= 64 ? "is-mid" : "is-low";
  return (
    <div className={`brew-grade ${tone}`}>
      <div
        className="brew-grade-badge"
        title={`Clinic grade: weighted alignment with today's ranked peer field (${grade.score}/100)`}
      >
        <strong>{grade.letter}</strong>
        <span>{grade.score}/100</span>
      </div>
      <div className="brew-grade-axes">
        <p className="brew-grade-verdict">{grade.verdict}</p>
        {grade.axes.map((a) => (
          <div key={a.id} className="brew-grade-axis" title={`${a.label}: ${a.detail}`}>
            <span className="brew-grade-axis-label">{a.label}</span>
            <span className="mu-track brew-grade-track">
              <span
                className={`mu-fill favor-${a.score >= 80 ? "favored" : a.score >= 55 ? "even" : "unfavored"}`}
                style={{ width: `${Math.max(4, a.score)}%`, display: "block" }}
              />
            </span>
            <span className="brew-grade-axis-num">{a.score}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm brew-grade-copy"
        title="Copy the whole clinic as plain text — paste into Discord or notes"
        onClick={() => {
          void copyToClipboard(clinicReportText(deckName, report, grade)).then((ok) => {
            setCopied(ok);
            setTimeout(() => setCopied(false), 2400);
          });
        }}
      >
        <IconCopy className="w-4 h-4" /> {copied ? "Copied!" : "Copy report"}
      </button>
    </div>
  );
}

type Props = {
  deckName: string;
  main: CountedName[];
  side?: CountedName[];
  /** True while card names are still resolving (paste mode / cold cache). */
  resolving?: boolean;
};

/**
 * Brew Lab clinic — meta-grounded list review with a letter-grade scorecard.
 * Pure: shape + staples come only from ranked lists already in today's feed.
 */
export function BrewClinic({ deckName, main, side, resolving }: Props) {
  const meta = useAppStore((s) => s.meta);
  const appMode = useAppStore((s) => s.mode);
  const [mode, setMode] = useState<PlayMode>(appMode);
  const [formatId, setFormatId] = useState<FormatId | "auto">("auto");

  const report: BrewClinicReport = useMemo(
    () =>
      runBrewClinic({
        deckName,
        main,
        side: side && side.length ? side : undefined,
        meta,
        mode,
        formatId: formatId === "auto" ? undefined : formatId,
      }),
    [deckName, main, side, meta, mode, formatId],
  );

  return (
    <div className="panel brew-lab">
      <div className="brew-lab-head">
        <div>
          <h3 className="dash-title m-0" title="Compare your list shape to today’s ranked meta peers">
            Clinic · {deckName}
          </h3>
          <p className="text-xs text-muted m-0 mt-1 leading-relaxed max-w-xl">
            Pure list clinic — no AI, no invented cards. Shape and staples come only from ranked
            Standard/Pioneer lists already in today’s feed.
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

      {resolving && (
        <p className="text-xs text-muted m-0 mt-2 loading-pulse" title="Resolving card names from local/Scryfall cache">
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

          <GradeCard report={report} deckName={deckName} />

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
