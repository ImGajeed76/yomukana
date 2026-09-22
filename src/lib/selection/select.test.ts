import { describe, expect, test } from "bun:test";
import { segmentKana } from "../romaji";
import { itemsForSegments } from "../srs";
import { EMPTY_STORE, applyReviews, reviewsFor, type ItemStore, type TimedSegment } from "../srs";
import { DEFAULT_OPTIONS, pickSentence, scoreSentence, type Candidate } from "./select";

const now = new Date("2026-01-01T00:00:00Z");

function candidate(id: string, text: string): Candidate {
  return { id, items: itemsForSegments(segmentKana(text)) };
}

/** A store where every character of `text` has been read cleanly and quickly. */
function storeKnowing(text: string): ItemStore {
  const segments = segmentKana(text);
  const timed: TimedSegment[] = segments.map((_, index) => ({
    segment: index,
    latencyMs: 150,
    errors: 0,
  }));

  let store = EMPTY_STORE;
  // Several passes, so the items build up real stability rather than sitting in
  // their first learning step.
  for (let pass = 0; pass < 6; pass++) {
    const at = new Date(now.getTime() + pass * 86_400_000);
    store = applyReviews(store, reviewsFor(segments, timed), at);
  }
  return store;
}

describe("scoreSentence", () => {
  test("counts every character as new for a reader with no history", () => {
    const score = scoreSentence(candidate("a", "かさ"), EMPTY_STORE, now);
    expect(score.newCount).toBe(2);
    expect(score.weakCount).toBe(0);
    expect(score.knownCount).toBe(0);
  });

  test("counts characters the reader has read well as known", () => {
    const store = storeKnowing("かさ");
    const score = scoreSentence(candidate("a", "かさ"), store, now);
    expect(score.knownCount).toBe(2);
    expect(score.newCount).toBe(0);
  });

  test("ranks a sentence with a couple of new characters above one with none", () => {
    const store = storeKnowing("かさたな");

    const allKnown = scoreSentence(candidate("known", "かさ"), store, now);
    const twoNew = scoreSentence(candidate("mixed", "かさきし"), store, now);

    expect(twoNew.score).toBeGreaterThan(allKnown.score);
  });

  test("ranks a sentence with a couple of new characters above one that is all new", () => {
    const store = storeKnowing("かさたな");

    const mixed = scoreSentence(candidate("mixed", "かさきし"), store, now);
    const allNew = scoreSentence(candidate("hard", "きしちにひみ"), store, now);

    expect(mixed.score).toBeGreaterThan(allNew.score);
  });

  test("pushes down a sentence the reader has just seen", () => {
    const store = storeKnowing("かさ");
    const options = { ...DEFAULT_OPTIONS, recent: ["mixed"] };

    const fresh = scoreSentence(candidate("mixed", "かさきし"), store, now);
    const repeated = scoreSentence(candidate("mixed", "かさきし"), store, now, options);

    expect(repeated.score).toBeLessThan(fresh.score);
  });

  test("pushes down the most recent sentence hardest", () => {
    const options = { ...DEFAULT_OPTIONS, recent: ["a", "b", "c"] };
    const store = storeKnowing("かさ");

    const justSeen = scoreSentence(candidate("a", "かさきし"), store, now, options);
    const seenEarlier = scoreSentence(candidate("c", "かさきし"), store, now, options);

    expect(justSeen.score).toBeLessThan(seenEarlier.score);
  });
});

describe("pickSentence", () => {
  test("chooses the sentence that sits in the readable range", () => {
    const store = storeKnowing("かさたな");
    const candidates = [
      candidate("known", "かさたな"),
      candidate("mixed", "かさきた"),
      candidate("hard", "きしちにひみ"),
    ];

    expect(pickSentence(candidates, store, now)?.id).toBe("mixed");
  });

  test("moves on rather than repeating the sentence just shown", () => {
    const store = storeKnowing("かさたな");
    const candidates = [candidate("mixed", "かさきた"), candidate("other", "たなしち")];

    const first = pickSentence(candidates, store, now);
    expect(first).not.toBeNull();
    if (first === null) return;

    const second = pickSentence(candidates, store, now, {
      ...DEFAULT_OPTIONS,
      recent: [first.id],
    });
    expect(second?.id).not.toBe(first.id);
  });

  test("returns null when there is nothing to choose from", () => {
    expect(pickSentence([], EMPTY_STORE, now)).toBeNull();
  });
});
