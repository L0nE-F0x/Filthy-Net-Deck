#!/usr/bin/env python3
"""
Three marketing soundtrack options for Filthy Net Deck.
Each has arrangement arc, SFX (whoosh/impact/riser/glitch), and a real climax.

  A — Acid Climax: dark electronic, evolving filter, big drop at ~65%
  B — Synthwave Climb: melodic arps + pads, emotional peak
  C — Trailer Hits: sparse → thunder impacts, hybrid trailer energy

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

def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    DESKTOP.mkdir(parents=True, exist_ok=True)

    tracks = [
        ("A", "acid-climax", track_a, "Dark acid electronic — evolving riffs, filter build, drop climax"),
        ("B", "synthwave-climb", track_b, "Melodic synthwave — arps + lead, emotional peak"),
        ("C", "trailer-hits", track_c, "Cinematic trailer — braams, impacts, hybrid climax"),
    ]

    print("Generating soundtracks…")
    for letter, slug, fn, desc in tracks:
        print(f"\n[{letter}] {slug}\n    {desc}")
        left, right = fn(48.0)
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

SOUNDTRACKS (play these alone — 48s each)
-----------------------------------------
FND-Soundtrack-A-acid-climax.wav
  Dark acid electronic. Groove → build → big drop climax with whooshes/impacts.

FND-Soundtrack-B-synthwave-climb.wav
  Melodic synthwave. Arps + lead line; emotional peak around 2/3.

FND-Soundtrack-C-trailer-hits.wav
  Cinematic trailer energy. Sparse open, braam hits, impact barrage climax.

STYLE VIDEOS (when rendered)
----------------------------
FND-Style-Neon-Terminal.mp4     + soundtrack A
FND-Style-Brutalist-Punch.mp4   + soundtrack B
FND-Style-Trailer-Kinetic.mp4   + soundtrack C

Pick a style + a soundtrack and we can mix any combo for a final cut.
""",
        encoding="utf-8",
    )
    print(f"\nREADME → {readme}")


if __name__ == "__main__":
    main()
