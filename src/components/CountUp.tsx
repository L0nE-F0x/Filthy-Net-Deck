import { useEffect, useRef, useState } from "react";

type Props = {
  /** Target value to display. */
  value: number;
  /** Decimal places (default 0). */
  decimals?: number;
  /** Suffix after the number, e.g. "%". */
  suffix?: string;
  /** Prefix, e.g. empty. */
  prefix?: string;
  /** Duration ms (default 480). */
  durationMs?: number;
  className?: string;
};

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Soft ease-out count-up for stat tiles. Skips animation when reduced-motion
 * is on, or when the jump is zero.
 */
export function CountUp({
  value,
  decimals = 0,
  suffix = "",
  prefix = "",
  durationMs = 480,
  className,
}: Props) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value || prefersReducedMotion() || durationMs <= 0) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const delta = value - from;
    cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic
      const e = 1 - (1 - t) ** 3;
      setDisplay(from + delta * e);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
        setDisplay(value);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, durationMs]);

  const text =
    decimals > 0
      ? `${prefix}${display.toFixed(decimals)}${suffix}`
      : `${prefix}${Math.round(display)}${suffix}`;

  return (
    <span className={className} data-count-up>
      {text}
    </span>
  );
}
