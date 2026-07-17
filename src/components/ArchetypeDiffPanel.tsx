import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { fetchDatedMeta } from "../services/metaFeed";
import {
  diffCardLists,
  findDeckList,
  type ListDiff,
} from "../services/archetypeDiff";
import type { Deck } from "../types/meta";

/** "What changed in this archetype today" — list vs previous meta day. */
export function ArchetypeDiffPanel({ deck }: { deck: Deck }) {
  const meta = useAppStore((s) => s.meta);
  const previousDate = useAppStore((s) => s.metaDiff.previousDate);
  const [diff, setDiff] = useState<ListDiff | null>(null);
  const [prevDate, setPrevDate] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "none" | "ready">("idle");

  useEffect(() => {
    let alive = true;
    setDiff(null);
    setStatus("loading");

    async function run() {
      if (!meta) {
        if (alive) setStatus("none");
        return;
      }
      // Prefer the snapshot date from today's board movement; else try yesterday.
      let date = previousDate;
      if (!date) {
        const d = new Date(`${meta.date}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        date = d.toISOString().slice(0, 10);
      }
      const prev = await fetchDatedMeta(date);
      if (!alive) return;
      if (!prev) {
        setStatus("none");
        return;
      }
      const oldList = findDeckList(prev.decks, deck.format, deck.mode, deck.name);
      if (!oldList) {
        setStatus("none");
        return;
      }
      const d = diffCardLists(oldList, deck.mainboard);
      setPrevDate(prev.date);
      setDiff(d);
      setStatus("ready");
    }

    void run();
    return () => {
      alive = false;
    };
  }, [meta, previousDate, deck.id, deck.format, deck.mode, deck.name, deck.mainboard]);

  if (status === "loading" || status === "idle") {
    return (
      <section className="panel">
        <p className="eyebrow m-0 mb-1">Daily archetype diff</p>
        <p className="text-xs text-muted m-0">Comparing to the previous meta day…</p>
      </section>
    );
  }

  if (status === "none" || !diff) {
    return (
      <section className="panel">
        <p className="eyebrow m-0 mb-1">Daily archetype diff</p>
        <p className="text-xs text-muted m-0 leading-relaxed">
          No previous-day list for this archetype yet — check back after tomorrow&apos;s meta
          refresh.
        </p>
      </section>
    );
  }

  if (diff.identical) {
    return (
      <section className="panel">
        <p className="eyebrow m-0 mb-1">Daily archetype diff</p>
        <p className="text-sm m-0">
          Mainboard unchanged vs {prevDate} — same 60 as yesterday&apos;s published list.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <p className="eyebrow m-0 mb-1">Daily archetype diff</p>
      <p className="text-xs text-muted m-0 mb-2">
        What changed in <strong className="text-foam">{deck.name}</strong> vs {prevDate}
      </p>
      <div className="flex flex-col gap-1 text-sm">
        {diff.added.map((c) => (
          <div key={`+${c.name}`} className="flex gap-2">
            <span className="text-good font-semibold w-10">+{c.to}</span>
            <span>{c.name}</span>
          </div>
        ))}
        {diff.removed.map((c) => (
          <div key={`-${c.name}`} className="flex gap-2">
            <span className="text-poor font-semibold w-10">−{c.from}</span>
            <span className="line-through opacity-80">{c.name}</span>
          </div>
        ))}
        {diff.changed.map((c) => (
          <div key={`~${c.name}`} className="flex gap-2">
            <span className="text-fair font-semibold w-10">
              {c.from}→{c.to}
            </span>
            <span>{c.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
