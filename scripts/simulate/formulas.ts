// Candidate score formulas, compared on the same simulated readers.
//
// Each one sees only what the app sees: the item store and the time. Some also
// use how often each item turns up in real text, counted once over the whole
// corpus, which the app could ship as a small table next to the corpus.

import { tokenSpans } from "../../src/lib/corpus/display";
import { segmentsOf } from "../../src/lib/corpus/load";
import type { CorpusSentence } from "../../src/lib/corpus/types";
import {
  itemForSegment,
  kanjiItem,
  parseItemId,
  recallProbability,
  type ItemState,
  type ItemStore,
} from "../../src/lib/srs";
import { scoreOf } from "../../src/lib/stats/score";
import { calibrated } from "./calibration";

const DAY_MS = 86_400_000;

/** How much of real text each item is: its morae, summed over every time it turns up. */
export interface TextShare {
  /** Morae of corpus text each item accounts for, written as real text is. */
  readonly moraeOf: ReadonlyMap<string, number>;
  /** All morae in the corpus. */
  readonly totalMorae: number;
  /** How many times each item turns up in the corpus: a kanji word once per use, a kana once per character. */
  readonly usesOf: ReadonlyMap<string, number>;
  /** All uses in the corpus. */
  readonly totalUses: number;
  /** A fixed sample of sentences, as the items each one needs, for formulas that read whole sentences. */
  readonly sampleSentences: readonly (readonly string[])[];
}

/** Counts, once, how much of real text each item accounts for. */
export function textShareOf(everything: readonly CorpusSentence[]): TextShare {
  const moraeOf = new Map<string, number>();
  let totalMorae = 0;
  const usesOf = new Map<string, number>();
  let totalUses = 0;
  const use = (id: string): void => {
    usesOf.set(id, (usesOf.get(id) ?? 0) + 1);
    totalUses += 1;
  };
  const sampleSentences: string[][] = [];
  for (const [index, sentence] of everything.entries()) {
    const segments = segmentsOf(sentence);
    const needs: string[] = [];
    for (const span of tokenSpans(sentence.tokens, segments)) {
      if (span.token.surface !== span.token.reading) {
        const id = kanjiItem(span.token.surface, span.token.reading).id;
        const morae = Math.max(1, span.to - span.from);
        moraeOf.set(id, (moraeOf.get(id) ?? 0) + morae);
        totalMorae += morae;
        use(id);
        needs.push(id);
        continue;
      }
      for (let position = span.from; position < span.to; position++) {
        const segment = segments[position];
        const item = segment === undefined ? null : itemForSegment(segment);
        if (item === null) continue;
        moraeOf.set(item.id, (moraeOf.get(item.id) ?? 0) + 1);
        totalMorae += 1;
        use(item.id);
        needs.push(item.id);
      }
    }
    // Every twentieth sentence: a sample spread evenly through the corpus.
    if (index % 20 === 0) sampleSentences.push(needs);
  }
  return { moraeOf, totalMorae, usesOf, totalUses, sampleSentences };
}

/**
 * A score for one reader. `recallShift` is how far FSRS's recall is off for
 * them, learned from their own reviews; only the calibrated formulas use it.
 */
export type Formula = (
  store: ItemStore,
  now: Date,
  share: TextShare,
  recallShift: number,
) => number;

// Pieces the candidates share.

const REFERENCE_READING_MS = 350;

/** Recall after `days` more days without practice: durable knowledge, not fresh exposure. */
function recallIn(state: ItemState, now: Date, days: number): number {
  return recallProbability(state, new Date(now.getTime() + days * DAY_MS));
}

/** Turns a share from 0 to 1 into a score with no top: every step closer to all of it costs more. */
function unbounded(share: number): number {
  const clamped = Math.min(Math.max(share, 0), 0.999_999);
  return 1000 * -Math.log(1 - clamped);
}

// The candidates.

/**
 * The formula the app had before this study, frozen here as the baseline:
 * every item at its weight, times recall now, times pace against 350 ms
 * clamped to 0.25 to 2.5. Kept as a copy because the app has since moved on.
 */
export const current: Formula = (store, now) => {
  let points = 0;
  for (const state of store.items.values()) {
    if (state.reviews === 0) continue;
    const item = parseItemId(state.id);
    if (item === null) continue;
    const weight = item.kind === "kana" ? 10 : 25;
    const pace =
      state.meanReadingMs === null
        ? 0.25
        : Math.min(2.5, Math.max(0.25, REFERENCE_READING_MS / Math.max(state.meanReadingMs, 40)));
    points += weight * recallProbability(state, now) * pace;
  }
  return Math.round(points);
};

/** The app's score as it ships now, to check it is the candidate the study chose. */
export const app: Formula = (store, now, share) => scoreOf(store, now, share);

/** What an item is worth: its share of real text, by morae or by uses. */
type Weighting = "morae" | "uses";

interface CoverageRecipe {
  /**
   * Days ahead recall is asked about: 0 is now, more rewards knowledge that
   * lasts. Negative means averaged over every day from now to that many
   * days ahead, which weighs today as much as next week.
   */
  readonly horizonDays: number;
  readonly weighting: Weighting;
  /**
   * How much reading pace counts, as a power of reference over reading time:
   * 0 not at all, 1 fully. Small powers let speed matter without letting
   * whatever typing speed leaks into the reading time matter much.
   */
  readonly pacePower: number;
  /** Whether recall is corrected for this reader first. See calibration.ts. */
  readonly isCalibrated: boolean;
}

/** Pace as a share of the fastest credited, 0 to 1, so coverage never passes all of the text. */
function paceFactor(state: ItemState, power: number): number {
  if (power === 0) return 1;
  if (state.meanReadingMs === null) return Math.pow(0.1, power);
  const reading = Math.max(state.meanReadingMs, 40);
  return Math.pow(Math.min(2.5, Math.max(0.25, REFERENCE_READING_MS / reading)) / 2.5, power);
}

/** Recall now, in some days, or averaged from now to then: see CoverageRecipe. */
function recallAcross(state: ItemState, now: Date, horizonDays: number): number {
  if (horizonDays === 0) return recallProbability(state, now);
  if (horizonDays > 0) return recallIn(state, now, horizonDays);
  let sum = 0;
  for (let day = 0; day <= -horizonDays; day++) sum += recallIn(state, now, day);
  return sum / (1 - horizonDays);
}

/** How much of real text a reader reads, on a scale with no top. */
export function coverageFormula(recipe: CoverageRecipe): Formula {
  return (store, now, share, recallShift) => {
    const weights = recipe.weighting === "morae" ? share.moraeOf : share.usesOf;
    const total = recipe.weighting === "morae" ? share.totalMorae : share.totalUses;
    let covered = 0;
    for (const state of store.items.values()) {
      if (state.reviews === 0) continue;
      const weight = (weights.get(state.id) ?? 0) / total;
      if (weight === 0) continue;
      const raw = recallAcross(state, now, recipe.horizonDays);
      const recall = recipe.isCalibrated ? calibrated(raw, recallShift) : raw;
      covered += weight * recall * paceFactor(state, recipe.pacePower);
    }
    return unbounded(covered);
  };
}

const plain = { weighting: "uses", pacePower: 0, isCalibrated: false } as const;

export const FORMULAS: Readonly<Record<string, Formula>> = {
  current,
  app,
  "uses now": coverageFormula({ ...plain, horizonDays: 0 }),
  "uses avg 2d": coverageFormula({ ...plain, horizonDays: -2 }),
  "uses avg 3d": coverageFormula({ ...plain, horizonDays: -3 }),
  "uses avg 4d": coverageFormula({ ...plain, horizonDays: -4 }),
  "uses avg 5d": coverageFormula({ ...plain, horizonDays: -5 }),
};
