<script lang="ts">
  import type { Snippet } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  // A list on a screen nobody touches, so it scrolls itself when it is taller
  // than the screen: slowly down, a pause at the bottom, back up, a longer
  // pause at the top, again. The track at the side shows which part is on
  // screen, and during a pause its thumb fills up like a countdown, so the
  // room can see the loop and knows it is about to move rather than stuck.
  // With reduced motion it turns a page at a time instead of gliding.

  let viewport = $state<HTMLElement | null>(null);
  let content = $state<HTMLElement | null>(null);
  /** The share of the list on screen, and where that share starts, both 0 to 1. */
  let shown = $state(1);
  let offset = $state(0);
  /** The current pause, counted so the countdown restarts with each one, and how long it lasts. */
  let pause = $state<{ count: number; ms: number } | null>(null);

  /** Pixels a second on the way down: slow enough to read the names going past. */
  const SCROLL_SPEED = 40;
  const PAUSE_TOP_MS = 12_000;
  const PAUSE_BOTTOM_MS = 6000;
  const PAGE_MS = 10_000;

  let hasMore = $derived(shown < 0.999);
  let isAtTop = $derived(offset < 0.001);
  let isAtBottom = $derived(offset + shown > 0.999);

  // Measures what share of the list is on screen, whenever it scrolls or the
  // list changes size, which it does when someone joins.
  $effect(() => {
    const element = viewport;
    const inner = content;
    if (element === null || inner === null) return;
    const measure = (): void => {
      const total = Math.max(1, element.scrollHeight);
      shown = Math.min(1, element.clientHeight / total);
      offset = element.scrollTop / total;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(inner);
    element.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", measure);
    };
  });

  $effect(() => {
    if (viewport === null) return;
    // Bound once it is known to exist, so the functions below, which the
    // loop hands to each other, need not check again.
    const element: HTMLElement = viewport;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = 0;
    let position = 0;
    let count = 0;

    const room = (): number => element.scrollHeight - element.clientHeight;

    const rest = (ms: number, then: () => void): void => {
      count += 1;
      pause = { count, ms };
      timer = setTimeout(() => {
        pause = null;
        then();
      }, ms);
    };

    const glideDown = (at: number): void => {
      const step = last === 0 ? 0 : ((at - last) / 1000) * SCROLL_SPEED;
      last = at;
      position = Math.min(room(), position + step);
      element.scrollTop = position;
      if (position >= room()) {
        last = 0;
        rest(PAUSE_BOTTOM_MS, glideUp);
        return;
      }
      frame = requestAnimationFrame(glideDown);
    };

    function glideUp(): void {
      position = 0;
      element.scrollTo({ top: 0, behavior: "smooth" });
      rest(PAUSE_TOP_MS, start);
    }

    const turnPage = (): void => {
      position = position >= room() ? 0 : Math.min(room(), position + element.clientHeight);
      element.scrollTop = position;
      rest(PAGE_MS, turnPage);
    };

    function start(): void {
      if (room() <= 0) {
        timer = setTimeout(start, PAUSE_TOP_MS);
        return;
      }
      if (prefersReducedMotion.current) turnPage();
      else frame = requestAnimationFrame(glideDown);
    }

    rest(PAUSE_TOP_MS, start);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      pause = null;
    };
  });
</script>

<div class="relative flex min-h-0 flex-1">
  <div
    bind:this={viewport}
    class="auto-scroll min-h-0 flex-1 overflow-hidden"
    style="--fade-top: {isAtTop ? '0px' : 'var(--fade)'}; --fade-bottom: {isAtBottom
      ? '0px'
      : 'var(--fade)'}"
  >
    <div bind:this={content}>
      {@render children()}
    </div>
  </div>

  {#if hasMore}
    <!-- Decoration for the room: screen readers get the whole list anyway. -->
    <div class="auto-scroll-track" aria-hidden="true">
      <div class="auto-scroll-thumb" style="top: {offset * 100}%; height: {shown * 100}%">
        {#if pause !== null}
          {#key pause.count}
            <div class="auto-scroll-fill" style="animation-duration: {pause.ms}ms"></div>
          {/key}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .auto-scroll {
    --fade: calc(var(--line, 1.5rem) * 1.5);
    /*
      A mask rather than a shadow laid on top: it paints no colour, only
      takes some away from the rows, so it survives a theme flip.
      See CLAUDE.md 8.5.
    */
    mask-image: linear-gradient(
      to bottom,
      transparent,
      black var(--fade-top),
      black calc(100% - var(--fade-bottom)),
      transparent
    );
  }

  /* One colour at two strengths, the way the charts do it. */
  .auto-scroll-track {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 1.5vw;
    width: calc(var(--line, 1.5rem) * 0.18);
    border-radius: 999px;
    background: color-mix(in oklab, var(--muted-foreground) 20%, transparent);
  }

  .auto-scroll-thumb {
    position: absolute;
    left: 0;
    right: 0;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in oklab, var(--muted-foreground) 55%, transparent);
  }

  /* Fills from the top while the list rests, and is gone the moment it moves. */
  .auto-scroll-fill {
    position: absolute;
    inset: 0;
    transform-origin: top;
    background: var(--foreground);
    animation-name: auto-scroll-countdown;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }

  @keyframes auto-scroll-countdown {
    from {
      transform: scaleY(0);
    }
    to {
      transform: scaleY(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .auto-scroll-fill {
      display: none;
    }
  }
</style>
