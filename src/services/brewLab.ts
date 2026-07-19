/**
 * Brew Lab — pure, non-LLM list clinic.
 *
 * Compares *your* main (and side) to live ranked meta peers for a format+mode.
 * Never invents cards: staples and copy targets only come from peer lists already
 * in the meta feed. No oracle text, no external AI, no BYOK.
 */

import type { CardEntry, Deck, FormatId, MetaBundle, PlayMode } from "../types/meta";
import { decksForMode } from "./deckHelpers";
import { resolveMetaDeck } from "./deepLinks";
import { isLandName } from "./landNames";

export type ClinicSeverity = "info" | "nudge" | "gap";

export interface CountedName {
  name: string;
  count: number;
  cmc?: number;
  land?: boolean;
  /** Pipeline / Scryfall type bucket when known. */
  type?: CardEntry["type"];
  typeLine?: string;
}

export interface ListShape {
  total: number;
  lands: number;
  creatures: number;
  /** Instants + sorceries — proxy for interaction / draw / counters without oracle. */
  instantSorcery: number;
  otherNonlands: number;
  nonlands: number;
  avgCmc: number | null;
  /** Non-land counts for MV 0..5 and 6+. */
  curve: [number, number, number, number, number, number, number];
}

export interface PeerStaple {
  name: string;
  /** Mean copies among peers (including zeros). */
  peerAvg: number;
  /** Fraction of peers that play ≥1 copy. */
  presence: number;
  yourCount: number;
  /** yourCount − peerAvg (negative = you're light). */
  delta: number;
}

export interface ClinicFinding {
  id: string;
  severity: ClinicSeverity;
  title: string;
  detail: string;
}

export interface BrewClinicInput {
  deckName: string;
  main: CountedName[];
  side?: CountedName[];
  meta: MetaBundle | null | undefined;
  mode: PlayMode;
  /** Prefer this format when resolving peers; else fuzzy across formats. */
  formatId?: FormatId;
}

export interface BrewClinicReport {
  mode: PlayMode;
  formatId: FormatId | null;
  peerCount: number;
  peerNames: string[];
  matchedPeerName: string | null;
  matchedPeerId: string | null;
  yourMain: ListShape;
  peerMainAvg: ListShape;
  yourSide: ListShape | null;
  peerSideAvg: ListShape | null;
  findings: ClinicFinding[];
  /** You're under peer average on high-presence staples. */
  lightStaples: PeerStaple[];
  /** High-presence peer cards for reference (not necessarily light). */
  fieldStaples: PeerStaple[];
  /** Sideboard staples you're light on (Bo3). */
  lightSideStaples: PeerStaple[];
  emptyReason?: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function isLandCard(c: CountedName): boolean {
  if (c.land === true) return true;
  if (c.land === false) return false;
  if (c.type === "creature") return false;
  if (c.typeLine) return /\bLand\b/i.test(c.typeLine.split("//")[0] ?? "");
  return isLandName(c.name);
}

function isCreatureCard(c: CountedName): boolean {
  if (isLandCard(c)) return false;
  if (c.type === "creature") return true;
  if (c.typeLine) return /\bCreature\b/i.test(c.typeLine.split("//")[0] ?? "");
  return false;
}

function isInstantOrSorcery(c: CountedName): boolean {
  if (isLandCard(c)) return false;
  if (c.type === "instant" || c.type === "sorcery") return true;
  if (c.typeLine) {
    const face = c.typeLine.split("//")[0] ?? "";
    return /\bInstant\b/i.test(face) || /\bSorcery\b/i.test(face);
  }
  return false;
}

function cmcBucket(cmc: number | undefined): number {
  if (cmc == null || !Number.isFinite(cmc)) return 2; // unknown → mid bias
  const n = Math.max(0, Math.floor(cmc));
  return n >= 6 ? 6 : n;
}

/** Quantify a 60/15 board into shape stats. */
export function shapeOf(cards: CountedName[]): ListShape {
  let lands = 0;
  let creatures = 0;
  let instantSorcery = 0;
  let otherNonlands = 0;
  let cmcSum = 0;
  let cmcN = 0;
  const curve: ListShape["curve"] = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;

  for (const c of cards) {
    const n = Math.max(0, c.count | 0);
    if (n === 0) continue;
    total += n;
    if (isLandCard(c)) {
      lands += n;
      continue;
    }
    const bucket = cmcBucket(c.cmc);
    curve[bucket] += n;
    if (c.cmc != null && Number.isFinite(c.cmc)) {
      cmcSum += c.cmc * n;
      cmcN += n;
    }
    if (isCreatureCard(c)) creatures += n;
    else if (isInstantOrSorcery(c)) instantSorcery += n;
    else otherNonlands += n;
  }

  return {
    total,
    lands,
    creatures,
    instantSorcery,
    otherNonlands,
    nonlands: total - lands,
    avgCmc: cmcN > 0 ? cmcSum / cmcN : null,
    curve,
  };
}

export function averageShapes(shapes: ListShape[]): ListShape {
  if (shapes.length === 0) {
    return {
      total: 0,
      lands: 0,
      creatures: 0,
      instantSorcery: 0,
      otherNonlands: 0,
      nonlands: 0,
      avgCmc: null,
      curve: [0, 0, 0, 0, 0, 0, 0],
    };
  }
  const n = shapes.length;
  const curve: ListShape["curve"] = [0, 0, 0, 0, 0, 0, 0];
  let lands = 0;
  let creatures = 0;
  let instantSorcery = 0;
  let otherNonlands = 0;
  let total = 0;
  let nonlands = 0;
  let cmcSum = 0;
  let cmcN = 0;
  for (const s of shapes) {
    lands += s.lands;
    creatures += s.creatures;
    instantSorcery += s.instantSorcery;
    otherNonlands += s.otherNonlands;
    total += s.total;
    nonlands += s.nonlands;
    for (let i = 0; i < 7; i++) curve[i] += s.curve[i];
    if (s.avgCmc != null) {
      cmcSum += s.avgCmc;
      cmcN++;
    }
  }
  for (let i = 0; i < 7; i++) curve[i] = curve[i] / n;
  return {
    total: total / n,
    lands: lands / n,
    creatures: creatures / n,
    instantSorcery: instantSorcery / n,
    otherNonlands: otherNonlands / n,
    nonlands: nonlands / n,
    avgCmc: cmcN > 0 ? cmcSum / cmcN : null,
    curve,
  };
}

/** CardEntry[] (meta pipeline) → counted names. */
export function fromCardEntries(entries: CardEntry[]): CountedName[] {
  return entries.map((c) => ({
    name: c.name,
    count: c.count,
    cmc: c.cmc,
    land: c.land,
    type: c.type,
  }));
}

/** Arena id multiset + resolved meta → counted names. Unknown ids dropped. */
export function fromArenaIds(
  ids: number[],
  cards: Record<number, { name?: string; typeLine?: string; cmc?: number } | null | undefined>,
): CountedName[] {
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const out: CountedName[] = [];
  for (const [id, count] of counts) {
    const info = cards[id];
    if (!info?.name) continue;
    const typeLine = info.typeLine;
    const face = typeLine?.split("//")[0] ?? "";
    let type: CardEntry["type"] | undefined;
    if (/\bCreature\b/i.test(face)) type = "creature";
    else if (/\bInstant\b/i.test(face)) type = "instant";
    else if (/\bSorcery\b/i.test(face)) type = "sorcery";
    else if (/\bEnchantment\b/i.test(face)) type = "enchantment";
    else if (/\bArtifact\b/i.test(face)) type = "artifact";
    else if (/\bPlaneswalker\b/i.test(face)) type = "planeswalker";
    else if (/\bBattle\b/i.test(face)) type = "battle";
    else if (/\bLand\b/i.test(face)) type = undefined;
    out.push({
      name: info.name,
      count,
      cmc: info.cmc,
      land: /\bLand\b/i.test(face) || isLandName(info.name),
      type,
      typeLine,
    });
  }
  return out;
}

function countMap(cards: CountedName[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) {
    const k = norm(c.name);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + c.count);
  }
  return m;
}

/** Display name for a norm key from first peer that has it. */
function displayNameFor(
  key: string,
  peers: CountedName[][],
): string {
  for (const list of peers) {
    for (const c of list) {
      if (norm(c.name) === key) return c.name;
    }
  }
  return key;
}

/**
 * Staples across peer lists: mean copies + presence.
 * yourMap optional — when omitted, yourCount is 0.
 */
export function peerStaples(
  peerLists: CountedName[][],
  yourList: CountedName[],
  opts?: { minPresence?: number; minPeerAvg?: number },
): PeerStaple[] {
  const minPresence = opts?.minPresence ?? 0.35;
  const minPeerAvg = opts?.minPeerAvg ?? 1.25;
  const n = peerLists.length;
  if (n === 0) return [];
  const yours = countMap(yourList);
  const totals = new Map<string, number>();
  const present = new Map<string, number>();
  for (const list of peerLists) {
    const seen = new Set<string>();
    for (const c of list) {
      const k = norm(c.name);
      if (!k) continue;
      totals.set(k, (totals.get(k) ?? 0) + c.count);
      if (!seen.has(k)) {
        seen.add(k);
        present.set(k, (present.get(k) ?? 0) + 1);
      }
    }
  }
  const out: PeerStaple[] = [];
  for (const [k, sum] of totals) {
    const presence = (present.get(k) ?? 0) / n;
    const peerAvg = sum / n;
    if (presence < minPresence || peerAvg < minPeerAvg) continue;
    const yourCount = yours.get(k) ?? 0;
    out.push({
      name: displayNameFor(k, peerLists),
      peerAvg,
      presence,
      yourCount,
      delta: yourCount - peerAvg,
    });
  }
  return out.sort(
    (a, b) => b.presence - a.presence || b.peerAvg - a.peerAvg || a.name.localeCompare(b.name),
  );
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(n % 1 ? 1 : 0);
}

/** Build clinic findings from shape deltas + staple gaps. */
export function buildFindings(
  yours: ListShape,
  peer: ListShape,
  light: PeerStaple[],
  opts?: { board?: "main" | "side" },
): ClinicFinding[] {
  const board = opts?.board ?? "main";
  const label = board === "main" ? "main" : "sideboard";
  const findings: ClinicFinding[] = [];

  if (board === "main" && yours.total > 0 && (yours.total < 58 || yours.total > 60)) {
    findings.push({
      id: "main-size",
      severity: yours.total < 55 || yours.total > 62 ? "gap" : "nudge",
      title: `Main is ${yours.total} cards`,
      detail:
        yours.total < 60
          ? "Standard/Pioneer constructed mains are usually 60. Short lists often mean missing interaction or lands."
          : "Over 60 dilutes draws — cut flex slots unless you have a hard reason.",
    });
  }

  const landDelta = yours.lands - peer.lands;
  if (Math.abs(landDelta) >= 2.5) {
    findings.push({
      id: `${board}-lands`,
      severity: Math.abs(landDelta) >= 4 ? "gap" : "nudge",
      title:
        landDelta < 0
          ? `Light on lands (~${round1(yours.lands)} vs peer ~${round1(peer.lands)})`
          : `Heavy on lands (~${round1(yours.lands)} vs peer ~${round1(peer.lands)})`,
      detail:
        landDelta < 0
          ? `Ranked ${label}s in this mode average more lands. Flood/screw swings often fix here first.`
          : `Peers run fewer lands. Extra taps can stall your curve if the package is already greedy.`,
    });
  }

  const crDelta = yours.creatures - peer.creatures;
  if (crDelta <= -4) {
    findings.push({
      id: `${board}-creatures`,
      severity: crDelta <= -7 ? "gap" : "nudge",
      title: `Creature density low (~${round1(yours.creatures)} vs ~${round1(peer.creatures)})`,
      detail:
        "Versus peer mains in this mode, you’re short on bodies. Midrange/aggro shells usually need more pressure slots.",
    });
  } else if (crDelta >= 5) {
    findings.push({
      id: `${board}-creatures-high`,
      severity: "info",
      title: `Creature-heavy vs peers (~${round1(yours.creatures)} vs ~${round1(peer.creatures)})`,
      detail:
        "Fine if the plan is go-wide or stompy — just confirm you still have enough clean-up spells for the field.",
    });
  }

  const isDelta = yours.instantSorcery - peer.instantSorcery;
  if (isDelta <= -3) {
    findings.push({
      id: `${board}-is`,
      severity: isDelta <= -5 ? "gap" : "nudge",
      title: `Few instants/sorceries (~${round1(yours.instantSorcery)} vs ~${round1(peer.instantSorcery)})`,
      detail:
        "Peers pack more noncreature spells (removal, draw, counters, pumps). Interaction density is the usual “field demands X” fix.",
    });
  }

  // Early curve pressure: MV 1–2 nonlands
  const yourEarly = yours.curve[1] + yours.curve[2];
  const peerEarly = peer.curve[1] + peer.curve[2];
  if (peerEarly - yourEarly >= 4 && board === "main") {
    findings.push({
      id: "curve-early",
      severity: "nudge",
      title: `Top-heavy curve (1–2 drops ~${round1(yourEarly)} vs peer ~${round1(peerEarly)})`,
      detail:
        "Peers deploy more early nonlands. If you’re dying before your plan, buy cheap interaction or threats before adding 5-drops.",
    });
  }

  const yourLate = yours.curve[5] + yours.curve[6];
  const peerLate = peer.curve[5] + peer.curve[6];
  if (yourLate - peerLate >= 3 && board === "main") {
    findings.push({
      id: "curve-late",
      severity: "info",
      title: `More expensive spells than peers (~${round1(yourLate)} MV5+ vs ~${round1(peerLate)})`,
      detail: "High curve is fine for control/ramp — deadly if your land count or early interaction is already light.",
    });
  }

  if (yours.avgCmc != null && peer.avgCmc != null && yours.avgCmc - peer.avgCmc >= 0.45) {
    findings.push({
      id: `${board}-mv`,
      severity: "nudge",
      title: `Higher average MV (${yours.avgCmc.toFixed(2)} vs peer ${peer.avgCmc.toFixed(2)})`,
      detail: "You cast more expensive spells on average than ranked peers in this mode.",
    });
  }

  // Staple copy counts — only real peer cards
  for (const s of light.slice(0, 6)) {
    const need = Math.max(1, Math.round(s.peerAvg));
    findings.push({
      id: `staple-${norm(s.name)}`,
      severity: s.yourCount === 0 && s.presence >= 0.5 ? "gap" : "nudge",
      title:
        s.yourCount === 0
          ? `Missing peer staple: ${s.name}`
          : `Light on ${s.name} (${s.yourCount} vs ~${round1(s.peerAvg)})`,
      detail: `${Math.round(s.presence * 100)}% of ranked peers play it (avg ${round1(s.peerAvg)}). Field shape suggests ~${need} cop${need === 1 ? "y" : "ies"} — never invented; only cards already on today’s board.`,
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: "aligned",
      severity: "info",
      title: "Shape tracks the peer field",
      detail:
        "Lands, threats, and spell density are close to ranked lists in this mode. Next edge is matchup tagging and your own WR, not big package rewrites.",
    });
  }

  return findings;
}

function peerDecksFor(
  meta: MetaBundle,
  mode: PlayMode,
  formatId: FormatId | null,
): Deck[] {
  const formats = formatId
    ? meta.formats.filter((f) => f.id === formatId)
    : meta.formats;
  const out: Deck[] = [];
  for (const fmt of formats) {
    for (const d of decksForMode(fmt, mode, meta.decks)) {
      if (d.mainboard?.length) out.push(d);
    }
  }
  return out;
}

/**
 * Run Brew Lab clinic. Pure — feed must already be loaded; no network.
 */
export function runBrewClinic(input: BrewClinicInput): BrewClinicReport {
  const { deckName, main, side, meta, mode } = input;
  if (!meta) {
    return emptyReport(mode, "Meta feed not loaded yet — open Decks once so today’s board is available.");
  }
  if (!main.length) {
    return emptyReport(
      mode,
      "No stored Arena mainboard on this deck yet. Play a match with the list so FND can read game-1 submission.",
    );
  }

  const hit = resolveMetaDeck(meta, deckName, {
    formatId: input.formatId,
    mode,
  });
  const formatId = input.formatId ?? hit?.formatId ?? null;
  const peers = peerDecksFor(meta, mode, formatId);
  if (peers.length === 0) {
    return emptyReport(
      mode,
      "No ranked peer lists for this format/mode in today’s feed.",
      formatId,
    );
  }

  const peerMains = peers.map((d) => fromCardEntries(d.mainboard));
  const peerSides = peers
    .map((d) => fromCardEntries(d.sideboard ?? []))
    .filter((s) => s.length > 0);

  const yourMain = shapeOf(main);
  const peerMainAvg = averageShapes(peerMains.map(shapeOf));
  const yourSide = side && side.length ? shapeOf(side) : null;
  const peerSideAvg =
    peerSides.length > 0 ? averageShapes(peerSides.map(shapeOf)) : null;

  const allStaples = peerStaples(peerMains, main, {
    minPresence: 0.35,
    minPeerAvg: 1.2,
  });
  const lightStaples = allStaples
    .filter((s) => s.delta <= -0.75)
    .sort((a, b) => a.delta - b.delta || b.presence - a.presence)
    .slice(0, 8);
  const fieldStaples = allStaples.slice(0, 12);

  const findings = buildFindings(yourMain, peerMainAvg, lightStaples, {
    board: "main",
  });

  let lightSideStaples: PeerStaple[] = [];
  if (mode === "bo3" && yourSide && peerSideAvg && peerSides.length > 0) {
    const sideAll = peerStaples(peerSides, side ?? [], {
      minPresence: 0.3,
      minPeerAvg: 0.8,
    });
    lightSideStaples = sideAll
      .filter((s) => s.delta <= -0.6)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 6);
    findings.push(
      ...buildFindings(yourSide, peerSideAvg, lightSideStaples, { board: "side" }).filter(
        (f) => f.id !== "aligned",
      ),
    );
  }

  return {
    mode,
    formatId,
    peerCount: peers.length,
    peerNames: peers.map((d) => d.name),
    matchedPeerName: hit?.deck.name ?? null,
    matchedPeerId: hit?.deckId ?? null,
    yourMain,
    peerMainAvg,
    yourSide,
    peerSideAvg,
    findings,
    lightStaples,
    fieldStaples,
    lightSideStaples,
  };
}

function emptyReport(
  mode: PlayMode,
  emptyReason: string,
  formatId: FormatId | null = null,
): BrewClinicReport {
  const z = shapeOf([]);
  return {
    mode,
    formatId,
    peerCount: 0,
    peerNames: [],
    matchedPeerName: null,
    matchedPeerId: null,
    yourMain: z,
    peerMainAvg: z,
    yourSide: null,
    peerSideAvg: null,
    findings: [],
    lightStaples: [],
    fieldStaples: [],
    lightSideStaples: [],
    emptyReason,
  };
}
