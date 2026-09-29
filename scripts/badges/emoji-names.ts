// Writes the search names for the badge emoji, one file per language.
//
// The badge emoji picker can be searched: "cat", "Katze" and "ねこ" all find
// 🐱. The names come from Unicode's CLDR annotations, the same ones every
// phone's emoji keyboard searches, and only the emoji in the badge list are
// kept, so each file is a few kilobytes instead of the half a megabyte CLDR
// ships. The app loads the file for its language only when the picker opens.
//
// Build output, like static/corpus: rerun this after changing the emoji list,
// never edit the files. Run with `bun run badges:emoji-names`.

import { mkdir } from "node:fs/promises";
import { BADGE_EMOJI } from "../../src/lib/sync/badge-rules";

const LOCALES = ["en", "de", "ja"] as const;
const OUT_DIR = "static/emoji";
const SOURCE = (locale: string): string =>
  `https://cdn.jsdelivr.net/npm/cldr-annotations-full@47.0.0/annotations/${locale}/annotations.json`;

/** What CLDR says about one emoji: its keywords, and the name a screen reader uses. */
interface Annotation {
  readonly default?: readonly string[];
  readonly tts?: readonly string[];
}

interface AnnotationFile {
  readonly annotations: { readonly annotations: Readonly<Record<string, Annotation>> };
}

// CLDR keys most emoji without the variation selector that asks for the
// colourful form, so ✏️ is found under ✏.
const VARIATION_SELECTOR = String.fromCodePoint(0xfe0f);

const emoji = BADGE_EMOJI.flatMap((group) => group.emoji);

await mkdir(OUT_DIR, { recursive: true });
for (const locale of LOCALES) {
  const response = await fetch(SOURCE(locale));
  if (!response.ok) throw new Error(`${locale}: ${String(response.status)}`);
  const annotations = ((await response.json()) as AnnotationFile).annotations.annotations;

  const names: Record<string, string> = {};
  const missing: string[] = [];
  for (const character of emoji) {
    const annotation =
      annotations[character] ?? annotations[character.replaceAll(VARIATION_SELECTOR, "")];
    const words = [...(annotation?.tts ?? []), ...(annotation?.default ?? [])];
    if (words.length === 0) missing.push(character);
    // One lowercase string per emoji, the words apart, so a search is one
    // `includes` and never matches across two of them.
    names[character] = [...new Set(words.map((word) => word.toLowerCase()))].join("|");
  }

  await Bun.write(`${OUT_DIR}/${locale}.json`, JSON.stringify(names) + "\n");
  const note = missing.length === 0 ? "" : `, no names for ${missing.join(" ")}`;
  console.log(`${locale}: ${String(emoji.length)} emoji${note}`);
}
