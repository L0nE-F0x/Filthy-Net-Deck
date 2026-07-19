/**
 * Opt-in match soundscape (main app only — never the overlay).
 *
 * Web Audio synthesized packs — zero sample assets. OFF by default.
 * Each pack has distinct Victory / Defeat / Draw / Rank-up / Soft click cues.
 */

export type SoundCueSet = "soft" | "crystal" | "tabletop";

export type SfxEvent = "win" | "loss" | "draw" | "rankup" | "ui";

export const SFX_EVENTS: {
  id: SfxEvent;
  label: string;
  blurb: string;
}[] = [
  { id: "win", label: "Victory", blurb: "Match win" },
  { id: "loss", label: "Defeat", blurb: "Match loss" },
  { id: "draw", label: "Draw", blurb: "Drawn game" },
  { id: "rankup", label: "Rank up", blurb: "Ladder step" },
  { id: "ui", label: "Soft click", blurb: "Light UI tick" },
];

export const SOUND_CUE_SETS: {
  id: SoundCueSet;
  label: string;
  blurb: string;
  /** Short vibe tag for the pack card. */
  vibe: string;
}[] = [
  {
    id: "soft",
    label: "Arena Soft",
    blurb: "Quiet sine taps that sit under the game",
    vibe: "Polite",
  },
  {
    id: "crystal",
    label: "Crystal Chimes",
    blurb: "Glassier bells — clearer pitch, still short",
    vibe: "Bright",
  },
  {
    id: "tabletop",
    label: "Tabletop Thunk",
    blurb: "Muted wood-pluck feel — less digital",
    vibe: "Warm",
  },
];

export function isSoundCueSet(v: unknown): v is SoundCueSet {
  return v === "soft" || v === "crystal" || v === "tabletop";
}

type Tone = {
  freq: number;
  dur: number;
  delay: number;
  type: OscillatorType;
  gain: number;
  partial?: number;
  noise?: boolean;
};

/** Pure cue maps — unit-tested; no AudioContext here. */
export function tonesFor(set: SoundCueSet, event: SfxEvent): Tone[] {
  switch (set) {
    case "soft":
      return softPack(event);
    case "crystal":
      return crystalPack(event);
    case "tabletop":
      return tabletopPack(event);
  }
}

function softPack(event: SfxEvent): Tone[] {
  const b = { type: "sine" as const, gain: 0.07 };
  switch (event) {
    case "win":
      return [
        { ...b, freq: 392, dur: 0.08, delay: 0, gain: 0.06 },
        { ...b, freq: 494, dur: 0.1, delay: 0.07, gain: 0.07 },
        { ...b, freq: 587, dur: 0.14, delay: 0.15, gain: 0.065 },
      ];
    case "loss":
      return [
        { ...b, freq: 349, dur: 0.1, delay: 0, gain: 0.055 },
        { ...b, freq: 277, dur: 0.16, delay: 0.09, gain: 0.05 },
      ];
    case "draw":
      return [
        { ...b, freq: 440, dur: 0.09, delay: 0, gain: 0.05 },
        { ...b, freq: 440, dur: 0.09, delay: 0.14, gain: 0.04 },
      ];
    case "rankup":
      return [
        { ...b, freq: 392, dur: 0.07, delay: 0, gain: 0.06 },
        { ...b, freq: 494, dur: 0.08, delay: 0.06, gain: 0.07 },
        { ...b, freq: 587, dur: 0.09, delay: 0.13, gain: 0.07 },
        { ...b, freq: 784, dur: 0.18, delay: 0.22, gain: 0.065, partial: 0.4 },
      ];
    case "ui":
      return [{ ...b, freq: 660, dur: 0.04, delay: 0, gain: 0.035 }];
  }
}

function crystalPack(event: SfxEvent): Tone[] {
  const b = { type: "triangle" as const, gain: 0.055 };
  switch (event) {
    case "win":
      return [
        { ...b, freq: 659, dur: 0.08, delay: 0, gain: 0.05 },
        { ...b, freq: 831, dur: 0.1, delay: 0.06, gain: 0.055 },
        { ...b, freq: 988, dur: 0.14, delay: 0.13, gain: 0.05, partial: 0.6 },
      ];
    case "loss":
      return [
        { ...b, freq: 740, dur: 0.09, delay: 0, gain: 0.045 },
        { ...b, freq: 554, dur: 0.15, delay: 0.08, gain: 0.04 },
      ];
    case "draw":
      return [
        { ...b, freq: 698, dur: 0.08, delay: 0, gain: 0.04 },
        { ...b, freq: 698, dur: 0.1, delay: 0.12, gain: 0.035, partial: 0.3 },
      ];
    case "rankup":
      return [
        { ...b, freq: 659, dur: 0.06, delay: 0, gain: 0.05 },
        { ...b, freq: 831, dur: 0.07, delay: 0.05, gain: 0.055 },
        { ...b, freq: 988, dur: 0.08, delay: 0.11, gain: 0.055 },
        { ...b, freq: 1319, dur: 0.2, delay: 0.2, gain: 0.05, partial: 0.7 },
      ];
    case "ui":
      return [{ ...b, freq: 1047, dur: 0.035, delay: 0, gain: 0.03 }];
  }
}

function tabletopPack(event: SfxEvent): Tone[] {
  const b = { type: "triangle" as const, gain: 0.08, noise: true };
  switch (event) {
    case "win":
      return [
        { ...b, freq: 196, dur: 0.07, delay: 0, gain: 0.07 },
        { ...b, freq: 247, dur: 0.09, delay: 0.07, gain: 0.08 },
        { ...b, freq: 294, dur: 0.12, delay: 0.15, gain: 0.07 },
      ];
    case "loss":
      return [
        { ...b, freq: 220, dur: 0.09, delay: 0, gain: 0.065 },
        { ...b, freq: 165, dur: 0.15, delay: 0.09, gain: 0.06 },
      ];
    case "draw":
      return [
        { ...b, freq: 185, dur: 0.08, delay: 0, gain: 0.055 },
        { ...b, freq: 185, dur: 0.08, delay: 0.13, gain: 0.045 },
      ];
    case "rankup":
      return [
        { ...b, freq: 196, dur: 0.06, delay: 0, gain: 0.07 },
        { ...b, freq: 247, dur: 0.07, delay: 0.06, gain: 0.08 },
        { ...b, freq: 294, dur: 0.08, delay: 0.13, gain: 0.08 },
        { ...b, freq: 392, dur: 0.16, delay: 0.22, gain: 0.075, noise: true },
      ];
    case "ui":
      return [{ ...b, freq: 330, dur: 0.04, delay: 0, gain: 0.04, noise: true }];
  }
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  return ctx;
}

function scheduleTone(audio: AudioContext, t: Tone, when: number): void {
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = t.type;
  osc.frequency.setValueAtTime(t.freq, when);

  const peak = Math.max(0.001, t.gain);
  const attack = 0.008;
  const release = Math.max(0.04, t.dur * 0.55);
  const end = when + t.dur;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, end + release * 0.15);

  osc.connect(g);
  g.connect(audio.destination);
  osc.start(when);
  osc.stop(end + release);

  if (t.partial && t.partial > 0) {
    const osc2 = audio.createOscillator();
    const g2 = audio.createGain();
    osc2.type = t.type;
    osc2.frequency.setValueAtTime(t.freq * (1 + t.partial * 0.02), when);
    g2.gain.setValueAtTime(0.0001, when);
    g2.gain.exponentialRampToValueAtTime(peak * 0.35, when + attack);
    g2.gain.exponentialRampToValueAtTime(0.0001, end + release * 0.15);
    osc2.connect(g2);
    g2.connect(audio.destination);
    osc2.start(when);
    osc2.stop(end + release);
  }

  if (t.noise || (t.type === "triangle" && t.freq < 300)) {
    try {
      const n = Math.floor(audio.sampleRate * Math.min(0.04, t.dur));
      const buf = audio.createBuffer(1, n, audio.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      }
      const src = audio.createBufferSource();
      src.buffer = buf;
      const ng = audio.createGain();
      const filter = audio.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = t.noise ? 1200 : 900;
      ng.gain.setValueAtTime(peak * 0.5, when);
      ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      src.connect(filter);
      filter.connect(ng);
      ng.connect(audio.destination);
      src.start(when);
    } catch {
      /* ignore */
    }
  }
}

export async function playSfx(
  event: SfxEvent,
  opts: { set: SoundCueSet; force?: boolean } = { set: "soft" },
): Promise<void> {
  const audio = getCtx();
  if (!audio) return;
  try {
    if (audio.state === "suspended") {
      await audio.resume();
    }
  } catch {
    return;
  }
  const now = audio.currentTime + 0.01;
  for (const t of tonesFor(opts.set, event)) {
    scheduleTone(audio, t, now + t.delay);
  }
  void opts.force;
}

/** Settings preview — always plays regardless of the master toggle. */
export function previewSfx(set: SoundCueSet, event: SfxEvent = "win"): void {
  void playSfx(event, { set, force: true });
}

/** Play the full pack demo (win → short gap → rankup) for “try pack”. */
export async function previewSoundPack(set: SoundCueSet): Promise<void> {
  await playSfx("win", { set, force: true });
  await new Promise((r) => setTimeout(r, 420));
  await playSfx("rankup", { set, force: true });
}
