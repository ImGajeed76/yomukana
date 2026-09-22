// Downloads the raw corpus sources into .cache/corpus and decompresses them.
//
// Cached on disk because a rebuild should not re-download 30MB, and because the
// build has to be reproducible: the same cache gives the same corpus, so a
// regeneration produces a diff worth reading. See CLAUDE.md 3.5.

import { spawn } from "bun";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export const CACHE_DIR = ".cache/corpus";

const BASE = "https://downloads.tatoeba.org/exports";

interface Source {
  readonly name: string;
  readonly url: string;
  /** The file that exists after decompression. */
  readonly output: string;
  readonly archive: "bz2" | "tar.bz2";
}

const SOURCES: readonly Source[] = [
  {
    name: "Japanese sentences",
    url: `${BASE}/per_language/jpn/jpn_sentences.tsv.bz2`,
    output: "jpn_sentences.tsv",
    archive: "bz2",
  },
  {
    name: "English sentences",
    url: `${BASE}/per_language/eng/eng_sentences.tsv.bz2`,
    output: "eng_sentences.tsv",
    archive: "bz2",
  },
  {
    name: "Japanese indices",
    url: `${BASE}/jpn_indices.tar.bz2`,
    output: "jpn_indices.csv",
    archive: "tar.bz2",
  },
];

async function run(command: readonly string[]): Promise<void> {
  const process = spawn({ cmd: [...command], stdout: "inherit", stderr: "inherit" });
  const code = await process.exited;
  if (code !== 0) throw new Error(`${command.join(" ")} exited with ${String(code)}`);
}

async function download(source: Source): Promise<void> {
  const target = join(CACHE_DIR, source.output);
  if (existsSync(target)) {
    console.log(`  cached   ${source.output}`);
    return;
  }

  const archive = join(CACHE_DIR, source.url.split("/").pop() ?? "download");
  if (!existsSync(archive)) {
    console.log(`  fetching ${source.name}`);
    // curl rather than fetch: these are tens of megabytes, and curl streams them
    // to disk with a progress bar instead of holding them in memory. The script
    // already leans on tar and bunzip2, so this adds no new requirement.
    await run([
      "curl",
      "--fail",
      "--location",
      "--silent",
      "--show-error",
      "--output",
      archive,
      source.url,
    ]);
  }

  console.log(`  unpacking ${source.name}`);
  if (source.archive === "bz2") {
    await run(["bunzip2", "--keep", "--force", archive]);
  } else {
    await run(["tar", "-xjf", archive, "-C", CACHE_DIR]);
  }
}

/** Makes sure every source is present and decompressed. */
export async function ensureSources(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  for (const source of SOURCES) {
    await download(source);
  }
}

if (import.meta.main) {
  await ensureSources();
  console.log("sources ready");
}
