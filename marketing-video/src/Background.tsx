import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { ACID, GOLD, INK } from "./theme";

/**
 * Cinematic atmosphere — diagonal light, parallax dust, soft film grain.
 */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 100) * 30;
  const drift2 = Math.cos(frame / 130) * 40;
  const pulse = 0.88 + 0.12 * Math.sin(frame / 50);

  const dust = React.useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        x: (i * 47.3) % 100,
        y: (i * 73.1) % 100,
        s: 1.2 + (i % 5) * 0.6,
        sp: 0.04 + (i % 6) * 0.03,
        ph: i * 0.55,
        gold: i % 4 === 0,
      })),
    [],
  );

  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {/* Deep base */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 100% 80% at 70% 20%, #12160c 0%, #050604 55%, #030402 100%)",
        }}
      />

      {/* Diagonal light shaft */}
      <div
        style={{
          position: "absolute",
          left: "35%",
          top: -200,
          width: 520,
          height: 1600,
          transform: `rotate(28deg) translateX(${drift}px)`,
          background: `linear-gradient(180deg, rgba(184,240,0,${0.07 * pulse}), transparent 70%)`,
          filter: "blur(8px)",
          opacity: 0.85,
        }}
      />

      {/* Orbs */}
      <div
        style={{
          position: "absolute",
          right: -80 + drift2,
          top: 200 + drift,
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(212,168,75,${0.11 * pulse}), transparent 65%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -120 + drift,
          bottom: -100,
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(184,240,0,${0.1 * pulse}), transparent 68%)`,
        }}
      />

      {/* Perspective floor grid */}
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, opacity: 0.5 }}
      >
        <defs>
          <linearGradient id="floorFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="55%" stopColor="white" stopOpacity="0" />
            <stop offset="100%" stopColor="white" stopOpacity="0.7" />
          </linearGradient>
          <pattern
            id="floorGrid"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(0 ${((frame * 0.6) % 80) - 80})`}
          >
            <path
              d="M 80 0 L 0 0 0 80"
              fill="none"
              stroke={ACID}
              strokeOpacity={0.08}
              strokeWidth={1}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#floorGrid)" opacity={0.7} />
        <rect
          y="55%"
          width="100%"
          height="45%"
          fill="url(#floorGrid)"
          opacity={0.9}
          style={{ mask: "url(#none)" }}
        />
      </svg>

      {/* Dust motes */}
      {dust.map((p, i) => {
        const y = (p.y + frame * p.sp) % 110;
        const x = p.x + Math.sin(frame / 50 + p.ph) * 1.5;
        const tw = 0.5 + 0.5 * Math.sin(frame / 14 + p.ph);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y - 5}%`,
              width: p.s,
              height: p.s,
              borderRadius: "50%",
              background: p.gold ? GOLD : ACID,
              opacity: 0.12 * tw,
              boxShadow: `0 0 ${p.s * 4}px ${p.gold ? GOLD : ACID}`,
            }}
          />
        );
      })}

      {/* Film grain (CSS noise approximation via repeating radial) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.04 + 0.015 * Math.sin(frame * 1.7),
          backgroundImage:
            "repeating-radial-gradient(circle at 17% 32%, rgba(255,255,255,0.12) 0 0.5px, transparent 1px 3px)",
          backgroundSize: "140px 140px",
          backgroundPosition: `${frame % 7}px ${(frame * 1.3) % 5}px`,
          pointerEvents: "none",
          mixBlendMode: "overlay",
        }}
      />

      {/* Top/bottom letterbox bars for cinema feel */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 48,
          background: "linear-gradient(180deg, rgba(0,0,0,0.75), transparent)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 56,
          background: "linear-gradient(0deg, rgba(0,0,0,0.8), transparent)",
        }}
      />

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 55% 45%, transparent 40%, rgba(0,0,0,0.55))",
          pointerEvents: "none",
        }}
      />

      {/* Subtle top hairline */}
      <div
        style={{
          position: "absolute",
          left: "8%",
          right: "8%",
          top: 48,
          height: 1,
          background: `linear-gradient(90deg, transparent, rgba(184,240,0,${interpolate(Math.sin(frame / 25), [-1, 1], [0.15, 0.45])}), transparent)`,
        }}
      />
    </AbsoluteFill>
  );
};
