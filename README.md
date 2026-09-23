# yomukana

Learn to read Japanese by typing it.

You get a Japanese sentence and type its romaji as fast as you can. Every
keystroke is timed, so the app learns how fast you recognise each kana and each
kanji reading, and picks the next sentence from that.

The name is 読む + かな, "read kana". It also reads as 読むかな, "shall I read?"

## Before you use it

I did not write this code. Claude wrote all of it, in one session, while I
steered. I have read some of it.

This is a quick project. I do not know yet whether it actually teaches you to
read, and there is slop in here. Sorry about that. It does work, and it has
helped me, which is why it is up.

I might come back to it.

## How it works

Time to the first key is recognition, everything after it is typing speed, and
the two are measured separately. Every kana, and every kanji paired with one
reading, is its own FSRS item, graded on latency and errors.

Sentences hold a few things you are shaky on among things you are not. Kanji are
written as kana until your kana holds, and katakana waits behind hiragana.

Everything stays in your browser unless you sign in to sync between devices.
Sync is opt-in, needs only an email and a password, and keeps a copy on a
server in Frankfurt. You can export your history or delete it, and deleting
deletes the synced copy too.

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
