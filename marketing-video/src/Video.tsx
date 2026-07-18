import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Background } from "./Background";
import { ChapterRail, SceneFade } from "./bits";
import {
  ArenaImportV2,
  DecksHomeV2,
  DesktopV2,
  DualMetaV2,
  DecklistsV2,
  FormatHubV2,
  IntroV2,
  MatchupsV2,
  OutroV2,
  SetRadarV2,
  TrackerV2,
} from "./scenes";

/**
 * Final marketing cut — product-cinema style, 44s @ 30fps.
 * Acid-climax soundtrack + chapter rail + app chrome scenes.
 */
export const CHAPTERS = [
  "Brand",
  "Decks",
  "Meta",
  "Formats",
  "Sets",
  "Tracker",
  "Matchups",
  "Lists",
  "Arena",
  "Desktop",
  "Get it",
];

export const SCENES: {
  comp: React.FC;
  from: number;
  duration: number;
  chapter: number;
}[] = [
  { comp: IntroV2, from: 0, duration: 130, chapter: 0 },
  { comp: DecksHomeV2, from: 120, duration: 135, chapter: 1 },
  { comp: DualMetaV2, from: 245, duration: 125, chapter: 2 },
  { comp: FormatHubV2, from: 360, duration: 135, chapter: 3 },
  { comp: SetRadarV2, from: 485, duration: 120, chapter: 4 },
  { comp: TrackerV2, from: 595, duration: 125, chapter: 5 },
  { comp: MatchupsV2, from: 710, duration: 130, chapter: 6 },
  { comp: DecklistsV2, from: 830, duration: 140, chapter: 7 },
  { comp: ArenaImportV2, from: 960, duration: 120, chapter: 8 },
  { comp: DesktopV2, from: 1070, duration: 120, chapter: 9 },
  { comp: OutroV2, from: 1180, duration: 140, chapter: 10 },
];

export const TOTAL_FRAMES = 1320; // 44s @ 30fps

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
    [0, 20, TOTAL_FRAMES - 50, TOTAL_FRAMES],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <div style={{ opacity }}>
      <ChapterRail chapters={CHAPTERS} activeIndex={active} progress={progress} />
    </div>
  );
};

export const FilthyNetDeckVideo: React.FC = () => (
  <AbsoluteFill>
    <Background />
    <Audio src={staticFile("soundtrack-acid-climax.wav")} volume={0.88} />
    {SCENES.map(({ comp: Comp, from, duration }) => (
      <Sequence key={`${from}-${duration}`} from={from} durationInFrames={duration}>
        <SceneFade durationInFrames={duration}>
          <Comp />
        </SceneFade>
      </Sequence>
    ))}
    <ChapterOverlay />
  </AbsoluteFill>
);
