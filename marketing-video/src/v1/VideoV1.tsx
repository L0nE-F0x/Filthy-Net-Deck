import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Background } from "../Background";
import { ChapterRail, SceneFade } from "../bits";
import {
  FeatureMontage,
  IntroBurst,
  OutroV1,
  ThemesSpotlight,
  WalkerCycle,
} from "./scenes-v1";

/**
 * v1 launch spot — 48s @ 30fps.
 * Celebration burst → v1 feature montage → Themes spotlight →
 * planeswalker cycle (lands on the acid-climax drop at ~33.75s) → outro.
 */
export const CHAPTERS_V1 = ["v1", "The Kit", "Themes", "Planeswalkers", "Get it"];

export const SCENES_V1: {
  comp: React.FC;
  from: number;
  duration: number;
  chapter: number;
  fade?: number;
}[] = [
  { comp: IntroBurst, from: 0, duration: 225, chapter: 0 },
  { comp: FeatureMontage, from: 215, duration: 460, chapter: 1 },
  { comp: ThemesSpotlight, from: 665, duration: 347, chapter: 2 },
  { comp: WalkerCycle, from: 1012, duration: 306, chapter: 3, fade: 6 },
  { comp: OutroV1, from: 1308, duration: 132, chapter: 4 },
];

export const TOTAL_FRAMES_V1 = 1440; // 48s @ 30fps — matches soundtrack

const ChapterOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  let active = 0;
  let progress = 0;
  for (const s of SCENES_V1) {
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
    [0, 20, TOTAL_FRAMES_V1 - 40, TOTAL_FRAMES_V1],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <div style={{ opacity }}>
      <ChapterRail chapters={CHAPTERS_V1} activeIndex={active} progress={progress} />
    </div>
  );
};

export const FilthyNetDeckVideoV1: React.FC = () => (
  <AbsoluteFill>
    <Background />
    <Audio src={staticFile("soundtrack-arena-pulse.wav")} volume={0.88} />
    {SCENES_V1.map(({ comp: Comp, from, duration, fade }) => (
      <Sequence key={`${from}-${duration}`} from={from} durationInFrames={duration}>
        <SceneFade durationInFrames={duration} fadeIn={fade ?? 16} fadeOut={fade ?? 16}>
          <Comp />
        </SceneFade>
      </Sequence>
    ))}
    <ChapterOverlay />
  </AbsoluteFill>
);
