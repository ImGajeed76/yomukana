import { describe, expect, test } from "bun:test";
import { katakanaToHiragana } from "../japanese/text";
import { preferredRomaji, segmentKana } from "./segment";

function displays(text: string): string[] {
  return segmentKana(text).map((segment) => segment.display);
}

function spellingsOf(text: string, index: number): readonly string[] {
  const segment = segmentKana(text)[index];
  if (segment === undefined) throw new Error(`no segment ${String(index)} in ${text}`);
  return segment.spellings;
}

describe("katakanaToHiragana", () => {
  test("converts katakana and leaves everything else alone", () => {
    expect(katakanaToHiragana("コーヒー")).toBe("こーひー");
    expect(katakanaToHiragana("ひらがな")).toBe("ひらがな");
    expect(katakanaToHiragana("ヴ")).toBe("ゔ");
    expect(katakanaToHiragana("A、")).toBe("A、");
  });
});

describe("segmentKana", () => {
  test("keeps a youon together as one segment", () => {
    expect(displays("きゃく")).toEqual(["きゃ", "く"]);
    expect(displays("しゃしん")).toEqual(["しゃ", "し", "ん"]);
  });

  test("gives the sokuon its own segment", () => {
    expect(displays("がっこう")).toEqual(["が", "っ", "こ", "う"]);
  });

  test("keeps katakana as written while matching on hiragana", () => {
    expect(displays("コーヒー")).toEqual(["コ", "ー", "ヒ", "ー"]);
    expect(preferredRomaji(segmentKana("コーヒー"))).toBe("ko-hi-");
  });

  test("keeps punctuation on screen but asks nothing of the reader", () => {
    expect(displays("あ、い。")).toEqual(["あ", "、", "い", "。"]);
    expect(preferredRomaji(segmentKana("あ、い。"))).toBe("ai");

    for (const segment of segmentKana("、。「」？！　")) {
      expect(segment.kind).toBe("punctuation");
      expect(segment.spellings).toEqual([]);
    }
  });

  test("treats the long vowel mark as something to read, not punctuation", () => {
    // ー holds the vowel before it, so missing it is misreading the word.
    const [segment] = segmentKana("ー");
    expect(segment?.kind).toBe("mora");
    expect(segment?.spellings).toEqual(["-"]);
  });

  test("marks characters it has no spelling for", () => {
    const segments = segmentKana("学こう");
    expect(segments[0]?.kind).toBe("untypeable");
    expect(segments[0]?.spellings).toEqual([]);
    expect(segments[1]?.kind).toBe("mora");
  });
});

describe("spelling variants", () => {
  test("accepts Hepburn, Kunrei and Nihon for the irregular moras", () => {
    expect(spellingsOf("し", 0)).toContain("shi");
    expect(spellingsOf("し", 0)).toContain("si");
    expect(spellingsOf("つ", 0)).toContain("tsu");
    expect(spellingsOf("つ", 0)).toContain("tu");
    expect(spellingsOf("ふ", 0)).toContain("fu");
    expect(spellingsOf("ふ", 0)).toContain("hu");
    expect(spellingsOf("じ", 0)).toContain("ji");
    expect(spellingsOf("じ", 0)).toContain("zi");
  });

  test("accepts every spelling of じゃ, contracted and decomposed", () => {
    const spellings = spellingsOf("じゃ", 0);
    expect(spellings).toContain("ja");
    expect(spellings).toContain("jya");
    expect(spellings).toContain("zya");
    expect(spellings).toContain("jilya");
    expect(spellings).toContain("zixya");
  });

  test("keeps ぢ and づ distinct from じ and ず", () => {
    expect(spellingsOf("ぢ", 0)).toEqual(["di"]);
    expect(spellingsOf("づ", 0)).toEqual(["du"]);
    expect(spellingsOf("じ", 0)).not.toContain("di");
    expect(spellingsOf("ず", 0)).not.toContain("du");
  });

  test("offers the doubled consonant of whatever follows the sokuon", () => {
    expect(spellingsOf("がっこう", 1)).toContain("k");
    expect(spellingsOf("がっこう", 1)).toContain("ltu");
    expect(spellingsOf("がっこう", 1)).toContain("xtu");

    // ち can be typed chi or ti, so both doublings are open.
    const beforeChi = spellingsOf("いっち", 1);
    expect(beforeChi).toContain("c");
    expect(beforeChi).toContain("t");
  });

  test("allows a bare n only where it cannot be misread", () => {
    // ん before か: nothing else starts with n, so a single n is unambiguous.
    expect(spellingsOf("こんかい", 1)).toContain("n");
    // ん before に and な: no mora begins `nn`, so an IME has nothing to wait
    // for. It commits ん and gives the next `n` to the mora after it, which is
    // why こんにちは is `konnichiha`.
    expect(spellingsOf("こんにちは", 1)).toContain("n");
    expect(spellingsOf("あんない", 1)).toContain("n");
    // ん before や: a bare n would be read as the start of にゃ instead.
    expect(spellingsOf("ほんや", 1)).not.toContain("n");
    // ん before a vowel has the same problem: `na` is な, not ん + あ.
    expect(spellingsOf("たんい", 1)).not.toContain("n");
    // ん at the end has nothing to be confused with.
    expect(spellingsOf("ほん", 1)).toContain("n");
  });

  test("reads a small vowel standing alone as the vowel it draws out", () => {
    // なぁ is なあ said with feeling. It was asking for `la`, which is IME
    // trivia, and refusing the `a` every reader types.
    expect(spellingsOf("なぁ", 1)).toEqual(["a", "la", "xa"]);
    expect(spellingsOf("ねぇ", 1)[0]).toBe("e");
    // Where it does combine, it is still part of one mora.
    expect(displays("ふぁ")).toEqual(["ふぁ"]);
  });
});
