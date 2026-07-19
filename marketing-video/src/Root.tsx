import React from "react";
import { Composition } from "remotion";
import { FilthyNetDeckVideo, TOTAL_FRAMES } from "./Video";
import { FilthyNetDeckVideoV1, TOTAL_FRAMES_V1 } from "./v1/VideoV1";
import { FilthyNetDeckThemesX, TOTAL_FRAMES_THEMES_X } from "./v1/VideoThemesX";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="FilthyNetDeck"
      component={FilthyNetDeckVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="FilthyNetDeckV1"
      component={FilthyNetDeckVideoV1}
      durationInFrames={TOTAL_FRAMES_V1}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="FilthyNetDeckThemesX"
      component={FilthyNetDeckThemesX}
      durationInFrames={TOTAL_FRAMES_THEMES_X}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
