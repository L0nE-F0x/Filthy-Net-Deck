import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useAppStore } from "../store/useAppStore";
import {
  buildCardIndex,
  searchCards,
  searchDecks,
  type CardOccurrence,
  type DeckSearchResult,
} from "../services/cardWatch";
import type { Page, PlayMode } from "../types/meta";

const PALETTE_PAGES: { id: Page; label: string }[] = [
  { id: "daily", label: "Decks" },
  { id: "stats", label: "My Stats" },
  { id: "climb", label: "Climb" },
  { id: "matchups", label: "Matchups" },
  { id: "sets", label: "Sets" },
  { id: "meta", label: "Events" },
  { id: "formats", label: "Format Hub" },
  { id: "settings", label: "Settings" },
];

/** Occurrences shown under one card before collapsing into "… N more". */
const MAX_OCCURRENCES_PER_CARD = 6;
const MAX_CARDS = 5;
const MAX_DECKS = 5;

type PaletteRow =
  | { kind: "occurrence"; occurrence: CardOccurrence }
  | { kind: "deck"; deck: DeckSearchResult }
  | { kind: "page"; id: Page; label: string };

function modeLabel(mode: PlayMode): string {
  return mode === "bo1" ? "Bo1" : "Bo3";
}

function occurrenceLine(o: CardOccurrence): string {
  const rank = o.rank != null ? `#${o.rank} ` : "";
  return `${o.formatName} · ${modeLabel(o.mode)} · ${rank}${o.deckName} · ${o.board} · ${o.count}×`;
}

function deckLine(d: DeckSearchResult): string {
  const rank = d.rank != null ? ` · #${d.rank}` : "";
  return `${d.formatName} · ${modeLabel(d.mode)}${rank}`;
}

/**
 * Ctrl+K / Cmd+K card watch palette. Self-manages open state — render it once
 * at app-shell level; it renders nothing while closed.
 */
export function CommandPalette(): ReactNode {
  const meta = useAppStore((s) => s.meta);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global toggle: Ctrl+K / Cmd+K (also works while typing in other inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // While open: autofocus, Escape closes, focus returns to the previous element.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open]);

  const index = useMemo(() => (meta ? buildCardIndex(meta) : null), [meta]);
  const cards = useMemo(
    () => (index ? searchCards(index, query, MAX_CARDS) : []),
    [index, query],
  );
  const decks = useMemo(
    () => (meta ? searchDecks(meta, query, MAX_DECKS) : []),
    [meta, query],
  );
  const q = query.trim().toLowerCase();
  const pages = useMemo(
    () => (q ? PALETTE_PAGES.filter((p) => p.label.toLowerCase().includes(q)) : []),
    [q],
  );

  // Keyboard-navigable rows in display order (occurrences → decks → pages).
  const rows = useMemo(() => {
    const out: PaletteRow[] = [];
    for (const card of cards) {
      for (const occurrence of card.occurrences.slice(0, MAX_OCCURRENCES_PER_CARD)) {
        out.push({ kind: "occurrence", occurrence });
      }
    }
    for (const deck of decks) out.push({ kind: "deck", deck });
    for (const p of pages) out.push({ kind: "page", id: p.id, label: p.label });
    return out;
  }, [cards, decks, pages]);

  const activeRow = Math.min(active, Math.max(rows.length - 1, 0));

  const close = () => setOpen(false);

  const activate = (row: PaletteRow) => {
    if (row.kind === "page") {
      useAppStore.getState().setPage(row.id);
    } else if (row.kind === "deck") {
      useAppStore.getState().openDeck(row.deck.deckId);
    } else {
      useAppStore.getState().openDeck(row.occurrence.deckId);
    }
    close();
  };

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(rows.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[activeRow];
      if (row) activate(row);
    }
  };

  if (!open) return null;

  // Sections render in the same order as `rows`; rowIndex tracks the flat
  // position of each row for highlight + activation.
  let rowIndex = -1;
  const nextRow = (): { i: number; active: boolean } => {
    rowIndex += 1;
    return { i: rowIndex, active: rowIndex === activeRow };
  };

  return (
    <div
      className="cp-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={close}
    >
      <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          className="cp-input"
          aria-label="Search cards, decks, and pages"
          placeholder="Search cards, decks, pages…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onInputKeyDown}
        />
        <div className="cp-results" role="listbox" aria-label="Command palette results">
          {!q ? (
            <p className="cp-hint m-0">Search cards, decks, pages…</p>
          ) : rows.length === 0 ? (
            <p className="cp-hint m-0">No matches for “{query.trim()}”.</p>
          ) : (
            <>
              {cards.length > 0 && <div className="cp-section">Cards</div>}
              {cards.map((card) => (
                <div key={card.name}>
                  <div className="cp-card-name">{card.name}</div>
                  {card.occurrences
                    .slice(0, MAX_OCCURRENCES_PER_CARD)
                    .map((o) => {
                      const { i, active: isActive } = nextRow();
                      return (
                        <button
                          key={`${o.formatId}-${o.mode}-${o.deckId}-${o.board}`}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`cp-row${isActive ? " cp-row-active" : ""}`}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => activate(rows[i])}
                        >
                          <span className="cp-row-sub">{occurrenceLine(o)}</span>
                        </button>
                      );
                    })}
                  {card.occurrences.length > MAX_OCCURRENCES_PER_CARD && (
                    <div className="cp-more">
                      … {card.occurrences.length - MAX_OCCURRENCES_PER_CARD} more
                    </div>
                  )}
                </div>
              ))}
              {decks.length > 0 && <div className="cp-section">Decks</div>}
              {decks.map((d) => {
                const { i, active: isActive } = nextRow();
                return (
                  <button
                    key={`${d.formatId}-${d.mode}-${d.deckId}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`cp-row${isActive ? " cp-row-active" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => activate(rows[i])}
                  >
                    <span className="cp-row-title">{d.deckName}</span>
                    <span className="cp-row-sub">{deckLine(d)}</span>
                  </button>
                );
              })}
              {pages.length > 0 && <div className="cp-section">Pages</div>}
              {pages.map((p) => {
                const { i, active: isActive } = nextRow();
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`cp-row${isActive ? " cp-row-active" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => activate(rows[i])}
                  >
                    <span className="cp-row-title">{p.label}</span>
                    <span className="cp-row-sub">Go to page</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
        <div className="cp-footer">↑↓ navigate · Enter open · Esc close</div>
      </div>
    </div>
  );
}
