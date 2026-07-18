import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { scryfallCdnUrl } from "../services/scryfall";
import { openExternal } from "../services/openExternal";
import type { BannedCard, FormatHub as FormatHubData, FormatSetInfo } from "../types/sets";

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

function HubBody({ hub }: { hub: FormatHubData }) {
  const [fmt, setFmt] = useState<"standard" | "pioneer">("standard");
  const [showAllPio, setShowAllPio] = useState(false);

  const std = hub.standard;
  const pio = hub.pioneer;
  if (!std && !pio) return null;

  const nextExitKey = std?.sets.length
    ? Math.min(...std.sets.map(exitSortKey))
    : Number.MAX_SAFE_INTEGER;
  const rotatingNext = (std?.sets ?? []).filter((s) => exitSortKey(s) === nextExitKey);

  const active = fmt === "standard" ? std : pio;
  const pioVisible = showAllPio ? (pio?.sets ?? []) : (pio?.sets ?? []).slice(0, 12);

  return (
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
              {showAllPio ? "Show fewer" : `Show all ${pio?.sets.length} Pioneer sets`}
            </button>
          ) : null}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted m-0 mb-2">
              Banned in {fmt === "standard" ? "Standard" : "Pioneer"} · {active.bans.length}
            </h4>
            <BanRail bans={active.bans} />
          </div>
        </>
      ) : null}

      {hub.sources?.length ? (
        <p className="text-[11px] text-muted m-0 leading-relaxed">
          Sources: {hub.sources.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Standalone Format Hub — Standard/Pioneer legality, rotation windows, ban lists.
 * Data rides the sets feed (`formats`); older feeds hide content gracefully.
 */
export function FormatHubPage() {
  const sets = useAppStore((s) => s.sets);
  const setsLoading = useAppStore((s) => s.setsLoading);
  const setsError = useAppStore((s) => s.setsError);
  const refreshSets = useAppStore((s) => s.refreshSets);
  const markBansSeen = useAppStore((s) => s.markBansSeen);

  // Visiting Format Hub acknowledges the current ban lists (clears B&R pulse).
  useEffect(() => {
    markBansSeen();
  }, [markBansSeen]);

  const hub = sets?.formats ?? null;
  const hasHub = Boolean(hub && (hub.standard || hub.pioneer));

  const summary = useMemo(() => {
    if (!hub) return null;
    const stdSets = hub.standard?.sets.length ?? 0;
    const pioSets = hub.pioneer?.sets.length ?? 0;
    const stdBans = hub.standard?.bans.length ?? 0;
    const pioBans = hub.pioneer?.bans.length ?? 0;
    const rotCards = hub.standard?.rotation?.cardNames?.length ?? 0;
    return { stdSets, pioSets, stdBans, pioBans, rotCards };
  }, [hub]);

  if (setsLoading && !sets) {
    return (
      <div className="empty-state">
        <div className="skel skel-line w-64" style={{ margin: "0 auto" }} />
        <p className="mt-3 loading-pulse">Loading format hub…</p>
      </div>
    );
  }

  if (!sets && setsError) {
    return (
      <div className="empty-state">
        <h2 className="text-lg font-semibold m-0 mb-2">Format hub offline</h2>
        <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">{setsError}</p>
        <button type="button" className="btn btn-primary mt-4" onClick={() => void refreshSets()}>
          Retry
        </button>
      </div>
    );
  }

  if (!hasHub || !hub) {
    return (
      <div className="empty-state">
        <h2 className="text-lg font-semibold m-0 mb-2">Format hub not in this feed</h2>
        <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
          Legality, rotation, and ban lists ship with the set radar. Sync when you&apos;re online
          and they&apos;ll appear here — nothing is invented offline.
        </p>
        <button type="button" className="btn btn-primary mt-4" onClick={() => void refreshSets()}>
          Retry download
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div>
        <p className="eyebrow">Format Hub</p>
        <h2 className="text-2xl font-semibold m-0 tracking-tight">Legality &amp; bans</h2>
        <p className="text-sm text-muted mt-2 mb-0 max-w-2xl leading-relaxed">
          Real Standard and Pioneer set pools, rotation windows, and ban lists — sourced from
          Scryfall legalities and the community rotation calendar. Snapshot{" "}
          <strong className="text-foam">{sets?.date ?? "—"}</strong>
          {summary ? (
            <>
              {" "}
              · Std {summary.stdSets} sets
              {summary.rotCards > 0 ? ` · ${summary.rotCards} cards leave next` : ""} · Pio{" "}
              {summary.pioSets} sets
            </>
          ) : null}
          .
        </p>
      </div>

      <HubBody hub={hub} />
    </div>
  );
}
