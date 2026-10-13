import type { FC } from 'react';
import type { CalculateMetadataFunction } from 'remotion';
import { Composition } from 'remotion';
import type { ShortVideoProps } from './props.ts';
import { COMPOSITION_ID } from './props.ts';
import { ShortVideo } from './ShortVideo.tsx';

/** Shown only in Remotion Studio. Real renders pass their own props. */
const PLACEHOLDER: ShortVideoProps = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 150,
  crossfadeFrames: 12,
  scenes: [],
  words: [],
  audio: null,
};

/** Size, frame rate and length come from the render's props, not from the placeholder. */
const calculateMetadata: CalculateMetadataFunction<ShortVideoProps> = ({ props }) => ({
  width: props.width,
  height: props.height,
  fps: props.fps,
  durationInFrames: props.durationInFrames,
});

export const Root: FC = () => (
  <Composition
    id={COMPOSITION_ID}
    component={ShortVideo}
    defaultProps={PLACEHOLDER}
    width={PLACEHOLDER.width}
    height={PLACEHOLDER.height}
    fps={PLACEHOLDER.fps}
    durationInFrames={PLACEHOLDER.durationInFrames}
    calculateMetadata={calculateMetadata}
  />
);
