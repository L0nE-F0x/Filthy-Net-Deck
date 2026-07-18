import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  AppWindow,
  Chip,
  CountUp,
  FillBar,
  GlassPanel,
  Headline,
  Kicker,
  Layout,
  LeftCopy,
  RiseIn,
  RightStage,
  SideNav,
  SolidPanel,
  Sub,
} from "./bits";
import {
  ACID,
  ACID_BRIGHT,
  FONT,
  FOAM,
  GLASS_EDGE,
  GOLD_LIGHT,
  GOOD,
  MONO,
  MUTED,
  POOR,
  WARN,
} from "./theme";

// ---------------------------------------------------------------------------
// 1. Cinematic open — asymmetric brand
// ---------------------------------------------------------------------------

export const IntroV2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.8, stiffness: 120 } });
  const glow = 0.5 + 0.5 * Math.sin(frame / 9);

  return (
    <AbsoluteFill>
      <Layout>
        <LeftCopy width={700}>
          <RiseIn delay={4}>
            <Kicker>MTG Arena companion · v0.19</Kicker>
          </RiseIn>
          <RiseIn delay={10}>
            <Headline size={96}>
              Filthy
              <br />
              Net Deck
            </Headline>
          </RiseIn>
          <RiseIn delay={20}>
            <div
              style={{
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: 40,
                color: ACID_BRIGHT,
                textShadow: `0 0 ${28 * glow}px rgba(184,240,0,0.4)`,
              }}
            >
              Netdeck dirty. Climb clean.
            </div>
          </RiseIn>
          <RiseIn delay={30}>
            <Sub>
              Daily meta, format legality, local winrates, matchup intel, and
              one-click Arena import — desktop-native, 100% on your PC.
            </Sub>
          </RiseIn>
          <RiseIn delay={40}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Chip filled>Windows</Chip>
              <Chip filled>macOS</Chip>
              <Chip>Standard + Pioneer</Chip>
              <Chip color={GOLD_LIGHT}>100% local</Chip>
            </div>
          </RiseIn>
        </LeftCopy>
        <RightStage>
          <div
            style={{
              transform: `scale(${interpolate(pop, [0, 1], [1.5, 1])}) rotate(${interpolate(pop, [0, 1], [8, -3])}deg)`,
              opacity: pop,
              filter: `drop-shadow(0 0 ${50 * glow}px rgba(184,240,0,0.55))`,
            }}
          >
            <Img src={staticFile("app-icon.png")} style={{ width: 380, height: 380 }} />
          </div>
        </RightStage>
      </Layout>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// 2. Decks home — Deck to beat hero
// ---------------------------------------------------------------------------

export const DecksHomeV2: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Layout>
        <LeftCopy>
          <RiseIn>
            <Kicker>Decks home</Kicker>
          </RiseIn>
          <RiseIn delay={6}>
            <Headline size={68}>The deck to beat. Front and center.</Headline>
          </RiseIn>
          <RiseIn delay={16}>
            <Sub>
              Redesigned home: big stats, top 8 at a glance, Bo1/Bo3 toggle —
              steal the list that is actually winning today.
            </Sub>
          </RiseIn>
        </LeftCopy>
        <RightStage>
          <AppWindow title="Filthy Net Deck — Decks" width={920} height={520}>
            <SideNav active="Decks" />
            <div style={{ flex: 1, padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                style={{
                  background: "linear-gradient(135deg, rgba(184,240,0,0.12), rgba(212,168,75,0.08))",
                  border: `1px solid ${GLASS_EDGE}`,
                  borderRadius: 14,
                  padding: "20px 22px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: FONT,
                      fontSize: 12,
                      letterSpacing: "0.16em",
                      color: ACID,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    Deck to beat · Standard BO1
                  </div>
                  <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 30, color: FOAM }}>
                    Selesnya Ouroboroid
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 15, color: MUTED, marginTop: 4 }}>
                    Real ranked lists · Scryfall verified
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontFamily: FONT,
                      fontWeight: 800,
                      fontSize: 48,
                      color: ACID_BRIGHT,
                      lineHeight: 1,
                    }}
                  >
                    <CountUp to={15} delay={18} duration={30} decimals={1} suffix="%" />
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 13, color: MUTED }}>meta share</div>
                </div>
              </div>
              {[
                ["#2", "Izzet Prowess", 14.1],
                ["#3", "Jeskai Lessons", 13.4],
                ["#4", "4c Control", 12.5],
                ["#5", "Dimir Midrange", 9.8],
              ].map(([rank, name, share], i) => {
                const show = interpolate(frame, [24 + i * 6, 38 + i * 6], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                return (
                  <div
                    key={String(name)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      opacity: show,
                      transform: `translateX(${(1 - show) * 16}px)`,
                      fontFamily: FONT,
                    }}
                  >
                    <span style={{ color: GOLD_LIGHT, fontWeight: 800, width: 36 }}>{rank}</span>
                    <span style={{ color: FOAM, fontWeight: 700, flex: 1, fontSize: 18 }}>{name}</span>
                    <FillBar progress={Number(share) / 15} delay={26 + i * 6} duration={20} height={10} />
                    <span style={{ color: MUTED, width: 52, textAlign: "right", fontSize: 15 }}>
                      {share}%
                    </span>
                  </div>
                );
              })}
            </div>
          </AppWindow>
        </RightStage>
      </Layout>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// 3. Dual format meta boards
// ---------------------------------------------------------------------------

export const DualMetaV2: React.FC = () => {
  const frame = useCurrentFrame();
  const std = [
    { n: "Selesnya Ouro", s: 15 },
    { n: "Izzet Prowess", s: 14 },
    { n: "Jeskai Lessons", s: 13 },
  ];
  const pio = [
    { n: "Amalia Combo", s: 12 },
    { n: "Rakdos Vampires", s: 11 },
    { n: "Izzet Phoenix", s: 10 },
  ];

  const Board: React.FC<{
    title: string;
    rows: { n: string; s: number }[];
    delay: number;
  }> = ({ title, rows, delay }) => (
    <GlassPanel glow style={{ width: 380, padding: "22px 24px" }}>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 14,
          letterSpacing: "0.14em",
          color: ACID,
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        {title}
      </div>
      {rows.map((r, i) => {
        const show = interpolate(frame, [delay + i * 8, delay + 14 + i * 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={r.n}
            style={{
              marginBottom: 12,
              opacity: show,
              transform: `translateY(${(1 - show) * 12}px)`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontFamily: FONT,
                fontSize: 17,
                fontWeight: 700,
                color: FOAM,
                marginBottom: 6,
              }}
            >
              <span>{r.n}</span>
              <span style={{ color: MUTED }}>{r.s}%</span>
            </div>
            <FillBar progress={r.s / 15} delay={delay + i * 8} duration={18} height={8} />
          </div>
        );
      })}
    </GlassPanel>
  );

  return (
    <AbsoluteFill>
      <Layout>
        <LeftCopy>
          <RiseIn>
            <Kicker>Daily meta boards</Kicker>
          </RiseIn>
          <RiseIn delay={6}>
            <Headline size={66}>Two formats. Zero fluff.</Headline>
          </RiseIn>
          <RiseIn delay={16}>
            <Sub>
              Standard and Pioneer boards refresh daily. Real ranked lists only —
              every card checked against Scryfall.
            </Sub>
          </RiseIn>
        </LeftCopy>
        <RightStage>
          <div style={{ display: "flex", gap: 24 }}>
            <RiseIn delay={12} dir="left">
              <Board title="● Standard · BO1" rows={std} delay={18} />
            </RiseIn>
            <RiseIn delay={20} dir="right">
              <Board title="● Pioneer · BO1" rows={pio} delay={26} />
            </RiseIn>
          </div>
        </RightStage>
      </Layout>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// 4. Format hub
// ---------------------------------------------------------------------------

export const FormatHubV2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stamp = spring({ frame: frame - 40, fps, config: { damping: 9, mass: 0.85 } });

  return (
    <AbsoluteFill>
      <Layout>
        <LeftCopy>
          <RiseIn>
            <Kicker>Format hub · New in v0.19</Kicker>
          </RiseIn>
          <RiseIn delay={6}>
            <Headline size={64}>Rotation. Bans. Legality.</Headline>
          </RiseIn>
          <RiseIn delay={16}>
            <Sub>
              Know when sets leave Standard, what is banned in Pioneer, and see
              banned cards with art — before you craft.
            </Sub>
          </RiseIn>
        </LeftCopy>
        <RightStage>
          <AppWindow title="Filthy Net Deck — Sets · Format hub" width={900} height={500}>
            <SideNav active="Sets" />
            <div style={{ flex: 1, padding: 22, display: "flex", gap: 18 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 18, color: FOAM }}>
                  Standard rotation
                </div>
                {["WOE", "LCI", "OTJ", "BLB"].map((code, i) => (
                  <RiseIn key={code} delay={14 + i * 5}>
                    <SolidPanel
                      style={{
                        padding: "12px 16px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: 22, color: FOAM }}>
                        {code}
                      </span>
                      <span
                        style={{
                          fontFamily: FONT,
                          fontWeight: 800,
                          fontSize: 13,
                          color: WARN,
                          border: "1.5px solid rgba(251,191,36,0.45)",
                          borderRadius: 999,
                          padding: "5px 12px",
                        }}
                      >
                        Q1 2027
                      </span>
                    </SolidPanel>
                  </RiseIn>
                ))}
              </div>
              <div style={{ width: 200, position: "relative", display: "flex", alignItems: "center" }}>
                <div
                  style={{
                    width: 180,
                    height: 250,
                    borderRadius: 12,
                    background: "linear-gradient(160deg, #2a2e1c, #0e110a)",
                    border: "1.5px solid rgba(248,113,113,0.5)",
                    filter: "saturate(0.4)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "42%",
                    transform: `translate(-50%,-50%) rotate(-12deg) scale(${interpolate(stamp, [0, 1], [3.5, 1])})`,
                    opacity: stamp,
                    fontFamily: FONT,
                    fontWeight: 900,
                    fontSize: 28,
                    letterSpacing: "0.12em",
                    color: "#fff",
                    background: POOR,
                    borderRadius: 8,
                    padding: "6px 14px",
                    boxShadow: "0 10px 40px rgba(248,113,113,0.7)",
                  }}
                >
                  BANNED
                </div>
              </div>
            </div>
          </AppWindow>
        </RightStage>
      </Layout>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// 5. Set Radar
// ---------------------------------------------------------------------------

export const SetRadarV2: React.FC = () => {
  const frame = useCurrentFrame();
  const cards = [0, 1, 2, 3, 4];
  return (
    <AbsoluteFill>
      <Layout>
        <LeftCopy>
          <RiseIn>
            <Kicker>Set Radar</Kicker>
          </RiseIn>
          <RiseIn delay={6}>
            <Headline size={64}>Spoilers. No Alchemy noise.</Headline>
          </RiseIn>
          <RiseIn delay={16}>
            <Sub>
              Arena-first set tracking with full galleries, mana pips, legality
              badges, and Arena-eve notifications.
            </Sub>
          </RiseIn>
          <RiseIn delay={26}>
            <div style={{ display: "flex", gap: 10 }}>
              <Chip filled>SPOILING</Chip>
              <Chip color={GOLD_LIGHT}>ARENA IN 3D</Chip>
            </div>
          </RiseIn>
        </LeftCopy>
        <RightStage>
          <GlassPanel glow style={{ width: 720, padding: "28px 30px" }}>
            <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 32, color: FOAM }}>
              Edge of Eternities
            </div>
            <div style={{ fontFamily: FONT, fontSize: 18, color: MUTED, marginTop: 6, marginBottom: 22 }}>
              Full gallery · Std/Pio legality at release · new-card badges
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              {cards.map((i) => {
                const show = interpolate(frame, [18 + i * 6, 32 + i * 6], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                const hue = 70 + i * 18;
                return (
                  <div
                    key={i}
                    style={{
                      width: 110,
                      height: 154,
                      borderRadius: 10,
                      opacity: show,
                      transform: `translateY(${(1 - show) * 24}px) rotate(${(i - 2) * 3}deg)`,
                      background: `linear-gradient(155deg, hsla(${hue},40%,22%,1), #0a0c08)`,
                      border: `1.5px solid rgba(184,240,0,${0.15 + i * 0.05})`,
                      boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
                      display: "flex",
                      flexDirection: "column",
                      padding: 8,
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        borderRadius: 6,
                        background: `linear-gradient(135deg, rgba(184,240,0,0.15), rgba(212,168,75,0.1))`,
                      }}
                    />
                    <div
                      style={{
                        height: 8,
                        borderRadius: 4,
                        background: "rgba(255,255,255,0.12)",
                        width: "70%",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </GlassPanel>
        </RightStage>
      </Layout>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// 6. Local tracker
// ---------------------------------------------------------------------------

export const TrackerV2: React.FC = () => {
  return (
    <AbsoluteFill>
      <Layout>
        <LeftCopy>
          <RiseIn>
            <Kicker>Local Player.log tracker</Kicker>
          </RiseIn>
          <RiseIn delay={6}>
            <Headline size={64}>Winrates that stay private.</Headline>
          </RiseIn>
          <RiseIn delay={16}>
            <Sub>
              Tails Arena&apos;s Player.log on your machine. Session stats, event
              history, climb tracking — nothing is uploaded.
            </Sub>
          </RiseIn>
        </LeftCopy>
        <RightStage>
          <div style={{ display: "flex", gap: 20 }}>
            <RiseIn delay={12} dir="scale">
              <GlassPanel
                glow
                style={{
                  width: 280,
                  height: 320,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontFamily: FONT,
                    fontSize: 14,
                    letterSpacing: "0.16em",
                    color: MUTED,
                    textTransform: "uppercase",
                  }}
                >
                  Session WR
                </div>
                <div
                  style={{
                    fontFamily: FONT,
                    fontWeight: 800,
                    fontSize: 92,
                    color: ACID_BRIGHT,
                    lineHeight: 1,
                    textShadow: "0 0 40px rgba(184,240,0,0.4)",
                  }}
                >
                  <CountUp to={67} delay={18} duration={34} suffix="%" />
                </div>
                <div style={{ fontFamily: FONT, fontSize: 24, color: FOAM }}>
                  <CountUp to={20} delay={22} duration={28} />W –{" "}
                  <CountUp to={10} delay={22} duration={28} />L
                </div>
                <div style={{ fontFamily: MONO, fontSize: 14, color: GOOD, marginTop: 12 }}>
                  ● Tailing Player.log
                </div>
              </GlassPanel>
            </RiseIn>
            <RiseIn delay={20}>
              <GlassPanel style={{ width: 360, height: 320, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 18, color: FOAM }}>
                  This week
                </div>
                {[
                  ["Matches", "48"],
                  ["Best streak", "7"],
                  ["Most played", "Dimir Mid"],
                  ["Peak rank", "Diamond 2"],
                ].map(([k, v], i) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontFamily: FONT,
                      fontSize: 20,
                      borderBottom: i < 3 ? `1px solid ${GLASS_EDGE}` : undefined,
                      paddingBottom: 10,
                    }}
                  >
                    <span style={{ color: MUTED }}>{k}</span>
                    <span style={{ color: FOAM, fontWeight: 700 }}>{v}</span>
                  </div>
                ))}
              </GlassPanel>
            </RiseIn>
          </div>
        </RightStage>
      </Layout>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// 7. Matchup intel
// ---------------------------------------------------------------------------

export const MatchupsV2: React.FC = () => {
  const frame = useCurrentFrame();
  const rows = [
    { name: "Izzet Prowess", wr: 62, n: 24 },
    { name: "4c Control", wr: 48, n: 18 },
    { name: "Dimir Midrange", wr: 71, n: 14 },
    { name: "Selesnya Ouro", wr: 55, n: 20 },
    { name: "Jeskai Lessons", wr: 58, n: 12 },
  ];

  return (
    <AbsoluteFill>
      <Layout>
        <LeftCopy>
          <RiseIn>
            <Kicker>Matchup intel</Kicker>
          </RiseIn>
          <RiseIn delay={6}>
            <Headline size={64}>Know the bad matchups.</Headline>
          </RiseIn>
          <RiseIn delay={16}>
            <Sub>
              Tag archetypes after games. See real personal WR vs the field —
              then sideboard with intent.
            </Sub>
          </RiseIn>
        </LeftCopy>
        <RightStage>
          <AppWindow title="Filthy Net Deck — Matchups" width={880} height={480}>
            <SideNav active="Matchups" />
            <div style={{ flex: 1, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 20, color: FOAM }}>
                Your record by archetype
              </div>
              {rows.map((m, i) => {
                const show = interpolate(frame, [16 + i * 7, 30 + i * 7], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                const good = m.wr >= 55;
                return (
                  <div
                    key={m.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      opacity: show,
                      transform: `translateX(${(1 - show) * 14}px)`,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONT,
                        fontWeight: 700,
                        fontSize: 18,
                        color: FOAM,
                        width: 180,
                      }}
                    >
                      {m.name}
                    </span>
                    <FillBar
                      progress={m.wr / 100}
                      delay={18 + i * 7}
                      duration={18}
                      height={10}
                      color={
                        good
                          ? `linear-gradient(90deg, ${GOOD}, ${ACID})`
                          : `linear-gradient(90deg, ${POOR}, ${WARN})`
                      }
                    />
                    <span
                      style={{
                        fontFamily: MONO,
                        fontWeight: 700,
                        fontSize: 18,
                        color: good ? GOOD : WARN,
                        width: 52,
                        textAlign: "right",
                      }}
                    >
                      {m.wr}%
                    </span>
                    <span style={{ fontFamily: FONT, fontSize: 14, color: MUTED, width: 40 }}>
                      n={m.n}
                    </span>
                  </div>
                );
              })}
            </div>
          </AppWindow>
        </RightStage>
      </Layout>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// 8. Decklists + curve + copy
// ---------------------------------------------------------------------------

export const DecklistsV2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pulse = spring({ frame: frame - 50, fps, config: { damping: 8 } });
  const toast = spring({ frame: frame - 62, fps, config: { damping: 12 } });
  const list = [
    ["4", "Agate-Blade Assassin"],
    ["4", "Azure Beastbinder"],
    ["3", "Enduring Curiosity"],
    ["2", "Kaito, Bane of Nightmares"],
    ["4", "Floodpits Drowner"],
  ];
  const curve = [0, 2, 6, 8, 5, 3, 1];

  return (
    <AbsoluteFill>
      <Layout>
        <LeftCopy>
          <RiseIn>
            <Kicker>My Stats · Full decklists</Kicker>
          </RiseIn>
          <RiseIn delay={6}>
            <Headline size={62}>Your 75. Curve. Copy.</Headline>
          </RiseIn>
          <RiseIn delay={16}>
            <Sub>
              Mainboard, sideboard, mana curve, card art — then one click to share
              or import straight into Arena.
            </Sub>
          </RiseIn>
        </LeftCopy>
        <RightStage>
          <div style={{ display: "flex", gap: 18, alignItems: "stretch" }}>
            <RiseIn delay={12}>
              <GlassPanel glow style={{ width: 380, position: "relative", padding: "20px 22px" }}>
                <div
                  style={{
                    fontFamily: FONT,
                    fontSize: 13,
                    color: MUTED,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    marginBottom: 12,
                  }}
                >
                  Dimir Midrange · MB
                </div>
                {list.map(([c, n], i) => {
                  const show = interpolate(frame, [18 + i * 5, 30 + i * 5], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  });
                  return (
                    <div
                      key={n}
                      style={{
                        display: "flex",
                        gap: 14,
                        fontFamily: MONO,
                        fontSize: 18,
                        opacity: show,
                        marginBottom: 8,
                      }}
                    >
                      <span style={{ color: GOLD_LIGHT, fontWeight: 700, width: 24 }}>{c}</span>
                      <span style={{ color: FOAM }}>{n}</span>
                    </div>
                  );
                })}
                <div style={{ fontFamily: MONO, color: MUTED, fontSize: 16 }}>…</div>
                <div
                  style={{
                    marginTop: 18,
                    display: "inline-block",
                    transform: `scale(${1 + 0.1 * Math.sin(pulse * Math.PI)})`,
                    fontFamily: FONT,
                    fontWeight: 800,
                    fontSize: 16,
                    color: "#0a0c06",
                    background: ACID_BRIGHT,
                    borderRadius: 10,
                    padding: "10px 18px",
                    boxShadow: `0 0 ${interpolate(pulse, [0, 1], [0, 40])}px rgba(212,255,58,0.45)`,
                  }}
                >
                  ⧉ Copy decklist
                </div>
                <div
                  style={{
                    position: "absolute",
                    right: 16,
                    top: -18,
                    opacity: toast,
                    fontFamily: FONT,
                    fontWeight: 700,
                    fontSize: 14,
                    color: FOAM,
                    background: "rgba(14,17,10,0.96)",
                    border: `1.5px solid ${GOOD}`,
                    borderRadius: 8,
                    padding: "8px 14px",
                  }}
                >
                  ✓ Copied
                </div>
              </GlassPanel>
            </RiseIn>
            <RiseIn delay={22}>
              <GlassPanel style={{ width: 260, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 16, color: FOAM }}>
                  Mana curve
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 8,
                    height: 160,
                    marginTop: 8,
                  }}
                >
                  {curve.map((h, i) => {
                    const show = interpolate(frame, [28 + i * 4, 42 + i * 4], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    });
                    return (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 6,
                          height: "100%",
                          justifyContent: "flex-end",
                        }}
                      >
                        <div
                          style={{
                            width: "100%",
                            height: `${show * (h / 8) * 100}%`,
                            minHeight: show > 0 ? 4 : 0,
                            borderRadius: 4,
                            background: `linear-gradient(180deg, ${ACID_BRIGHT}, ${ACID})`,
                            boxShadow: "0 0 12px rgba(184,240,0,0.25)",
                          }}
                        />
                        <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>{i}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontFamily: FONT, fontSize: 13, color: MUTED, marginTop: 8 }}>
                  Sideboard · 15 cards ready
                </div>
              </GlassPanel>
            </RiseIn>
          </div>
        </RightStage>
      </Layout>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// 9. Arena import + Bo1/Bo3
// ---------------------------------------------------------------------------

export const ArenaImportV2: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = Math.min(
    28,
    Math.max(0, Math.floor((frame - 24) * 0.7)),
  );
  const msg = "Deck imported → MTG Arena";
  const showBtn = interpolate(frame, [55, 68], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <Layout>
        <LeftCopy>
          <RiseIn>
            <Kicker>Arena import</Kicker>
          </RiseIn>
          <RiseIn delay={6}>
            <Headline size={64}>Bo1 or Bo3. One click.</Headline>
          </RiseIn>
          <RiseIn delay={16}>
            <Sub>
              Export verified lists straight into Arena. Toggle best-of mode,
              copy, and queue — no retyping sixty cards.
            </Sub>
          </RiseIn>
        </LeftCopy>
        <RightStage>
          <GlassPanel glow style={{ width: 560, padding: "32px 36px" }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>
              <div
                style={{
                  fontFamily: FONT,
                  fontWeight: 800,
                  fontSize: 16,
                  padding: "10px 20px",
                  borderRadius: 10,
                  background: ACID,
                  color: "#0a0c06",
                }}
              >
                Bo1
              </div>
              <div
                style={{
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: 16,
                  padding: "10px 20px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.06)",
                  color: MUTED,
                  border: `1px solid ${GLASS_EDGE}`,
                }}
              >
                Bo3
              </div>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 22,
                color: GOOD,
                minHeight: 36,
                background: "rgba(0,0,0,0.35)",
                borderRadius: 10,
                padding: "16px 18px",
                border: `1px solid ${GLASS_EDGE}`,
              }}
            >
              {msg.slice(0, typed)}
              <span style={{ opacity: frame % 16 < 8 ? 1 : 0.2, color: ACID_BRIGHT }}>▋</span>
            </div>
            <div
              style={{
                marginTop: 22,
                opacity: showBtn,
                transform: `translateY(${(1 - showBtn) * 12}px)`,
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: 20,
                color: "#0a0c06",
                background: ACID_BRIGHT,
                borderRadius: 12,
                padding: "14px 24px",
                display: "inline-block",
              }}
            >
              Import to Arena
            </div>
          </GlassPanel>
        </RightStage>
      </Layout>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// 10. Privacy + desktop quality of life
// ---------------------------------------------------------------------------

export const DesktopV2: React.FC = () => {
  const features = [
    { t: "100% local", d: "No account. No cloud. Your PC only." },
    { t: "Tray + autostart", d: "Lives quietly while you climb." },
    { t: "Fullscreen · F11", d: "Immersive meta study mode." },
    { t: "Signed updates", d: "One-click in-app Update & restart." },
  ];
  return (
    <AbsoluteFill>
      <Layout>
        <LeftCopy width={480}>
          <RiseIn>
            <Kicker>Desktop-native</Kicker>
          </RiseIn>
          <RiseIn delay={6}>
            <Headline size={64}>Built for the grind.</Headline>
          </RiseIn>
          <RiseIn delay={16}>
            <Sub>
              Tauri desktop app for Windows and macOS — fast, local, and ready
              when Arena is.
            </Sub>
          </RiseIn>
        </LeftCopy>
        <RightStage>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              width: 640,
            }}
          >
            {features.map((f, i) => (
              <RiseIn key={f.t} delay={12 + i * 8} dir="scale">
                <GlassPanel
                  glow={i === 0}
                  style={{ minHeight: 140, display: "flex", flexDirection: "column", gap: 10 }}
                >
                  <div
                    style={{
                      fontFamily: FONT,
                      fontWeight: 800,
                      fontSize: 22,
                      color: i % 2 === 0 ? ACID_BRIGHT : GOLD_LIGHT,
                    }}
                  >
                    {f.t}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 18, color: MUTED, lineHeight: 1.35 }}>
                    {f.d}
                  </div>
                </GlassPanel>
              </RiseIn>
            ))}
          </div>
        </RightStage>
      </Layout>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// 11. Outro
// ---------------------------------------------------------------------------

export const OutroV2: React.FC = () => {
  const frame = useCurrentFrame();
  const glow = 0.5 + 0.5 * Math.sin(frame / 8);
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <RiseIn>
        <div style={{ filter: `drop-shadow(0 0 ${42 * glow}px rgba(184,240,0,0.55))` }}>
          <Img src={staticFile("app-icon.png")} style={{ width: 180, height: 180 }} />
        </div>
      </RiseIn>
      <RiseIn delay={8}>
        <Headline size={78}>v0.19 — out now.</Headline>
      </RiseIn>
      <RiseIn delay={16}>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 36,
            color: ACID_BRIGHT,
          }}
        >
          Netdeck dirty. Climb clean.
        </div>
      </RiseIn>
      <RiseIn delay={24}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <Chip>Format hub</Chip>
          <Chip>Daily meta</Chip>
          <Chip>Matchups</Chip>
          <Chip>Set Radar</Chip>
          <Chip>Local WR</Chip>
          <Chip color={GOLD_LIGHT}>Windows + macOS</Chip>
        </div>
      </RiseIn>
      <RiseIn delay={34}>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 48,
            color: GOLD_LIGHT,
            marginTop: 8,
            textShadow: "0 0 30px rgba(212,168,75,0.35)",
          }}
        >
          filthy-net-deck.netlify.app
        </div>
      </RiseIn>
      <RiseIn delay={42}>
        <div style={{ fontFamily: FONT, fontSize: 22, color: MUTED }}>
          Built by ApexForge · not affiliated with Wizards of the Coast
        </div>
      </RiseIn>
    </AbsoluteFill>
  );
};
