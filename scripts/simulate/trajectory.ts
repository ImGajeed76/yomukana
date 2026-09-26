// Prints one reader's truth and scores month by month, to see the shape of
// progress: `bun scripts/simulate/trajectory.ts <all.jsonl> <profile> [formula]`

import type { Row } from "./metrics";

const [file, profile = "diligent", formula = "uses now"] = process.argv.slice(2);
if (file === undefined) throw new Error("say which results to read");
const rows = (await Bun.file(file).text())
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line) as Row)
  .filter((row) => row.profile === profile && row.seed === 1);

console.log(
  `${profile}, seed 1: day, sentences readable, coverage, halvings of unknowns, ${formula}`,
);
for (const day of [0, 6, 13, 29, 44, 59, 74, 89]) {
  const row = rows.find((candidate) => candidate.day === day);
  if (row === undefined) continue;
  const halvings = -Math.log2(1 - row.truth.coverage);
  console.log(
    `  ${String(day + 1).padStart(3)} ${(row.truth.sentences * 100).toFixed(1).padStart(6)}% ${(row.truth.coverage * 100).toFixed(1).padStart(6)}% ${halvings.toFixed(2).padStart(6)} ${(row.scores[formula] ?? 0).toFixed(0).padStart(7)}`,
  );
}
