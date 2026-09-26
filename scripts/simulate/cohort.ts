// Runs simulated readers and records, at the end of every day, what each
// candidate formula scores them and what they can really do.
//
// `bun scripts/simulate/cohort.ts <profile> <seed> <days> <out.jsonl> [brain]`
// One reader per process, so a whole cohort can run side by side.

import type { CorpusChunk, CorpusIndex, CorpusSentence } from "../../src/lib/corpus/types";
import { Brain } from "./brain";
import { openCorpus, simulate } from "./engine";
import { FORMULAS, textShareOf } from "./formulas";
import { seeded } from "./random";
import { BRAIN_VARIANTS, PROFILES } from "./readers";
import { EvaluationText } from "./truth";

const [
  profileName = "steady",
  seedText = "1",
  daysText = "90",
  out = "/dev/stdout",
  variantName = "default",
] = process.argv.slice(2);
const profile = PROFILES.find((candidate) => candidate.name === profileName);
if (profile === undefined) throw new Error(`no reader called ${profileName}`);

const CORPUS_ROOT = new URL("../../static/corpus", import.meta.url).pathname;
const index = (await Bun.file(`${CORPUS_ROOT}/index.json`).json()) as CorpusIndex;
const everything: CorpusSentence[] = [];
for (const band of index.bands) {
  const chunk = (await Bun.file(`${CORPUS_ROOT}/${band.file}`).json()) as CorpusChunk;
  everything.push(...chunk.sentences);
}
const text = EvaluationText.draw(everything, 400);
const share = textShareOf(everything);
const corpus = await openCorpus();

const seed = Number(seedText);
const random = seeded(seed * 7919 + 17);
const startedAt = new Date("2026-01-05T08:00:00").getTime();
const variant = BRAIN_VARIANTS[variantName];
if (variant === undefined) throw new Error(`no brain called ${variantName}`);
const brain = new Brain(variant(profile.traits), random, startedAt);

const lines: string[] = [];
await simulate(
  corpus,
  { brain, input: profile.input, minutesOnDay: profile.minutesOnDay, random },
  Number(daysText),
  startedAt,
  (end) => {
    const now = new Date(end.at);
    const scores: Record<string, number> = {};
    for (const [name, formula] of Object.entries(FORMULAS)) {
      scores[name] = formula(end.store, now, share, end.recallShift);
    }
    lines.push(
      JSON.stringify({
        profile: profile.name,
        seed,
        day: end.day,
        sentences: end.sentences,
        items: end.store.items.size,
        truth: text.measure(brain, end.at),
        recallShift: end.recallShift,
        scores,
      }),
    );
  },
);
await Bun.write(out, `${lines.join("\n")}\n`);
