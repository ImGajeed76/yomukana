<script lang="ts">
  import { m } from "$lib/paraglide/messages";

  // The last minute before a marathon starts or ends, on the room's big
  // screen in place of the board. Seconds, big; through the last ten, brush
  // numerals that land like ink strokes; at zero 始め！, "begin", or
  // 終わり！, "the end", with the word in the reader's language under it.
  // Sized in em from the screen's own line, like the board it replaces.

  interface Props {
    /** The moment counted down to, in epoch milliseconds. */
    at: number;
    /** Which moment: the start or the end of the race. */
    kind: "start" | "end";
  }

  let { at, kind }: Props = $props();

  /** From here the numbers are brush strokes. */
  const FINAL_SECONDS = 10;
  const NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

  // Its own clock, finer than the page's: a second shown late by most of a
  // second reads as a stutter on a number this big.
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 100);
    return () => {
      clearInterval(timer);
    };
  });

  let seconds = $derived(Math.ceil((at - now) / 1000));
</script>

<div class="flex size-full flex-col items-center justify-center" role="timer" aria-live="off">
  {#if seconds <= 0}
    <p lang="ja" class="screen-word is-landing font-seal">
      {kind === "start" ? "始め！" : "終わり！"}
    </p>
    <p class="screen-label text-muted-foreground">
      {kind === "start" ? m.marathon_countdown_go() : m.marathon_countdown_finish()}
    </p>
  {:else}
    <p class="screen-label text-muted-foreground">
      {kind === "start" ? m.marathon_countdown_starts() : m.marathon_countdown_ends()}
    </p>
    {#key seconds}
      {#if seconds <= FINAL_SECONDS}
        <p lang="ja" class="screen-numeral is-landing font-seal">
          {NUMERALS[seconds - 1]}
        </p>
      {:else}
        <p class="screen-number font-semibold tabular-nums">{seconds}</p>
      {/if}
    {/key}
  {/if}
</div>

<style>
  .screen-label {
    font-size: 1.4em;
  }

  .screen-number {
    font-size: 9em;
    line-height: 1;
  }

  .screen-numeral {
    font-size: 10em;
    line-height: 1.1;
  }

  .screen-word {
    font-size: 7em;
    line-height: 1.1;
  }

  /*
    An ink stroke landing: out of focus and too big, then sharp, settling a
    touch past its size. Blur is the brush's wet edge drying.
  */
  .is-landing {
    animation: ink-land 520ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes ink-land {
    from {
      opacity: 0;
      filter: blur(0.08em);
      transform: scale(1.5) rotate(-4deg);
    }
    40% {
      opacity: 1;
    }
    to {
      filter: blur(0);
      transform: scale(1) rotate(0deg);
    }
  }
</style>
