/* eslint-disable @typescript-eslint/consistent-type-definitions --
   Remotion input props must be type aliases: an interface is not assignable to
   Record<string, unknown>, which the renderer requires. */
import type { CameraMove } from '@automate/contracts';

export const COMPOSITION_ID = 'ShortVideo';

export type SceneProps = {
  /** File name inside the bundle's public directory. */
  image: string;
  startFrame: number;
  durationInFrames: number;
  cameraMove: CameraMove;
};

export type CaptionWord = {
  text: string;
  startMs: number;
  endMs: number;
};

export type ShortVideoProps = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  /** Frames over which a scene fades in on top of the previous one. */
  crossfadeFrames: number;
  scenes: SceneProps[];
  words: CaptionWord[];
  /** File name of the narration inside the public directory, or null for a silent video. */
  audio: string | null;
};
