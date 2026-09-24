// Builds static/corpus from the Tatoeba exports.
//
// Run with `bun run corpus:build`. The output is generated: fix a bad sentence
// by changing the rules here and rebuilding, never by editing the JSON.
// See CLAUDE.md 3.5.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { toCodePoints, isKanji, isKatakana } from "../../src/lib/japanese/text";
import { segmentKana } from "../../src/lib/romaji";
import {
  ATTRIBUTION,
  CORPUS_VERSION,
  type CorpusChunk,
  type CorpusIndex,
  type CorpusSentence,
  type CorpusToken,
} from "../../src/lib/corpus/types";
import { applyCheckedReadings, checkedReadings, parseIndexTokens } from "./indices";
import { CACHE_DIR, ensureSources } from "./sources";
import { createTokenizer, readTokens } from "./tokenise";

const OUTPUT_DIR = "static/corpus";
const BANDS = 10;

// Shorter than this is not a sentence, longer than this is a paragraph and stops
// being a reading exercise somewhere in the middle.
const MIN_SEGMENTS = 3;
const MAX_SEGMENTS = 40;

// Enough material that a reader will not run out, small enough that one band
// downloads without thinking about it.
const MAX_SENTENCES = 30_000;

const ATTRIBUTION_TEXT =
  `Sentences from ${ATTRIBUTION.source} (${ATTRIBUTION.sourceUrl}), used under ` +
  `${ATTRIBUTION.licence}. Readings generated with ${ATTRIBUTION.readings.join(" and ")}.`;

function parseTsv(text: string): Map<string, string> {
  const rows = new Map<string, string>();

  for (const line of text.split("\n")) {
    if (line.length === 0) continue;
    const first = line.indexOf("\t");
    const second = line.indexOf("\t", first + 1);
    if (first === -1 || second === -1) continue;
    rows.set(line.slice(0, first), line.slice(second + 1));
  }
  return rows;
}

interface IndexEntry {
  readonly meaningId: string;
  /** Hand-checked readings for this sentence, keyed by written form. */
  readonly readings: ReadonlyMap<string, string>;
}

/** Japanese sentence id to its English translation and its checked readings. */
function parseIndices(text: string): Map<string, IndexEntry> {
  const entries = new Map<string, IndexEntry>();

  for (const line of text.split("\n")) {
    if (line.length === 0) continue;
    const first = line.indexOf("\t");
    const second = line.indexOf("\t", first + 1);
    if (first === -1 || second === -1) continue;

    const meaningId = line.slice(first + 1, second);
    // A negative id means the indexer could not match a translation.
    if (meaningId.startsWith("-")) continue;

    entries.set(line.slice(0, first), {
      meaningId,
      readings: checkedReadings(parseIndexTokens(line.slice(second + 1))),
    });
  }
  return entries;
}

interface Scored {
  readonly sentence: Omit<CorpusSentence, "band">;
  readonly score: number;
}

function distinctKanji(tokens: readonly CorpusToken[]): string[] {
  const kanji = new Set<string>();
  for (const token of tokens) {
    for (const character of toCodePoints(token.surface)) {
      if (isKanji(character)) kanji.add(character);
    }
  }
  return [...kanji];
}

function countKatakanaTokens(tokens: readonly CorpusToken[]): number {
  let count = 0;
  for (const token of tokens) {
    if (toCodePoints(token.surface).some(isKatakana)) count += 1;
  }
  return count;
}

/**
 * How hard a sentence is to read.
 *
 * Length matters less than it looks: a long sentence of familiar kana reads
 * easily. What actually stops a learner is an unfamiliar kanji, so the rarest
 * kanji in the sentence carries the most weight. Rarity is measured against this
 * corpus rather than an outside list, so it tracks what a reader will meet here.
 */
function difficultyOf(
  tokens: readonly CorpusToken[],
  segments: number,
  rankOf: ReadonlyMap<string, number>,
): number {
  const kanji = distinctKanji(tokens);

  let rarest = 0;
  for (const character of kanji) {
    rarest = Math.max(rarest, Math.log10(1 + (rankOf.get(character) ?? 0)));
  }

  return (
    0.5 * Math.sqrt(segments) +
    1.0 * Math.sqrt(kanji.length) +
    1.5 * rarest +
    0.4 * Math.sqrt(countKatakanaTokens(tokens))
  );
}

function kanjiRanks(sentences: readonly { tokens: readonly CorpusToken[] }[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const sentence of sentences) {
    for (const character of distinctKanji(sentence.tokens)) {
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }
  }

  const ordered = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  const ranks = new Map<string, number>();
  for (const [index, [character]] of ordered.entries()) {
    ranks.set(character, index);
  }
  return ranks;
}

async function readCache(file: string): Promise<string> {
  return Bun.file(join(CACHE_DIR, file)).text();
}

async function build(): Promise<void> {
  await ensureSources();

  console.log("reading sources");
  const [indicesText, japaneseText, englishText] = await Promise.all([
    readCache("jpn_indices.csv"),
    readCache("jpn_sentences.tsv"),
    readCache("eng_sentences.tsv"),
  ]);

  const indices = parseIndices(indicesText);
  const japanese = parseTsv(japaneseText);
  const english = parseTsv(englishText);
  console.log(
    `  ${String(indices.size)} indexed, ${String(japanese.size)} japanese, ${String(english.size)} english`,
  );

  console.log("loading dictionary");
  const tokenize = await createTokenizer();

  console.log("tokenising");
  const accepted: { id: string; tokens: CorpusToken[]; meaning: string; segments: number }[] = [];
  const rejected = new Map<string, number>();

  function reject(reason: string): void {
    rejected.set(reason, (rejected.get(reason) ?? 0) + 1);
  }

  let corrected = 0;

  for (const [japaneseId, entry] of indices) {
    const text = japanese.get(japaneseId);
    const meaning = english.get(entry.meaningId);
    if (text === undefined || meaning === undefined) {
      reject("missing-text");
      continue;
    }

    const { tokens: analysed, rejection } = readTokens(tokenize(text));
    if (analysed === null) {
      reject(rejection ?? "unknown");
      continue;
    }

    // Where a human checked the reading, that reading wins.
    const checked = applyCheckedReadings(analysed, entry.readings);
    corrected += checked.corrections;
    const tokens = checked.tokens;

    let reading = "";
    for (const token of tokens) reading += token.reading;
    const segments = segmentKana(reading);

    // The reader has to be able to type every character. Anything the engine has
    // no spelling for, digits and latin included, is not a reading exercise.
    if (segments.some((segment) => segment.kind === "untypeable")) {
      reject("untypeable");
      continue;
    }
    if (segments.length < MIN_SEGMENTS || segments.length > MAX_SEGMENTS) {
      reject("length");
      continue;
    }

    accepted.push({
      id: `t${japaneseId}`,
      tokens: [...tokens],
      meaning,
      segments: segments.length,
    });
  }

  console.log(
    `  ${String(accepted.length)} accepted, ${String(corrected)} readings corrected from the indices`,
  );
  for (const [reason, count] of [...rejected].sort((left, right) => right[1] - left[1])) {
    console.log(`  rejected ${reason}: ${String(count)}`);
  }

  console.log("scoring");
  const ranks = kanjiRanks(accepted);
  const scored: Scored[] = accepted.map((entry) => ({
    sentence: { id: entry.id, tokens: entry.tokens, meaning: entry.meaning },
    score: difficultyOf(entry.tokens, entry.segments, ranks),
  }));
  scored.sort((left, right) => left.score - right.score);

  const kept = scored.slice(0, MAX_SENTENCES);
  const perBand = Math.ceil(kept.length / BANDS);

  console.log("writing chunks");
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const bands: { band: number; file: string; sentences: number }[] = [];
  for (let band = 0; band < BANDS; band++) {
    const slice = kept.slice(band * perBand, (band + 1) * perBand);
    if (slice.length === 0) continue;

    const chunk: CorpusChunk = {
      version: CORPUS_VERSION,
      band,
      sentences: slice.map((entry) => ({ ...entry.sentence, band })),
    };
    const file = `band-${String(band)}.json`;
    await writeFile(join(OUTPUT_DIR, file), JSON.stringify(chunk));
    bands.push({ band, file, sentences: slice.length });
    console.log(`  band ${String(band)}: ${String(slice.length)} sentences`);
  }

  const index: CorpusIndex = {
    version: CORPUS_VERSION,
    builtAt: new Date().toISOString(),
    bands,
    attribution: ATTRIBUTION_TEXT,
  };
  await writeFile(join(OUTPUT_DIR, "index.json"), `${JSON.stringify(index, null, 2)}\n`);

  console.log(`done: ${String(kept.length)} sentences in ${String(bands.length)} bands`);
}

if (import.meta.main) {
  await build();
}
