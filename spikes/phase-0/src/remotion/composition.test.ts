import { CameraMoveSchema } from '@automate/contracts';
import { describe, expect, it } from 'vitest';
import { cameraTransform } from './camera.ts';
import { activePage, paginateCaptions } from './captions.ts';

const word = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs });

describe('cameraTransform', () => {
  it('never exposes the edge of the image, for any move at any point', () => {
    for (const move of CameraMoveSchema.options) {
      for (const progress of [-1, 0, 0.25, 0.5, 0.75, 1, 2]) {
        const { scale, translateXPercent, translateYPercent } = cameraTransform(move, progress);
        const marginPercent = ((scale - 1) / 2) * 100;

        expect(scale).toBeGreaterThanOrEqual(1);
        expect(Math.abs(scale * translateXPercent)).toBeLessThanOrEqual(marginPercent + 1e-9);
        expect(Math.abs(scale * translateYPercent)).toBeLessThanOrEqual(marginPercent + 1e-9);
      }
    }
  });

  it('zooms in over the scene and zooms out in reverse', () => {
    expect(cameraTransform('zoom-in', 0).scale).toBe(1);
    expect(cameraTransform('zoom-in', 1).scale).toBeGreaterThan(1);
    expect(cameraTransform('zoom-out', 0).scale).toBe(cameraTransform('zoom-in', 1).scale);
    expect(cameraTransform('zoom-out', 1).scale).toBe(1);
  });

  it('moves the image opposite to the camera during a pan', () => {
    // Camera pans left, so the image slides to the right: its offset increases.
    expect(cameraTransform('pan-left', 1).translateXPercent).toBeGreaterThan(
      cameraTransform('pan-left', 0).translateXPercent,
    );
    expect(cameraTransform('pan-right', 1).translateXPercent).toBeLessThan(
      cameraTransform('pan-right', 0).translateXPercent,
    );
    expect(cameraTransform('pan-up', 1).translateYPercent).toBeGreaterThan(
      cameraTransform('pan-up', 0).translateYPercent,
    );
  });
});

describe('paginateCaptions', () => {
  it('breaks at the page size and at sentence ends', () => {
    const words = [
      word('Honey', 0, 300),
      word('never', 300, 600),
      word('spoils.', 600, 1000),
      word('It', 1200, 1300),
      word('is', 1300, 1400),
      word('very', 1400, 1600),
      word('very', 1600, 1800),
      word('dry', 1800, 2000),
    ];
    const pages = paginateCaptions(words, 4);

    expect(pages.map((page) => page.words.map((w) => w.text).join(' '))).toEqual([
      'Honey never spoils.',
      'It is very very',
      'dry',
    ]);
    expect(pages[0]).toMatchObject({ startMs: 0, endMs: 1000 });
    expect(pages[1]).toMatchObject({ startMs: 1200, endMs: 1800 });
  });

  it('returns no pages for no words', () => {
    expect(paginateCaptions([], 4)).toEqual([]);
  });
});

describe('activePage', () => {
  const pages = paginateCaptions([word('One.', 1000, 1500), word('Two.', 4000, 4500)], 4);

  it('shows nothing before the first word', () => {
    expect(activePage(pages, 500)).toBeUndefined();
  });

  it('holds a page briefly after its last word, then hides it', () => {
    expect(activePage(pages, 1200)?.words[0]?.text).toBe('One.');
    expect(activePage(pages, 2000)?.words[0]?.text).toBe('One.');
    expect(activePage(pages, 3000)).toBeUndefined();
  });

  it('switches to the next page when it starts', () => {
    expect(activePage(pages, 4000)?.words[0]?.text).toBe('Two.');
  });
});
