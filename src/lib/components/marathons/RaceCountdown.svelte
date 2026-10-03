<script lang="ts">
  import { fade } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { m } from "$lib/paraglide/messages";

  interface Props {
    /** The moment counted down to, in epoch milliseconds. */
    at: number;
    /** Which moment: the start or the end of the race. */
    kind: "start" | "end";
  }

  let { at, kind }: Props = $props();

  /** From here the numbers land big and settle, one a second. */
  const FINAL_SECONDS = 10;

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
  let isDone = $derived(seconds <= 0);
</script>

<!--
  The last minute before a race starts or ends, on the classroom screen: the
  board goes soft behind one big number, so the room counts along. Through
  the last ten seconds each number lands large and settles. At zero, one
  word, and the board comes back.
-->
<div
  class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/60 backdrop-blur-md"
  transition:fade={{ duration: prefersReducedMotion.current ? 0 : 300 }}
  role="timer"
  aria-live="off"
>
  {#if isDone}
    <p class="countdown-word font-semibold tracking-tight">
      {kind === "start" ? m.marathon_countdown_go() : m.marathon_countdown_finish()}
    </p>
  {:else}
    <p class="countdown-label text-muted-foreground">
      {kind === "start" ? m.marathon_countdown_starts() : m.marathon_countdown_ends()}
    </p>
    {#key seconds}
      <p
        class={[
          "countdown-number font-semibold tabular-nums",
          seconds <= FINAL_SECONDS && !prefersReducedMotion.current && "is-landing",
        ]}
      >
        {seconds}
      </p>
    {/key}
  {/if}
</div>

<style>
  .countdown-label {
    font-size: 4vh;
  }

  .countdown-number {
    font-size: 38vh;
    line-height: 1;
  }

  .countdown-word {
    font-size: 22vh;
    line-height: 1;
    animation: countdown-land 600ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* Lands big, then settles back a little past its size and into place. */
  .is-landing {
    animation: countdown-land 600ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes countdown-land {
    from {
      transform: scale(1.45);
    }
    to {
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .countdown-word {
      animation: none;
    }
  }
</style>
