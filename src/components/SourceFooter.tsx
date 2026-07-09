import type { DeckSource } from "../types/meta";

export function SourceFooter({ sources }: { sources: DeckSource[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-4 pt-3 border-t border-ink-600/40">
      <p className="text-xs text-muted m-0 mb-1.5 uppercase tracking-wide font-semibold">
        Sources
      </p>
      <div className="flex flex-wrap gap-2">
        {sources.map((s) => (
          <a
            key={s.url + s.name}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-azure-300 hover:text-gold-300 underline-offset-2 hover:underline"
          >
            {s.name}
          </a>
        ))}
      </div>
      <p className="text-[11px] text-muted mt-2 m-0 leading-relaxed">
        Community consensus snapshot — not affiliated with Wizards of the Coast.
        Always verify legality and latest bans in-client.
      </p>
    </div>
  );
}
