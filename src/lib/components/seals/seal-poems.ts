// A classical Japanese poem or saying for each kind of seal, shown in its
// dialog in the original, for a reader who is learning to read exactly this.
// Content, like the corpus: the Japanese and who wrote it are not translated.
// What it means is, in messages/ as seal_classic_<kind>.
//
// Every text here was checked against a published source before it went in.
// Change one only against a source too: a misquoted Bashō in an app that
// teaches reading would be worse than none.

import type { SealKind } from "$lib/sync/seal-rules";

export interface SealPoem {
  readonly text: string;
  readonly author: string;
}

export const SEAL_POEMS: Readonly<Record<SealKind, SealPoem>> = {
  // Keep going: Issa cheering on a thin frog at a frog fight, 1816.
  streak: { text: "痩蛙まけるな一茶是に有", author: "小林一茶" },
  // Days that add up, as rains do into a river.
  days: { text: "五月雨をあつめて早し最上川", author: "松尾芭蕉" },
  // The heart as seed and words as leaves: 言の葉, what reading gathers.
  sentences: {
    text: "やまとうたは、人の心を種として、万の言の葉とぞなれりける",
    author: "紀貫之『古今和歌集』仮名序",
  },
  // Pure snow on the white peak of Fuji: flawless.
  perfect: { text: "田子の浦にうち出でてみれば白妙の富士の高嶺に雪は降りつつ", author: "山部赤人" },
  // Out in front, where nobody else is walking: from Bashō's last gathering, 1694.
  wins: { text: "此道や行く人なしに秋の暮", author: "松尾芭蕉" },
  // Among the best is never luck: a swordsman's saying.
  podium: {
    text: "勝ちに不思議の勝ちあり、負けに不思議の負けなし",
    author: "松浦静山『剣談』",
  },
  // Setting out, and glad to be called a traveller: 笈の小文, 1687.
  finished: { text: "旅人と我名よばれん初しぐれ", author: "松尾芭蕉" },
  // Friends who come from far away.
  invited: { text: "朋有り遠方より来たる、亦楽しからずや", author: "『論語』" },
  // Cherry blossoms, and all they bring to mind.
  followers: { text: "さまざまの事おもひ出す桜かな", author: "松尾芭蕉" },
  // The years are travellers too.
  years: {
    text: "月日は百代の過客にして、行きかふ年も又旅人也",
    author: "松尾芭蕉『おくのほそ道』",
  },
  // Where every road begins.
  joined: { text: "千里の行も足下より始まる", author: "『老子』" },
};
