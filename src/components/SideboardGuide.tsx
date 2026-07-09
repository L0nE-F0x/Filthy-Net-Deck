import type { SideboardLine } from "../types/meta";

export function SideboardGuide({ guide }: { guide: SideboardLine[] }) {
  if (!guide.length) {
    return (
      <p className="text-sm text-muted">
        Sideboard guide available in Bo3 mode when data is present.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {guide.map((g) => (
        <div
          key={g.vs}
          className="rounded-xl border border-ink-600/50 bg-ink-900/40 px-3 py-2.5"
        >
          <div className="font-semibold text-sm mb-1.5">vs {g.vs}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm mb-1.5">
            <div>
              <div className="text-xs uppercase tracking-wide text-good mb-0.5">In</div>
              <ul className="m-0 pl-4 text-muted">
                {g.in.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-poor mb-0.5">Out</div>
              <ul className="m-0 pl-4 text-muted">
                {g.out.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-sm text-muted m-0 leading-relaxed">{g.notes}</p>
        </div>
      ))}
    </div>
  );
}
