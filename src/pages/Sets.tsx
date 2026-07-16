import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { scryfallCdnUrl } from "../services/scryfall";
import { openExternal } from "../services/openExternal";
import type { DateConfidence, SetStatus, UpcomingSet } from "../types/sets";

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
  if (c === "scryfall") return "";
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

function SetCard({ set }: { set: UpcomingSet }) {
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

        {set.previews.length > 0 ? (
          <div className="set-preview-rail" aria-label="Recent spoilers">
            {set.previews.slice(0, 10).map((c) => (
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
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void openExternal(set.scryfallUri)}
          >
            Open on Scryfall
          </button>
          {set.overrideSource ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void openExternal(set.overrideSource!)}
            >
              Schedule source
            </button>
          ) : null}
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

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div>
        <p className="eyebrow">Sets</p>
        <h2 className="text-2xl font-semibold m-0 tracking-tight">Set radar</h2>
        <p className="text-sm text-muted mt-2 mb-0 max-w-2xl leading-relaxed">
          Arena-first release radar for upcoming expansions — spoilers, drop dates, and
          countdowns. <strong className="text-foam">No Alchemy.</strong> Snapshot{" "}
          {sets.date}.
        </p>
      </div>

      {upcoming.length > 0 ? (
        <section>
          <h3 className="set-section-title">Coming to Arena</h3>
          <div className="set-grid">
            {upcoming.map((s) => (
              <SetCard key={s.code} set={s} />
            ))}
          </div>
        </section>
      ) : null}

      {live.length > 0 ? (
        <section>
          <h3 className="set-section-title">Recently live</h3>
          <div className="set-grid">
            {live.map((s) => (
              <SetCard key={s.code} set={s} />
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-[11px] text-muted m-0 leading-relaxed max-w-2xl">
        Paper dates from Scryfall. Arena dates are official when we have a published source;
        otherwise labeled estimated (typically a few days before paper). Always confirm in-client.
      </p>
    </div>
  );
}
