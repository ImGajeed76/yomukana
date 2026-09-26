// A simulated reader's real memory, which the app never sees.
//
// The point of simulating readers is to know the truth about them: how much
// Japanese they can really read, and how fast. A score is good when it agrees
// with that truth. So the truth has to come from somewhere the app cannot
// look, and it must not be the app's own memory model (FSRS), or any formula
// built on FSRS would be graded against itself. This is a different, simpler
// model on purpose: exponential forgetting with a stability per item, which
// grows with every successful recall, more when the recall was hard (the
// spacing effect), and shrinks on a lapse. The app only ever sees keystrokes.

import type { Random } from "./random";
import { logNormal } from "./random";

const DAY_MS = 86_400_000;
/** A memory that lasts a lifetime. Nothing grows past it. */
const MAX_STABILITY_DAYS = 36_500;

/** How one reader learns, forgets and reads. Every simulated person is one of these. */
export interface ReaderTraits {
  /** Stability in days after first learning an item from its hint. */
  readonly firstStabilityDays: number;
  /** How much a successful recall multiplies stability, at its hardest. */
  readonly growth: number;
  /** What a lapse keeps of an item's stability. */
  readonly lapseKeeps: number;
  /**
   * Reading time for a well-known item, in milliseconds, with the reach for
   * the key not included. How fast this person reads once they know it.
   */
  readonly fluentReadMs: number;
  /** Reading time for an item they only just manage to recall. */
  readonly effortfulReadMs: number;
  /** Reaching for a key: the part of every latency that is the hand, not the eye. */
  readonly motorMs: number;
  /** Between keys inside one mora. */
  readonly keyMs: number;
  /** How long they look at something they cannot read before trying. */
  readonly stuckMs: number;
  /** Stability in days they start with for everything, for someone who already reads Japanese. */
  readonly priorStabilityDays: number;
  /** How long before the first day they last used what they already knew, for someone rusty. */
  readonly priorAgeDays: number;
}

interface Memory {
  /** Days until recall falls to about 37% without practice. */
  stability: number;
  /** When it was last recalled or learned, in epoch milliseconds. */
  lastAt: number;
}

/** What happened when the reader met one item. */
export interface Encounter {
  readonly isRecalled: boolean;
  /** Time from seeing it to reaching for the first key, hand included. */
  readonly latencyMs: number;
}

export class Brain {
  readonly #traits: ReaderTraits;
  readonly #random: Random;
  readonly #memories = new Map<string, Memory>();
  /** When the simulation began: what someone who already reads Japanese knew, they knew then. */
  readonly #startedAt: number;

  constructor(traits: ReaderTraits, random: Random, startedAt: number) {
    this.#traits = traits;
    this.#random = random;
    this.#startedAt = startedAt;
  }

  get traits(): ReaderTraits {
    return this.#traits;
  }

  /** The chance of recalling an item right now, which is the truth the app guesses at. */
  recall(itemId: string, now: number): number {
    const memory = this.#memory(itemId);
    if (memory === null) return 0;
    return Math.exp(-(now - memory.lastAt) / (memory.stability * DAY_MS));
  }

  /** How long reading an item takes right now, if it is recalled. */
  readMs(itemId: string): number {
    const memory = this.#memory(itemId);
    if (memory === null) return this.#traits.effortfulReadMs;
    // Faster the stronger the memory: effortful for a fresh item, fluent once
    // it has lasted a few weeks.
    const strength = memory.stability / (memory.stability + 7);
    const { fluentReadMs, effortfulReadMs } = this.#traits;
    return effortfulReadMs + (fluentReadMs - effortfulReadMs) * strength;
  }

  /**
   * The reader meets an item. Recalled with the chance their memory gives, and
   * either way they come out knowing it better: a recall strengthens it, and a
   * failure is followed by reading the hint, which teaches it again.
   */
  meet(itemId: string, now: number): Encounter {
    const chance = this.recall(itemId, now);
    const isRecalled = this.#random() < chance;
    const { motorMs, stuckMs, firstStabilityDays, growth, lapseKeeps } = this.#traits;
    const memory = this.#memory(itemId);

    if (isRecalled && memory !== null) {
      const read = logNormal(this.#random, this.readMs(itemId), 0.25);
      // The harder the recall, the more it strengthens: the spacing effect.
      // One that was certain teaches almost nothing, so stability cannot run
      // away on a character read a thousand times.
      memory.stability = Math.min(
        MAX_STABILITY_DAYS,
        memory.stability * (1 + (growth - 1) * (1 - chance) + 0.02),
      );
      memory.lastAt = now;
      return { isRecalled, latencyMs: logNormal(this.#random, motorMs, 0.15) + read };
    }

    const learned: Memory =
      memory === null
        ? { stability: firstStabilityDays, lastAt: now }
        : { stability: Math.max(firstStabilityDays, memory.stability * lapseKeeps), lastAt: now };
    this.#memories.set(itemId, learned);
    return { isRecalled: false, latencyMs: logNormal(this.#random, stuckMs, 0.3) };
  }

  #memory(itemId: string): Memory | null {
    const existing = this.#memories.get(itemId);
    if (existing !== undefined) return existing;
    if (this.#traits.priorStabilityDays <= 0) return null;
    // Someone who already reads Japanese knows every item from the start.
    const prior: Memory = {
      stability: this.#traits.priorStabilityDays,
      lastAt: this.#startedAt - this.#traits.priorAgeDays * DAY_MS,
    };
    this.#memories.set(itemId, prior);
    return prior;
  }
}
