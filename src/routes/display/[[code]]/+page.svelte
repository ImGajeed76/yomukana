<script lang="ts">
  import { Maximize, Minimize, WifiOff } from "@lucide/svelte";
  import { flip } from "svelte/animate";
  import { prefersReducedMotion } from "svelte/motion";
  import { page } from "$app/state";
  import MadeBy from "$lib/components/MadeBy.svelte";
  import AutoScroll from "$lib/components/display/AutoScroll.svelte";
  import { groupProblemMessage } from "$lib/components/groups/problems";
  import { CARD_BACKGROUNDS } from "$lib/components/profile/colors";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import { m } from "$lib/paraglide/messages";
  import { timeAgo } from "$lib/stats";
  import { nameOf, rankBoard, type RankedEntry } from "$lib/sync/board";
  import {
    boardOf,
    loadDisplayBoard,
    type DisplayBoard,
    type GroupMember,
    type GroupProblem,
  } from "$lib/sync/groups";

  // A group's board on a classroom screen: a projector or a TV on the wall,
  // read from across the room, left open all day, touched by nobody. So it
  // loads once, then changes in place: rows move to their new rank rather
  // than the page redrawing, and it scrolls itself when there are more
  // people than fit.

  type Load = () => Promise<{ value: DisplayBoard } | { problem: GroupProblem }>;

  /**
   * `?debug` on this machine feeds the page a pretend class instead of the
   * API, so the screen can be watched changing. Never anywhere but localhost:
   * on the real site the flag is ignored and the simulator never downloads.
   */
  const isDebug =
    page.url.searchParams.has("debug") &&
    (location.hostname === "localhost" || location.hostname === "127.0.0.1");

  let code = $derived(page.params.code ?? "");
  // Raw: replaced whole on every refresh. See CLAUDE.md 1.8.
  let board = $state.raw<DisplayBoard | null>(null);
  /** Why the first load failed. Later failures keep the board and say so quietly. */
  let problem = $state<GroupProblem | null>(null);
  let isRefreshing = $state(false);
  /** When the board on screen was fetched, in epoch milliseconds. */
  let updatedAt = $state<number | null>(null);
  /** Whether the last refresh failed, so the corner says the board may be behind. */
  let isOffline = $state(false);
  /** Places each reader climbed in the last refresh, to show beside their name until the next. */
  let climbs = $state.raw(new Map<string, number>());
  /** Points each reader gained in the last refresh, beside their score until the next. */
  let gains = $state.raw(new Map<string, number>());
  /** Readers whose score went up in the last refresh, lit up for a moment. */
  let raised = $state.raw(new Set<string>());
  /** The clock the offline note is worked out from, ticked rather than read on every render. */
  let now = $state(Date.now());

  /**
   * How often the screen asks again. Scores arrive with each reader's sync,
   * between sentences, so a minute is as fresh as they get, and a screen left
   * on all day asks a few hundred times rather than thousands. The simulator
   * goes faster, to have something to watch.
   */
  const REFRESH_MS = isDebug ? 5000 : 60_000;
  /** How long a raised score stays lit. */
  const RAISED_MS = 4000;

  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

  function ranksOf(members: readonly GroupMember[]): Map<string, RankedEntry> {
    return new Map(rankBoard(boardOf(members), 0).map((entry) => [entry.username, entry]));
  }

  async function refresh(load: Load): Promise<void> {
    isRefreshing = true;
    const result = await load();
    isRefreshing = false;
    if ("problem" in result) {
      // Turned off: say so. Anything else, like a dropped connection, keeps
      // the last board up and only notes it in the corner.
      if (board === null || result.problem === "not-found") problem = result.problem;
      isOffline = board !== null && result.problem !== "not-found";
      return;
    }
    const next = result.value;
    if (board !== null) {
      const before = ranksOf(board.members);
      const nextClimbs: [string, number][] = [];
      const nextGains: [string, number][] = [];
      for (const [username, entry] of ranksOf(next.members)) {
        const old = before.get(username);
        if (old === undefined) continue;
        if (entry.rank < old.rank) nextClimbs.push([username, old.rank - entry.rank]);
        const gain = Math.round(entry.score) - Math.round(old.score);
        if (gain > 0) nextGains.push([username, gain]);
      }
      climbs = new Map(nextClimbs);
      gains = new Map(nextGains);
      raised = new Set(gains.keys());
      setTimeout(() => {
        raised = new Set();
      }, RAISED_MS);
    }
    board = next;
    problem = null;
    isOffline = false;
    updatedAt = Date.now();
  }

  $effect(() => {
    const invite = code;
    let timer: ReturnType<typeof setInterval> | undefined;
    // Set when the page goes away before the simulator has loaded.
    const stopped = new AbortController();
    void (async () => {
      const load: Load = isDebug
        ? (await import("$lib/sync/display-simulator")).createDisplaySimulator()
        : () => loadDisplayBoard(invite);
      if (stopped.signal.aborted) return;
      void refresh(load);
      timer = setInterval(() => {
        void refresh(load);
      }, REFRESH_MS);
    })();
    const clock = setInterval(() => {
      now = Date.now();
    }, 15_000);
    return () => {
      stopped.abort();
      clearInterval(timer);
      clearInterval(clock);
    };
  });

  let ranked = $derived(board === null ? [] : rankBoard(boardOf(board.members), 0));
  let colors = $derived(
    new Map(board?.members.map((member) => [member.username, member.cardColor]) ?? []),
  );

  /** The first character of a name, whole, so an emoji or a kanji is not cut in half. */
  function initialOf(entry: RankedEntry): string {
    return (
      graphemes.segment(nameOf(entry))[Symbol.iterator]().next().value?.segment ?? ""
    ).toUpperCase();
  }

  // Keeps the screen on. A screen that sleeps after ten minutes is a black
  // rectangle for the rest of the lesson. The browser drops the lock when the
  // tab is hidden, so it is asked for again whenever it comes back.
  $effect(() => {
    let lock: WakeLockSentinel | null = null;
    const hold = async (): Promise<void> => {
      if (document.visibilityState !== "visible") return;
      // Refused when the battery is low or the browser does not allow it.
      // The board still works; the screen may just sleep.
      lock = await navigator.wakeLock.request("screen").catch(() => null);
    };
    const holdAgain = (): void => {
      void hold();
    };
    holdAgain();
    document.addEventListener("visibilitychange", holdAgain);
    return () => {
      document.removeEventListener("visibilitychange", holdAgain);
      void lock?.release();
    };
  });

  // The fullscreen button and the pointer show only while someone moves the
  // mouse. The rest of the day there is nothing on screen but the board.
  let isPointerActive = $state(false);
  let isFullscreen = $state(false);
  $effect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wake = (): void => {
      isPointerActive = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        isPointerActive = false;
      }, 3000);
    };
    const track = (): void => {
      isFullscreen = document.fullscreenElement !== null;
    };
    window.addEventListener("pointermove", wake);
    document.addEventListener("fullscreenchange", track);
    return () => {
      window.removeEventListener("pointermove", wake);
      document.removeEventListener("fullscreenchange", track);
      clearTimeout(timer);
    };
  });

  async function toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement === null) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }
</script>

<svelte:head>
  <title>{board?.name ?? m.common_app_name()}</title>
</svelte:head>

<main class={["display flex min-h-0 w-full flex-1 flex-col", !isPointerActive && "cursor-none"]}>
  {#if board === null}
    <!-- The only loading state: the first. After this the board changes in place. -->
    <div class="flex flex-1 items-center justify-center">
      {#if problem === null}
        <Spinner class="size-10 text-muted-foreground" aria-label={m.common_status_loading()} />
      {:else}
        <p class="display-status text-muted-foreground" role="alert">
          {problem === "not-found"
            ? m.leaderboards_groups_display_gone()
            : groupProblemMessage(problem)}
        </p>
      {/if}
    </div>
  {:else}
    <header class="display-header flex items-end justify-between gap-8">
      <h1 class="display-title min-w-0 truncate font-semibold tracking-tight">{board.name}</h1>
      <!--
        Nothing here most of the time. A small spinner while it fetches, and
        a note when the connection is gone, because then the board on the
        wall may be behind and whoever set it up should know.
      -->
      <div class="display-meta flex shrink-0 items-center gap-3 text-muted-foreground">
        {#if isOffline}
          <WifiOff class="display-icon" aria-hidden="true" />
          <span>
            {m.leaderboards_groups_display_offline({ when: timeAgo(updatedAt ?? now, now) })}
          </span>
        {:else if isRefreshing}
          <Spinner class="display-icon" aria-label={m.common_status_loading()} />
        {/if}
        {#if document.fullscreenEnabled}
          <Button
            variant="ghost"
            size="icon"
            class={[
              "transition-opacity duration-150",
              isPointerActive ? "opacity-100" : "pointer-events-none opacity-0",
            ]}
            aria-label={isFullscreen
              ? m.leaderboards_groups_display_button_exit()
              : m.leaderboards_groups_display_button_fullscreen()}
            onclick={() => {
              void toggleFullscreen();
            }}
          >
            {#if isFullscreen}
              <Minimize class="size-5" />
            {:else}
              <Maximize class="size-5" />
            {/if}
          </Button>
        {/if}
      </div>
    </header>

    <AutoScroll>
      <ol class="display-rows flex flex-col">
        {#each ranked as entry (entry.username)}
          <li
            animate:flip={{ duration: prefersReducedMotion.current ? 0 : 800 }}
            class={[
              "display-row flex items-center rounded-xl transition-colors duration-1000",
              raised.has(entry.username) && "bg-accent",
            ]}
          >
            <span class="display-rank shrink-0 text-muted-foreground tabular-nums"
              >{entry.rank}</span
            >
            <span
              class={[
                "display-avatar flex shrink-0 items-center justify-center rounded-full font-semibold text-profile-foreground",
                CARD_BACKGROUNDS[colors.get(entry.username) ?? "green"],
              ]}
              aria-hidden="true">{initialOf(entry)}</span
            >
            <span class="flex min-w-0 flex-1 items-baseline gap-[0.5em]">
              <span class="max-w-full shrink-0 truncate font-medium">{nameOf(entry)}</span>
              {#if entry.displayName !== null}
                <span class="display-meta min-w-0 truncate text-muted-foreground"
                  >@{entry.username}</span
                >
              {/if}
              {#if climbs.has(entry.username)}
                <span class="display-meta shrink-0 font-medium text-gain"
                  >▲{climbs.get(entry.username)}</span
                >
              {/if}
            </span>
            <!-- What the score gained since the last update, so a climb has a reason on screen. -->
            <span class="flex shrink-0 items-baseline gap-[0.5em]">
              {#if gains.has(entry.username)}
                <span class="display-meta font-medium text-gain tabular-nums"
                  >+{gains.get(entry.username)}</span
                >
              {/if}
              <span class="font-semibold tabular-nums">{Math.round(entry.score)}</span>
            </span>
          </li>
        {/each}
      </ol>
    </AutoScroll>

    <!-- Where the board comes from, small, for anyone in the room who wants to try it. -->
    <footer
      class="display-footer display-meta flex items-baseline justify-between gap-8 border-t border-border text-muted-foreground"
    >
      <span class="font-medium text-foreground">{m.common_app_name()}</span>
      <MadeBy />
    </footer>
  {/if}
</main>

<style>
  /*
    Sized from the screen, not in pixels: the same page on a 720p projector
    and a 4K TV fills the wall the same way, and a line stays readable from
    the back of the room. One variable, the rest in proportion to it.
  */
  .display {
    --line: clamp(1.25rem, 3.6vh, 3.5rem);
    font-size: var(--line);
  }

  .display-header {
    padding: 4vh 4vw 3vh;
  }

  /* Room on the right for the scroll track, so it never sits on a score. */
  .display-rows {
    gap: calc(var(--line) * 0.15);
    padding: 0 calc(4vw + var(--line)) 4vh 4vw;
  }

  .display-footer {
    padding: 2vh 4vw;
  }

  :global(.display-icon) {
    width: 1em;
    height: 1em;
  }

  .display-title {
    font-size: calc(var(--line) * 1.6);
    line-height: 1.2;
  }

  .display-meta {
    font-size: calc(var(--line) * 0.55);
  }

  .display-status {
    font-size: calc(var(--line) * 0.8);
  }

  .display-row {
    gap: calc(var(--line) * 0.7);
    padding: calc(var(--line) * 0.35) calc(var(--line) * 0.5);
    margin-inline: calc(var(--line) * -0.5);
  }

  .display-rank {
    width: 2.2em;
    text-align: right;
  }

  .display-avatar {
    width: 1.6em;
    height: 1.6em;
    font-size: calc(var(--line) * 0.75);
  }

  @media (prefers-reduced-motion: reduce) {
    .display-row {
      transition: none;
    }
  }
</style>
