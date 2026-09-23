<script lang="ts">
  import TypedKeys from "./TypedKeys.svelte";
  import type { DisplayToken } from "$lib/corpus/display";
  import { m } from "$lib/paraglide/messages";

  interface Props {
    /** The sentence as it should appear, word by word. */
    tokens: readonly DisplayToken[];
    /** How many segments the reader has finished. */
    settled: number;
    /** Whether there are wrong keys on screen, which tints the current word. */
    hasError: boolean;
    /** What the reader typed for each finished segment, by segment index. */
    typedBySegment: readonly string[];
    /** Keys typed so far in the segment still in progress. */
    typing: string;
    /** Wrong keys waiting to be deleted. */
    stray: string;
    /**
     * Segment indices that written words the reader has asked to see start at.
     * Keyed by segment rather than by position, so the same word is identified
     * the same way wherever the token list has been reshaped.
     */
    revealed: ReadonlySet<number>;
    onReveal?: (segment: number) => void;
  }

  let { tokens, settled, hasError, typedBySegment, typing, stray, revealed, onReveal }: Props =
    $props();

  function isCurrent(token: DisplayToken): boolean {
    return settled >= token.from && settled < token.to;
  }

  /** What the reader has typed for the finished part of a word. */
  function typedFor(token: DisplayToken): string {
    let keys = "";
    for (let segment = token.from; segment < Math.min(token.to, settled); segment++) {
      keys += typedBySegment[segment] ?? "";
    }
    return keys;
  }
</script>

<!--
  Three states and nothing more, per CLAUDE.md 8.3. No transitions: the colour
  has to change on the same frame as the keystroke, or the timing the reader
  feels stops matching the timing being recorded.

  The unit here is the word, not the character, because a word shown in kanji is
  read as one thing. Highlighting half of 学校 would ask the reader to map
  keystrokes onto strokes, which is not the skill.

  Every written word keeps its ruby slot whether the reading is showing or not,
  so asking for it never moves the sentence.
-->
<!--
  Under every character, what the reader typed for it. Only the word being typed
  reads the live keys, so a keystroke touches that word and not every word in
  the sentence. See CLAUDE.md 1.9.
-->
<p class="sentence font-japanese text-3xl sm:text-4xl" lang="ja">
  {#each tokens as token, index (index)}{#if token.isWritten}<button
        type="button"
        class="unit reveal"
        class:done={settled >= token.to}
        class:current={isCurrent(token)}
        class:error={hasError && isCurrent(token)}
        aria-label={m.session_typing_reveal_label({ word: token.token.surface })}
        onclick={() => {
          onReveal?.(token.from);
        }}
        ><ruby
          >{token.text}<rt class="reading" class:shown={revealed.has(token.from)}
            >{token.token.reading}</rt
          ></ruby
        ><TypedKeys
          done={typedFor(token)}
          now={isCurrent(token) ? typing : ""}
          stray={isCurrent(token) ? stray : ""}
        /></button
      >{:else}<span
        class="unit"
        class:done={settled >= token.to}
        class:current={isCurrent(token)}
        class:error={hasError && isCurrent(token)}
        >{token.text}<TypedKeys
          done={typedFor(token)}
          now={isCurrent(token) ? typing : ""}
          stray={isCurrent(token) ? stray : ""}
        /></span
      >{/if}{/each}
</p>

<style>
  /*
    Looser than the scale's 1.75 for Japanese, because each line now carries a
    row of romaji under it as well as the furigana slot over it, and the two
    must not meet between lines. See CLAUDE.md 7.2.
  */
  .sentence {
    line-height: 2.4;
  }

  .unit {
    position: relative;
    color: var(--muted-foreground);
  }

  .reveal {
    font: inherit;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
  }

  .done {
    opacity: 0.45;
  }

  .current {
    color: var(--foreground);
    box-shadow: inset 0 -2px 0 0 var(--primary);
  }

  .error {
    color: var(--destructive);
    box-shadow: inset 0 -2px 0 0 var(--destructive);
  }

  /* The slot is always there; only the text appears. */
  .reading {
    visibility: hidden;
    font-size: 0.4em;
    color: var(--primary);
  }

  .shown {
    visibility: visible;
  }
</style>
