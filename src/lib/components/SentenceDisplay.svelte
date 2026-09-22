<script lang="ts">
  import type { DisplayToken } from "$lib/corpus/display";
  import { m } from "$lib/paraglide/messages";

  interface Props {
    /** The sentence as it should appear, word by word. */
    tokens: readonly DisplayToken[];
    /** How many segments the reader has finished. */
    settled: number;
    /** Whether the last key was wrong, which tints the current word. */
    hasError: boolean;
    /**
     * Segment indices that written words the reader has asked to see start at.
     * Keyed by segment rather than by position, so the same word is identified
     * the same way wherever the token list has been reshaped.
     */
    revealed: ReadonlySet<number>;
    onReveal?: (segment: number) => void;
  }

  let { tokens, settled, hasError, revealed, onReveal }: Props = $props();

  function isCurrent(token: DisplayToken): boolean {
    return settled >= token.from && settled < token.to;
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
<p class="font-japanese text-3xl leading-loose sm:text-4xl" lang="ja">
  {#each tokens as token, index (index)}{#if token.isWritten}<button
        type="button"
        class="reveal"
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
        ></button
      >{:else}<span
        class:done={settled >= token.to}
        class:current={isCurrent(token)}
        class:error={hasError && isCurrent(token)}>{token.text}</span
      >{/if}{/each}
</p>

<style>
  span,
  .reveal {
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
