// What the reader is learning, one scheduled unit at a time.
//
// A kanji paired with one reading is its own item. 生 in 生きる and 生 in 学生
// are different pieces of knowledge and must not share a schedule, so the
// reading is part of the identity rather than an attribute of it.
// See CLAUDE.md 2 and the anti-patterns list.

import type { Segment } from "../romaji";

/** A stable key for one unit of knowledge. Used as the storage key, so it must not drift. */
export type ItemId = string;

export type ItemKind = "kana" | "kanji";

export interface Item {
  readonly id: ItemId;
  readonly kind: ItemKind;
  /** The character or word as it is written. */
  readonly surface: string;
  /** For kanji, the reading this item covers. For kana, the kana itself. */
  readonly reading: string;
}

const SEPARATOR = ":";

// There are only a couple of hundred kana items, and the sentence selector holds
// item lists for thousands of candidates at once. Handing out the same object
// every time turns those lists into pointers instead of copies.
const kanaItems = new Map<string, Item>();

export function kanaItem(kana: string): Item {
  const existing = kanaItems.get(kana);
  if (existing !== undefined) return existing;

  const item: Item = {
    id: `kana${SEPARATOR}${kana}`,
    kind: "kana",
    surface: kana,
    reading: kana,
  };
  kanaItems.set(kana, item);
  return item;
}

export function kanjiItem(surface: string, reading: string): Item {
  return {
    id: `kanji${SEPARATOR}${surface}${SEPARATOR}${reading}`,
    kind: "kanji",
    surface,
    reading,
  };
}

/**
 * Rebuilds an item from its stored id.
 *
 * Storage keeps ids, not items, so anything reading progress back has to invert
 * this. Splitting on the first separator only is what makes it safe: a kanji id
 * carries two fields, and neither kana nor a written form can contain a colon.
 */
export function parseItemId(id: ItemId): Item | null {
  const kindEnd = id.indexOf(SEPARATOR);
  if (kindEnd === -1) return null;

  const kind = id.slice(0, kindEnd);
  const rest = id.slice(kindEnd + 1);

  if (kind === "kana") return rest.length === 0 ? null : kanaItem(rest);
  if (kind === "kanji") {
    const surfaceEnd = rest.indexOf(SEPARATOR);
    if (surfaceEnd === -1) return null;
    return kanjiItem(rest.slice(0, surfaceEnd), rest.slice(surfaceEnd + 1));
  }
  return null;
}

/**
 * The items a segment tests.
 *
 * Punctuation and characters with no spelling teach nothing about reading, so
 * they are not scheduled. The sokuon and the moraic nasal are: both are read
 * differently depending on what surrounds them, and both trip up learners.
 */
export function itemForSegment(segment: Segment): Item | null {
  // Punctuation, anything the engine cannot spell, and a っ with nothing after
  // it to double are all shown and stepped over. None of them is read by
  // pressing a key, so none of them can be measured, and an item that can never
  // be reviewed would sit as "new" forever and pull on every sentence it is in.
  if (segment.spellings.length === 0) return null;

  // Keyed by what the reader saw, not by the normalised hiragana. コ and こ are
  // typed with the same keys but recognised by different knowledge, and merging
  // them would let katakana ride in on hiragana practice.
  return kanaItem(segment.display);
}

/** Every item a sentence tests, deduplicated, in the order they first appear. */
export function itemsForSegments(segments: readonly Segment[]): Item[] {
  const seen = new Set<ItemId>();
  const items: Item[] = [];

  for (const segment of segments) {
    const item = itemForSegment(segment);
    if (item === null || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}
