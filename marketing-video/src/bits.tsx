import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import {
  ACID,
  ACID_BRIGHT,
  FONT,
  FOAM,
  GLASS,
  GLASS_EDGE,
  GOLD_LIGHT,
  MUTED,
  NAV,
  PANEL,
  PANEL_EDGE,
} from "./theme";

export const SceneFade: React.FC<{
  durationInFrames: number;
  children: React.ReactNode;
  fadeIn?: number;
  fadeOut?: number;
}> = ({ durationInFrames, children, fadeIn = 16, fadeOut = 16 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, fadeIn, durationInFrames - fadeOut, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const x = interpolate(
    frame,
    [0, fadeIn, durationInFrames - fadeOut, durationInFrames],
    [28, 0, 0, -18],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <div
      style={{
        opacity,
        width: "100%",
        height: "100%",
        transform: `translateX(${x}px)`,
      }}
    >
      {children}
    </div>
  );
};

export const RiseIn: React.FC<{
  delay?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  from?: number;
  dir?: "up" | "left" | "right" | "scale";
}> = ({ delay = 0, children, style, from = 40, dir = "up" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, mass: 0.62, stiffness: 130 },
  });
  let transform = `translateY(${interpolate(s, [0, 1], [from, 0])}px)`;
  if (dir === "left") transform = `translateX(${interpolate(s, [0, 1], [-from, 0])}px)`;
  if (dir === "right") transform = `translateX(${interpolate(s, [0, 1], [from, 0])}px)`;
  if (dir === "scale") transform = `scale(${interpolate(s, [0, 1], [0.88, 1])})`;
  return (
    <div style={{ transform, opacity: s, ...style }}>
      {children}
    </div>
  );
};

export const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontFamily: FONT,
      fontWeight: 800,
      fontSize: 22,
      letterSpacing: "0.34em",
      textTransform: "uppercase",
      color: ACID,
      display: "flex",
      alignItems: "center",
      gap: 14,
    }}
  >
    <span
      style={{
        width: 28,
        height: 2,
        background: ACID,
        boxShadow: "0 0 12px rgba(184,240,0,0.6)",
      }}
    />
    {children}
  </div>
);

export const Headline: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
}> = ({ children, size = 72, color = FOAM }) => (
  <div
    style={{
      fontFamily: FONT,
      fontWeight: 800,
      fontSize: size,
      letterSpacing: "-0.03em",
      lineHeight: 1.05,
      color,
      textShadow: "0 6px 48px rgba(0,0,0,0.75)",
    }}
  >
    {children}
  </div>
);

export const Sub: React.FC<{ children: React.ReactNode; align?: "left" | "center" }> = ({
  children,
  align = "left",
}) => (
  <div
    style={{
      fontFamily: FONT,
      fontSize: 26,
      color: MUTED,
      lineHeight: 1.45,
      maxWidth: 720,
      textAlign: align,
    }}
  >
    {children}
  </div>
);

export const Chip: React.FC<{
  children: React.ReactNode;
  color?: string;
  filled?: boolean;
}> = ({ children, color = ACID_BRIGHT, filled = false }) => (
  <span
    style={{
      fontFamily: FONT,
      fontWeight: 800,
      fontSize: 18,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: filled ? "#0a0c06" : color,
      background: filled ? color : "rgba(10,12,6,0.75)",
      border: `1.5px solid ${color}`,
      borderRadius: 999,
      padding: "8px 18px",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);

export const GlassPanel: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  glow?: boolean;
}> = ({ children, style, glow }) => (
  <div
    style={{
      background: GLASS,
      border: `1.5px solid ${glow ? PANEL_EDGE : GLASS_EDGE}`,
      borderRadius: 18,
      boxShadow: glow
        ? "0 24px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(184,240,0,0.08), 0 0 40px rgba(184,240,0,0.08)"
        : "0 24px 70px rgba(0,0,0,0.55)",
      backdropFilter: "blur(12px)",
      padding: "28px 32px",
      ...style,
    }}
  >
    {children}
  </div>
);

export const SolidPanel: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      background: PANEL,
      border: `1.5px solid ${PANEL_EDGE}`,
      borderRadius: 16,
      boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      padding: "24px 28px",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Fake desktop app window chrome. */
export const AppWindow: React.FC<{
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  width?: number | string;
  height?: number | string;
}> = ({ title = "Filthy Net Deck", children, style, width = 980, height = 560 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 16, mass: 0.75, stiffness: 110 } });
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 16,
        overflow: "hidden",
        background: NAV,
        border: `1.5px solid ${GLASS_EDGE}`,
        boxShadow:
          "0 40px 100px rgba(0,0,0,0.65), 0 0 0 1px rgba(184,240,0,0.06)",
        transform: `translateY(${interpolate(s, [0, 1], [36, 0])}px) scale(${interpolate(s, [0, 1], [0.96, 1])})`,
        opacity: s,
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <div
        style={{
          height: 44,
          background: "rgba(8,10,6,0.95)",
          borderBottom: `1px solid ${GLASS_EDGE}`,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 7 }}>
          {["#f87171", "#fbbf24", "#34d399"].map((c) => (
            <div
              key={c}
              style={{
                width: 11,
                height: 11,
                borderRadius: "50%",
                background: c,
                opacity: 0.85,
              }}
            />
          ))}
        </div>
        <div
          style={{
            flex: 1,
            textAlign: "center",
            fontFamily: FONT,
            fontSize: 14,
            fontWeight: 600,
            color: MUTED,
            letterSpacing: "0.04em",
          }}
        >
          {title}
        </div>
        <div style={{ width: 52 }} />
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>{children}</div>
    </div>
  );
};

/** Sidebar nav mock. */
export const SideNav: React.FC<{ active: string }> = ({ active }) => {
  const items = [
    "Decks",
    "Events",
    "Sets",
    "My Stats",
    "Matchups",
    "Climb",
    "Settings",
  ];
  return (
    <div
      style={{
        width: 168,
        background: "rgba(6,8,4,0.92)",
        borderRight: `1px solid ${GLASS_EDGE}`,
        padding: "18px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 12,
          color: ACID,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 12,
          paddingLeft: 8,
        }}
      >
        FND
      </div>
      {items.map((name) => {
        const on = name === active;
        return (
          <div
            key={name}
            style={{
              fontFamily: FONT,
              fontWeight: on ? 800 : 600,
              fontSize: 15,
              color: on ? "#0a0c06" : MUTED,
              background: on ? ACID : "transparent",
              borderRadius: 8,
              padding: "9px 12px",
              boxShadow: on ? "0 0 20px rgba(184,240,0,0.25)" : undefined,
            }}
          >
            {name}
          </div>
        );
      })}
    </div>
  );
};

export const CountUp: React.FC<{
  to: number;
  delay?: number;
  duration?: number;
  suffix?: string;
  decimals?: number;
  style?: React.CSSProperties;
}> = ({ to, delay = 0, duration = 28, suffix = "", decimals = 0, style }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eased = 1 - Math.pow(1 - t, 3);
  const value = to * eased;
  return (
    <span style={style}>
      {decimals > 0 ? value.toFixed(decimals) : Math.round(value)}
      {suffix}
    </span>
  );
};

export const FillBar: React.FC<{
  progress: number;
  delay?: number;
  duration?: number;
  height?: number;
  color?: string;
}> = ({
  progress,
  delay = 0,
  duration = 24,
  height = 12,
  color = `linear-gradient(90deg, ${ACID}, ${GOLD_LIGHT})`,
}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eased = 1 - Math.pow(1 - t, 3);
  return (
    <div
      style={{
        flex: 1,
        height,
        borderRadius: height,
        background: "rgba(255,255,255,0.06)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${eased * progress * 100}%`,
          height: "100%",
          borderRadius: height,
          background: color,
          boxShadow: "0 0 12px rgba(184,240,0,0.3)",
        }}
      />
    </div>
  );
};

/** Bottom chapter rail */
export const ChapterRail: React.FC<{
  chapters: string[];
  activeIndex: number;
  progress: number;
}> = ({ chapters, activeIndex, progress }) => (
  <div
    style={{
      position: "absolute",
      left: 80,
      right: 80,
      bottom: 22,
      display: "flex",
      gap: 10,
      alignItems: "center",
      zIndex: 20,
    }}
  >
    {chapters.map((c, i) => {
      const on = i === activeIndex;
      const done = i < activeIndex;
      return (
        <div key={c} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
          <div
            style={{
              height: 3,
              borderRadius: 2,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: done ? "100%" : on ? `${progress * 100}%` : "0%",
                background: on || done ? ACID : "transparent",
                boxShadow: on ? "0 0 10px rgba(184,240,0,0.5)" : undefined,
              }}
            />
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 11,
              fontWeight: on ? 800 : 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: on ? ACID : done ? MUTED : "rgba(154,163,138,0.45)",
            }}
          >
            {c}
          </div>
        </div>
      );
    })}
  </div>
);

export const Layout: React.FC<{
  children: React.ReactNode;
  pad?: number;
}> = ({ children, pad = 72 }) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      padding: `${pad}px ${pad + 20}px ${pad + 40}px`,
      boxSizing: "border-box",
    }}
  >
    {children}
  </div>
);

export const LeftCopy: React.FC<{
  children: React.ReactNode;
  width?: number;
}> = ({ children, width = 520 }) => (
  <div
    style={{
      width,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: 18,
      paddingRight: 36,
    }}
  >
    {children}
  </div>
);

export const RightStage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 0,
    }}
  >
    {children}
  </div>
);
