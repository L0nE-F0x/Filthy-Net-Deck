import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Background } from "../Background";
import { ChapterRail, Kicker, RiseIn, SceneFade, Sub } from "../bits";
import { ACID, FONT, FOAM, GOLD_LIGHT } from "../theme";
import { OutroV1, ThemesSpotlight, WalkerCycle } from "./scenes-v1";

/**
 * X-optimized Themes promo — 30s @ 30fps.
 * Hook → Themes sidebar → rapid planeswalker cycle → CTA.
 * Tight enough for the feed, loud enough to stop the scroll.
 */
export const CHAPTERS_THEMES_X = ["Hook", "Themes", "Skins", "Get it"];

export const TOTAL_FRAMES_THEMES_X = 900; // 30s

/* ------------------------------------------------------------------ */
/* Scene 0 — Scroll-stopper hook                                       */
/* ------------------------------------------------------------------ */

const ThemesHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const badge = spring({
    frame: frame - 4,
    fps,
    config: { damping: 11, mass: 0.65, stiffness: 170 },
  });
  const title = spring({
    frame: frame - 16,
    fps,
    config: { damping: 13, mass: 0.75, stiffness: 130 },
  });
  const ring = interpolate(frame, [6, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowPulse = 0.7 + 0.3 * Math.sin(frame / 8);

  const sparks = React.useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => {
        const a = (i / 48) * Math.PI * 2 + (i % 3) * 0.2;
        return {
          angle: a,
          speed: 180 + (i % 7) * 70,
          delay: 4 + (i % 9),
          size: 3 + (i % 5),
          acid: i % 3 !== 0,
        };
      }),
    [],
  );

  const swatches = [
    { c: "#ff7a1a", name: "Chandra" },
    { c: "#7ec8ff", name: "Teferi" },
    { c: "#a855f7", name: "Liliana" },
    { c: "#f0c040", name: "Ajani" },
    { c: "#e0bc4a", name: "Elspeth" },
    { c: "#b8f000", name: "Classic" },
  ];

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {[0, 1].map((k) => {
        const r = ring * (900 + k * 220);
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              width: r,
              height: r,
              borderRadius: "50%",
              border: `2.5px solid ${k === 0 ? ACID : GOLD_LIGHT}`,
              opacity: (1 - ring) * 0.55,
              boxShadow: `0 0 50px ${ACID}40`,
            }}
          />
        );
      })}

      {sparks.map((p, i) => {
        const t = interpolate(frame, [p.delay, p.delay + 55], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const eased = 1 - Math.pow(1 - t, 3);
        const dist = eased * p.speed;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "44%",
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: p.acid ? ACID : GOLD_LIGHT,
              boxShadow: `0 0 12px ${p.acid ? ACID : GOLD_LIGHT}`,
              opacity: 1 - t,
              transform: `translate(${Math.cos(p.angle) * dist}px, ${Math.sin(p.angle) * dist * 0.55}px)`,
            }}
          />
        );
      })}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
          zIndex: 2,
        }}
      >
        <RiseIn delay={0} dir="up" from={24}>
          <Kicker>Filthy Net Deck · v1.1</Kicker>
        </RiseIn>

        <div
          style={{
            transform: `scale(${interpolate(badge, [0, 1], [0.55, 1])})`,
            opacity: badge,
          }}
        >
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: 118,
              letterSpacing: "-0.045em",
              lineHeight: 0.95,
              color: FOAM,
              textAlign: "center",
              textShadow: `0 0 90px ${ACID}${Math.round(glowPulse * 90)
                .toString(16)
                .padStart(2, "0")}, 0 14px 50px rgba(0,0,0,0.85)`,
            }}
          >
            Planeswalker
            <br />
            <span style={{ color: ACID }}>Themes</span>
          </div>
        </div>

        <div
          style={{
            opacity: title,
            transform: `translateY(${interpolate(title, [0, 1], [28, 0])}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <Sub align="center">Six looks. Dark &amp; light still stack. One click in the sidebar.</Sub>
          <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap", justifyContent: "center" }}>
            {swatches.map((s, i) => {
              const pop = spring({
                frame: frame - (28 + i * 3),
                fps,
                config: { damping: 12, stiffness: 160 },
              });
              return (
                <div
                  key={s.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 14px",
                    borderRadius: 999,
                    background: "rgba(10,12,6,0.72)",
                    border: `1.5px solid ${s.c}88`,
                    opacity: pop,
                    transform: `scale(${interpolate(pop, [0, 1], [0.7, 1])})`,
                    boxShadow: `0 0 18px ${s.c}33`,
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: s.c,
                      boxShadow: `0 0 10px ${s.c}`,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: FONT,
                      fontWeight: 800,
                      fontSize: 15,
                      color: FOAM,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {s.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

const SCENES: {
  comp: React.FC;
  from: number;
  duration: number;
  chapter: number;
  fade?: number;
}[] = [
  { comp: ThemesHook, from: 0, duration: 150, chapter: 0 },
  { comp: ThemesSpotlight, from: 140, duration: 280, chapter: 1 },
  {
    comp: () => <WalkerCycle sliceDuration={42} />,
    from: 410,
    duration: 252,
    chapter: 2,
    fade: 6,
  },
  { comp: OutroV1, from: 652, duration: 248, chapter: 3 },
];

const ChapterOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  let active = 0;
  let progress = 0;
  for (const s of SCENES) {
    if (frame >= s.from && frame < s.from + s.duration) {
      active = s.chapter;
      progress = (frame - s.from) / s.duration;
      break;
    }
    if (frame >= s.from + s.duration) {
      active = s.chapter;
      progress = 1;
    }
  }
  const opacity = interpolate(
    frame,
    [0, 16, TOTAL_FRAMES_THEMES_X - 30, TOTAL_FRAMES_THEMES_X],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <div style={{ opacity }}>
      <ChapterRail chapters={CHAPTERS_THEMES_X} activeIndex={active} progress={progress} />
    </div>
  );
};

export const FilthyNetDeckThemesX: React.FC = () => (
  <AbsoluteFill>
    <Background />
    {/* Arena Pulse — 30s bed hard-timed to hook → skins → CTA */}
    <Audio src={staticFile("soundtrack-arena-pulse-themes-x.wav")} volume={0.9} />
    {SCENES.map(({ comp: Comp, from, duration, fade }) => (
      <Sequence key={`${from}-${duration}`} from={from} durationInFrames={duration}>
        <SceneFade durationInFrames={duration} fadeIn={fade ?? 12} fadeOut={fade ?? 12}>
          <Comp />
        </SceneFade>
      </Sequence>
    ))}
    <ChapterOverlay />
  </AbsoluteFill>
);
