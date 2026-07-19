import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  ACID,
  ACID_BRIGHT,
  FONT,
  FOAM,
  GLASS_EDGE,
  GOLD,
  GOLD_LIGHT,
  MUTED,
  NAV,
} from "../theme";
import { Chip, GlassPanel, Headline, Kicker, Layout, RiseIn, Sub } from "../bits";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const rand = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** Small tinted app-window silhouette used inside the skin slices. */
const MiniApp: React.FC<{ accent: string; ink: string; bright: string }> = ({
  accent,
  ink,
  bright,
}) => (
  <div
    style={{
      width: 520,
      borderRadius: 14,
      overflow: "hidden",
      background: ink,
      border: `1.5px solid ${accent}55`,
      boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 50px ${accent}22`,
    }}
  >
    <div
      style={{
        height: 34,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 14px",
        background: "rgba(0,0,0,0.35)",
        borderBottom: `1px solid ${accent}33`,
      }}
    >
      {["#f87171", "#fbbf24", "#34d399"].map((c) => (
        <div key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.8 }} />
      ))}
      <div style={{ flex: 1, textAlign: "center", fontFamily: FONT, fontSize: 12, color: bright, opacity: 0.75 }}>
        Filthy Net Deck
      </div>
    </div>
    <div style={{ display: "flex", height: 200 }}>
      <div style={{ width: 120, borderRight: `1px solid ${accent}22`, padding: 12, display: "flex", flexDirection: "column", gap: 7 }}>
        {[0.9, 0.55, 0.55, 0.55, 0.55].map((o, i) => (
          <div
            key={i}
            style={{
              height: 16,
              borderRadius: 5,
              background: i === 0 ? accent : `${bright}22`,
              opacity: i === 0 ? 0.95 : o,
            }}
          />
        ))}
        <div style={{ marginTop: "auto", display: "flex", gap: 5 }}>
          {[accent, bright, `${bright}55`].map((c, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: c }} />
          ))}
        </div>
      </div>
      <div style={{ flex: 1, padding: 14, display: "flex", flexDirection: "column", gap: 9 }}>
        {[86, 68, 92, 54, 74].map((w, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 20, height: 20, borderRadius: 5, background: `${accent}55` }} />
            <div style={{ height: 12, width: `${w}%`, borderRadius: 6, background: `${bright}1f` }} />
            <div style={{ height: 12, width: 34, borderRadius: 6, background: `${accent}88`, marginLeft: "auto" }} />
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Glyphs (viewBox 0 0 100 100, stroke/fill via currentColor-ish)      */
/* ------------------------------------------------------------------ */

const Glyph: React.FC<{ g: { d: string; filled: boolean }; color: string; size: number }> = ({
  g,
  color,
  size,
}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ filter: `drop-shadow(0 0 18px ${color}66)` }}>
    <path
      d={g.d}
      fill={g.filled ? color : "none"}
      stroke={g.filled ? "none" : color}
      strokeWidth={7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const GLYPHS: Record<string, { d: string; filled: boolean }> = {
  spark: { d: "M50 2 L61 39 L98 50 L61 61 L50 98 L39 61 L2 50 L39 39 Z", filled: true },
  flame: { d: "M50 4 C58 24 84 34 84 62 A34 34 0 1 1 16 62 C16 42 34 34 39 18 C43 31 52 35 57 27 C53 19 50 11 50 4 Z", filled: true },
  hourglass: { d: "M22 8 H78 L56 50 L78 92 H22 L44 50 Z", filled: true },
  skull: { d: "M50 8 A30 30 0 0 1 80 42 C80 56 72 62 66 66 V80 H34 V66 C28 62 20 56 20 42 A30 30 0 0 1 50 8 Z", filled: true },
  paw: { d: "M50 46 A22 18 0 1 1 50 82 A22 18 0 1 1 50 46 Z", filled: true },
  shield: { d: "M50 4 L86 20 V50 C86 74 68 88 50 96 C32 88 14 74 14 50 V20 Z", filled: true },
  chart: { d: "M14 86 V44 M38 86 V26 M62 86 V56 M86 86 V14", filled: false },
  pulse: { d: "M6 50 H30 L40 26 L54 74 L64 50 H94", filled: false },
  climb: { d: "M14 84 H86 M22 84 V60 H42 V84 M50 84 V38 H70 V84 M56 26 L74 12 L92 26", filled: false },
  swords: { d: "M22 22 L70 70 M70 70 L82 82 M82 22 L34 70 M34 70 L22 82", filled: false },
  radar: { d: "M50 50 L50 12 M50 50 A38 38 0 1 1 49 12 M50 50 A22 22 0 1 1 49 28", filled: false },
  grid: { d: "M16 16 H44 V44 H16 Z M56 16 H84 V44 H56 Z M16 56 H44 V84 H16 Z M56 56 H84 V84 H56 Z", filled: true },
  eye: { d: "M6 50 C24 26 76 26 94 50 C76 74 24 74 6 50 Z", filled: true },
  bolt: { d: "M56 4 L20 56 H44 L40 96 L78 40 H52 Z", filled: true },
};

/* ------------------------------------------------------------------ */
/* Scene 1 — Intro: v1 celebration burst                               */
/* ------------------------------------------------------------------ */

export const IntroBurst: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const badge = spring({ frame: frame - 8, fps, config: { damping: 12, mass: 0.7, stiffness: 160 } });
  const title = spring({ frame: frame - 20, fps, config: { damping: 14, mass: 0.8, stiffness: 120 } });
  const ring = interpolate(frame, [10, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glowPulse = 0.75 + 0.25 * Math.sin(frame / 9);

  const confetti = React.useMemo(
    () =>
      Array.from({ length: 110 }, (_, i) => ({
        angle: rand(i) * Math.PI * 2,
        speed: 260 + rand(i + 200) * 720,
        delay: 6 + rand(i + 400) * 14,
        size: 3 + rand(i + 600) * 7,
        spin: rand(i + 800) * 360,
        acid: rand(i + 1000) > 0.35,
        rect: rand(i + 1200) > 0.6,
      })),
    [],
  );

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* shockwave rings */}
      {[0, 1].map((k) => {
        const r = ring * (1100 + k * 260);
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              width: r,
              height: r,
              borderRadius: "50%",
              border: `3px solid ${k === 0 ? ACID : GOLD}`,
              opacity: (1 - ring) * 0.5,
              boxShadow: `0 0 60px ${ACID}44`,
            }}
          />
        );
      })}

      {/* confetti burst */}
      {confetti.map((p, i) => {
        const t = interpolate(frame, [p.delay, p.delay + 70], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const eased = 1 - Math.pow(1 - t, 3);
        const dist = eased * p.speed;
        const fall = Math.pow(t, 2) * 160;
        const x = Math.cos(p.angle) * dist;
        const y = Math.sin(p.angle) * dist * 0.62 + fall;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "42%",
              width: p.rect ? p.size * 0.6 : p.size,
              height: p.rect ? p.size * 1.7 : p.size,
              borderRadius: p.rect ? 2 : "50%",
              background: p.acid ? ACID : GOLD_LIGHT,
              boxShadow: `0 0 10px ${p.acid ? ACID : GOLD}88`,
              opacity: 1 - t,
              transform: `translate(${x}px, ${y}px) rotate(${p.spin + eased * 320}deg)`,
            }}
          />
        );
      })}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26, zIndex: 2 }}>
        <RiseIn delay={2} dir="up" from={30}>
          <Kicker>Filthy Net Deck</Kicker>
        </RiseIn>

        <div style={{ transform: `scale(${interpolate(badge, [0, 1], [0.4, 1])})`, opacity: badge }}>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: 210,
              letterSpacing: "-0.05em",
              lineHeight: 1,
              color: FOAM,
              textShadow: `0 0 90px ${ACID}${Math.round(glowPulse * 80).toString(16).padStart(2, "0")}, 0 12px 60px rgba(0,0,0,0.8)`,
            }}
          >
            v1<span style={{ color: ACID }}>.</span>1
          </div>
        </div>

        <div style={{ opacity: title, transform: `translateY(${interpolate(title, [0, 1], [34, 0])}px)`, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <Headline size={58}>Planeswalker themes.</Headline>
          <Sub align="center">Six accent skins. Dark &amp; light still stack. Your deck. Your color.</Sub>
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <Chip filled>Free</Chip>
            <Chip>Windows + macOS</Chip>
            <Chip color={GOLD_LIGHT}>Chandra · Liliana · more</Chip>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 2 — Feature montage: everything that shipped in v1            */
/* ------------------------------------------------------------------ */

const FEATURES: { icon: keyof typeof GLYPHS; title: string; line: string }[] = [
  { icon: "chart", title: "Live Meta", line: "Standard + Pioneer decklists, refreshed daily" },
  { icon: "pulse", title: "Winrate Tracker", line: "Reads your local Player.log automatically" },
  { icon: "climb", title: "Climb Tracker", line: "Path-by-deck, streaks, season compare" },
  { icon: "swords", title: "Matchup Lab", line: "Archetype-vs-archetype intel" },
  { icon: "radar", title: "Set Radar", line: "Spoilers, rotation impact, B&R pulse" },
  { icon: "grid", title: "Format Hub", line: "Rotation, bans and pool snapshots" },
  { icon: "eye", title: "Card Watch", line: "Ctrl+K any card, track its price pulse" },
  { icon: "bolt", title: "Arena Import", line: "Paste a deck straight from Arena" },
];

export const FeatureMontage: React.FC = () => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, 440], [1, 1.07], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <Layout pad={70}>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 34, transform: `scale(${zoom})`, transformOrigin: "50% 45%" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <RiseIn delay={0}>
                <Kicker>One year of nightly builds</Kicker>
              </RiseIn>
              <RiseIn delay={6}>
                <Headline size={64}>Everything shipped in v1.</Headline>
              </RiseIn>
            </div>
            <RiseIn delay={10} dir="right">
              <Chip color={GOLD_LIGHT}>8 pillars</Chip>
            </RiseIn>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {FEATURES.map((f, i) => {
              const delay = 14 + i * 7;
              const sweep = interpolate(frame, [delay + 46 + i * 4, delay + 66 + i * 4], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <RiseIn key={f.title} delay={delay} dir="up" from={54}>
                  <GlassPanel
                    glow={sweep > 0.2}
                    style={{
                      height: 208,
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: `linear-gradient(120deg, transparent 30%, rgba(184,240,0,${0.1 * (1 - Math.abs(sweep * 2 - 1))}) 50%, transparent 70%)`,
                      }}
                    />
                    <Glyph g={GLYPHS[f.icon]} color={f.icon === "bolt" ? GOLD_LIGHT : ACID} size={44} />
                    <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 27, color: FOAM }}>{f.title}</div>
                    <div style={{ fontFamily: FONT, fontSize: 18.5, lineHeight: 1.4, color: MUTED }}>{f.line}</div>
                  </GlassPanel>
                </RiseIn>
              );
            })}
          </div>

          <RiseIn delay={84}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Chip>Signed in-app updates</Chip>
              <Chip>Light mode</Chip>
              <Chip>Local-first · your data stays on your PC</Chip>
            </div>
          </RiseIn>
        </div>
      </Layout>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 3 — Themes spotlight: the sidebar Themes menu                 */
/* ------------------------------------------------------------------ */

export const THEMES: {
  name: string;
  walker: string;
  blurb: string;
  glyph: keyof typeof GLYPHS;
  ink: string;
  inkSoft: string;
  accent: string;
  bright: string;
}[] = [
  { name: "Chandra", walker: "Chandra Nalaar", blurb: "Reds, embers, molten gold", glyph: "flame", ink: "#1a0a08", inkSoft: "#2a1410", accent: "#ff7a1a", bright: "#ffe0b0" },
  { name: "Teferi", walker: "Teferi, Time Raveler", blurb: "Cool blues & ivory whites", glyph: "hourglass", ink: "#081018", inkSoft: "#122030", accent: "#7ec8ff", bright: "#e8f4ff" },
  { name: "Liliana", walker: "Liliana Vess", blurb: "Deep violets & deathly pinks", glyph: "skull", ink: "#100818", inkSoft: "#1e1230", accent: "#a855f7", bright: "#f3e8ff" },
  { name: "Ajani", walker: "Ajani Goldmane", blurb: "Warm white-gold & tawny amber", glyph: "paw", ink: "#16140c", inkSoft: "#282418", accent: "#f0c040", bright: "#faf0c8" },
  { name: "Elspeth", walker: "Elspeth Tirel", blurb: "Steel white & noble gold", glyph: "shield", ink: "#10141a", inkSoft: "#1c2430", accent: "#e0bc4a", bright: "#f0d999" },
  { name: "Classic", walker: "The original look", blurb: "Ink & gold — filthy default", glyph: "spark", ink: "#0a0c08", inkSoft: "#14170f", accent: "#b8f000", bright: "#f2f4ea" },
];

export const ThemesSpotlight: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const open = spring({ frame: frame - 26, fps, config: { damping: 18, mass: 0.8, stiffness: 110 } });
  const rows = 6;

  return (
    <AbsoluteFill>
      <Layout pad={66}>
        <div style={{ display: "flex", width: "100%", alignItems: "center", gap: 60 }}>
          {/* Left copy */}
          <div style={{ width: 560, flexShrink: 0, display: "flex", flexDirection: "column", gap: 20 }}>
            <RiseIn delay={0}>
              <Kicker>New in v1.1</Kicker>
            </RiseIn>
            <RiseIn delay={6}>
              <Headline size={76}>
                Make it <span style={{ color: ACID }}>yours.</span>
            </Headline>
            </RiseIn>
            <RiseIn delay={12}>
              <Sub>
                The new <b style={{ color: FOAM }}>Themes</b> menu lives right in the sidebar — six planeswalker
                looks on top of dark &amp; light. No pop-ups, no covering your decks.
              </Sub>
            </RiseIn>
            <RiseIn delay={20}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Chip filled>Themes</Chip>
                <Chip>Dark + Light</Chip>
                <Chip color={GOLD_LIGHT}>6 planeswalkers</Chip>
              </div>
            </RiseIn>
          </div>

          {/* Right: sidebar mock with Themes accordion */}
          <RiseIn delay={10} dir="right" from={70} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <div
              style={{
                width: 420,
                borderRadius: 18,
                overflow: "hidden",
                background: NAV,
                border: `1.5px solid ${GLASS_EDGE}`,
                boxShadow: "0 40px 100px rgba(0,0,0,0.65), 0 0 60px rgba(184,240,0,0.08)",
                padding: "22px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minHeight: 640,
              }}
            >
              <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 13, color: ACID, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
                FND
              </div>
              {["Decks", "My Stats", "Matchups", "Climb"].map((n) => (
                <div key={n} style={{ fontFamily: FONT, fontWeight: 600, fontSize: 17, color: MUTED, padding: "10px 12px" }}>
                  {n}
                </div>
              ))}

              <div style={{ flex: 1 }} />

              {/* Themes accordion */}
              <div
                style={{
                  borderRadius: 14,
                  border: `1.5px solid ${ACID}44`,
                  background: "rgba(184,240,0,0.05)",
                  overflow: "hidden",
                  boxShadow: `0 0 ${30 * open}px rgba(184,240,0,${0.12 * open})`,
                }}
              >
                <div style={{ maxHeight: interpolate(open, [0, 1], [0, 560]), overflow: "hidden" }}>
                  {/* dark / light segmented */}
                  <div style={{ display: "flex", gap: 8, padding: "14px 14px 6px" }}>
                    {["Dark", "Light"].map((m, i) => (
                      <div
                        key={m}
                        style={{
                          flex: 1,
                          textAlign: "center",
                          fontFamily: FONT,
                          fontWeight: 800,
                          fontSize: 15,
                          padding: "9px 0",
                          borderRadius: 9,
                          background: i === 0 ? ACID : "rgba(255,255,255,0.06)",
                          color: i === 0 ? "#0a0c06" : MUTED,
                          border: `1px solid ${i === 0 ? ACID : GLASS_EDGE}`,
                        }}
                      >
                        {m}
                      </div>
                    ))}
                  </div>
                  {/* skin rows */}
                  {THEMES.map((t, i) => {
                    const rowS = spring({ frame: frame - (38 + i * 5), fps, config: { damping: 16, stiffness: 140 } });
                    return (
                      <div
                        key={t.name}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "9px 14px",
                          opacity: rowS,
                          transform: `translateX(${interpolate(rowS, [0, 1], [26, 0])}px)`,
                          background: t.name === "Classic" ? "rgba(184,240,0,0.08)" : "transparent",
                          borderRadius: 10,
                        }}
                      >
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: `conic-gradient(${t.accent} 0 50%, ${t.inkSoft} 50% 100%)`, border: `1.5px solid ${t.accent}` }} />
                        <div>
                          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 17, color: FOAM }}>{t.name}</div>
                          <div style={{ fontFamily: FONT, fontSize: 12.5, color: MUTED }}>{t.walker}</div>
                        </div>
                        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                          {[t.ink, t.accent, t.bright].map((c, k) => (
                            <div key={k} style={{ width: 12, height: 12, borderRadius: 3, background: c, border: `1px solid ${GLASS_EDGE}` }} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "13px 16px",
                    borderTop: `1px solid ${ACID}22`,
                    fontFamily: FONT,
                    fontWeight: 800,
                    fontSize: 17,
                    color: FOAM,
                  }}
                >
                  Themes
                  <span style={{ color: ACID, transform: `rotate(${interpolate(open, [0, 1], [0, 180])}deg)`, display: "inline-block" }}>▾</span>
                </div>
              </div>
            </div>
          </RiseIn>
        </div>
      </Layout>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 4 — Planeswalker cycle (lands on the drop)                    */
/* ------------------------------------------------------------------ */

export const WalkerCycle: React.FC<{ sliceDuration?: number }> = ({ sliceDuration = 51 }) => {
  const frame = useCurrentFrame();
  const idx = Math.min(THEMES.length - 1, Math.floor(frame / sliceDuration));
  const local = frame - idx * sliceDuration;
  const t = THEMES[idx];

  const enter = interpolate(local, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const eased = 1 - Math.pow(1 - enter, 3);
  const flash = interpolate(local, [0, 5], [0.85, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const drift = Math.sin((frame + idx * 40) / 18) * 24;

  const embers = React.useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        x: rand(idx * 100 + i) * 100,
        y: rand(idx * 100 + i + 40) * 100,
        s: 2 + rand(idx * 100 + i + 80) * 5,
        sp: 0.5 + rand(idx * 100 + i + 120) * 1.4,
      })),
    [idx],
  );

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 90% 75% at 50% 38%, ${t.inkSoft} 0%, ${t.ink} 62%, #030402 100%)` }}>
      {/* accent orbs */}
      <div style={{ position: "absolute", right: -120 + drift, top: 60, width: 760, height: 760, borderRadius: "50%", background: `radial-gradient(circle, ${t.accent}2e, transparent 65%)` }} />
      <div style={{ position: "absolute", left: -160 - drift, bottom: -180, width: 860, height: 860, borderRadius: "50%", background: `radial-gradient(circle, ${t.accent}1e, transparent 68%)` }} />

      {/* rising embers */}
      {embers.map((p, i) => {
        const y = (p.y - frame * p.sp * 0.35 + 200) % 110;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${y - 5}%`,
              width: p.s,
              height: p.s,
              borderRadius: "50%",
              background: t.accent,
              opacity: 0.3,
              boxShadow: `0 0 ${p.s * 4}px ${t.accent}`,
            }}
          />
        );
      })}

      {/* cut flash */}
      <div style={{ position: "absolute", inset: 0, background: t.accent, opacity: flash }} />

      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", padding: "0 110px", gap: 70, transform: `scale(${interpolate(eased, [0, 1], [1.12, 1])})` }}>
        {/* left: glyph + name */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18, opacity: eased, transform: `translateX(${interpolate(eased, [0, 1], [-60, 0])}px)` }}>
          <Glyph g={GLYPHS[t.glyph]} color={t.accent} size={120} />
          <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 108, letterSpacing: "-0.04em", lineHeight: 1, color: t.bright, textShadow: `0 10px 60px rgba(0,0,0,0.7), 0 0 70px ${t.accent}55` }}>
            {t.name}
          </div>
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 24, letterSpacing: "0.22em", textTransform: "uppercase", color: t.accent }}>
            {t.walker}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 25, color: t.bright, opacity: 0.72 }}>
            {t.blurb}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            {[t.ink, t.accent, t.bright].map((c, i) => (
              <div key={i} style={{ width: 46, height: 46, borderRadius: 10, background: c, border: `1.5px solid ${t.bright}44`, boxShadow: "0 8px 24px rgba(0,0,0,0.45)" }} />
            ))}
          </div>
        </div>

        {/* right: tinted app */}
        <div style={{ opacity: eased, transform: `translateX(${interpolate(eased, [0, 1], [70, 0])}px) rotate(-1.5deg)` }}>
          <MiniApp accent={t.accent} ink={t.ink} bright={t.bright} />
        </div>
      </div>

      {/* progress dots */}
      <div style={{ position: "absolute", bottom: 66, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 14 }}>
        {THEMES.map((th, i) => (
          <div
            key={th.name}
            style={{
              width: i === idx ? 34 : 13,
              height: 13,
              borderRadius: 8,
              background: i === idx ? th.accent : `${th.accent}44`,
              boxShadow: i === idx ? `0 0 16px ${th.accent}` : undefined,
              transition: "width 0.2s",
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 5 — Outro                                                     */
/* ------------------------------------------------------------------ */

export const OutroV1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 15, mass: 0.75, stiffness: 120 } });
  const glow = 0.7 + 0.3 * Math.sin(frame / 10);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, opacity: s, transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)` }}>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 92,
            letterSpacing: "-0.04em",
            color: FOAM,
            textShadow: `0 0 ${70 * glow}px ${ACID}66, 0 10px 50px rgba(0,0,0,0.8)`,
          }}
        >
          Filthy <span style={{ color: ACID }}>Net</span> Deck
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Chip filled>v1.1.1 — out now</Chip>
          <Chip color={GOLD_LIGHT}>Free</Chip>
        </div>
        <RiseIn delay={10}>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 34,
              letterSpacing: "0.02em",
              color: FOAM,
              background: "rgba(184,240,0,0.1)",
              border: `2px solid ${ACID}`,
              borderRadius: 14,
              padding: "16px 40px",
              boxShadow: `0 0 44px ${ACID}33`,
              marginTop: 8,
            }}
          >
            filthy-net-deck.netlify.app
          </div>
        </RiseIn>
        <RiseIn delay={20}>
          <div style={{ fontFamily: FONT, fontSize: 19, color: MUTED, marginTop: 10 }}>
            Built by <span style={{ color: GOLD_LIGHT, fontWeight: 700 }}>ApexForge</span> · ame-apexforge.org
          </div>
        </RiseIn>
      </div>
    </AbsoluteFill>
  );
};
