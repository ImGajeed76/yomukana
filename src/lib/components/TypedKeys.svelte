<script lang="ts">
  interface Props {
    /** Keys for the part of the word already finished. */
    done: string;
    /** Keys typed so far in the segment in progress. */
    now: string;
    /** Wrong keys waiting to be deleted. */
    stray: string;
  }

  let { done, now, stray }: Props = $props();
</script>

<!--
  What the reader typed, under the character they typed it for. Positioned
  rather than laid out, so a run of wrong keys can spill sideways without
  widening the character above it and moving the rest of the sentence.
  See CLAUDE.md 10.1. An echo of the keyboard, so hidden from assistive
  technology rather than read out a second time.
-->
<span class="typed" aria-hidden="true"
  ><span class="done">{done}</span><span class="now">{now}</span><span class="stray">{stray}</span
  ></span
>

<style>
  .typed {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    font-family: var(--font-mono);
    font-size: 0.34em;
    line-height: 1;
    white-space: nowrap;
    pointer-events: none;
  }

  .done {
    color: var(--muted-foreground);
  }

  .now {
    color: var(--foreground);
  }

  .stray {
    color: var(--destructive);
  }
</style>
