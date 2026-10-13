/** Splits prose into sentences on terminal punctuation. Adequate for narration text. */
export function splitSentences(text: string): string[] {
  const normalised = text.replace(/\s+/g, ' ').trim();
  const matches = normalised.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [];
  return matches.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}

export interface TimedSpan {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export interface TimedWord {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Spreads each sentence's time span across its words in proportion to word length.
 * This is an approximation for the render spike only: production word timings come from speech
 * recognition of the final narration.
 */
export function approximateWordTimings(sentences: readonly TimedSpan[]): TimedWord[] {
  const words: TimedWord[] = [];
  for (const sentence of sentences) {
    const tokens = sentence.text.split(/\s+/).filter((token) => token.length > 0);
    const totalLength = tokens.reduce((sum, token) => sum + token.length, 0);
    if (totalLength === 0) continue;

    const spanMs = (sentence.endSeconds - sentence.startSeconds) * 1000;
    let cursorMs = sentence.startSeconds * 1000;
    for (const token of tokens) {
      const durationMs = (spanMs * token.length) / totalLength;
      words.push({
        text: token,
        startMs: Math.round(cursorMs),
        endMs: Math.round(cursorMs + durationMs),
      });
      cursorMs += durationMs;
    }
  }
  return words;
}
