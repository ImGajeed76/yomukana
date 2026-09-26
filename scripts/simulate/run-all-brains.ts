// Runs the whole cohort once for every brain variant, one after another, so
// every formula is judged in every world. `bun scripts/simulate/run-all-brains.ts <out-dir> [days] [seeds]`

import { BRAIN_VARIANTS } from "./readers";

const [outDir, daysText = "90", seedsText = "5"] = process.argv.slice(2);
if (outDir === undefined) throw new Error("say where to write the results");
const script = new URL("./run-cohort.ts", import.meta.url).pathname;
for (const variant of Object.keys(BRAIN_VARIANTS)) {
  console.log(`brain: ${variant}`);
  const child = Bun.spawn(["bun", script, `${outDir}/${variant}`, daysText, seedsText, variant], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0) throw new Error(`the ${variant} run failed`);
}
