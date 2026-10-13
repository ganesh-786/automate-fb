import { describe, expect, it } from 'vitest';
import { approximateWordTimings, splitSentences } from './text.ts';

describe('splitSentences', () => {
  it('splits on terminal punctuation and normalises whitespace', () => {
    expect(splitSentences('  Honey never spoils.\nWhy?   Because it is dry!  ')).toEqual([
      'Honey never spoils.',
      'Why?',
      'Because it is dry!',
    ]);
  });

  it('keeps a trailing fragment that has no terminal punctuation', () => {
    expect(splitSentences('First one. And a fragment')).toEqual(['First one.', 'And a fragment']);
  });

  it('returns nothing for blank input', () => {
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('approximateWordTimings', () => {
  it('spreads a sentence span across its words by length', () => {
    const words = approximateWordTimings([{ text: 'aa bbbb aa', startSeconds: 1, endSeconds: 2 }]);

    expect(words).toEqual([
      { text: 'aa', startMs: 1000, endMs: 1250 },
      { text: 'bbbb', startMs: 1250, endMs: 1750 },
      { text: 'aa', startMs: 1750, endMs: 2000 },
    ]);
  });

  it('keeps words in order across sentences with no overlap', () => {
    const words = approximateWordTimings([
      { text: 'one two', startSeconds: 0, endSeconds: 1 },
      { text: 'three', startSeconds: 1.2, endSeconds: 2 },
    ]);

    expect(words.map((word) => word.text)).toEqual(['one', 'two', 'three']);
    for (let i = 1; i < words.length; i += 1) {
      expect(words[i]?.startMs).toBeGreaterThanOrEqual(words[i - 1]?.endMs ?? Infinity);
    }
  });

  it('ignores sentences without words', () => {
    expect(approximateWordTimings([{ text: '   ', startSeconds: 0, endSeconds: 1 }])).toEqual([]);
  });
});
