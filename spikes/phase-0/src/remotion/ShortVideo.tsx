import type { CSSProperties, FC } from 'react';
import { useMemo } from 'react';
import {
  AbsoluteFill,
  Html5Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { cameraTransform } from './camera.ts';
import { activePage, paginateCaptions } from './captions.ts';
import type { CaptionWord, SceneProps, ShortVideoProps } from './props.ts';

const WORDS_PER_PAGE = 4;
const SPOKEN_COLOUR = '#FFD400';
const IDLE_COLOUR = '#FFFFFF';

// Captions sit above the bottom quarter of the frame, which platform controls cover.
const captionArea: CSSProperties = {
  justifyContent: 'flex-end',
  alignItems: 'center',
  padding: '0 8% 26%',
};

const captionLine: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  columnGap: 22,
};

const captionWord: CSSProperties = {
  display: 'inline-block',
  fontFamily: "'Segoe UI', Arial, Helvetica, sans-serif",
  fontWeight: 800,
  fontSize: 76,
  lineHeight: 1.2,
  textShadow: '0 4px 14px rgba(0, 0, 0, 0.85), 0 0 4px rgba(0, 0, 0, 0.9)',
};

const SceneLayer: FC<{ scene: SceneProps; visibleFrames: number; fadeFrames: number }> = ({
  scene,
  visibleFrames,
  fadeFrames,
}) => {
  const frame = useCurrentFrame();
  const camera = cameraTransform(scene.cameraMove, frame / visibleFrames);
  const opacity =
    fadeFrames > 0 ? interpolate(frame, [0, fadeFrames], [0, 1], { extrapolateRight: 'clamp' }) : 1;

  return (
    <AbsoluteFill style={{ opacity }}>
      <Img
        src={staticFile(scene.image)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${camera.scale}) translate(${camera.translateXPercent}%, ${camera.translateYPercent}%)`,
        }}
      />
    </AbsoluteFill>
  );
};

const Captions: FC<{ words: CaptionWord[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pages = useMemo(() => paginateCaptions(words, WORDS_PER_PAGE), [words]);
  const timeMs = (frame / fps) * 1000;
  const page = activePage(pages, timeMs);
  if (!page) return null;

  return (
    <AbsoluteFill style={captionArea}>
      <div style={captionLine}>
        {page.words.map((word) => {
          const spoken = timeMs >= word.startMs && timeMs < word.endMs;
          return (
            <span
              key={`${word.startMs}-${word.text}`}
              style={{
                ...captionWord,
                color: spoken ? SPOKEN_COLOUR : IDLE_COLOUR,
                transform: spoken ? 'scale(1.08)' : 'none',
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Still images with camera motion and crossfades, word-highlight captions, and narration. */
export const ShortVideo: FC<ShortVideoProps> = ({ scenes, words, audio, crossfadeFrames }) => (
  <AbsoluteFill style={{ backgroundColor: '#000000' }}>
    {scenes.map((scene, index) => {
      // Each scene stays up while the next one fades in over it.
      const visibleFrames = scene.durationInFrames + crossfadeFrames;
      return (
        <Sequence key={scene.image} from={scene.startFrame} durationInFrames={visibleFrames}>
          <SceneLayer
            scene={scene}
            visibleFrames={visibleFrames}
            fadeFrames={index === 0 ? 0 : crossfadeFrames}
          />
        </Sequence>
      );
    })}
    <Captions words={words} />
    {audio === null ? null : <Html5Audio src={staticFile(audio)} />}
  </AbsoluteFill>
);
