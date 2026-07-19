/**
 * Opt-in UI sound cues (main app only — never the overlay).
 *
 * All tones are synthesized with the Web Audio API so we ship zero audio
 * assets and keep the installer small. Bad sound ruins an app, so:
 *  - OFF by default
 *  - soft, short, low-volume cues only
 *  - three tasteful sets the player can preview in Settings
 */

export type SoundCueSet = "soft" | "crystal" | "tabletop";

export type SfxEvent = "win" | "loss" | "draw" | "rankup" | "ui";

export const SOUND_CUE_SETS: {
  id: SoundCueSet;
  label: string;
  blurb: string;
}[] = [
  {
    id: "soft",
    label: "Arena Soft",
    blurb: "Quiet sine taps — polite, sits under the game",
  },
  {
    id: "crystal",
    label: "Crystal Chimes",
    blurb: "Glassier bells — clearer pitch, still short",
  },
  {
    id: "tabletop",
    label: "Tabletop Thunk",
    blurb: "Muted wood-pluck feel — less digital",
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
  /** Optional detuned second partial (0 = none). */
  partial?: number;
};

/** Pure cue maps — unit-tested; no AudioContext here. */
export function tonesFor(set: SoundCueSet, event: SfxEvent): Tone[] {
  const base = BASE[set];
  switch (event) {
    case "win":
      return [
        { ...base, freq: base.freq * 1.0, dur: 0.09, delay: 0, gain: base.gain * 0.9 },
        { ...base, freq: base.freq * 1.25, dur: 0.11, delay: 0.07, gain: base.gain },
        { ...base, freq: base.freq * 1.5, dur: 0.14, delay: 0.15, gain: base.gain * 0.85 },
      ];
    case "loss":
      return [
        { ...base, freq: base.freq * 1.12, dur: 0.1, delay: 0, gain: base.gain * 0.75 },
        { ...base, freq: base.freq * 0.84, dur: 0.16, delay: 0.08, gain: base.gain * 0.65 },
      ];
    case "draw":
      return [
        { ...base, freq: base.freq * 1.0, dur: 0.1, delay: 0, gain: base.gain * 0.7 },
        { ...base, freq: base.freq * 1.0, dur: 0.1, delay: 0.12, gain: base.gain * 0.55 },
      ];
    case "rankup":
      return [
        { ...base, freq: base.freq * 1.0, dur: 0.08, delay: 0, gain: base.gain * 0.85 },
        { ...base, freq: base.freq * 1.25, dur: 0.09, delay: 0.06, gain: base.gain },
        { ...base, freq: base.freq * 1.5, dur: 0.1, delay: 0.13, gain: base.gain },
        {
          ...base,
          freq: base.freq * 2.0,
          dur: 0.18,
          delay: 0.22,
          gain: base.gain * 0.9,
          partial: 0.5,
        },
      ];
    case "ui":
      return [
        {
          ...base,
          freq: base.freq * 1.5,
          dur: 0.045,
          delay: 0,
          gain: base.gain * 0.45,
        },
      ];
  }
}

const BASE: Record<SoundCueSet, Tone> = {
  soft: { freq: 440, dur: 0.1, delay: 0, type: "sine", gain: 0.07 },
  crystal: { freq: 660, dur: 0.1, delay: 0, type: "triangle", gain: 0.055 },
  tabletop: { freq: 220, dur: 0.08, delay: 0, type: "triangle", gain: 0.08 },
};

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

  // Soft attack / release — no clicks.
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

  // Tabletop: slight noise “body” for wood-pluck character.
  if (t.type === "triangle" && t.freq < 300) {
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
      filter.frequency.value = 900;
      ng.gain.setValueAtTime(peak * 0.55, when);
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

/**
 * Play a cue. No-ops safely if Web Audio is unavailable or the context is suspended
 * and resume fails (autoplay policy). Call from a user gesture for previews.
 */
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
