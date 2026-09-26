// A fabricated reader, for looking at the charts without spending a month
// earning the data.
//
// Nothing here is shipped: the stats page only reaches for it under
// `import.meta.env.DEV`, so the bundle drops it in a production build. It is
// also read-only, built in memory and never written to IndexedDB, so turning it
// on cannot touch a real reader's history.
//
// The history is replayed through the real pipeline rather than made up point by
// point. Every score, card and latency here came out of the same code a real
// sentence goes through, so what the charts draw is what they would draw.

import type { BoardEntry } from "../sync/board";
import type { AttemptRecord } from "../db";
import { segmentKana } from "../romaji";
import { CORE_HIRAGANA } from "../selection";
import {
  EMPTY_STORE,
  applyReviews,
  kanjiItem,
  reviewsFor,
  reviewsForWords,
  type ItemStore,
  type TimedSegment,
} from "../srs";
import { scoreOf } from "./score";

const MS_PER_DAY = 86_400_000;

/** Days of invented history. Long enough that every span has something in it. */
const DAYS = 120;

/** Recognition at the start and at the end, in milliseconds. */
const SLOW_MS = 1100;
const FAST_MS = 230;

/** Chance a given day was a rest day. Real practice has gaps in it. */
const REST_CHANCE = 0.28;

/** Words the invented reader has met, once kanji open up. */
const WORDS: readonly (readonly [string, string])[] = [
  ["学校", "がっこう"],
  ["先生", "せんせい"],
  ["日本", "にほん"],
  ["今日", "きょう"],
  ["時間", "じかん"],
  ["電車", "でんしゃ"],
  ["友達", "ともだち"],
  ["仕事", "しごと"],
];

/** xorshift32, so the same invented reader comes back on every reload. */
function randomFrom(seed: number): () => number {
  let state = seed;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/**
 * A made-up friends board for `?demo`, for looking at the board with people on
 * it. Spread around the demo reader's own score, so every standing shows up.
 */
export function demoBoard(ownScore: number, now: Date): BoardEntry[] {
  const hour = 3_600_000;
  const at = (hoursAgo: number): number => now.getTime() - hoursAgo * hour;
  return [
    {
      userId: "d1",
      username: "swift-kitsune-71",
      displayName: null,
      score: ownScore * 1.6,
      scoredAt: at(2),
      isYou: false,
    },
    {
      userId: "d2",
      username: "calm-fukurou-18",
      displayName: "Aiko",
      score: ownScore + 23,
      scoredAt: at(30),
      isYou: false,
    },
    {
      userId: "you",
      username: "quiet-tanuki-42",
      displayName: null,
      score: ownScore,
      scoredAt: at(0),
      isYou: true,
    },
    {
      userId: "d3",
      username: "sleepy-neko-55",
      displayName: null,
      score: ownScore * 0.7,
      scoredAt: at(24 * 9),
      isYou: false,
    },
    {
      userId: "d4",
      username: "oliver",
      displayName: null,
      score: ownScore * 0.3,
      scoredAt: null,
      isYou: false,
    },
    // Enough more that the board is longer than the card it sits in, so the
    // scrolling and the jump to the reader's own line show up too.
    ...[
      "brave-kuma-12",
      "shy-usagi-64",
      "lucky-koi-29",
      "tidy-risu-88",
      "warm-saru-40",
      "witty-tako-17",
      "bright-tsuru-53",
    ].map((username, index) => ({
      userId: `extra-${String(index)}`,
      username,
      displayName: null,
      score: ownScore * (0.2 + index * 0.25),
      scoredAt: at(3 + index * 20),
      isYou: false,
    })),
  ];
}

export interface DemoProgress {
  readonly store: ItemStore;
  readonly attempts: readonly AttemptRecord[];
}

let built: DemoProgress | null = null;

/**
 * A reader who started {@link DAYS} days ago and got steadily faster.
 *
 * Kana come in over the first weeks rather than all at once, and words only
 * once the kana is holding, so the script gates on the stats page have
 * something honest to show.
 */
export function demoProgress(now: Date): DemoProgress {
  // Four months of replayed reviews is not free, and the answer is the same
  // every time. Built once per session rather than on every visit.
  const cached = built;
  if (cached !== null) return cached;

  const random = randomFrom(0x5eed1234);
  let store = EMPTY_STORE;
  const attempts: AttemptRecord[] = [];

  for (let back = DAYS - 1; back >= 0; back--) {
    if (random() < REST_CHANCE) continue;

    const at = new Date(now.getTime() - back * MS_PER_DAY);
    // 0 on the first day, 1 on the last.
    const progress = 1 - back / (DAYS - 1);

    // The characters this reader has met by now, widening as they go.
    const known = Math.max(5, Math.round(CORE_HIRAGANA.length * Math.min(1, progress * 1.6)));
    const typical = SLOW_MS + (FAST_MS - SLOW_MS) * progress;

    for (let sentence = 0; sentence < 3; sentence++) {
      const kana: string[] = [];
      for (let index = 0; index < 12; index++) {
        kana.push(CORE_HIRAGANA[Math.floor(random() * known)] ?? "あ");
      }

      const segments = segmentKana(kana.join(""));
      const timed: TimedSegment[] = segments.map((_segment, segment) => ({
        segment,
        // Spread around the day's typical pace, never off the floor.
        latencyMs: Math.max(90, Math.round(typical * (0.6 + random() * 0.9))),
        errors: random() < 0.06 ? 1 : 0,
      }));

      const reviews = [...reviewsFor(segments, timed)];

      // Words arrive late, the way they do for a reader whose kana had to come
      // first. See the script gates in selection/gating.ts.
      if (progress > 0.45) {
        const word = WORDS[Math.floor(random() * WORDS.length)];
        if (word !== undefined) {
          reviews.push(
            ...reviewsForWords(
              [{ item: kanjiItem(word[0], word[1]), from: 0, to: 2 }],
              [{ segment: 0, latencyMs: Math.round(typical * 1.4), errors: 0 }],
            ),
          );
        }
      }

      store = applyReviews(store, reviews, at);

      const errors = timed.reduce((total, timing) => total + timing.errors, 0);
      const keyCount = segments.length * 2 + errors;

      attempts.push({
        sentenceId: `demo-${String(back)}-${String(sentence)}`,
        finishedAt: at.getTime() + sentence * 60_000,
        durationMs: Math.round(typical * segments.length * 1.6),
        keyCount,
        errors,
        segments: segments.length,
        score: scoreOf(store, at),
      });
    }
  }

  built = { store, attempts };
  return built;
}
