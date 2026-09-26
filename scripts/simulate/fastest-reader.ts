// How fast can a score honestly grow?
//
// The global board has to turn away a score nobody could have earned, and the
// limits for that have to come from the app itself, not from a guess. So this
// runs the fastest reader who is still plausible through the real practice
// loop: the real corpus, the real selector, the real attempt keystroke by
// keystroke, the real grading and scheduler, the real score. Only storage and
// the screen are left out. It is the same loop as Practice in
// src/lib/session/practice.svelte.ts, written out without Svelte or IndexedDB.
//
// The reader never makes a mistake, never skips, reads every character at the
// speed the score treats as the fastest there is, and practises eight hours a
// day in fifty-minute sittings for a month.
//
// Run with `bun scripts/simulate/fastest-reader.ts [days]`. Prints the largest
// gain in any ten minutes, hour and day, and the highest score the corpus
// allows at all.

import { planDisplay, tokenSpans } from "../../src/lib/corpus/display";
import { Corpus, segmentsOf, type Fetcher } from "../../src/lib/corpus/load";
import type { CorpusChunk, CorpusIndex, CorpusSentence } from "../../src/lib/corpus/types";
import { toCodePoints } from "../../src/lib/japanese/text";
import type { Segment } from "../../src/lib/romaji";
import {
  DEFAULT_OPTIONS,
  START,
  advance,
  allowsKanji,
  allowsKatakana,
  bandsAround,
  chooseRevealed,
  pickSentence,
  scoreSentence,
  type Progression,
} from "../../src/lib/selection";
import {
  measuredLatency,
  pressKey,
  startAttempt,
  summarise,
  usableTimings,
  type Attempt,
} from "../../src/lib/session/attempt";
import {
  EMPTY_STORE,
  applyReviews,
  itemsForSegments,
  kanjiItem,
  reviewsFor,
  reviewsForWords,
  type ItemStore,
  type TimedSegment,
  type WordSpan,
} from "../../src/lib/srs";
import { scoreOf } from "../../src/lib/stats/score";

// The reader.

/**
 * Between two keys of one mora, in milliseconds. 60 ms is a burst rate of
 * about 200 words a minute, faster than all but competition typists, so the
 * sentences go by quicker than any real reader's would.
 */
const KEY_MS = 60;
/**
 * Reaching for the first key of a mora the reader knows cold. Fast, but a
 * finger still has to move.
 */
const MOTOR_MS = 120;
/**
 * Reading a character. The score counts any reading under 140 ms as the
 * fastest pace it gives credit for (350 ms reference over the 2.5 cap), so
 * 40 ms is past the point where being faster could earn anything more.
 */
const READING_MS = 40;
/**
 * A little spread on each first key, so the reader's motor floor settles the
 * way it does for a person, rather than on one exact number.
 */
const JITTER_MS = 30;
/** Enter, and the eye finding the next sentence. */
const BETWEEN_SENTENCES_MS = 800;

// The day.

const SITTING_MS = 50 * 60_000;
const BREAK_MS = 10 * 60_000;
const SITTINGS_PER_DAY = 8;
const DAY_MS = 86_400_000;
/** How often the score is sampled. A minute is fine enough for ten-minute windows. */
const SAMPLE_MS = 60_000;

const RECENT_MEMORY = 8;
const CORPUS_ROOT = new URL("../../static", import.meta.url).pathname;

/** Reads the corpus from disk in place of the network, so the real Corpus class loads it. */
// Cast because the platform's fetch type carries extras, like preconnect, that
// the corpus loader never calls.
const fromDisk = ((input: string | URL | Request) => {
  const path =
    typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  return Promise.resolve(new Response(Bun.file(`${CORPUS_ROOT}${path}`)));
}) as Fetcher;

/** Fixed, so two runs of the same length print the same numbers. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}
const random = seeded(20_260_926);

interface Sample {
  readonly at: number;
  readonly score: number;
}

/** Types one sentence the way the reader would, key by key, and returns the attempt. */
function typeSentence(segments: readonly Segment[], startAt: number): Attempt {
  let attempt = startAttempt(segments, startAt);
  let at = startAt;
  for (const segment of segments) {
    // ん as `nn`, the way a fast typist writes it: a bare `n` before a vowel
    // reads as the next mora instead, な for ん plus あ. Every sentence in the
    // corpus types cleanly this way.
    const spelling = segment.kind === "moraic-n" ? "nn" : (segment.spellings[0] ?? "");
    // Punctuation is stepped over by the app, with nothing to type.
    if (spelling === "") continue;
    at += MOTOR_MS + READING_MS + Math.round((random() - 0.5) * 2 * JITTER_MS);
    for (const [index, key] of toCodePoints(spelling).entries()) {
      if (index > 0) at += KEY_MS;
      attempt = pressKey(attempt, key, at);
    }
  }
  return attempt;
}

/** The largest rise from any sample to a later one within `window` milliseconds. */
function largestGain(samples: readonly Sample[], window: number): number {
  let best = 0;
  // A queue of indices whose scores only rise, so the lowest score still inside
  // the window is always at its head.
  const lows: number[] = [];
  let head = 0;
  for (const [index, sample] of samples.entries()) {
    while (head < lows.length && sample.at - (samples[lows[head] ?? 0]?.at ?? 0) > window) head++;
    const low = samples[lows[head] ?? index];
    if (low !== undefined) best = Math.max(best, sample.score - low.score);
    while (lows.length > head && (samples[lows.at(-1) ?? 0]?.score ?? 0) >= sample.score)
      lows.pop();
    lows.push(index);
  }
  return best;
}

/** Every item the corpus could ever teach, and the most any of them can score. */
function ceilingOf(sentences: readonly CorpusSentence[]): {
  kana: number;
  words: number;
  score: number;
} {
  const kana = new Set<string>();
  const words = new Set<string>();
  for (const sentence of sentences) {
    for (const item of itemsForSegments(segmentsOf(sentence))) kana.add(item.id);
    for (const token of sentence.tokens) {
      if (token.surface !== token.reading) words.add(kanjiItem(token.surface, token.reading).id);
    }
  }
  // Weight times full recall times the fastest pace: see src/lib/stats/score.ts.
  return {
    kana: kana.size,
    words: words.size,
    score: kana.size * 10 * 2.5 + words.size * 25 * 2.5,
  };
}

async function main(): Promise<void> {
  const days = Number(process.argv[2] ?? "30");
  const startedAt = performance.now();

  const corpus = new Corpus(fromDisk);
  await corpus.open();
  const index = (await Bun.file(`${CORPUS_ROOT}/corpus/index.json`).json()) as CorpusIndex;
  const everything: CorpusSentence[] = [];
  for (const band of index.bands) {
    const chunk = (await Bun.file(`${CORPUS_ROOT}/corpus/${band.file}`).json()) as CorpusChunk;
    everything.push(...chunk.sentences);
  }
  const ceiling = ceilingOf(everything);

  let store: ItemStore = EMPTY_STORE;
  let progression: Progression = START;
  let recent: string[] = [];
  const seenAt = new Map<string, number>();
  const samples: Sample[] = [];
  let sentencesRead = 0;
  let keyErrors = 0;

  const origin = new Date("2026-01-05T08:00:00").getTime();
  for (let day = 0; day < days; day++) {
    for (let sitting = 0; sitting < SITTINGS_PER_DAY; sitting++) {
      const sittingStart = origin + day * DAY_MS + sitting * (SITTING_MS + BREAK_MS);
      let at = sittingStart;
      let nextSample = at;

      while (at < sittingStart + SITTING_MS) {
        if (at >= nextSample) {
          samples.push({ at, score: scoreOf(store, new Date(at)) });
          nextSample += SAMPLE_MS;
        }
        await corpus.ensure(bandsAround(progression.band, corpus.highestBand));

        // Choosing, as Practice.#choose does.
        const when = new Date(at);
        const options = { ...DEFAULT_OPTIONS, recent, seenAt };
        const candidates = corpus.candidates(bandsAround(progression.band, corpus.highestBand), {
          allowKatakana: allowsKatakana(store),
          allowKanji: allowsKanji(store),
        });
        const candidate = pickSentence(candidates, store, when, options);
        if (candidate === null) throw new Error("the selector found nothing to read");
        const scored = scoreSentence(candidate, store, when, options);
        const challenge =
          candidate.band > progression.band ? 0 : scored.newCount + scored.weakCount;

        const sentence = corpus.sentence(candidate.id);
        if (sentence === null) throw new Error(`no sentence ${candidate.id}`);
        const segments = corpus.segmentsFor(candidate.id);
        const spans = tokenSpans(sentence.tokens, segments);
        const revealed = allowsKanji(store)
          ? chooseRevealed(sentence.tokens, store, when)
          : new Set<number>();
        const words: WordSpan[] = planDisplay(spans, (_token, tokenIndex) =>
          revealed.has(tokenIndex),
        )
          .filter((token) => token.isWritten)
          .map((token) => ({
            item: kanjiItem(token.token.surface, token.token.reading),
            from: token.from,
            to: token.to,
          }));

        // Reading it.
        const attempt = typeSentence(segments, at);
        if (attempt.finishedAt === null) throw new Error(`sentence ${candidate.id} did not finish`);
        keyErrors += attempt.errors;
        const summary = summarise(attempt);
        at = attempt.finishedAt;

        // Finishing it, as Practice.finish does.
        const timed: TimedSegment[] = usableTimings(attempt).map((timing) => ({
          segment: timing.segment,
          latencyMs: measuredLatency(timing),
          errors: timing.errors,
        }));
        const reviews = [...reviewsFor(segments, timed), ...reviewsForWords(words, timed)];
        const before = store;
        store = applyReviews(before, reviews, new Date(at), attempt.input);
        const baseline = before.reader[attempt.input].baselineMs;
        const meanLatency =
          timed.length === 0
            ? baseline
            : timed.reduce((sum, t) => sum + t.latencyMs, 0) / timed.length;
        progression = advance(progression, {
          accuracy: summary.accuracy,
          easeRatio: baseline > 0 ? meanLatency / baseline : 1,
          challenge,
        });
        seenAt.set(candidate.id, at);
        recent = [candidate.id, ...recent].slice(0, RECENT_MEMORY);
        sentencesRead++;

        at += BETWEEN_SENTENCES_MS;
      }
      samples.push({ at, score: scoreOf(store, new Date(at)) });
    }
    // Overnight, so decay shows up in the day-long windows too.
    const nextMorning = origin + (day + 1) * DAY_MS;
    samples.push({ at: nextMorning - 1, score: scoreOf(store, new Date(nextMorning - 1)) });
    const dayScore = samples.at(-1)?.score ?? 0;
    console.log(
      `day ${String(day + 1).padStart(2)}: score ${String(dayScore).padStart(7)}, band ${String(progression.band)}, items ${String(store.items.size)}, sentences ${String(sentencesRead)}`,
    );
  }

  const endOfDay = (day: number): number => {
    const cutoff = origin + day * DAY_MS;
    return samples.filter((sample) => sample.at < cutoff).at(-1)?.score ?? 0;
  };
  const dayGain = (day: number): number => endOfDay(day) - endOfDay(day - 1);

  // The fastest path itself: the highest score reached by each point after
  // starting, as the table the score check reads. See src/lib/sync/score-limits.ts.
  console.log("");
  console.log("fastest path, [minutes since starting, highest score by then]:");
  const checkpoints = [
    5,
    10,
    20,
    30,
    45,
    60,
    90,
    120,
    180,
    240,
    300,
    360,
    420,
    480,
    ...Array.from({ length: days }, (_, day) => (day + 1) * 1440),
  ];
  for (const minutes of checkpoints) {
    const cutoff = origin + minutes * 60_000;
    const best = samples
      .filter((sample) => sample.at <= cutoff)
      .reduce((high, sample) => Math.max(high, sample.score), 0);
    console.log(`  [${String(minutes)}, ${String(best)}],`);
  }

  console.log("");
  console.log(`sentences read: ${String(sentencesRead)}, wrong keys: ${String(keyErrors)}`);
  console.log(`largest gain in 10 minutes: ${String(largestGain(samples, 10 * 60_000))}`);
  console.log(`largest gain in 60 minutes: ${String(largestGain(samples, 60 * 60_000))}`);
  console.log(`largest gain in 24 hours:   ${String(largestGain(samples, DAY_MS))}`);
  for (const day of [1, 2, 7, 30]) {
    if (day <= days) console.log(`gain on day ${String(day)}: ${String(dayGain(day))}`);
  }
  console.log("");
  console.log(
    `ceiling: ${String(ceiling.kana)} kana items, ${String(ceiling.words)} word items, ${String(ceiling.score)} points`,
  );
  console.log(`ran in ${String(Math.round((performance.now() - startedAt) / 1000))} s`);
}

await main();
