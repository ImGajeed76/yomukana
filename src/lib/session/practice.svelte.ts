// Ties the pieces together: pick a sentence, run an attempt, grade it, store it,
// and move the reader up or down as the evidence comes in.
//
// The route renders this; it holds no markup and no timing logic of its own, so
// the parts worth testing stay in the pure modules underneath.

import { expandKana, planDisplay, tokenSpans, type DisplayToken } from "../corpus/display";
import { Corpus } from "../corpus/load";
import { STARTER_SENTENCES } from "../corpus/starter";
import type { CorpusToken } from "../corpus/types";
import { Progress, type AttemptRecord } from "../db";
import { segmentKana, type Segment } from "../romaji";
import {
  DEFAULT_OPTIONS,
  START,
  advance,
  allowsKanji,
  allowsKatakana,
  chooseRevealed,
  bandsAround,
  pickSentence,
  scoreSentence,
  type Candidate,
  type Progression,
} from "../selection";
import {
  applyReviews,
  itemsForSegments,
  kanjiItem,
  reviewsFor,
  reviewsForWords,
  type TimedSegment,
  type WordSpan,
} from "../srs";
import { scoreOf } from "../stats/score";
import {
  measuredLatency,
  summarise,
  usableTimings,
  type Attempt,
  type AttemptSummary,
} from "./attempt";

/** Sentences held back from the running, so the reader is not shown the same few. */
const RECENT_MEMORY = 8;

/** Shared empty set, so the common case allocates nothing. */
const NOTHING_REVEALED: ReadonlySet<number> = new Set<number>();

/** Everything the view needs about the sentence on screen. */
export interface CurrentSentence {
  readonly id: string;
  /** What the reader types. */
  readonly segments: readonly Segment[];
  /** What the reader sees. */
  readonly tokens: readonly DisplayToken[];
  /** The written words on screen, for grading them as their own items. */
  readonly words: readonly WordSpan[];
  readonly meaning: string;
}

/** A timestamp, read once and never mutated. */
function now(): Date {
  return new Date();
}

/**
 * How this sentence read compared with how the reader usually reads, as a
 * multiple of their baseline. Below 1 means faster than their norm.
 */
function easeRatio(timed: readonly TimedSegment[], baselineMs: number): number {
  if (timed.length === 0 || baselineMs <= 0) return 1;

  let total = 0;
  for (const timing of timed) total += timing.latencyMs;
  return total / timed.length / baselineMs;
}

export class Practice {
  readonly #progress = new Progress();
  readonly #corpus = new Corpus();

  /** Kana-only sentences to start on while the first band downloads. */
  readonly #starter: readonly Candidate[] = STARTER_SENTENCES.map((sentence) => ({
    id: sentence.id,
    items: itemsForSegments(segmentKana(sentence.text)),
  }));

  #recent: string[] = [];
  #progression: Progression = START;
  /** How much the sentence on screen had left to teach, when it was chosen. */
  #challenge = 0;
  /**
   * When each sentence was last read.
   *
   * Sentences are not scheduled, they cool down: see the note on `seenAt` in
   * selection/select.ts for why reading is not the same as remembering.
   */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- read by the selector, never rendered
  readonly #seenAt = new Map<string, number>();

  // Raw for the same reason the stats page is: a sentence is a few dozen
  // segments and tokens, it is replaced whole for each one, and nothing here
  // should be building proxies on the keystroke path. See CLAUDE.md 1.8.
  current = $state.raw<CurrentSentence | null>(null);
  summary = $state.raw<AttemptSummary | null>(null);
  /**
   * Counts sentences shown. The selector may legitimately pick the same sentence
   * again, so the id alone is not enough to tell the view a new attempt started.
   */
  round = $state(0);
  /** Whether stored progress has been read back yet. */
  isLoaded = $state(false);
  /** Whether what the reader does here will still be there tomorrow. */
  isPersistent = $state(false);

  /**
   * The difficulty band sentences are drawn from, and whether the real corpus
   * has replaced the cold-start set.
   *
   * Plain fields rather than state: nothing on screen shows either of them, and
   * the reader should not be told which band they are in. See CLAUDE.md 12.5.
   */
  #band = 0;
  #isCorpusReady = false;

  constructor() {
    this.#choose();
  }

  /**
   * Reads stored progress, then the corpus.
   *
   * The reader can type the whole time. Nothing here blocks the first sentence,
   * which is the reason the cold-start set exists.
   */
  async load(): Promise<void> {
    await this.#progress.load();
    this.isPersistent = this.#progress.isPersistent;
    this.isLoaded = true;
    this.#choose();

    await this.#corpus.open();
    await this.#corpus.ensure(bandsAround(this.#band, this.#corpus.highestBand));
    this.#isCorpusReady = true;
    this.#choose();
  }

  #candidates(): readonly Candidate[] {
    if (!this.#isCorpusReady) return this.#starter;

    const at = now();
    const candidates = this.#corpus.candidates(bandsAround(this.#band, this.#corpus.highestBand), {
      allowKatakana: allowsKatakana(this.#progress.store, at),
      allowKanji: allowsKanji(this.#progress.store, at),
    });
    // A reader whose bands hold nothing the gates allow still needs something to
    // read, so fall back rather than showing them an empty screen.
    return candidates.length === 0 ? this.#starter : candidates;
  }

  #segmentsFor(id: string): readonly Segment[] {
    const fromCorpus = this.#corpus.segmentsFor(id);
    if (fromCorpus.length > 0) return fromCorpus;

    const starter = STARTER_SENTENCES.find((sentence) => sentence.id === id);
    return starter === undefined ? [] : segmentKana(starter.text);
  }

  #meaningFor(id: string): string {
    const sentence = this.#corpus.sentence(id);
    if (sentence !== null) return sentence.meaning;

    return STARTER_SENTENCES.find((entry) => entry.id === id)?.meaning ?? "";
  }

  /** The corpus tokens for a sentence, or one whole-sentence token for a starter. */
  #tokensFor(id: string): readonly CorpusToken[] {
    const sentence = this.#corpus.sentence(id);
    if (sentence !== null) return sentence.tokens;

    const starter = STARTER_SENTENCES.find((entry) => entry.id === id);
    return starter === undefined ? [] : [{ surface: starter.text, reading: starter.text }];
  }

  #choose(): void {
    const at = now();
    const options = { ...DEFAULT_OPTIONS, recent: this.#recent, seenAt: this.#seenAt };
    const candidate = pickSentence(this.#candidates(), this.#progress.store, at, options);
    if (candidate === null) {
      this.current = null;
      return;
    }

    // Kept from the moment of choosing. It is what the selector knew about this
    // sentence, and reading it back afterwards would measure the store the
    // reader's own answers have already changed.
    const scored = scoreSentence(candidate, this.#progress.store, at, options);
    this.#challenge = scored.newCount + scored.weakCount;

    const segments = this.#segmentsFor(candidate.id);
    const tokens = this.#tokensFor(candidate.id);
    const spans = tokenSpans(tokens, segments);

    const store = this.#progress.store;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a local, read once while building the plan
    const nothingRevealed = new Set<number>();
    const revealed = allowsKanji(store, at) ? chooseRevealed(tokens, store, at) : nothingRevealed;

    const plan = planDisplay(spans, (_token, index) => revealed.has(index));
    const words: WordSpan[] = plan
      .filter((token) => token.isWritten)
      .map((token) => ({
        item: kanjiItem(token.token.surface, token.token.reading),
        from: token.from,
        to: token.to,
      }));

    this.current = {
      id: candidate.id,
      segments,
      tokens: expandKana(plan, segments),
      words,
      meaning: this.#meaningFor(candidate.id),
    };
  }

  /**
   * Grades a finished attempt and writes it down.
   *
   * Everything here happens after the last keystroke of the sentence, which is
   * the only moment the app is allowed to do work this size. See CLAUDE.md 1.8.
   */
  async finish(attempt: Attempt, revealed: ReadonlySet<number> = NOTHING_REVEALED): Promise<void> {
    const summary = summarise(attempt);
    this.summary = summary;

    const current = this.current;
    if (current === null) return;

    const timed: TimedSegment[] = usableTimings(attempt).map((timing) => ({
      segment: timing.segment,
      latencyMs: measuredLatency(timing),
      errors: timing.errors,
    }));

    // Characters and written words are separate knowledge and both get graded:
    // reading か is not reading 学校, even when the same keystrokes prove both.
    // A word whose reading the reader asked for was not read, it was looked up.
    // Grading it would record a recognition time for knowledge they just told us
    // they do not have.
    const readWords = current.words.filter((word) => !revealed.has(word.from));
    const reviews = [...reviewsFor(current.segments, timed), ...reviewsForWords(readWords, timed)];
    const at = now();
    const before = this.#progress.store;
    const store = applyReviews(before, reviews, at);

    // Measured against the baseline the reader had going in, which is what this
    // sentence actually asked of them.
    this.#progression = advance(this.#progression, {
      accuracy: summary.accuracy,
      easeRatio: easeRatio(timed, before.reader.baselineLatencyMs),
      challenge: this.#challenge,
    });
    this.#band = this.#progression.band;

    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a local, discarded after the write
    const changed = new Set(reviews.map((review) => review.item.id));
    const record: AttemptRecord = {
      sentenceId: current.id,
      finishedAt: at.getTime(),
      durationMs: summary.durationMs,
      keyCount: summary.keyCount,
      errors: summary.errors,
      segments: attempt.timings.length,
      // Written down now because it cannot be worked out later: an item state
      // says what the reader knows today, not what they knew in March.
      score: scoreOf(store),
    };

    this.#seenAt.set(current.id, at.getTime());
    this.#recent = [current.id, ...this.#recent].slice(0, RECENT_MEMORY);
    await this.#progress.commit(store, changed, record);

    if (this.#isCorpusReady) {
      await this.#corpus.ensure(bandsAround(this.#band, this.#corpus.highestBand));
    }
  }

  next(): void {
    this.summary = null;
    this.round += 1;
    this.#choose();
  }

  /**
   * Abandons the sentence on screen and moves on.
   *
   * Nothing is graded. A reader who cannot read a sentence has told us nothing
   * about the characters in it except that this was the wrong sentence, and
   * charging them for giving up is how a trainer teaches people to stop opening
   * it. The sentence goes on the recent list so it does not come straight back.
   */
  skip(): void {
    const current = this.current;
    if (current !== null) {
      this.#recent = [current.id, ...this.#recent].slice(0, RECENT_MEMORY);
    }
    this.next();
  }
}
