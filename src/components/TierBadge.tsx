export function TierBadge({ tier }: { tier: 1 | 2 | 3 }) {
  return <span className={`tier-badge tier-${tier}`}>Tier {tier}</span>;
}
