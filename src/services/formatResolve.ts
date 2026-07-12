import type { FormatId, FormatMeta, MetaBundle } from "../types/meta";

const ALIASES: Record<string, FormatId> = {
  standard: "standard",
  std: "standard",
  pioneer: "pioneer",
  explorer: "pioneer",
};

export function resolveFormatId(raw: string | undefined | null): FormatId | null {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (ALIASES[key]) return ALIASES[key];
  // try without underscores
  const spaced = String(raw).trim().toLowerCase();
  if (ALIASES[spaced]) return ALIASES[spaced];
  return null;
}

export function findFormat(
  meta: MetaBundle,
  raw: string | FormatId | null | undefined,
): FormatMeta | undefined {
  const id = resolveFormatId(raw ?? null);
  if (!id) return undefined;
  return meta.formats.find((f) => f.id === id);
}
