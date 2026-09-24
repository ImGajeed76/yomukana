import { describe, expect, test } from "bun:test";
import { segmentKana } from "../romaji";
import { EMPTY_STORE, INITIAL_READER, applyReviews, reviewsFor, type ItemState } from "../srs";
import { mergeReaders, mergeSessions, newerItem, reviveItem } from "./merge";

function itemReadAt(iso: string): ItemState {
  const segments = segmentKana("か");
  const store = applyReviews(
    EMPTY_STORE,
    reviewsFor(segments, [{ segment: 0, latencyMs: 400, errors: 0 }]),
    new Date(iso),
  );
  const state = [...store.items.values()][0];
  if (state === undefined) throw new Error("no item");
  return state;
}

describe("reviveItem", () => {
  test("brings an item through JSON with its dates intact", () => {
    const item = itemReadAt("2026-09-20T10:00:00Z");
    const back = reviveItem(JSON.parse(JSON.stringify(item)));
    expect(back.card.due).toBeInstanceOf(Date);
    expect(back.card.due.getTime()).toBe(item.card.due.getTime());
    expect(back.card.last_review?.getTime()).toBe(item.card.last_review?.getTime());
  });
});

describe("newerItem", () => {
  test("keeps the copy reviewed most recently, from either side", () => {
    const older = itemReadAt("2026-09-10T10:00:00Z");
    const newer = itemReadAt("2026-09-20T10:00:00Z");
    expect(newerItem(older, newer)).toBe(newer);
    expect(newerItem(newer, older)).toBe(newer);
  });

  test("takes the remote copy of an item this device has never seen", () => {
    const remote = itemReadAt("2026-09-10T10:00:00Z");
    expect(newerItem(undefined, remote)).toBe(remote);
  });
});

describe("mergeReaders", () => {
  test("keeps each input from whichever copy has read more on it", () => {
    // A desk that has only ever been a keyboard and a phone that has only ever
    // been touch: neither may wipe out what the other learned.
    const desk = { ...INITIAL_READER, keyboard: { ...INITIAL_READER.keyboard, reviews: 500 } };
    const phone = { ...INITIAL_READER, touch: { ...INITIAL_READER.touch, reviews: 80 } };
    const merged = mergeReaders(desk, phone);
    expect(merged.keyboard.reviews).toBe(500);
    expect(merged.touch.reviews).toBe(80);
  });

  test("keeps a Japanese keyboard's input from the device that used one", () => {
    const flicked = { ...INITIAL_READER, kana: { ...INITIAL_READER.kana, reviews: 40 } };
    expect(mergeReaders(INITIAL_READER, flicked).kana.reviews).toBe(40);
    expect(mergeReaders(flicked, INITIAL_READER).kana.reviews).toBe(40);
  });
});

describe("mergeSessions", () => {
  test("keeps the higher band and every sentence either device read", () => {
    const merged = mergeSessions(
      { band: 2, easyStreak: 1, hardStreak: 0, seenAt: [["t1", 100]] },
      { band: 4, easyStreak: 2, hardStreak: 0, seenAt: [["t2", 200]] },
    );
    expect(merged?.band).toBe(4);
    expect(merged?.seenAt.map(([id]) => id)).toEqual(["t1", "t2"]);
  });

  test("remembers a sentence at the latest time either device read it", () => {
    const merged = mergeSessions(
      { band: 1, easyStreak: 0, hardStreak: 0, seenAt: [["t1", 900]] },
      { band: 1, easyStreak: 0, hardStreak: 0, seenAt: [["t1", 100]] },
    );
    expect(merged?.seenAt).toEqual([["t1", 900]]);
  });
});
