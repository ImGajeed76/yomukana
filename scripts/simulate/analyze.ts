// Grades every candidate formula against what the simulated readers can
// really do, one requirement at a time, for one cohort. See metrics.ts for
// what each number means, and summarize.ts to set several cohorts side by side.
//
// `bun scripts/simulate/analyze.ts <all.jsonl>`

import { Cohort, readRows } from "./metrics";

const [file] = process.argv.slice(2);
if (file === undefined) throw new Error("say which results to read");
const cohort = new Cohort(await readRows(file));
const { formulas, seeds, lastDay } = cohort;
const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

function table(title: string, note: string, line: (formula: string) => string): void {
  console.log(`\n${title}\n  ${note}`);
  for (const formula of formulas) console.log(`  ${formula.padEnd(16)} ${line(formula)}`);
}

table("1. Ranking", "rank agreement with the truth, 1 is the same order", (formula) => {
  const { sentences, coverage, pace } = cohort.ranking(formula);
  return `sentences ${sentences.toFixed(3)}   coverage ${coverage.toFixed(3)}   pace ${pace.toFixed(3)}`;
});
table("2. Twins", "unfairness from hands or device alone, 0% is fair", (formula) =>
  ["twin-slow-typist", "twin-phone"]
    .map((twin) => `${twin.replace("twin-", "")} ${percent(cohort.twinGap(formula, twin))}`)
    .join("   "),
);
table("3. Speed", "fast reader above steady above slow reader", (formula) =>
  percent(cohort.speedOrder(formula)),
);
table("4. Cramming", "how far the crammer is overrated after its week", (formula) => {
  const { overrated, wrong, pairs } = cohort.cramming(formula);
  return `overrated ${percent(overrated)}   wrong order ${String(wrong)}/${String(pairs)}`;
});
table("5. Breaks", "follows reading (1 is in step), fall error (+ fell less)", (formula) => {
  const { follows, fallError } = cohort.breakTracking(formula);
  return `follows ${follows.toFixed(3)}   fall error ${percent(fallError)}`;
});
table("6. Growth", "the diligent reader's gain in each month", (formula) =>
  cohort
    .monthlyGains(formula)
    .map((gain) => gain.toFixed(0).padStart(7))
    .join(""),
);
table("7. Wobble", "the fluent reader's daily movement", (formula) =>
  percent(cohort.wobble(formula)),
);

console.log(`\nDay ${String(lastDay + 1)}, first seed: truth and scores`);
console.log(
  `  ${"reader".padEnd(24)}${"readable".padStart(9)}${"coverage".padStart(9)}  ${formulas.map((f) => f.slice(0, 10).padStart(11)).join("")}`,
);
for (const profile of [...new Set(cohort.rows.map((row) => row.profile))]) {
  const row = cohort.at(profile, seeds[0] ?? 1, lastDay);
  if (row === undefined) continue;
  console.log(
    `  ${profile.padEnd(24)}${(row.truth.sentences * 100).toFixed(1).padStart(8)}%${(row.truth.coverage * 100).toFixed(1).padStart(8)}%  ${formulas.map((f) => (row.scores[f] ?? 0).toFixed(0).padStart(11)).join("")}`,
  );
}
