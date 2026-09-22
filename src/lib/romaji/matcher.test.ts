import { describe, expect, test } from "bun:test";
import {
  acceptableKeys,
  backspace,
  press,
  startTypingKana,
  typedInCurrentSegment,
  type TypingState,
} from "./matcher";

interface Typed {
  readonly state: TypingState;
  readonly rejected: readonly string[];
}

function type(text: string, keys: string): Typed {
  let state = startTypingKana(text);
  const rejected: string[] = [];
  for (const key of keys) {
    const result = press(state, key);
    if (result.isAccepted) {
      state = result.state;
    } else {
      rejected.push(key);
    }
  }
  return { state, rejected };
}

/** Whether these keys spell the text exactly, with nothing rejected. */
function accepts(text: string, keys: string): boolean {
  const { state, rejected } = type(text, keys);
  return rejected.length === 0 && state.isComplete;
}

describe("accepted spellings", () => {
  test("takes every romanisation of the same word", () => {
    for (const keys of ["shashin", "syasin", "shasin", "sixyasin"]) {
      expect(accepts("しゃしん", keys)).toBe(true);
    }
  });

  test("takes the decomposed spelling of a youon", () => {
    expect(accepts("きゃく", "kyaku")).toBe(true);
    expect(accepts("きゃく", "kilyaku")).toBe(true);
    expect(accepts("きゃく", "kixyaku")).toBe(true);
  });

  test("doubles the consonant across a sokuon", () => {
    expect(accepts("がっこう", "gakkou")).toBe(true);
    expect(accepts("がっこう", "galtukou")).toBe(true);
    expect(accepts("がっこう", "gaxtukou")).toBe(true);
  });

  test("doubles whichever consonant the reader chose for the next mora", () => {
    expect(accepts("いっち", "itti")).toBe(true);
    expect(accepts("いっち", "icchi")).toBe(true);
    // The doubled letter has to match the spelling that follows it, with the
    // one exception Hepburn insists on. See the sokuon spellings below.
    expect(accepts("いっち", "ikchi")).toBe(false);
  });

  test("takes n, nn and n' for the moraic nasal", () => {
    expect(accepts("こんかい", "konkai")).toBe(true);
    expect(accepts("こんかい", "konnkai")).toBe(true);
    expect(accepts("こんかい", "kon'kai")).toBe(true);
  });

  test("takes one n for the nasal when the next mora also starts with n", () => {
    // The spelling everyone already knows. No mora begins `nn`, so an IME has
    // nothing to wait for: it commits ん and hands the second n to に.
    expect(accepts("こんにちは", "konnichiha")).toBe(true);
    expect(accepts("あんない", "annai")).toBe(true);
    // Spelling the nasal out still works, because every reading stays live
    // until one of them finishes the sentence.
    expect(accepts("こんにちは", "konnnichiha")).toBe(true);
    expect(accepts("こんにちは", "kon'nichiha")).toBe(true);
    // One n cannot be both the nasal and the start of に.
    expect(accepts("こんにちは", "konichiha")).toBe(false);
  });

  test("needs a doubled n before a vowel or y, where an IME would misread it", () => {
    // `kinyoubi` is きにょうび in every IME, so it is not きんようび here either.
    expect(accepts("きんようび", "kinnyoubi")).toBe(true);
    expect(accepts("きんようび", "kinyoubi")).toBe(false);
    // `zenin` would be ぜにん.
    expect(accepts("ぜんいん", "zennin")).toBe(true);
    expect(accepts("ぜんいん", "zenin")).toBe(false);
  });

  test("takes a bare n at the end of a sentence", () => {
    expect(accepts("ほん", "hon")).toBe(true);
    expect(accepts("ほん", "honn")).toBe(true);
  });

  test("types the long vowel mark as a hyphen", () => {
    expect(accepts("コーヒー", "ko-hi-")).toBe(true);
  });

  test("steps over punctuation instead of asking for it", () => {
    expect(accepts("はい、そうです。", "haisoudesu")).toBe(true);
    // Reaching for the comma key should not be treated as a mistake in itself,
    // but it is not part of the sentence either.
    expect(accepts("はい、そうです。", "hai,soudesu.")).toBe(false);
  });

  test("finishes on the last character a reader types, not the last on screen", () => {
    const { state } = type("あい。", "ai");
    expect(state.isComplete).toBe(true);
    expect(state.settled).toBe(state.segments.length);
  });

  test("skips past characters it has no spelling for", () => {
    // Kanji in the text is passed over rather than demanded from the reader.
    expect(accepts("学こう", "kou")).toBe(true);
  });
});

describe("rejection", () => {
  test("rejects a wrong key and stays where it was", () => {
    const state = startTypingKana("かさ");
    const wrong = press(state, "s");
    expect(wrong.isAccepted).toBe(false);
    expect(wrong.state).toBe(state);

    const right = press(state, "k");
    expect(right.isAccepted).toBe(true);
    expect(right.state.keystrokes).toEqual(["k"]);
  });

  test("rejects extra keys once the sentence is finished", () => {
    const { state } = type("かさ", "kasa");
    expect(state.isComplete).toBe(true);
    expect(press(state, "a").isAccepted).toBe(false);
  });

  test("reports which keys are still open", () => {
    // し can start with s or c, so both are live before anything is typed.
    expect(acceptableKeys(startTypingKana("し"))).toEqual(new Set(["s", "c"]));
  });
});

describe("progress", () => {
  test("settles a segment only once no reading can still change it", () => {
    // こ settles on the o, not on the k.
    const afterK = type("こんかい", "k").state;
    expect(afterK.settled).toBe(0);
    expect(type("こんかい", "ko").state.settled).toBe(1);

    // The n could still be n or the start of nn, so ん is not settled yet.
    expect(type("こんかい", "kon").state.settled).toBe(1);
    // The k rules out nn, so ん settles.
    expect(type("こんかい", "konk").state.settled).toBe(2);
  });

  test("settles everything when the sentence completes", () => {
    const { state } = type("ほん", "hon");
    expect(state.isComplete).toBe(true);
    expect(state.settled).toBe(state.segments.length);
  });

  test("reports the segments each key settled", () => {
    let state = startTypingKana("かさ");
    expect(press(state, "k").settledSegments).toEqual([]);
    state = press(state, "k").state;
    expect(press(state, "a").settledSegments).toEqual([0]);
  });

  test("exposes what has been typed towards the current segment", () => {
    expect(typedInCurrentSegment(type("しゃしん", "s").state)).toBe("s");
    expect(typedInCurrentSegment(type("しゃしん", "sh").state)).toBe("sh");
    expect(typedInCurrentSegment(type("しゃしん", "sha").state)).toBe("");
  });
});

describe("backspace", () => {
  test("undoes one key", () => {
    const state = type("しゃしん", "sha").state;
    const undone = backspace(state);
    expect(undone.keystrokes).toEqual(["s", "h"]);
    expect(typedInCurrentSegment(undone)).toBe("sh");
  });

  test("reopens readings the undone key had ruled out", () => {
    // After konk, ん is settled as a bare n. Undoing the k reopens nn.
    const state = type("こんかい", "konk").state;
    expect(state.settled).toBe(2);
    const undone = backspace(state);
    expect(undone.settled).toBe(1);
    expect(press(undone, "n").isAccepted).toBe(true);
  });

  test("does nothing at the start", () => {
    const state = startTypingKana("かさ");
    expect(backspace(state)).toEqual(state);
  });
});

describe("spelling systems", () => {
  test("takes Hepburn, Kunrei and Nihon alike", () => {
    // Any of these is what some reader was taught, so all of them are correct
    // input. See CLAUDE.md 3.4.
    for (const spelling of ["shi", "si", "ci"]) expect(accepts("し", spelling)).toBe(true);
    for (const spelling of ["chi", "ti"]) expect(accepts("ち", spelling)).toBe(true);
    for (const spelling of ["tsu", "tu"]) expect(accepts("つ", spelling)).toBe(true);
    for (const spelling of ["fu", "hu"]) expect(accepts("ふ", spelling)).toBe(true);
    for (const spelling of ["ja", "zya", "jya"]) expect(accepts("じゃ", spelling)).toBe(true);
  });

  test("keeps ぢ and づ apart from じ and ず", () => {
    // Different kana, different keys. Merging them would teach the reader that
    // 鼻血 is はなじ.
    expect(accepts("ぢ", "di")).toBe(true);
    expect(accepts("ぢ", "ji")).toBe(false);
    expect(accepts("づ", "du")).toBe(true);
    expect(accepts("づ", "zu")).toBe(false);
  });
});

describe("sokuon spellings", () => {
  test("takes the Hepburn t before ち and ちゃ", () => {
    // 抹茶 is matcha. Nobody writes maccha, and rejecting it scored the reader
    // an error on a word they had spelled the way they were taught.
    expect(accepts("まっちゃ", "matcha")).toBe(true);
    expect(accepts("いっち", "itchi")).toBe(true);
    // The other doublings still work.
    expect(accepts("まっちゃ", "maccha")).toBe(true);
    expect(accepts("いっち", "itti")).toBe(true);
  });

  test("still refuses a doubling that does not match what follows", () => {
    expect(accepts("がっこう", "gatkou")).toBe(false);
    expect(accepts("いった", "icta")).toBe(false);
  });
});
