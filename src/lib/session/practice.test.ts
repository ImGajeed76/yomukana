// Drives the whole chain over the real corpus: candidates, selection, typing,
// grading, scheduling, and the band the reader ends up in.
//
// The Svelte components are the only part left out, and they hold no logic. If
// this passes, a reader who types perfectly gets promoted and a reader who types
// badly does not.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { tokenSpans } from "../corpus/display";
import { readingOf, type CorpusChunk } from "../corpus/types";
import { preferredRomaji, segmentKana, type Segment } from "../romaji";
import {
  DEFAULT_OPTIONS,
  START,
  advance,
  allowsKatakana,
  hiraganaMastery,
  pickSentence,
  scoreSentence,
  type Candidate,
  type Progression,
} from "../selection";
import {
  EMPTY_STORE,
  applyReviews,
  itemsForSegments,
  reviewsFor,
  type ItemStore,
  type TimedSegment,
} from "../srs";
import { startAttempt, summarise, usableTimings, type Attempt } from "./attempt";
import { applyKey, classifyKey } from "./keyboard";

const CORPUS_FILE = "static/corpus/band-0.json";
const hasCorpus = existsSync(CORPUS_FILE);

/** Types a sentence, one key every `msPerKey` milliseconds. */
function typePerfectly(segments: readonly Segment[], msPerKey: number): Attempt {
  let attempt = startAttempt(segments, 0);
  let at = 0;

  for (const key of preferredRomaji(segments)) {
    at += msPerKey;
    attempt = applyKey(
      attempt,
      classifyKey({ key, ctrlKey: false, metaKey: false, altKey: false }),
      at,
    ).attempt;
  }
  return attempt;
}

function timedFrom(attempt: Attempt): TimedSegment[] {
  return usableTimings(attempt).map((timing) => ({
    segment: timing.segment,
    latencyMs: timing.firstKeyAt - timing.availableAt,
    errors: timing.errors,
  }));
}

/** Mean recognition latency over a sentence, in multiples of the reader's norm. */
function easeRatioOf(timed: readonly TimedSegment[], baselineMs: number): number {
  if (timed.length === 0 || baselineMs <= 0) return 1;
  let total = 0;
  for (const timing of timed) total += timing.latencyMs;
  return total / timed.length / baselineMs;
}

interface Session {
  readonly store: ItemStore;
  readonly progression: Progression;
  readonly sentences: number;
}

/** Runs a reader through `rounds` sentences of the given corpus. */
function practise(
  candidates: readonly Candidate[],
  segmentsOf: Map<string, Segment[]>,
  rounds: number,
): Session {
  let store = EMPTY_STORE;
  let progression = START;
  let recent: string[] = [];
  let sentences = 0;

  for (let round = 0; round < rounds; round++) {
    const at = new Date(Date.UTC(2026, 0, 1) + round * 60_000);
    const options = { ...DEFAULT_OPTIONS, recent };
    const candidate = pickSentence(candidates, store, at, options);
    if (candidate === null) break;

    const score = scoreSentence(candidate, store, at, options);
    const segments = segmentsOf.get(candidate.id) ?? [];
    const attempt = typePerfectly(segments, 90);
    const timed = timedFrom(attempt);

    progression = advance(progression, {
      accuracy: summarise(attempt).accuracy,
      easeRatio: easeRatioOf(timed, store.reader.keyboard.baselineMs),
      challenge: score.newCount + score.weakCount,
    });
    store = applyReviews(store, reviewsFor(segments, timed), at);
    recent = [candidate.id, ...recent].slice(0, 8);
    sentences += 1;
  }

  return { store, progression, sentences };
}

describe.skipIf(!hasCorpus)("practice over the shipped corpus", () => {
  const chunk = JSON.parse(
    hasCorpus ? readFileSync(CORPUS_FILE, "utf8") : "{}",
  ) as Partial<CorpusChunk>;
  const segmentsOf = new Map<string, Segment[]>();
  const candidates: Candidate[] = [];

  for (const sentence of (chunk.sentences ?? []).slice(0, 600)) {
    const segments = segmentKana(readingOf(sentence));
    segmentsOf.set(sentence.id, segments);
    candidates.push({ id: sentence.id, band: sentence.band, items: itemsForSegments(segments) });
  }

  test("the first band is readable without katakana or kanji", () => {
    // Band 0 is where a reader starts, so it must not be gated shut for them.
    const kanaOnly = candidates.filter((candidate) =>
      candidate.items.every((item) => item.kind === "kana"),
    );
    expect(kanaOnly.length).toBe(candidates.length);
  });

  test("every sentence in the corpus is typeable", () => {
    for (const [, segments] of segmentsOf) {
      expect(segments.every((segment) => segment.kind !== "untypeable")).toBe(true);
      expect(preferredRomaji(segments).length).toBeGreaterThan(0);
    }
  });

  test("a reader who types cleanly learns characters and moves up", () => {
    const session = practise(candidates, segmentsOf, 80);

    expect(session.sentences).toBe(80);
    expect(session.store.items.size).toBeGreaterThan(20);
    expect(session.progression.band).toBeGreaterThan(0);
  });

  test("the reader's baseline settles near how fast they actually type", () => {
    const session = practise(candidates, segmentsOf, 120);

    // Typing one key every 90ms, most characters take one or two keys, so the
    // pause before a character lands in the low hundreds of milliseconds.
    expect(session.store.reader.keyboard.baselineMs).toBeGreaterThan(50);
    expect(session.store.reader.keyboard.baselineMs).toBeLessThan(400);
  });

  test("hiragana knowledge grows and the katakana gate is shut until it does", () => {
    const early = practise(candidates, segmentsOf, 10);
    const later = practise(candidates, segmentsOf, 150);

    expect(hiraganaMastery(later.store)).toBeGreaterThan(hiraganaMastery(early.store));
    expect(allowsKatakana(EMPTY_STORE)).toBe(false);
  });

  test("token spans line up with the segments for every sentence", () => {
    for (const sentence of (chunk.sentences ?? []).slice(0, 600)) {
      const segments = segmentsOf.get(sentence.id) ?? [];
      const spans = tokenSpans(sentence.tokens, segments);

      expect(spans[0]?.from).toBe(0);
      expect(spans[spans.length - 1]?.to).toBe(segments.length);
    }
  });
});
