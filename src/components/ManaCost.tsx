/** "{2}{U}{U}" → colored mana pips (numbers and odd symbols in neutral pips). */
export function ManaCost({ cost }: { cost: string | undefined }) {
  if (!cost) return null;
  const symbols = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  if (symbols.length === 0) return null;
  return (
    <span className="mana-cost" aria-label={`Mana cost ${cost}`}>
      {symbols.map((s, i) => {
        const single = /^[WUBRG]$/.test(s) ? s.toLowerCase() : null;
        return (
          <span key={i} className={`mana-pip ${single ? `pip-${single}` : "pip-generic"}`}>
            {single ? "" : s}
          </span>
        );
      })}
    </span>
  );
}
