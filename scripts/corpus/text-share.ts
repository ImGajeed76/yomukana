// Writes static/corpus/text-share.json from the corpus already built, without
// building it again. The build writes the same file itself; this is for when
// the counting changes and the corpus does not. `bun run corpus:text-share`

import type { CorpusChunk, CorpusIndex, CorpusSentence } from "../../src/lib/corpus/types";
import { countUses } from "../../src/lib/stats/text-share";

const root = new URL("../../static/corpus", import.meta.url).pathname;
const index = (await Bun.file(`${root}/index.json`).json()) as CorpusIndex;
const sentences: CorpusSentence[] = [];
for (const band of index.bands) {
  const chunk = (await Bun.file(`${root}/${band.file}`).json()) as CorpusChunk;
  sentences.push(...chunk.sentences);
}
const share = countUses(sentences);
await Bun.write(`${root}/text-share.json`, JSON.stringify(share));
console.log(
  `${String(Object.keys(share.uses).length)} items, ${String(share.totalUses)} uses, from ${String(sentences.length)} sentences`,
);
