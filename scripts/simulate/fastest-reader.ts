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
// fastest pace the app believes, and practises eight hours a day in
// fifty-minute sittings.
//
// Run with `bun scripts/simulate/fastest-reader.ts [days]`. Prints the path
// the leaderboard limits are made from (src/lib/sync/score-limits.ts) and the
// largest gain in any ten minutes, hour and day.

import { planDisplay, tokenSpans } from "../../src/lib/corpus/display";
import { Corpus, type Fetcher } from "../../src/lib/corpus/load";
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
  kanjiItem,
  reviewsFor,
  reviewsForWords,
  type ItemStore,
  type TimedSegment,
  type WordSpan,
} from "../../src/lib/srs";
import { scoreOf } from "../../src/lib/stats/score";
import { countUses, textShareFrom } from "../../src/lib/stats/text-share";
import {
  RELEARNING_WINDOWS,
  SHORTEST_STEP_MS,
  lastTimeAt,
  lastTimeOn,
  leastTimeOn,
  leastTimeTo,
} from "../../src/lib/sync/score-limits";
import { judgeScore, type AcceptedScore, type ScoreLimits } from "../../functions/api/score-check";

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

/**
 * How far the path may lag behind this reader, as a share of the time it
 * took and at most PATH_ERROR_MINUTES: a path drawn exactly under every high
 * needs hundreds of points. Out of TIME_MARGIN in
 * src/lib/sync/score-limits.ts, so a real reader still has 1.5 / 1.1, about
 * a third, of room.
 */
const PATH_SLACK = 1.1;

/**
 * How far the path may lag behind or run ahead of this reader, in minutes. A
 * step up is judged by the path's time between two scores, so an error at
 * either end makes the step look slower than it was. Both ends together
 * stay well inside the margin on SHORTEST_STEP_MS.
 */
const PATH_ERROR_MINUTES = 5;

/**
 * How long the score has to stand still to be kept as a stretch of the path:
 * the breaks between sittings and the nights, not the moment between two
 * sentences.
 */
const STILL_MINUTES = 5;

/**
 * The fastest path in as few points as it takes, close to the reader. The
 * check draws straight lines between the points, and a score jumps once a
 * sentence rather than growing smoothly, so a line between hand-picked
 * points cuts under some of the jumps: it says a score needs longer than
 * this reader took, and refuses it. So this starts from every new high and
 * joins neighbours only where the line between them stays within
 * PATH_SLACK and PATH_ERROR_MINUTES of every high in between.
 * Minutes are rounded down, which only makes it faster.
 */
function pathNear(syncs: readonly Sample[], startedAt: number): [number, number][] {
  const minutesOf = (at: number): number => (at - startedAt) / 60_000;
  const highs: [number, number][] = [[0, 0]];
  for (const sync of syncs) {
    const [highMinutes, highScore] = highs.at(-1) ?? [0, 0];
    if (sync.score <= highScore) continue;
    // Where it stood still, a break or a night, so the check can start a step
    // from the end of it: the score stays put until the sentence that lifts
    // it ends. See lastTimeAt in src/lib/sync/score-limits.ts.
    const minutes = minutesOf(sync.at);
    if (minutes - highMinutes >= STILL_MINUTES) highs.push([minutes - 0.01, highScore]);
    highs.push([minutes, sync.score]);
  }
  // Whether the line from one high to another stays close to every high in
  // between. Never across a stretch it stood still, which stays two points.
  const isClose = (from: number, to: number): boolean => {
    for (let index = from + 1; index <= to; index++) {
      if (highs[index]?.[1] === highs[index - 1]?.[1]) return false;
    }
    const [fromMinutes, fromScore] = highs[from] ?? [0, 0];
    const [toMinutes, toScore] = highs[to] ?? [0, 0];
    for (let index = from + 1; index < to; index++) {
      const [minutes, score] = highs[index] ?? [0, 0];
      const line =
        fromMinutes + ((score - fromScore) / (toScore - fromScore)) * (toMinutes - fromMinutes);
      const lag = Math.min(minutes * (PATH_SLACK - 1), PATH_ERROR_MINUTES);
      if (line > minutes + lag || line < minutes - PATH_ERROR_MINUTES) return false;
    }
    return true;
  };
  const path: [number, number][] = [[0, 0]];
  let from = 0;
  while (from < highs.length - 1) {
    let to = from + 1;
    while (to + 1 < highs.length && isClose(from, to + 1)) to++;
    const [minutes, score] = highs[to] ?? [0, 0];
    path.push([Math.floor(minutes * 100) / 100, score]);
    from = to;
  }
  return path;
}

/** How long the server keeps accepted scores, as KEEP_INTERVAL in functions/api/scores.ts. */
const KEEP_MS = 2 * DAY_MS;

/**
 * Sends each score to the server's own check, as the app does after every
 * sentence, and returns the ones it turns away. This reader is the fastest
 * plausible one, so anything it returns is a refusal a real reader can get.
 */
function refusedSyncs(
  syncs: readonly Sample[],
  startedAt: number,
  path: Pick<ScoreLimits, "leastTimeTo" | "lastTimeAt">,
): Sample[] {
  const limits: ScoreLimits = {
    relearning: RELEARNING_WINDOWS,
    shortestStepMs: SHORTEST_STEP_MS,
    ...path,
  };
  const refused: Sample[] = [];
  let peak: AcceptedScore | null = null;
  let recent: AcceptedScore[] = [];
  for (const sync of syncs) {
    if (
      judgeScore(sync.score, sync.at, { createdAt: startedAt, peak, recent }, limits) !== "accept"
    ) {
      refused.push(sync);
      continue;
    }
    const best = Math.max(sync.score, peak?.score ?? 0);
    const accepted = { score: sync.score, at: sync.at, best };
    recent = [...recent.filter((entry) => entry.at >= sync.at - KEEP_MS), accepted];
    if (sync.score > (peak?.score ?? 0)) peak = accepted;
  }
  return refused;
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
  // The same counts the app ships in static/corpus/text-share.json.
  const share = textShareFrom(countUses(everything));

  let store: ItemStore = EMPTY_STORE;
  let progression: Progression = START;
  let recent: string[] = [];
  const seenAt = new Map<string, number>();
  const samples: Sample[] = [];
  /** The score the app would send after each sentence. */
  const syncs: Sample[] = [];
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
          samples.push({ at, score: scoreOf(store, new Date(at), share) });
          nextSample += SAMPLE_MS;
        }
        await corpus.ensure(bandsAround(progression.band, corpus.highestBand));

        // Choosing, as Practice.#choose does.
        const when = new Date(at);
        const options = { ...DEFAULT_OPTIONS, random, recent, seenAt };
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
        syncs.push({ at, score: scoreOf(store, new Date(at), share) });

        at += BETWEEN_SENTENCES_MS;
      }
      samples.push({ at, score: scoreOf(store, new Date(at), share) });
    }
    // Overnight, so decay shows up in the day-long windows too.
    const nextMorning = origin + (day + 1) * DAY_MS;
    samples.push({ at: nextMorning - 1, score: scoreOf(store, new Date(nextMorning - 1), share) });
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

  // The fastest path itself, as the table the score check reads. See
  // src/lib/sync/score-limits.ts.
  const path = pathNear(syncs, origin);
  console.log("");
  console.log(
    `fastest path, [minutes since starting, highest score by then], ${String(path.length)} points:`,
  );
  for (const [minutes, score] of path) console.log(`  [${String(minutes)}, ${String(score)}],`);

  console.log("");
  console.log(`sentences read: ${String(sentencesRead)}, wrong keys: ${String(keyErrors)}`);
  console.log(`largest gain in 10 minutes: ${String(largestGain(samples, 10 * 60_000))}`);
  console.log(`largest gain in 60 minutes: ${String(largestGain(samples, 60 * 60_000))}`);
  console.log(`largest gain in 24 hours:   ${String(largestGain(samples, DAY_MS))}`);
  for (const day of [1, 2, 7, 30]) {
    if (day <= days) console.log(`gain on day ${String(day)}: ${String(dayGain(day))}`);
  }

  // Both must be none: a refusal here is one an honest reader can get too.
  // The table in use, and the path just measured, before it replaces it.
  console.log("");
  for (const [name, along] of [
    ["the table in score-limits.ts", { leastTimeTo, lastTimeAt }],
    [
      "the path above",
      {
        leastTimeTo: (score: number) => leastTimeOn(path, score),
        lastTimeAt: (score: number) => lastTimeOn(path, score),
      },
    ],
  ] as const) {
    const refused = refusedSyncs(syncs, origin, along);
    console.log(`syncs refused by ${name}: ${String(refused.length)} of ${String(syncs.length)}`);
    for (const sync of refused.slice(0, 5)) {
      const minutes = ((sync.at - origin) / 60_000).toFixed(2);
      console.log(`  minute ${minutes}: ${String(sync.score)}`);
    }
  }
  console.log("");
  console.log(`ran in ${String(Math.round((performance.now() - startedAt) / 1000))} s`);
}

await main();
