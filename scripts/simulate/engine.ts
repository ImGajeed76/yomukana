// The app's practice loop with a simulated person at the keyboard.
//
// Everything the app does is the app's own code: choosing a sentence,
// deciding which words show as kanji, timing each key, grading, scheduling,
// moving between bands. Only the person is simulated: a Brain decides whether
// they recall each character and how long they take, and they type exactly
// what a person would, wrong keys and all. The app sees keystrokes and
// nothing else, as it does with a real reader.

import { planDisplay, tokenSpans } from "../../src/lib/corpus/display";
import { Corpus, type Fetcher } from "../../src/lib/corpus/load";
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
  backspaceKey,
  measuredLatency,
  pressKey,
  startAttempt,
  summarise,
  usableTimings,
  type Attempt,
} from "../../src/lib/session/attempt";
import type { InputMethod } from "../../src/lib/srs";
import {
  EMPTY_STORE,
  applyReviews,
  itemForSegment,
  kanjiItem,
  recallProbability,
  reviewsFor,
  reviewsForWords,
  type ItemStore,
  type TimedSegment,
  type WordSpan,
} from "../../src/lib/srs";
import { toCodePoints } from "../../src/lib/japanese/text";
import type { Brain } from "./brain";
import { updatedShift } from "./calibration";
import type { Random } from "./random";

const CORPUS_ROOT = new URL("../../static", import.meta.url).pathname;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** Enter, and the eye finding the next sentence. */
const BETWEEN_SENTENCES_MS = 800;
const RECENT_MEMORY = 8;
/** A key no romaji spelling starts with, for a reader who does not know what to type. */
const WRONG_KEY = "q";

/** Reads the corpus from disk in place of the network, so the real Corpus class loads it. */
// Cast because the platform's fetch type carries extras, like preconnect, that
// the corpus loader never calls.
const fromDisk = ((input: string | URL | Request) => {
  const path =
    typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  return Promise.resolve(new Response(Bun.file(`${CORPUS_ROOT}${path}`)));
}) as Fetcher;

/** One corpus, opened once and shared by every simulated reader. */
export async function openCorpus(): Promise<Corpus> {
  const corpus = new Corpus(fromDisk);
  await corpus.open();
  return corpus;
}

/** Who is practising, how, and when. */
export interface Practice {
  readonly brain: Brain;
  readonly input: InputMethod;
  /** Minutes of practice on each day, from the first. Zero is a day off. */
  readonly minutesOnDay: (day: number) => number;
  readonly random: Random;
}

/** What the loop hands back at the end of each day. */
export interface DayEnd {
  readonly day: number;
  /** The last moment of the day, in epoch milliseconds. */
  readonly at: number;
  readonly store: ItemStore;
  readonly sentences: number;
  /** How far FSRS's recall is off for this reader, in log-odds. See calibration.ts. */
  readonly recallShift: number;
}

/**
 * Types one sentence the way this person would, key by key.
 *
 * Each character, or each written word, is met by the brain once, at its
 * first key: recalled, the keys follow after the time it took to read it;
 * not recalled, the person stares, reaches for a wrong key, deletes it and
 * types the reading they found in the hint. The rest of a written word
 * follows at typing speed, because its reading was recovered all at once.
 */
function typeSentence(
  segments: readonly Segment[],
  words: readonly WordSpan[],
  practice: Practice,
  startAt: number,
): Attempt {
  const { brain } = practice;
  const { keyMs, motorMs } = brain.traits;
  const wordStarting = new Map(words.map((word) => [word.from, word]));
  const inWord = new Set<number>();
  for (const word of words) for (let index = word.from; index < word.to; index++) inWord.add(index);

  let attempt = { ...startAttempt(segments, startAt), input: practice.input };
  let at = startAt;
  for (const [index, segment] of segments.entries()) {
    // ん as `nn`: a bare `n` before a vowel reads as the next mora instead.
    const spelling = segment.kind === "moraic-n" ? "nn" : (segment.spellings[0] ?? "");
    // Punctuation is stepped over by the app, with nothing to type.
    if (spelling === "") continue;

    const word = wordStarting.get(index);
    const item = word?.item ?? (inWord.has(index) ? null : itemForSegment(segment));
    const encounter = item === null ? null : brain.meet(item.id, at);
    at += encounter?.latencyMs ?? motorMs;

    if (encounter?.isRecalled === false) {
      attempt = pressKey(attempt, WRONG_KEY, at);
      at += motorMs;
      attempt = backspaceKey(attempt, at);
      at += motorMs;
    }
    for (const [position, key] of toCodePoints(spelling).entries()) {
      if (position > 0) at += keyMs;
      attempt = pressKey(attempt, key, at);
    }
  }
  return attempt;
}

/**
 * Runs one person through `days` days of practice, handing each day's end to
 * `observe`. Practice starts at seven in the evening, in one sitting.
 */
export async function simulate(
  corpus: Corpus,
  practice: Practice,
  days: number,
  startedAt: number,
  observe: (end: DayEnd) => void,
): Promise<void> {
  let store: ItemStore = EMPTY_STORE;
  let progression: Progression = START;
  let recent: string[] = [];
  const seenAt = new Map<string, number>();
  let sentences = 0;
  let recallShift = 0;

  for (let day = 0; day < days; day++) {
    const sittingStart = startedAt + day * DAY_MS + 11 * 60 * MINUTE_MS;
    const sittingEnd = sittingStart + practice.minutesOnDay(day) * MINUTE_MS;
    let at = sittingStart;

    while (at < sittingEnd) {
      await corpus.ensure(bandsAround(progression.band, corpus.highestBand));

      // Choosing, as Practice.#choose does, with this person's randomness.
      const when = new Date(at);
      const options = { ...DEFAULT_OPTIONS, random: practice.random, recent, seenAt };
      const candidates = corpus.candidates(bandsAround(progression.band, corpus.highestBand), {
        allowKatakana: allowsKatakana(store),
        allowKanji: allowsKanji(store),
      });
      const candidate = pickSentence(candidates, store, when, options);
      if (candidate === null) throw new Error("the selector found nothing to read");
      const scored = scoreSentence(candidate, store, when, options);
      const challenge = candidate.band > progression.band ? 0 : scored.newCount + scored.weakCount;

      const sentence = corpus.sentence(candidate.id);
      if (sentence === null) throw new Error(`no sentence ${candidate.id}`);
      const segments = corpus.segmentsFor(candidate.id);
      const spans = tokenSpans(sentence.tokens, segments);
      const revealed = allowsKanji(store)
        ? chooseRevealed(sentence.tokens, store, when)
        : new Set<number>();
      const words: WordSpan[] = planDisplay(spans, (_token, tokenIndex) => revealed.has(tokenIndex))
        .filter((token) => token.isWritten)
        .map((token) => ({
          item: kanjiItem(token.token.surface, token.token.reading),
          from: token.from,
          to: token.to,
        }));

      const attempt = typeSentence(segments, words, practice, at);
      if (attempt.finishedAt === null) throw new Error(`sentence ${candidate.id} did not finish`);
      const summary = summarise(attempt);
      at = attempt.finishedAt;

      // Finishing it, as Practice.finish does.
      const timed: TimedSegment[] = usableTimings(attempt).map((timing) => ({
        segment: timing.segment,
        latencyMs: measuredLatency(timing),
        errors: timing.errors,
      }));
      const reviews = [...reviewsFor(segments, timed), ...reviewsForWords(words, timed)];
      // What FSRS expected of each item already studied, against what happened,
      // as the app would record it at the same moment.
      for (const review of reviews) {
        const state = store.items.get(review.item.id);
        if (state === undefined || state.reviews === 0) continue;
        recallShift = updatedShift(
          recallShift,
          recallProbability(state, new Date(at)),
          review.errors === 0,
        );
      }
      const before = store;
      store = applyReviews(before, reviews, new Date(at), attempt.input);
      const baseline = before.reader[attempt.input].baselineMs;
      const meanLatency =
        timed.length === 0
          ? baseline
          : timed.reduce((sum, timing) => sum + timing.latencyMs, 0) / timed.length;
      progression = advance(progression, {
        accuracy: summary.accuracy,
        easeRatio: baseline > 0 ? meanLatency / baseline : 1,
        challenge,
      });
      seenAt.set(candidate.id, at);
      recent = [candidate.id, ...recent].slice(0, RECENT_MEMORY);
      sentences++;
      at += BETWEEN_SENTENCES_MS;
    }

    observe({ day, at: startedAt + (day + 1) * DAY_MS - 1, store, sentences, recallShift });
  }
}
