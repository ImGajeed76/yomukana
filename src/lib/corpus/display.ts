// Decides what the reader looks at.
//
// The reader always types the reading. What they see is a separate question: a
// token can be shown as kanji once they are ready for it, and as kana until then.
// Both are the same sentence and the same keystrokes, so the display can change
// without the exercise changing underneath it.

import { toCodePoints } from "../japanese/text";
import type { Segment } from "../romaji";
import type { CorpusToken } from "./types";

/** One token, with the stretch of segments the reader types for it. */
export interface TokenSpan {
  readonly token: CorpusToken;
  /** First segment of this token. */
  readonly from: number;
  /** One past the last segment of this token. */
  readonly to: number;
}

export interface DisplayToken extends TokenSpan {
  /** What to put on screen. */
  readonly text: string;
  /** Whether the text is the written form rather than the reading. */
  readonly isWritten: boolean;
}

/**
 * Lines the segments up against the tokens they came from.
 *
 * Segmentation runs over the whole reading rather than token by token, because a
 * sokuon at the end of one token takes its consonant from the next. So the spans
 * are recovered afterwards by counting characters, and a segment that straddles a
 * boundary belongs to the token it starts in.
 */
export function tokenSpans(
  tokens: readonly CorpusToken[],
  segments: readonly Segment[],
): TokenSpan[] {
  const spans: TokenSpan[] = [];

  let segment = 0;
  let consumed = 0;

  for (const token of tokens) {
    const length = toCodePoints(token.reading).length;
    const from = segment;

    while (segment < segments.length && consumed < length) {
      consumed += toCodePoints(segments[segment]?.display ?? "").length;
      segment += 1;
    }

    spans.push({ token, from, to: segment });
    consumed -= length;
  }

  // Anything left over, which only happens if the reading and the segments
  // disagree, hangs off the last token rather than vanishing.
  const last = spans[spans.length - 1];
  if (last !== undefined && segment < segments.length) {
    spans[spans.length - 1] = { ...last, to: segments.length };
  }
  return spans;
}

/** Whether a token is written differently from how it is read. */
export function isWrittenDifferently(token: CorpusToken): boolean {
  return token.surface !== token.reading;
}

export type RevealDecision = (token: CorpusToken, index: number) => boolean;

/** Never shows the written form. What a reader sees before the kanji gate opens. */
export const READING_ONLY: RevealDecision = () => false;

export function planDisplay(spans: readonly TokenSpan[], reveal: RevealDecision): DisplayToken[] {
  return spans.map((span, index) => {
    const isWritten = isWrittenDifferently(span.token) && reveal(span.token, index);
    return {
      ...span,
      text: isWritten ? span.token.surface : span.token.reading,
      isWritten,
    };
  });
}

/**
 * Splits kana words into their characters, leaving written words whole.
 *
 * A word shown as kanji is read as one thing, so it highlights as one thing.
 * Kana is read character by character, and highlighting a whole kana word at
 * once would hide exactly the progress the reader is watching for.
 */
export function expandKana(
  plan: readonly DisplayToken[],
  segments: readonly Segment[],
): DisplayToken[] {
  const expanded: DisplayToken[] = [];

  for (const token of plan) {
    if (token.isWritten) {
      expanded.push(token);
      continue;
    }

    for (let index = token.from; index < token.to; index++) {
      const segment = segments[index];
      if (segment === undefined) continue;
      expanded.push({
        token: token.token,
        from: index,
        to: index + 1,
        text: segment.display,
        isWritten: false,
      });
    }
  }
  return expanded;
}
