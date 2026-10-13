import type { CameraMove } from '@automate/contracts';

export interface CameraTransform {
  scale: number;
  translateXPercent: number;
  translateYPercent: number;
}

/** Extra magnification reached at the far end of a zoom. */
const ZOOM_AMOUNT = 0.12;
/** Magnification held during a pan. It creates the margin the pan travels through. */
const PAN_SCALE = 1.1;
/** How far a pan travels either side of centre, as a percentage of the frame. */
const PAN_TRAVEL_PERCENT = 4;

/**
 * Transform for a still image at `progress` through its scene (0 at the start, 1 at the end).
 * Apply it as `scale(s) translate(x%, y%)`. Moves are named for the camera, so the image travels
 * the opposite way. No move ever exposes the edge of the image.
 */
export function cameraTransform(move: CameraMove, progress: number): CameraTransform {
  const p = Math.min(1, Math.max(0, progress));
  const travel = PAN_TRAVEL_PERCENT * (2 * p - 1); // -travel at the start, +travel at the end
  const still = { translateXPercent: 0, translateYPercent: 0 };

  switch (move) {
    case 'static':
      return { scale: 1, ...still };
    case 'zoom-in':
      return { scale: 1 + ZOOM_AMOUNT * p, ...still };
    case 'zoom-out':
      return { scale: 1 + ZOOM_AMOUNT * (1 - p), ...still };
    case 'pan-left':
      return { scale: PAN_SCALE, translateXPercent: travel, translateYPercent: 0 };
    case 'pan-right':
      return { scale: PAN_SCALE, translateXPercent: -travel, translateYPercent: 0 };
    case 'pan-up':
      return { scale: PAN_SCALE, translateXPercent: 0, translateYPercent: travel };
    case 'pan-down':
      return { scale: PAN_SCALE, translateXPercent: 0, translateYPercent: -travel };
  }
}
