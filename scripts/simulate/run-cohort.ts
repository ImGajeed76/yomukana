// Runs every reader profile with several seeds, side by side, one process
// each, and gathers what they wrote into one file.
//
// `bun scripts/simulate/run-cohort.ts <out-dir> [days] [seeds] [brain]`

import { mkdir } from "node:fs/promises";
import { PROFILES } from "./readers";

const [outDir, daysText = "90", seedsText = "3", variantName = "default"] = process.argv.slice(2);
if (outDir === undefined) throw new Error("say where to write the results");
await mkdir(outDir, { recursive: true });

const script = new URL("./cohort.ts", import.meta.url).pathname;
const runs: { name: string; file: string; done: Promise<number> }[] = [];
for (const profile of PROFILES) {
  for (let seed = 1; seed <= Number(seedsText); seed++) {
    const file = `${outDir}/${profile.name}-${String(seed)}.jsonl`;
    const child = Bun.spawn(
      ["bun", script, profile.name, String(seed), daysText, file, variantName],
      {
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    runs.push({ name: `${profile.name} ${String(seed)}`, file, done: child.exited });
  }
}

const began = performance.now();
const codes = await Promise.all(runs.map((run) => run.done));
const failed = runs.filter((_, index) => codes[index] !== 0).map((run) => run.name);
if (failed.length > 0) throw new Error(`these runs failed: ${failed.join(", ")}`);

const lines: string[] = [];
for (const run of runs) lines.push((await Bun.file(run.file).text()).trimEnd());
await Bun.write(`${outDir}/all.jsonl`, `${lines.join("\n")}\n`);
console.log(
  `${String(runs.length)} readers, ${daysText} days, in ${((performance.now() - began) / 1000).toFixed(0)} s`,
);
