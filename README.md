# yomukana

Learn to read Japanese by typing it.

You get a Japanese sentence and type its romaji as fast as you can, like a typing
test. Every keystroke is timed, so the app learns how quickly you recognise each
individual kana and each kanji reading, and picks the next sentence from that.

The name is 読む + かな, "read kana". It also reads as 読むかな, "shall I read?"

## How it works

Time-to-first-key on a character is recognition time. Everything after that is
how fast you type. The two are measured separately, so a slow typist does not
look like a poor reader.

Every kana, and every kanji paired with one specific reading, is its own
scheduled item. FSRS holds the long-term model. The grade for each review comes
from latency and errors, not from a self-report button.

Sentences are picked to contain a few items that are due or weak, surrounded by
ones you already know. Reading in context is the skill being trained, so a
sentence is never uniformly hard.

Kanji are written as kana until your kana is solid, then revealed gradually.
Katakana waits until hiragana holds. When you are clearly past the current
difficulty, the selector notices within a handful of sentences and moves you up.

## Privacy

Everything stays in your browser. No account, no server, no telemetry. The site
is static. You can export your history to a file or delete it, and there is no
copy anywhere else.

## Running it

Needs [bun](https://bun.sh).

```sh
bun install
bun run dev
```

The corpus is precomputed and checked in under `static/corpus/`. To rebuild it
from the Tatoeba exports:

```sh
bun run corpus:build
```

That downloads the sentence exports, tokenises them with kuromoji, corrects the
readings against Tatoeba's hand-checked indices, and writes difficulty-banded
chunks. It takes a few minutes and needs about a gigabyte of disk for the cache.

```sh
bun test         # the romaji engine, grading, selection, corpus shape
bun run check    # prettier, eslint, the guard scripts, svelte-check
bun run build    # static site into build/
```

## Credits

Sentences come from the [Tatoeba Project](https://tatoeba.org) under
[CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/). Readings are
generated with kuromoji and IPADic, corrected against Tatoeba's Japanese indices
where a human checked them.

The dither charts are a port of [dither-kit](https://tripwire.sh/dither-kit)
(MIT), which ships as React components this app cannot use.
