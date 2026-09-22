# yomukana

Learn to read Japanese by typing it.

You get a Japanese sentence and type its romaji as fast as you can. Every
keystroke is timed, so the app learns how fast you recognise each kana and each
kanji reading, and picks the next sentence from that.

The name is 読む + かな, "read kana". It also reads as 読むかな, "shall I read?"

## How it works

Time to the first key is recognition, everything after it is typing speed, and
the two are measured separately. Every kana, and every kanji paired with one
reading, is its own FSRS item, graded on latency and errors.

Sentences hold a few things you are shaky on among things you are not. Kanji are
written as kana until your kana holds, and katakana waits behind hiragana.

Everything stays in your browser. No account, no server. You can export your
history or delete it, and there is no copy anywhere else.

## Running it

Needs [bun](https://bun.sh).

```sh
bun install
bun run dev      # dev server
bun test         # romaji engine, grading, selection
bun run check    # prettier, eslint, svelte-check
bun run build    # static site into build/
```

The corpus is checked in under `static/corpus/`. Rebuilding it from the Tatoeba
exports takes a few minutes and about a gigabyte of disk for the cache:

```sh
bun run corpus:build
```

## Credits

Sentences from the [Tatoeba Project](https://tatoeba.org) under
[CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/). Readings from
kuromoji with IPADic, corrected against Tatoeba's Japanese indices. Dither
charts ported from [dither-kit](https://tripwire.sh/dither-kit).

MIT licensed, see [LICENSE](LICENSE).
