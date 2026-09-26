// The people every formula is compared on.
//
// Chosen to cover what a comparison score has to get right, not to be a
// realistic population: a steady learner as the baseline, readers who differ
// only in how they type or what they type on (twins of the steady one, whose
// scores should match theirs), and the ways a score is usually fooled or
// unfair: cramming, breaks, fast hands with a weak memory, and someone who
// already reads Japanese.

import type { InputMethod } from "../../src/lib/srs";
import type { ReaderTraits } from "./brain";

export interface ReaderProfile {
  readonly name: string;
  readonly traits: ReaderTraits;
  readonly input: InputMethod;
  /** Minutes of practice on each day, from the first. */
  readonly minutesOnDay: (day: number) => number;
}

/** The steady learner's brain and hands, which the twins copy. */
const STEADY: ReaderTraits = {
  firstStabilityDays: 1,
  growth: 3,
  lapseKeeps: 0.4,
  fluentReadMs: 350,
  effortfulReadMs: 900,
  motorMs: 250,
  keyMs: 120,
  stuckMs: 2500,
  priorStabilityDays: 0,
  priorAgeDays: 0,
};

const every = (minutes: number) => () => minutes;

export const PROFILES: readonly ReaderProfile[] = [
  { name: "steady", traits: STEADY, input: "keyboard", minutesOnDay: every(20) },
  { name: "diligent", traits: STEADY, input: "keyboard", minutesOnDay: every(60) },
  {
    name: "casual",
    traits: STEADY,
    input: "keyboard",
    // Four days a week.
    minutesOnDay: (day) => (day % 7 < 4 ? 10 : 0),
  },
  {
    name: "twin-slow-typist",
    traits: { ...STEADY, motorMs: 450, keyMs: 230 },
    input: "keyboard",
    minutesOnDay: every(20),
  },
  {
    name: "twin-phone",
    traits: { ...STEADY, motorMs: 420, keyMs: 260 },
    input: "touch",
    minutesOnDay: every(20),
  },
  {
    // Reads faster than the steady one, with the same memory and hands.
    name: "twin-fast-reader",
    traits: { ...STEADY, fluentReadMs: 200, effortfulReadMs: 550 },
    input: "keyboard",
    minutesOnDay: every(20),
  },
  {
    // Reads slower than the steady one, with the same memory and hands.
    name: "twin-slow-reader",
    traits: { ...STEADY, fluentReadMs: 600, effortfulReadMs: 1400 },
    input: "keyboard",
    minutesOnDay: every(20),
  },
  {
    name: "fast-hands-weak-memory",
    traits: {
      ...STEADY,
      motorMs: 140,
      keyMs: 60,
      firstStabilityDays: 0.4,
      growth: 2,
      lapseKeeps: 0.25,
    },
    input: "keyboard",
    minutesOnDay: every(20),
  },
  {
    name: "crammer",
    traits: STEADY,
    input: "keyboard",
    // Three hours a day for a week, a month off, then twenty minutes a day.
    minutesOnDay: (day) => (day < 7 ? 180 : day < 37 ? 0 : 20),
  },
  {
    name: "break",
    traits: STEADY,
    input: "keyboard",
    minutesOnDay: (day) => (day < 30 || day >= 60 ? 30 : 0),
  },
  {
    name: "fluent",
    traits: {
      ...STEADY,
      priorStabilityDays: 3650,
      fluentReadMs: 150,
      effortfulReadMs: 300,
      motorMs: 200,
      keyMs: 90,
    },
    input: "keyboard",
    minutesOnDay: every(15),
  },
  {
    name: "rusty-returner",
    // Learned it all once, last used four months ago: about one in eight
    // things still there on the first day, and quick to come back.
    traits: { ...STEADY, priorStabilityDays: 60, priorAgeDays: 120, growth: 4 },
    input: "keyboard",
    minutesOnDay: every(20),
  },
];

/**
 * Other brains, to check a result does not hang on how the default one was
 * set. Each changes how everyone in the cast learns and forgets; hands, eyes
 * and schedules stay as they are.
 */
export const BRAIN_VARIANTS: Readonly<Record<string, (traits: ReaderTraits) => ReaderTraits>> = {
  default: (traits) => traits,
  "forgets-fast": (traits) => ({
    ...traits,
    firstStabilityDays: traits.firstStabilityDays * 0.4,
    growth: 1 + (traits.growth - 1) * 0.6,
  }),
  "forgets-slow": (traits) => ({
    ...traits,
    firstStabilityDays: traits.firstStabilityDays * 2.5,
    growth: 1 + (traits.growth - 1) * 1.5,
  }),
  "little-spacing-effect": (traits) => ({ ...traits, growth: 1.6, lapseKeeps: 0.7 }),
};
