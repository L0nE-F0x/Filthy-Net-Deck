/** Pure helpers for the top-most alert card — see ToastApp.tsx. */

/**
 * Split a toast body on the "·" separators the tracker builds bodies with
 * ("Win vs Rival · 62% this season · Diamond 1"). Prose alerts have none, and
 * come back as a lead with no rest.
 */
export function bodyParts(body: string): { lead: string; rest: string[] } {
  const parts = body
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
  return { lead: parts[0] ?? body, rest: parts.slice(1) };
}

export type ToastTone = "win" | "loss" | "draw" | "neutral";

/** Result colour for the accent bar, read off the match-end lead. */
export function toneOf(body: string): ToastTone {
  const lead = bodyParts(body).lead.toLowerCase();
  if (lead.startsWith("win")) return "win";
  if (lead.startsWith("loss")) return "loss";
  if (lead.startsWith("draw")) return "draw";
  return "neutral";
}
