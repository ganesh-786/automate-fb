import type { CaptionWord } from './props.ts';

export interface CaptionPage {
  words: CaptionWord[];
  startMs: number;
  endMs: number;
}

const SENTENCE_END = /[.!?]["')\]]*$/;

/** How long a page may stay on screen after its last word, so short pauses do not flicker. */
const MAX_HOLD_MS = 600;

/** Groups words into short on-screen pages, breaking early at the end of a sentence. */
export function paginateCaptions(
  words: readonly CaptionWord[],
  maxWordsPerPage: number,
): CaptionPage[] {
  const pages: CaptionPage[] = [];
  let current: CaptionWord[] = [];

  const flush = (): void => {
    const first = current[0];
    const last = current.at(-1);
    if (first && last) pages.push({ words: current, startMs: first.startMs, endMs: last.endMs });
    current = [];
  };

  for (const word of words) {
    current.push(word);
    if (current.length >= maxWordsPerPage || SENTENCE_END.test(word.text)) flush();
  }
  flush();
  return pages;
}

/** The page to show at `timeMs`, or undefined during a pause longer than the hold time. */
export function activePage(pages: readonly CaptionPage[], timeMs: number): CaptionPage | undefined {
  let latest: CaptionPage | undefined;
  for (const page of pages) {
    if (page.startMs > timeMs) break;
    latest = page;
  }
  return latest && timeMs - latest.endMs <= MAX_HOLD_MS ? latest : undefined;
}
