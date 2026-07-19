#!/usr/bin/env python3
"""
Marketing soundtrack options for Filthy Net Deck.
Each has arrangement arc, SFX (whoosh/impact/riser/glitch), and a real climax.

  A — Acid Climax: dark electronic, evolving filter, big drop at ~65%
  B — Synthwave Climb: melodic arps + pads, emotional peak
  C — Trailer Hits: sparse → thunder impacts, hybrid trailer energy
  D — Arena Pulse: competitive esports half-time, glitch ticks, cut hits, CTA smash
  D30 — Arena Pulse (30s): timed for Themes X cut (hook → skins → CTA)

No deps beyond numpy.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

SR = 44100
PUBLIC = Path(__file__).resolve().parents[1] / "public"
DESKTOP = Path.home() / "Desktop"


# ---------------------------------------------------------------------------
# Core DSP
# ---------------------------------------------------------------------------

def env_adsr(n: int, a=0.01, d=0.08, s=0.55, r=0.12) -> np.ndarray:
    a_n, d_n, r_n = max(1, int(a * SR)), max(1, int(d * SR)), max(1, int(r * SR))
    s_n = max(0, n - a_n - d_n - r_n)
    e = np.concatenate(
        [
            np.linspace(0, 1, a_n, endpoint=False),
            np.linspace(1, s, d_n, endpoint=False),
            np.full(s_n, s),
            np.linspace(s, 0, r_n, endpoint=True),
        ]
    )
    if len(e) < n:
        e = np.pad(e, (0, n - len(e)))
    return e[:n]


def note_hz(midi: float) -> float:
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def noise(n: int, seed: int = 0) -> np.ndarray:
    return np.random.default_rng(seed).uniform(-1, 1, n)


def one_pole_lp(x: np.ndarray, cutoff: float) -> np.ndarray:
    """Vectorized-ish one-pole via recursive formula in loop (OK for ~50s)."""
    alpha = min(0.99, 2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    s = 0.0
    a = alpha
    for i, v in enumerate(x):
        s += a * (v - s)
        y[i] = s
    return y


def one_pole_hp(x: np.ndarray, cutoff: float) -> np.ndarray:
    rc = 1.0 / (2 * np.pi * cutoff)
    dt = 1.0 / SR
    alpha = rc / (rc + dt)
    y = np.empty_like(x)
    prev_x = prev_y = 0.0
    for i, v in enumerate(x):
        prev_y = alpha * (prev_y + v - prev_x)
        prev_x = v
        y[i] = prev_y
    return y


def soft_clip(x: np.ndarray, drive: float = 1.1) -> np.ndarray:
    return np.tanh(x * drive)


def place(buf: np.ndarray, start_s: float, sample: np.ndarray, gain: float = 1.0) -> None:
    i0 = int(start_s * SR)
    if i0 >= len(buf) or i0 < 0:
        return
    i1 = min(len(buf), i0 + len(sample))
    buf[i0:i1] += sample[: i1 - i0] * gain


def fade_edges(x: np.ndarray, inn: float = 0.12, out: float = 2.0) -> np.ndarray:
    y = x.copy()
    fi, fo = int(inn * SR), int(out * SR)
    if fi > 0:
        y[:fi] *= np.linspace(0, 1, fi)
    if fo > 0 and fo < len(y):
        y[-fo:] *= np.linspace(1, 0, fo)
    return y


def to_stereo(mono: np.ndarray, width: float = 1.1, delay_s: float = 0.011) -> tuple[np.ndarray, np.ndarray]:
    delay = int(delay_s * SR)
    left = mono.copy()
    right = mono.copy()
    if delay > 0 and delay < len(mono):
        right[delay:] += mono[:-delay] * 0.14
        left[delay:] += mono[:-delay] * 0.07
    mid = (left + right) * 0.5
    side = (left - right) * 0.5 * width
    left, right = mid + side, mid - side
    peak = max(np.max(np.abs(left)), np.max(np.abs(right)), 1e-9)
    return left / peak * 0.9, right / peak * 0.9


def write_wav(path: Path, left: np.ndarray, right: np.ndarray) -> None:
    import wave

    path.parent.mkdir(parents=True, exist_ok=True)
    interleaved = np.empty(len(left) * 2, dtype=np.float64)
    interleaved[0::2] = np.clip(left, -1, 1)
    interleaved[1::2] = np.clip(right, -1, 1)
    pcm = (interleaved * 32767.0).astype(np.int16)
    with wave.open(str(path), "w") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"  wrote {path.name} ({len(left) / SR:.1f}s, {path.stat().st_size // 1024} KB)")


# ---------------------------------------------------------------------------
# Instruments & SFX
# ---------------------------------------------------------------------------

def kick(length_s: float = 0.34, pitch: float = 150) -> np.ndarray:
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    freq = pitch * np.exp(-tt * 20) + 36
    phase = 2 * np.pi * np.cumsum(freq) / SR
    body = np.sin(phase) * env_adsr(n, 0.001, 0.04, 0.2, 0.2)
    click = noise(n, 1) * env_adsr(n, 0.0004, 0.006, 0, 0.01) * 0.4
    return body * 1.2 + click


def snare(length_s: float = 0.24) -> np.ndarray:
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 190 * tt) * env_adsr(n, 0.001, 0.035, 0.08, 0.1) * 0.4
    nse = one_pole_hp(noise(n, 2), 900) * env_adsr(n, 0.001, 0.05, 0.12, 0.12)
    return tone + nse * 0.75


def hat(open_: bool = False) -> np.ndarray:
    n = int((0.16 if open_ else 0.055) * SR)
    nse = one_pole_hp(noise(n, 3), 7000)
    e = env_adsr(n, 0.0004, 0.01, 0.04 if open_ else 0.0, 0.1 if open_ else 0.025)
    return nse * e * (0.26 if open_ else 0.2)


def clap() -> np.ndarray:
    n = int(0.22 * SR)
    nse = one_pole_hp(noise(n, 7), 1200)
    # multi-burst
    e = np.zeros(n)
    for off in (0, 0.012, 0.024):
        o = int(off * SR)
        burst = env_adsr(n - o, 0.001, 0.02, 0.05, 0.1) if n > o else []
        if len(burst):
            e[o:] += burst[: n - o] * 0.5
    return nse * e * 0.55


def bass_note(midi: int, length_s: float, slide_to: int | None = None) -> np.ndarray:
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    f0 = note_hz(midi)
    if slide_to is not None:
        f1 = note_hz(slide_to)
        freq = f0 + (f1 - f0) * np.clip(tt / max(length_s * 0.3, 1e-6), 0, 1)
    else:
        freq = np.full(n, f0)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    s1 = 2 * (phase / (2 * np.pi) % 1) - 1
    s2 = 2 * ((phase * 1.007) / (2 * np.pi) % 1) - 1
    raw = soft_clip(s1 * 0.55 + s2 * 0.45, 1.5)
    return raw * env_adsr(n, 0.004, 0.04, 0.78, 0.07) * 0.5


def acid_note(midi: int, length_s: float, cut0=400.0, cut1=2800.0, res=0.3) -> np.ndarray:
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    f = note_hz(midi)
    phase = 2 * np.pi * f * tt
    sq = np.where((phase / (2 * np.pi) % 1) < 0.5, 1.0, -1.0)
    sw = 2 * (phase / (2 * np.pi) % 1) - 1
    raw = sq * 0.6 + sw * 0.4
    cut = cut0 + (cut1 - cut0) * (0.5 + 0.5 * np.sin(2 * np.pi * 3 * tt))
    y = np.zeros(n)
    state = 0.0
    for i in range(n):
        a = min(0.95, cut[i] / 9000)
        state += a * (raw[i] - state)
        y[i] = state + (raw[i] - state) * res
    return soft_clip(y, 1.7) * env_adsr(n, 0.002, 0.05, 0.35, 0.09) * 0.3


def lead_saw(midi: int, length_s: float, vib=0.0) -> np.ndarray:
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    f = note_hz(midi) * (1 + vib * np.sin(2 * np.pi * 5 * tt) * 0.01)
    phase = 2 * np.pi * np.cumsum(f) / SR
    s = 2 * (phase / (2 * np.pi) % 1) - 1
    s2 = 2 * ((phase * 1.01) / (2 * np.pi) % 1) - 1
    return soft_clip((s + s2 * 0.5) * 0.5, 1.2) * env_adsr(n, 0.02, 0.1, 0.6, 0.15) * 0.28


def arp_pluck(midi: int, length_s: float = 0.18) -> np.ndarray:
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    f = note_hz(midi)
    s = np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * f * 2 * tt)
    s += 0.15 * (2 * ((f * tt) % 1) - 1)
    return s * env_adsr(n, 0.002, 0.04, 0.15, 0.08) * 0.35


def pad_chord(midis: list[int], length_s: float) -> np.ndarray:
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    out = np.zeros(n)
    for m in midis:
        f = note_hz(m)
        out += np.sin(2 * np.pi * f * tt) * 0.3
        out += np.sin(2 * np.pi * f * 2.005 * tt) * 0.1
        out += (2 * ((f * 0.5 * tt) % 1) - 1) * 0.06
    return out * env_adsr(n, 0.5, 0.6, 0.7, 0.9) * 0.2


def whoosh(length_s: float = 0.55, rising: bool = True) -> np.ndarray:
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    nse = noise(n, 11)
    sweep = (tt / length_s) if rising else (1 - tt / length_s)
    # per-sample highpass (sweeping cutoff)
    y = np.empty(n)
    prev_x = prev_y = 0.0
    for i in range(n):
        cutoff = 200 + 6000 * float(sweep[i] ** 1.4)
        rc = 1.0 / (2 * np.pi * cutoff)
        dt = 1.0 / SR
        alpha = rc / (rc + dt)
        v = float(nse[i])
        prev_y = alpha * (prev_y + v - prev_x)
        prev_x = v
        y[i] = prev_y
    e = np.clip(sweep**1.2 * (1 - sweep) * 4, 0, 1)
    return y * e * 0.55


def impact(length_s: float = 0.9) -> np.ndarray:
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    # sub hit + noise burst + metallic
    sub_f = 55 * np.exp(-tt * 6) + 28
    sub = np.sin(2 * np.pi * np.cumsum(sub_f) / SR) * env_adsr(n, 0.001, 0.08, 0.3, 0.5)
    nse = one_pole_lp(one_pole_hp(noise(n, 13), 200), 3000) * env_adsr(n, 0.001, 0.1, 0.1, 0.4)
    metal = np.sin(2 * np.pi * 880 * tt) * np.exp(-tt * 12) * 0.25
    metal += np.sin(2 * np.pi * 1320 * tt) * np.exp(-tt * 15) * 0.15
    return soft_clip(sub * 1.1 + nse * 0.7 + metal, 1.3) * 0.9


def reverse_cymbal(length_s: float = 1.4) -> np.ndarray:
    n = int(length_s * SR)
    nse = one_pole_hp(noise(n, 17), 2500)
    e = np.linspace(0, 1, n) ** 2.2
    return nse * e * 0.4


def glitch_hit(length_s: float = 0.12) -> np.ndarray:
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    f = 200 + 2000 * (tt / max(length_s, 1e-6))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR)
    s += noise(n, 19) * 0.5
    # bitcrush-ish
    s = np.round(s * 6) / 6
    return s * env_adsr(n, 0.001, 0.02, 0.1, 0.05) * 0.45


def riser(length_s: float = 2.0) -> np.ndarray:
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    nse = one_pole_hp(noise(n, 23), 400)
    f = 70 + 1400 * (tt / length_s) ** 2
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.3
    e = (tt / length_s) ** 1.5
    return (nse * 0.4 + tone) * e * 0.45


def sub_drop(length_s: float = 0.7) -> np.ndarray:
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    f = 80 * np.exp(-tt * 4) + 25
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_adsr(n, 0.01, 0.1, 0.4, 0.3) * 0.85


def tick() -> np.ndarray:
    n = int(0.04 * SR)
    return one_pole_hp(noise(n, 29), 4000) * env_adsr(n, 0.0005, 0.005, 0, 0.02) * 0.35


# ---------------------------------------------------------------------------
# Track A — Acid Climax
# ---------------------------------------------------------------------------

def track_a(duration: float = 48.0) -> tuple[np.ndarray, np.ndarray]:
    bpm = 128
    beat = 60.0 / bpm
    bar = beat * 4
    n = int(duration * SR)
    drums = np.zeros(n)
    bass = np.zeros(n)
    lead = np.zeros(n)
    pads = np.zeros(n)
    sfx = np.zeros(n)
    total_beats = int(duration / beat)

    # Sections (bars): intro 0-4, groove 4-12, build 12-18, CLIMAX 18-26, break 26-30, outro 30+
    for b in range(total_beats):
        t = b * beat
        bar_i = b // 4
        # intro: sparse kicks + ticks
        if bar_i < 4:
            if b % 8 == 0:
                place(drums, t, kick(pitch=130), 0.9)
            if b % 2 == 0 and bar_i >= 2:
                place(drums, t + beat * 0.5, hat(), 0.5)
            if b % 4 == 3:
                place(sfx, t, tick(), 0.6)
            continue
        # groove
        if 4 <= bar_i < 12:
            if b % 4 == 0:
                place(drums, t, kick(), 1.0)
            if b % 4 == 2:
                place(drums, t, snare(), 0.85)
            if b % 2 == 0:
                place(drums, t + beat * 0.5, hat(), 0.7)
            if b % 8 == 7:
                place(drums, t + beat * 0.75, hat(True), 0.5)
            continue
        # build — denser hats, ghost snares
        if 12 <= bar_i < 18:
            if b % 4 == 0:
                place(drums, t, kick(), 1.05)
            if b % 4 == 2:
                place(drums, t, snare(), 0.9)
            if b % 1 == 0:
                place(drums, t + beat * 0.5, hat(), 0.55 + 0.05 * (bar_i - 12))
            if b % 2 == 1:
                place(drums, t, snare(0.1), 0.25)
            continue
        # CLIMAX — four on floor + claps
        if 18 <= bar_i < 26:
            if b % 4 == 0:
                place(drums, t, kick(pitch=160), 1.15)
            if b % 2 == 0:
                place(drums, t, kick(0.2, 90), 0.25)
            if b % 4 == 2:
                place(drums, t, snare(), 1.0)
                place(drums, t, clap(), 0.55)
            place(drums, t + beat * 0.5, hat(), 0.75)
            if b % 4 == 3:
                place(drums, t + beat * 0.75, hat(True), 0.6)
            continue
        # break
        if 26 <= bar_i < 30:
            if b % 8 == 0:
                place(drums, t, kick(), 0.8)
            if b % 8 == 4:
                place(drums, t, snare(), 0.5)
            continue
        # outro
        if b % 8 == 0:
            place(drums, t, kick(), 0.65)
        if b % 8 == 4:
            place(drums, t, hat(), 0.4)

    # Bass patterns by section
    pat_a = [(33, 0.5), (33, 0.5), (31, 0.5), (33, 0.5), (29, 0.5), (29, 0.5), (28, 0.5), (31, 0.5)]
    pat_b = [(36, 0.5), (36, 0.5), (33, 0.5), (36, 0.5), (31, 0.5), (29, 0.5), (28, 0.5), (31, 0.5)]
    for bar_i in range(4, 30):
        pat = pat_b if 18 <= bar_i < 26 else pat_a
        for i, (m, dur) in enumerate(pat):
            if 12 <= bar_i < 18 and i % 2 == 1:
                # build: more movement
                place(bass, (bar_i * 4 + i * 0.5) * beat, bass_note(m + 12, beat * dur * 0.9), 0.7)
            place(bass, (bar_i * 4 + i * 0.5) * beat, bass_note(m, beat * dur * 0.92), 0.95 if bar_i < 18 else 1.1)

    # Acid riff — evolves
    riff1 = [57, 57, 60, 57, 55, 53, 55, 57]
    riff2 = [60, 64, 62, 60, 57, 55, 57, 60]
    riff3 = [69, 72, 67, 64, 65, 67, 64, 60]  # climax octave up
    for bar_i in range(6, 12):
        for i, m in enumerate(riff1):
            place(lead, (bar_i * 4 + i * 0.5) * beat, acid_note(m, beat * 0.45, 350, 1800), 0.85)
    for bar_i in range(12, 18):
        for i, m in enumerate(riff2):
            place(lead, (bar_i * 4 + i * 0.5) * beat, acid_note(m, beat * 0.45, 500, 3200), 1.0)
    for bar_i in range(18, 26):
        for i, m in enumerate(riff3):
            place(lead, (bar_i * 4 + i * 0.5) * beat, acid_note(m, beat * 0.42, 800, 4500, 0.45), 1.15)
        # harmony layer
        if bar_i % 2 == 0:
            place(lead, bar_i * bar, lead_saw(64, bar * 1.8, 0.8), 0.55)

    # Pads
    chords = [[45, 48, 52, 57], [43, 47, 50, 55], [41, 45, 48, 53], [40, 43, 47, 52]]
    for bar_i in range(0, 34, 2):
        place(pads, bar_i * bar, pad_chord(chords[(bar_i // 2) % 4], bar * 2.2), 0.7 if bar_i < 18 else 1.0)

    # SFX timeline
    place(sfx, 4 * bar - 1.5, reverse_cymbal(1.5), 0.7)
    place(sfx, 4 * bar, whoosh(0.5), 0.8)
    place(sfx, 4 * bar, impact(0.7), 0.5)
    place(sfx, 12 * bar - 2.0, riser(2.0), 0.9)
    place(sfx, 12 * bar, whoosh(0.45), 0.85)
    place(sfx, 12 * bar, glitch_hit(), 0.7)
    # big climax hit
    place(sfx, 18 * bar - 2.2, riser(2.2), 1.1)
    place(sfx, 18 * bar - 0.4, reverse_cymbal(0.4), 0.8)
    place(sfx, 18 * bar, impact(1.1), 1.2)
    place(sfx, 18 * bar, sub_drop(0.8), 1.0)
    place(sfx, 18 * bar, whoosh(0.6, False), 0.7)
    # mid-climax accents
    for bar_i in (20, 22, 24):
        place(sfx, bar_i * bar, whoosh(0.35), 0.55)
        place(sfx, bar_i * bar, glitch_hit(0.08), 0.45)
    place(sfx, 26 * bar, impact(0.8), 0.7)
    place(sfx, 26 * bar, whoosh(0.7, False), 0.6)
    # scene-change style ticks every 4 bars after intro
    for bar_i in range(8, 28, 4):
        if bar_i not in (12, 18, 26):
            place(sfx, bar_i * bar - 0.15, whoosh(0.3), 0.4)
            place(sfx, bar_i * bar, tick(), 0.8)

    mono = drums * 0.95 + one_pole_lp(bass, 300) * 0.9 + bass * 0.35
    mono += lead * 0.95 + pads * 0.75 + sfx * 1.05
    mono = soft_clip(fade_edges(mono, 0.1, 2.4), 1.05)
    return to_stereo(mono, 1.15)


# ---------------------------------------------------------------------------
# Track B — Synthwave Climb
# ---------------------------------------------------------------------------

def track_b(duration: float = 48.0) -> tuple[np.ndarray, np.ndarray]:
    bpm = 100
    beat = 60.0 / bpm
    bar = beat * 4
    n = int(duration * SR)
    drums = np.zeros(n)
    bass = np.zeros(n)
    arp = np.zeros(n)
    pads = np.zeros(n)
    lead = np.zeros(n)
    sfx = np.zeros(n)
    total_beats = int(duration / beat)

    # Sections: ambient 0-4, groove 4-10, lift 10-16, CLIMAX 16-22, cool 22-26, outro
    for b in range(total_beats):
        t = b * beat
        bar_i = b // 4
        if bar_i < 4:
            if b % 8 == 0:
                place(drums, t, kick(0.4, 110), 0.55)
            continue
        if 4 <= bar_i < 10:
            if b % 4 == 0:
                place(drums, t, kick(0.36, 140), 0.9)
            if b % 4 == 2:
                place(drums, t, snare(), 0.7)
            if b % 2 == 0:
                place(drums, t + beat * 0.5, hat(), 0.55)
            continue
        if 10 <= bar_i < 16:
            if b % 4 == 0:
                place(drums, t, kick(), 1.0)
            if b % 4 == 2:
                place(drums, t, snare(), 0.85)
                place(drums, t, clap(), 0.3)
            place(drums, t + beat * 0.5, hat(), 0.65)
            if b % 4 == 1:
                place(drums, t + beat * 0.75, hat(), 0.35)
            continue
        if 16 <= bar_i < 22:  # climax
            if b % 4 == 0:
                place(drums, t, kick(pitch=165), 1.15)
            if b % 4 == 2:
                place(drums, t, snare(), 1.05)
                place(drums, t, clap(), 0.6)
            place(drums, t + beat * 0.5, hat(True) if b % 4 == 3 else hat(), 0.7)
            continue
        if 22 <= bar_i < 26:
            if b % 8 == 0:
                place(drums, t, kick(), 0.7)
            if b % 8 == 4:
                place(drums, t, snare(), 0.45)
            continue
        if b % 8 == 0:
            place(drums, t, kick(0.4, 120), 0.5)

    # Bass — warm root movement
    roots = [33, 33, 29, 31, 33, 36, 29, 28]  # per bar
    for bar_i in range(2, 26):
        root = roots[bar_i % len(roots)]
        place(bass, bar_i * bar, bass_note(root, bar * 0.95), 0.85 if bar_i < 16 else 1.05)
        place(bass, bar_i * bar + beat * 2, bass_note(root + 7, beat * 1.8), 0.55)

    # Arpeggios Am-ish
    arp_notes = [57, 60, 64, 67, 64, 60, 57, 55]
    for bar_i in range(4, 22):
        dens = 8 if bar_i >= 10 else 4
        for i in range(dens):
            m = arp_notes[i % len(arp_notes)]
            if bar_i >= 16:
                m += 12
            place(arp, bar_i * bar + i * (bar / dens), arp_pluck(m, beat * 0.4), 0.7 if bar_i < 16 else 1.0)

    # Melody at lift + climax
    melody = [69, 71, 72, 71, 69, 67, 64, 67, 69, 72, 76, 74, 72, 71, 69, 67]
    for bar_i in range(12, 22):
        for i, m in enumerate(melody[:8] if bar_i < 16 else melody):
            place(lead, bar_i * bar + i * beat * 0.5, lead_saw(m, beat * 0.48, 1.0), 0.8 if bar_i < 16 else 1.15)

    chords = [[45, 48, 52, 57], [41, 45, 48, 53], [43, 47, 50, 55], [40, 43, 47, 52]]
    for bar_i in range(0, 28, 2):
        place(pads, bar_i * bar, pad_chord(chords[(bar_i // 2) % 4], bar * 2.3), 0.85)

    # SFX
    place(sfx, 4 * bar - 1.2, reverse_cymbal(1.2), 0.6)
    place(sfx, 4 * bar, whoosh(0.55), 0.7)
    place(sfx, 10 * bar - 1.8, riser(1.8), 0.85)
    place(sfx, 10 * bar, impact(0.6), 0.55)
    place(sfx, 16 * bar - 2.5, riser(2.5), 1.15)
    place(sfx, 16 * bar, impact(1.2), 1.25)
    place(sfx, 16 * bar, sub_drop(0.9), 1.1)
    place(sfx, 16 * bar, whoosh(0.5), 0.8)
    for bar_i in (18, 20):
        place(sfx, bar_i * bar, whoosh(0.3), 0.5)
        place(sfx, bar_i * bar + beat * 2, glitch_hit(0.1), 0.35)
    place(sfx, 22 * bar, impact(0.7), 0.65)
    place(sfx, 22 * bar, whoosh(0.8, False), 0.55)
    for bar_i in range(6, 24, 4):
        if bar_i not in (10, 16, 22):
            place(sfx, bar_i * bar, tick(), 0.55)

    mono = drums * 0.9 + bass * 0.95 + arp * 0.75 + lead * 0.85 + pads * 0.8 + sfx * 1.0
    mono = soft_clip(fade_edges(mono, 0.2, 2.8), 1.02)
    return to_stereo(mono, 1.2)


# ---------------------------------------------------------------------------
# Track C — Trailer Hits
# ---------------------------------------------------------------------------

def track_c(duration: float = 48.0) -> tuple[np.ndarray, np.ndarray]:
    bpm = 90
    beat = 60.0 / bpm
    bar = beat * 4
    n = int(duration * SR)
    drums = np.zeros(n)
    bass = np.zeros(n)
    pads = np.zeros(n)
    lead = np.zeros(n)
    sfx = np.zeros(n)
    total_beats = int(duration / beat)

    # Hybrid trailer: silence/space → pulse → BRAAM climax → resolve
    for b in range(total_beats):
        t = b * beat
        bar_i = b // 4
        if bar_i < 3:
            if b % 16 == 0:
                place(drums, t, kick(0.5, 100), 0.4)
            continue
        if 3 <= bar_i < 8:
            if b % 4 == 0:
                place(drums, t, kick(0.4, 130), 0.75)
            if b % 8 == 4:
                place(drums, t, snare(), 0.55)
            if b % 4 == 2:
                place(drums, t + beat * 0.5, tick(), 0.5)
            continue
        if 8 <= bar_i < 14:
            if b % 4 == 0:
                place(drums, t, kick(), 1.0)
            if b % 4 == 2:
                place(drums, t, snare(), 0.9)
            if b % 2 == 0:
                place(drums, t + beat * 0.5, hat(), 0.5)
            continue
        if 14 <= bar_i < 20:  # climax barrage
            if b % 2 == 0:
                place(drums, t, kick(pitch=170), 1.2)
            if b % 4 == 2:
                place(drums, t, snare(), 1.1)
                place(drums, t, clap(), 0.7)
            place(drums, t + beat * 0.5, hat(), 0.65)
            continue
        if 20 <= bar_i < 24:
            if b % 8 == 0:
                place(drums, t, kick(), 0.7)
            continue
        if b % 16 == 0:
            place(drums, t, kick(0.5, 110), 0.45)

    # Braam-like low stacks at climax
    def braam(midi: int, length_s: float) -> np.ndarray:
        n_ = int(length_s * SR)
        tt = np.arange(n_) / SR
        out = np.zeros(n_)
        for off, g in ((0, 1.0), (7, 0.55), (12, 0.35), (-12, 0.7)):
            f = note_hz(midi + off) * (1 + 0.01 * np.sin(2 * np.pi * 3 * tt))
            out += np.sin(2 * np.pi * np.cumsum(f) / SR) * g
            out += (2 * ((f * tt * 0.5) % 1) - 1) * 0.15 * g
        return soft_clip(out * env_adsr(n_, 0.05, 0.2, 0.55, 0.4), 1.4) * 0.4

    for bar_i in range(3, 14):
        root = 28 if bar_i % 4 < 2 else 26
        place(bass, bar_i * bar, bass_note(root, bar * 0.9), 0.8)

    for bar_i in (14, 15, 16, 17, 18, 19):
        place(bass, bar_i * bar, braam(28 if bar_i % 2 == 0 else 31, bar * 0.95), 1.2)
        place(bass, bar_i * bar + beat * 2, braam(24, beat * 1.8), 0.7)

    # Sparse heroic lead
    for bar_i, notes in (
        (8, [60, 64, 67, 64]),
        (10, [62, 65, 69, 65]),
        (12, [64, 67, 72, 67]),
        (14, [67, 72, 76, 72]),
        (16, [69, 72, 76, 79]),
        (18, [72, 76, 79, 76]),
    ):
        for i, m in enumerate(notes):
            place(lead, bar_i * bar + i * beat, lead_saw(m, beat * 0.9, 0.6), 0.7 if bar_i < 14 else 1.1)

    chords = [[40, 43, 47, 52], [38, 41, 45, 50], [41, 45, 48, 53], [43, 47, 50, 55]]
    for bar_i in range(0, 26, 2):
        g = 0.5 if bar_i < 8 else 0.9 if bar_i < 14 else 1.15
        place(pads, bar_i * bar, pad_chord(chords[(bar_i // 2) % 4], bar * 2.2), g)

    # Heavy SFX design
    place(sfx, 3 * bar - 1.0, reverse_cymbal(1.0), 0.5)
    place(sfx, 3 * bar, whoosh(0.6), 0.65)
    place(sfx, 3 * bar, impact(0.5), 0.4)
    place(sfx, 8 * bar - 1.6, riser(1.6), 0.75)
    place(sfx, 8 * bar, impact(0.7), 0.7)
    place(sfx, 8 * bar, whoosh(0.4), 0.6)
    # pre-climax silence tension + mega hit
    place(sfx, 14 * bar - 2.8, riser(2.8), 1.2)
    place(sfx, 14 * bar - 0.5, reverse_cymbal(0.5), 0.9)
    place(sfx, 14 * bar, impact(1.3), 1.35)
    place(sfx, 14 * bar, sub_drop(1.0), 1.2)
    place(sfx, 14 * bar + 0.05, glitch_hit(0.15), 0.8)
    place(sfx, 14 * bar + 0.1, whoosh(0.55, False), 0.7)
    for bar_i in (15, 16, 17, 18, 19):
        place(sfx, bar_i * bar, impact(0.55), 0.55 + 0.08 * (bar_i - 15))
        place(sfx, bar_i * bar + beat, whoosh(0.25), 0.4)
        place(sfx, bar_i * bar + beat * 2, glitch_hit(0.07), 0.35)
    place(sfx, 20 * bar, impact(1.0), 0.9)
    place(sfx, 20 * bar, whoosh(1.0, False), 0.7)
    # transition ticks
    for bar_i in (5, 6, 7, 10, 12):
        place(sfx, bar_i * bar, tick(), 0.6)

    mono = drums * 0.95 + bass * 1.0 + lead * 0.75 + pads * 0.7 + sfx * 1.15
    mono = soft_clip(fade_edges(mono, 0.15, 3.0), 1.08)
    return to_stereo(mono, 1.1)


# ---------------------------------------------------------------------------
# Track D — Arena Pulse (competitive esports / product-brand fit)
# ---------------------------------------------------------------------------

def digital_stutter(length_s: float = 0.09) -> np.ndarray:
    """Short bit-crushed digital tick for UI / cut energy."""
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    f = 900 + 2400 * (tt / max(length_s, 1e-6))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR)
    s += one_pole_hp(noise(n, 31), 3000) * 0.55
    s = np.round(s * 5) / 5
    return s * env_adsr(n, 0.0004, 0.012, 0.05, 0.04) * 0.4


def laser_blip(midi: int = 84, length_s: float = 0.08) -> np.ndarray:
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    f0, f1 = note_hz(midi), note_hz(midi - 12)
    freq = f0 + (f1 - f0) * (tt / max(length_s, 1e-6))
    s = np.sin(2 * np.pi * np.cumsum(freq) / SR)
    s += 0.3 * np.sin(2 * np.pi * np.cumsum(freq * 2) / SR)
    return s * env_adsr(n, 0.001, 0.02, 0.05, 0.04) * 0.28


def half_time_kick(length_s: float = 0.42) -> np.ndarray:
    """Punchier, longer kick for competitive half-time feel."""
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    freq = 165 * np.exp(-tt * 16) + 38
    phase = 2 * np.pi * np.cumsum(freq) / SR
    body = np.sin(phase) * env_adsr(n, 0.001, 0.05, 0.25, 0.22)
    click = one_pole_hp(noise(n, 37), 2500) * env_adsr(n, 0.0003, 0.005, 0, 0.012) * 0.5
    sub = np.sin(2 * np.pi * 48 * tt) * env_adsr(n, 0.002, 0.08, 0.35, 0.25) * 0.35
    return soft_clip(body * 1.15 + click + sub, 1.25)


def track_d(duration: float = 48.0) -> tuple[np.ndarray, np.ndarray]:
    """
    Arena Pulse — competitive esports brand bed.
    Tight 110 BPM half-time groove, glitch ticks, rising tension, CTA smash.
    """
    bpm = 110
    beat = 60.0 / bpm
    bar = beat * 4
    n = int(duration * SR)
    drums = np.zeros(n)
    bass = np.zeros(n)
    pulse = np.zeros(n)
    pads = np.zeros(n)
    lead = np.zeros(n)
    sfx = np.zeros(n)
    total_beats = int(duration / beat)
    total_bars = int(duration / bar)

    # Sections (bars, ~2.18s each):
    # 0-2 intro · 2-6 groove · 6-10 lift · 10-16 peak (skin cycle energy)
    # 16-18 CTA smash · 18+ cool-out
    for b in range(total_beats):
        t = b * beat
        bar_i = b // 4
        # intro — sparse pulse + glitch ticks
        if bar_i < 2:
            if b % 8 == 0:
                place(drums, t, half_time_kick(), 0.7)
            if b % 4 == 2:
                place(sfx, t, digital_stutter(0.07), 0.55)
            if b % 2 == 1 and bar_i >= 1:
                place(drums, t, tick(), 0.45)
            continue
        # groove
        if 2 <= bar_i < 6:
            if b % 8 == 0:
                place(drums, t, half_time_kick(), 1.0)
            if b % 8 == 4:
                place(drums, t, snare(), 0.75)
                place(drums, t, clap(), 0.25)
            if b % 2 == 0:
                place(drums, t + beat * 0.5, hat(), 0.5)
            if b % 4 == 3:
                place(sfx, t + beat * 0.75, digital_stutter(0.06), 0.4)
            continue
        # lift — denser hats, more ticks
        if 6 <= bar_i < 10:
            if b % 8 == 0:
                place(drums, t, half_time_kick(), 1.05)
            if b % 4 == 0 and b % 8 != 0:
                place(drums, t, kick(0.22, 120), 0.35)
            if b % 8 == 4:
                place(drums, t, snare(), 0.9)
                place(drums, t, clap(), 0.4)
            place(drums, t + beat * 0.5, hat(), 0.55 + 0.04 * (bar_i - 6))
            if b % 2 == 1:
                place(sfx, t, tick(), 0.35)
            if b % 4 == 2:
                place(sfx, t + beat * 0.25, digital_stutter(0.05), 0.45)
            continue
        # peak — competitive drive (maps to walker / feature climax)
        if 10 <= bar_i < 16:
            if b % 4 == 0:
                place(drums, t, half_time_kick(0.38), 1.15)
            if b % 4 == 2:
                place(drums, t, snare(), 1.0)
                place(drums, t, clap(), 0.55)
            place(drums, t + beat * 0.5, hat(True) if b % 4 == 3 else hat(), 0.72)
            if b % 2 == 0:
                place(sfx, t + beat * 0.25, laser_blip(79 + (b % 4) * 2, 0.07), 0.35)
            if b % 4 == 1:
                place(sfx, t, digital_stutter(0.08), 0.5)
            continue
        # CTA smash zone
        if 16 <= bar_i < 18:
            if b % 4 == 0:
                place(drums, t, half_time_kick(0.45), 1.2)
            if b % 4 == 2:
                place(drums, t, snare(), 1.05)
                place(drums, t, clap(), 0.7)
            place(drums, t + beat * 0.5, hat(), 0.65)
            continue
        # cool-out
        if b % 8 == 0:
            place(drums, t, half_time_kick(0.4), 0.6)
        if b % 8 == 4:
            place(drums, t, hat(), 0.35)

    # Bass — dark minor roots, half-time pocket
    # Em-ish competitive palette
    root_cycle = [28, 28, 26, 31, 28, 24, 26, 31]  # E2 F#2 B2 etc (midi-ish)
    for bar_i in range(1, min(total_bars, 20)):
        root = root_cycle[bar_i % len(root_cycle)]
        g = 0.75 if bar_i < 6 else 0.95 if bar_i < 10 else 1.1 if bar_i < 16 else 1.0
        place(bass, bar_i * bar, bass_note(root, bar * 0.92), g)
        # offbeat ghost octave for drive
        if bar_i >= 6:
            place(bass, bar_i * bar + beat * 2, bass_note(root + 12, beat * 1.6, root + 7), g * 0.55)

    # Sidechain-ish mid pulse (gated saw pad)
    for bar_i in range(2, min(total_bars, 18)):
        dens = 4 if bar_i < 10 else 8
        notes = [52, 55, 59, 62] if bar_i % 2 == 0 else [50, 55, 59, 64]
        for i in range(dens):
            m = notes[i % len(notes)]
            if bar_i >= 10:
                m += 12
            place(
                pulse,
                bar_i * bar + i * (bar / dens),
                arp_pluck(m, beat * (0.35 if dens == 4 else 0.22)),
                0.55 if bar_i < 10 else 0.85,
            )

    # Sparse lead motifs — competitive hook, not rave
    motifs = [
        (6, [64, 67, 71, 67, 64, 62, 59, 62]),
        (8, [67, 71, 74, 71, 67, 64, 62, 64]),
        (10, [71, 74, 76, 74, 71, 67, 64, 67]),
        (12, [74, 76, 79, 76, 74, 71, 67, 71]),
        (14, [76, 79, 83, 79, 76, 74, 71, 74]),
    ]
    for bar_i, notes in motifs:
        if bar_i * bar >= duration:
            continue
        for i, m in enumerate(notes):
            place(lead, bar_i * bar + i * beat * 0.5, lead_saw(m, beat * 0.42, 0.4), 0.75 if bar_i < 10 else 1.05)

    # Pads — dark gold atmosphere
    chords = [
        [40, 43, 47, 52],  # Em
        [38, 43, 47, 50],  # D
        [36, 40, 43, 47],  # C
        [38, 42, 45, 50],  # Dmaj-ish
    ]
    for bar_i in range(0, min(total_bars + 1, 22), 2):
        g = 0.55 if bar_i < 4 else 0.75 if bar_i < 10 else 0.95 if bar_i < 16 else 0.6
        place(pads, bar_i * bar, pad_chord(chords[(bar_i // 2) % 4], bar * 2.3), g)

    # SFX arc
    place(sfx, 2 * bar - 1.0, reverse_cymbal(1.0), 0.55)
    place(sfx, 2 * bar, whoosh(0.45), 0.7)
    place(sfx, 2 * bar, impact(0.55), 0.45)
    place(sfx, 6 * bar - 1.6, riser(1.6), 0.85)
    place(sfx, 6 * bar, whoosh(0.4), 0.75)
    place(sfx, 6 * bar, glitch_hit(0.1), 0.55)
    place(sfx, 10 * bar - 2.0, riser(2.0), 1.0)
    place(sfx, 10 * bar, impact(0.85), 0.9)
    place(sfx, 10 * bar, sub_drop(0.65), 0.85)
    place(sfx, 10 * bar, whoosh(0.5), 0.7)
    # peak cut accents every bar (skin-cut energy)
    for bar_i in range(11, 16):
        place(sfx, bar_i * bar, whoosh(0.28), 0.45)
        place(sfx, bar_i * bar, digital_stutter(0.07), 0.55)
        place(sfx, bar_i * bar + beat * 2, laser_blip(86, 0.06), 0.4)
    # CTA smash
    place(sfx, 16 * bar - 1.8, riser(1.8), 1.15)
    place(sfx, 16 * bar - 0.25, reverse_cymbal(0.25), 0.85)
    place(sfx, 16 * bar, impact(1.15), 1.3)
    place(sfx, 16 * bar, sub_drop(0.85), 1.15)
    place(sfx, 16 * bar, whoosh(0.55, False), 0.75)
    place(sfx, 16 * bar + 0.05, glitch_hit(0.12), 0.7)
    place(sfx, 18 * bar, impact(0.7), 0.55)
    place(sfx, 18 * bar, whoosh(0.9, False), 0.5)

    mono = drums * 0.95 + one_pole_lp(bass, 280) * 0.85 + bass * 0.4
    mono += pulse * 0.7 + lead * 0.8 + pads * 0.75 + sfx * 1.05
    mono = soft_clip(fade_edges(mono, 0.08, 2.2), 1.06)
    return to_stereo(mono, 1.12)


def track_d_themes_x(duration: float = 30.0) -> tuple[np.ndarray, np.ndarray]:
    """
    Arena Pulse timed for Themes X (30s @ 30fps):
      0.0–5.0s   Hook
      4.7–14.0s  Themes sidebar
      13.7–22.1s Walker cycle (6 × ~1.4s cuts)
      21.7–30.0s Outro / CTA
    """
    bpm = 110
    beat = 60.0 / bpm
    n = int(duration * SR)
    drums = np.zeros(n)
    bass = np.zeros(n)
    pulse = np.zeros(n)
    pads = np.zeros(n)
    lead = np.zeros(n)
    sfx = np.zeros(n)

    # Exact cut points from VideoThemesX timeline
    t_hook = 0.0
    t_themes = 140 / 30  # 4.667
    t_walk = 410 / 30  # 13.667
    t_outro = 652 / 30  # 21.733
    skin_dt = 42 / 30  # 1.4s per planeswalker

    # ---- Drums ----
    # Hook: sparse half-time kick + digital ticks
    for i, t in enumerate(np.arange(0, t_themes, beat * 2)):
        place(drums, float(t), half_time_kick(), 0.55 + 0.05 * min(i, 4))
        if i % 2 == 1:
            place(sfx, float(t) + beat * 0.5, digital_stutter(0.06), 0.5)

    # Themes open: groove locks
    for i, t in enumerate(np.arange(t_themes, t_walk, beat)):
        bi = i  # beat index in section
        if bi % 4 == 0:
            place(drums, float(t), half_time_kick(), 0.95)
        if bi % 4 == 2:
            place(drums, float(t), snare(), 0.8)
            place(drums, float(t), clap(), 0.3)
        if bi % 2 == 0:
            place(drums, float(t) + beat * 0.5, hat(), 0.55)
        if bi % 4 == 3:
            place(sfx, float(t) + beat * 0.25, digital_stutter(0.05), 0.4)

    # Walker cycle: denser drive + cut hit every skin
    for i, t in enumerate(np.arange(t_walk, t_outro, beat)):
        bi = i
        if bi % 2 == 0:
            place(drums, float(t), half_time_kick(0.36), 1.1)
        if bi % 4 == 2:
            place(drums, float(t), snare(), 1.0)
            place(drums, float(t), clap(), 0.5)
        place(drums, float(t) + beat * 0.5, hat(True) if bi % 4 == 3 else hat(), 0.7)
        if bi % 2 == 1:
            place(sfx, float(t), laser_blip(81 + (bi % 6) * 2, 0.065), 0.38)

    for k in range(6):
        t = t_walk + k * skin_dt
        place(sfx, t, whoosh(0.32), 0.55 + 0.05 * k)
        place(sfx, t, digital_stutter(0.08), 0.65)
        place(sfx, t, impact(0.45) if k == 0 else glitch_hit(0.09), 0.5 if k else 0.75)

    # Outro / CTA
    for i, t in enumerate(np.arange(t_outro, duration - 0.5, beat)):
        bi = i
        if bi % 4 == 0:
            place(drums, float(t), half_time_kick(0.42), 1.05 if bi < 8 else 0.7)
        if bi % 4 == 2 and bi < 10:
            place(drums, float(t), snare(), 0.9)
            place(drums, float(t), clap(), 0.55)
        if bi < 12:
            place(drums, float(t) + beat * 0.5, hat(), 0.55)

    # ---- Bass ----
    roots_hook = [28, 28, 26, 28]
    for i, t in enumerate(np.arange(0, t_themes, beat * 2)):
        place(bass, float(t), bass_note(roots_hook[i % 4], beat * 1.85), 0.7)

    roots_body = [28, 28, 26, 31, 28, 24, 26, 31]
    for i, t in enumerate(np.arange(t_themes, t_outro, beat * 2)):
        root = roots_body[i % len(roots_body)]
        g = 0.9 if t < t_walk else 1.1
        place(bass, float(t), bass_note(root, beat * 1.9), g)
        if t >= t_walk:
            place(bass, float(t) + beat, bass_note(root + 12, beat * 0.85, root + 7), g * 0.5)

    place(bass, t_outro, bass_note(28, beat * 3.5), 1.05)
    place(bass, t_outro + beat * 4, bass_note(26, beat * 3.5), 0.85)
    place(bass, t_outro + beat * 8, bass_note(28, beat * 4), 0.65)

    # ---- Pulse arps ----
    arp_notes = [52, 55, 59, 62, 59, 55, 52, 50]
    for i, t in enumerate(np.arange(t_themes, t_outro, beat * 0.5)):
        m = arp_notes[i % len(arp_notes)]
        if t >= t_walk:
            m += 12
        place(pulse, float(t), arp_pluck(m, beat * 0.28), 0.55 if t < t_walk else 0.8)

    # ---- Lead hooks ----
    # Themes section motif
    motif_a = [64, 67, 71, 67, 64, 62, 59, 62]
    for i, m in enumerate(motif_a):
        place(lead, t_themes + 1.2 + i * beat * 0.5, lead_saw(m, beat * 0.4, 0.35), 0.7)
    # Peak motif over walker
    motif_b = [71, 74, 76, 74, 71, 67, 64, 67, 74, 76, 79, 76]
    for i, m in enumerate(motif_b):
        place(lead, t_walk + 0.3 + i * beat * 0.5, lead_saw(m, beat * 0.38, 0.45), 1.0)

    # ---- Pads ----
    for t0, chord, g in (
        (0.0, [40, 43, 47, 52], 0.5),
        (t_themes, [38, 43, 47, 50], 0.7),
        (t_themes + 4.5, [36, 40, 43, 47], 0.75),
        (t_walk, [40, 43, 47, 52], 0.9),
        (t_walk + 4.2, [38, 42, 45, 50], 0.95),
        (t_walk + 8.4, [40, 43, 47, 52], 1.0),
        (t_outro, [40, 43, 47, 52], 0.85),
        (t_outro + 4.0, [38, 43, 47, 50], 0.55),
    ):
        place(pads, t0, pad_chord(chord, 4.5), g)

    # ---- SFX scene hits ----
    place(sfx, t_hook + 0.15, whoosh(0.5), 0.55)
    place(sfx, t_hook + 0.2, digital_stutter(0.1), 0.45)

    place(sfx, t_themes - 0.9, reverse_cymbal(0.9), 0.6)
    place(sfx, t_themes, whoosh(0.45), 0.8)
    place(sfx, t_themes, impact(0.55), 0.55)
    place(sfx, t_themes, glitch_hit(0.1), 0.5)

    place(sfx, t_walk - 1.6, riser(1.6), 1.05)
    place(sfx, t_walk, impact(0.9), 1.0)
    place(sfx, t_walk, sub_drop(0.7), 0.95)
    place(sfx, t_walk, whoosh(0.5), 0.75)

    # CTA smash
    place(sfx, t_outro - 1.5, riser(1.5), 1.2)
    place(sfx, t_outro - 0.2, reverse_cymbal(0.2), 0.8)
    place(sfx, t_outro, impact(1.2), 1.35)
    place(sfx, t_outro, sub_drop(0.9), 1.2)
    place(sfx, t_outro, whoosh(0.55, False), 0.8)
    place(sfx, t_outro + 0.04, glitch_hit(0.12), 0.75)
    place(sfx, t_outro + 0.08, digital_stutter(0.1), 0.6)
    # soft landing
    place(sfx, duration - 2.5, whoosh(1.2, False), 0.45)

    mono = drums * 0.95 + one_pole_lp(bass, 280) * 0.85 + bass * 0.4
    mono += pulse * 0.72 + lead * 0.82 + pads * 0.78 + sfx * 1.08
    mono = soft_clip(fade_edges(mono, 0.06, 1.8), 1.07)
    return to_stereo(mono, 1.14)


# ---------------------------------------------------------------------------

def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    DESKTOP.mkdir(parents=True, exist_ok=True)

    tracks = [
        ("A", "acid-climax", lambda: track_a(48.0), "Dark acid electronic — evolving riffs, filter build, drop climax"),
        ("B", "synthwave-climb", lambda: track_b(48.0), "Melodic synthwave — arps + lead, emotional peak"),
        ("C", "trailer-hits", lambda: track_c(48.0), "Cinematic trailer — braams, impacts, hybrid climax"),
        ("D", "arena-pulse", lambda: track_d(48.0), "Competitive esports half-time — glitch ticks, cut hits, CTA smash"),
        ("D30", "arena-pulse-themes-x", lambda: track_d_themes_x(30.0), "Arena Pulse timed for 30s Themes X cut"),
    ]

    print("Generating soundtracks…")
    for letter, slug, fn, desc in tracks:
        print(f"\n[{letter}] {slug}\n    {desc}")
        left, right = fn()
        for dest in (
            PUBLIC / f"soundtrack-{slug}.wav",
            DESKTOP / f"FND-Soundtrack-{letter}-{slug}.wav",
        ):
            write_wav(dest, left, right)

    # Convenience pointer text
    readme = DESKTOP / "FND-OPTIONS-README.txt"
    readme.write_text(
        """Filthy Net Deck — marketing options
=====================================

SOUNDTRACKS
-----------
FND-Soundtrack-A-acid-climax.wav (48s)
  Dark acid electronic. Groove → build → big drop climax.

FND-Soundtrack-B-synthwave-climb.wav (48s)
  Melodic synthwave. Arps + lead; emotional peak around 2/3.

FND-Soundtrack-C-trailer-hits.wav (48s)
  Cinematic trailer energy. Sparse open, braam hits, impact climax.

FND-Soundtrack-D-arena-pulse.wav (48s)
  Competitive esports brand bed. 110 BPM half-time, glitch ticks, CTA smash.

FND-Soundtrack-D30-arena-pulse-themes-x.wav (30s)
  Same vibe, hard-timed to Themes X: hook → sidebar → skin cuts → CTA.
""",
        encoding="utf-8",
    )
    print(f"\nREADME → {readme}")


if __name__ == "__main__":
    main()
