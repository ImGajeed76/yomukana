// Sets several cohorts side by side, one per brain variant, so a formula can
// be judged on its worst world and not only its best.
//
// `bun scripts/simulate/summarize.ts <dir>`, where <dir> holds one folder per
// brain, each with an all.jsonl, as run-all-brains.ts writes them.

import { readdir } from "node:fs/promises";
import { Cohort, readRows } from "./metrics";

const [dir] = process.argv.slice(2);
if (dir === undefined) throw new Error("say where the results are");
const worlds: { name: string; cohort: Cohort }[] = [];
for (const name of (await readdir(dir)).sort()) {
  const file = Bun.file(`${dir}/${name}/all.jsonl`);
  if (await file.exists())
    worlds.push({ name, cohort: new Cohort(await readRows(`${dir}/${name}/all.jsonl`)) });
}
const formulas = worlds[0]?.cohort.formulas ?? [];

/** One table: a row per formula, a column per world, and the worst of them. */
function matrix(
  title: string,
  note: string,
  measure: (cohort: Cohort, formula: string) => number,
  show: (value: number) => string,
  worstOf: (values: number[]) => number,
): void {
  console.log(`\n${title}\n  ${note}`);
  console.log(
    `  ${"".padEnd(16)}${worlds.map((world) => world.name.slice(0, 13).padStart(14)).join("")}${"worst".padStart(10)}`,
  );
  for (const formula of formulas) {
    const values = worlds.map((world) => measure(world.cohort, formula));
    console.log(
      `  ${formula.padEnd(16)}${values.map((value) => show(value).padStart(14)).join("")}${show(worstOf(values)).padStart(10)}`,
    );
  }
}

const lowest = (values: number[]): number => Math.min(...values);
const highest = (values: number[]): number => Math.max(...values);
const furthestFromZero = (values: number[]): number =>
  values.reduce((worst, value) => (Math.abs(value) > Math.abs(worst) ? value : worst), 0);
const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

matrix(
  "Clear pairs: of readers whose reading differs by 10% or more, the share the score orders right",
  "the leaderboard question (higher is better, 100% is perfect)",
  (cohort, formula) => cohort.concordance(formula).share,
  percent,
  lowest,
);
matrix(
  "Ranking: agreement with the truth, the weakest of sentences, coverage and pace",
  "1 is the same order as their reading (higher is better)",
  (cohort, formula) => {
    const { sentences, coverage, pace } = cohort.ranking(formula);
    return Math.min(sentences, coverage, pace);
  },
  (value) => value.toFixed(3),
  lowest,
);
matrix(
  "Twins: unfairness to the slow typist or the phone, whichever is worse",
  "same brain, different hands (0% is fair)",
  (cohort, formula) =>
    Math.max(cohort.twinGap(formula, "twin-slow-typist"), cohort.twinGap(formula, "twin-phone")),
  percent,
  highest,
);
matrix(
  "Speed: fast reader above steady above slow reader",
  "share of checks in the right order (higher is better)",
  (cohort, formula) => cohort.speedOrder(formula),
  percent,
  lowest,
);
matrix(
  "Cramming: how far the crammer is overrated after its week",
  "0% is right, above overrates it",
  (cohort, formula) => cohort.cramming(formula).overrated,
  percent,
  furthestFromZero,
);
matrix(
  "Breaks: how far the score's fall differs from reading's, over thirty days away",
  "0% is exact; above, the score fell less than reading did",
  (cohort, formula) => cohort.breakTracking(formula).fallError,
  percent,
  furthestFromZero,
);
matrix(
  "Wobble: the fluent reader's daily score movement",
  "their reading does not move (lower is better)",
  (cohort, formula) => cohort.wobble(formula),
  percent,
  highest,
);
console.log(
  `\n  their real third month, as a share of the first: ${worlds
    .map((world) => {
      const [first = 0, , third = 0] = world.cohort.truthMonthlyGains();
      return `${world.name} ${percent(first === 0 ? 0 : third / first)}`;
    })
    .join(", ")}`,
);
matrix(
  "Growth: the diligent reader's third month, as a share of the first",
  "should be positive, and less than the first",
  (cohort, formula) => {
    const [first = 0, , third = 0] = cohort.monthlyGains(formula);
    return first === 0 ? 0 : third / first;
  },
  percent,
  lowest,
);
