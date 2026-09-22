// A stand-in corpus so the typing screen can be built and felt before the
// preprocessing pipeline exists. Kana only, ordered roughly easiest first.
//
// Delete this once `static/corpus/` is generated. Nothing outside the practice
// route should import it, and nothing here feeds the memory model, because these
// sentences carry no reading alignment or difficulty data.

export interface StarterSentence {
  readonly id: string;
  /** The text the reader sees, kana only for now. */
  readonly text: string;
  /** Plain English, shown after the attempt. */
  readonly meaning: string;
}

export const STARTER_SENTENCES: readonly StarterSentence[] = [
  { id: "s1", text: "ねこ", meaning: "cat" },
  { id: "s2", text: "あおいそら", meaning: "blue sky" },
  { id: "s3", text: "みずをのむ", meaning: "drink water" },
  { id: "s4", text: "これはほんです。", meaning: "This is a book." },
  { id: "s5", text: "がっこうにいきます。", meaning: "I go to school." },
  { id: "s6", text: "きょうはあついですね。", meaning: "It is hot today, isn't it." },
  { id: "s7", text: "でんしゃがきました。", meaning: "The train came." },
  { id: "s8", text: "しゃしんをとってもいいですか。", meaning: "May I take a photo?" },
  { id: "s9", text: "コーヒーをもういっぱいください。", meaning: "One more coffee, please." },
  { id: "s10", text: "あしたのてんきはどうですか。", meaning: "What is tomorrow's weather like?" },
];
