// Picks the next sentence.
//
// The rule the whole app is built around: a sentence should test a few things
// the reader is shaky on, surrounded by things they are not. Reading in context
// is the skill, and a sentence where every character is hard stops being reading
// and becomes decoding. See CLAUDE.md 0.

import { recallProbability, type Item, type ItemState, type ItemStore } from "../srs";

export interface Candidate {
  readonly id: string;
  /** Which difficulty band it came from. */
  readonly band: number;
  /** The items this sentence tests, deduplicated. */
  readonly items: readonly Item[];
}

export type Bucket = "new" | "weak" | "known";

/** Below this chance of recall, an item counts as needing work. */
const WEAK_RECALL = 0.9;

export function bucketFor(state: ItemState | undefined, now: Date): Bucket {
  if (state === undefined || state.reviews === 0) return "new";
  return recallProbability(state, now) < WEAK_RECALL ? "weak" : "known";
}

/** An item's chance of recall right now, by id. */
type RecallOf = (state: ItemState) => number;

/**
 * Recall worked out once per item for one pick, however many sentences share
 * the item. A pick scores thousands of sentences that share a few thousand
 * items between them, and working recall out again for each sentence was most
 * of what a pick cost: on a phone, between sentences, that is time the reader
 * waits for.
 */
function recallFor(now: Date): RecallOf {
  const known = new Map<string, number>();
  return (state) => {
    let recall = known.get(state.id);
    if (recall === undefined) {
      recall = recallProbability(state, now);
      known.set(state.id, recall);
    }
    return recall;
  };
}

export interface SelectionOptions {
  /**
   * Source of randomness for choosing between equally good sentences.
   *
   * Injected rather than reached for, so the selector stays a pure function of
   * its inputs and a test can pin what it picks.
   */
  readonly random: () => number;
  /** Fewest items worth practising for a sentence to be worth showing. */
  readonly minChallenge: number;
  /** Most the reader should face at once before the sentence stops being readable. */
  readonly maxChallenge: number;
  /** Sentence ids shown recently, most recent first. */
  readonly recent: readonly string[];
  /**
   * When each sentence was last read, in epoch milliseconds.
   *
   * Sentences are not scheduled for recall the way characters are. The reader is
   * here to learn to read, not to memorise thirty thousand sentences, and a
   * sentence that comes back while they still remember it stops testing their
   * reading and starts testing their memory of that sentence. So this is a
   * cooldown and not a schedule: it pushes a sentence to the back of the queue
   * and lets it drift forward again over weeks.
   */
  readonly seenAt: ReadonlyMap<string, number>;
}

export const DEFAULT_OPTIONS: SelectionOptions = {
  random: Math.random,
  minChallenge: 1,
  maxChallenge: 3,
  recent: [],
  seenAt: new Map(),
};

/** How long a sentence stays at the back of the queue after being read. */
const COOLDOWN_DAYS = 30;

/**
 * What being read costs a sentence.
 *
 * Larger than anything else in the score on purpose: an unread sentence should
 * beat a read one whatever else is true of them, and among read ones the one
 * read longest ago should win. It tapers rather than expiring, so a reader who
 * has been through everything in their band keeps going instead of being told
 * there is nothing to read.
 */
const COOLDOWN_PENALTY = 12;

const MS_PER_DAY = 86_400_000;

/**
 * How close to the best score still counts as being as good as the best.
 *
 * Without this the selector is an argmax over thousands of candidates that
 * mostly score identically, so the same handful of sentences win every time.
 * A reader with thirty thousand sentences was being shown about a hundred.
 */
const AS_GOOD_AS_BEST = 0.01;

// A new item is worth introducing, but not as urgently as one the reader is
// actively losing. Sits below a fully forgotten item and above a solid one.
const NEW_ITEM_WEIGHT = 0.6;

// How hard each kind of mismatch pulls the score. Being over the challenge cap
// hurts more than being under it: a sentence with nothing to learn is dull, one
// the reader cannot read is where they quit.
const IN_RANGE_BONUS = 3;
const UNDER_RANGE_PENALTY = 3;
const OVER_RANGE_PENALTY = 1.5;
const REPEAT_PENALTY = 6;

export interface SentenceScore {
  readonly score: number;
  readonly newCount: number;
  readonly weakCount: number;
  readonly knownCount: number;
}

/**
 * Scores one sentence against the reader's current state. Higher is better.
 * Exposed on its own so the reasons behind a pick can be shown to the reader and
 * checked in a test.
 */
export function scoreSentence(
  candidate: Candidate,
  store: ItemStore,
  now: Date,
  options: SelectionOptions = DEFAULT_OPTIONS,
): SentenceScore {
  return scoreWith(candidate, store, now, options, recallFor(now));
}

function scoreWith(
  candidate: Candidate,
  store: ItemStore,
  now: Date,
  options: SelectionOptions,
  recallOf: RecallOf,
): SentenceScore {
  let newCount = 0;
  let weakCount = 0;
  let knownCount = 0;
  let urgency = 0;

  for (const item of candidate.items) {
    const state = store.items.get(item.id);
    // The same buckets as bucketFor, with recall looked up once per pick.
    if (state === undefined || state.reviews === 0) {
      newCount += 1;
      urgency += NEW_ITEM_WEIGHT;
      continue;
    }
    const recall = recallOf(state);
    if (recall < WEAK_RECALL) {
      weakCount += 1;
      urgency += 1 - recall;
    } else {
      knownCount += 1;
    }
  }

  const challenge = newCount + weakCount;
  let score = urgency;

  if (challenge < options.minChallenge) {
    score -= UNDER_RANGE_PENALTY;
  } else if (challenge <= options.maxChallenge) {
    score += IN_RANGE_BONUS;
  } else {
    score += IN_RANGE_BONUS - (challenge - options.maxChallenge) * OVER_RANGE_PENALTY;
  }

  // Showing the same sentence twice in a row measures memory of the sentence,
  // not of the characters in it.
  const recentIndex = options.recent.indexOf(candidate.id);
  if (recentIndex !== -1) {
    score -= REPEAT_PENALTY / (recentIndex + 1);
  }

  const lastReadAt = options.seenAt.get(candidate.id);
  if (lastReadAt !== undefined) {
    const days = (now.getTime() - lastReadAt) / MS_PER_DAY;
    score -= COOLDOWN_PENALTY * Math.max(0, 1 - days / COOLDOWN_DAYS);
  }

  return { score, newCount, weakCount, knownCount };
}

/** The best-scoring candidate, or null if there are none. */
export function pickSentence(
  candidates: readonly Candidate[],
  store: ItemStore,
  now: Date,
  options: SelectionOptions = DEFAULT_OPTIONS,
): Candidate | null {
  let best: Candidate[] = [];
  let bestScore = Number.NEGATIVE_INFINITY;
  const recallOf = recallFor(now);

  for (const candidate of candidates) {
    const { score } = scoreWith(candidate, store, now, options, recallOf);
    if (score > bestScore + AS_GOOD_AS_BEST) {
      bestScore = score;
      best = [candidate];
    } else if (score > bestScore - AS_GOOD_AS_BEST) {
      // Equal as far as the reader is concerned. Kept, so one of them can be
      // drawn rather than the first one found winning forever.
      if (score > bestScore) bestScore = score;
      best.push(candidate);
    }
  }

  return best[Math.floor(options.random() * best.length)] ?? null;
}
