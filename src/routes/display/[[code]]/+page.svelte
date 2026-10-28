<script lang="ts">
  import { List, Maximize, Minimize, WifiOff } from "@lucide/svelte";
  import type { Component, Snippet } from "svelte";
  import { flip } from "svelte/animate";
  import { prefersReducedMotion } from "svelte/motion";
  import { page } from "$app/state";
  import FlagCredit from "$lib/components/FlagCredit.svelte";
  import MadeBy from "$lib/components/MadeBy.svelte";
  import AutoScroll from "$lib/components/display/AutoScroll.svelte";
  import type { LobbyMember } from "$lib/components/display/lobby/lobby-scene";
  import type { RoomPhase } from "$lib/components/display/lobby/race";
  import type { Countdown } from "$lib/components/display/lobby/start-count";
  import WornBadge from "$lib/components/badges/WornBadge.svelte";
  import { groupProblemMessage } from "$lib/components/groups/problems";
  import { CARD_BACKGROUNDS } from "$lib/components/profile/colors";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import { m } from "$lib/paraglide/messages";
  import { pollWhileVisible } from "$lib/poll";
  import { timeAgo } from "$lib/stats";
  import { nameOf, rankBoard, type RankedEntry } from "$lib/sync/board";
  import { loadGlobalDisplayBoard } from "$lib/sync/global";
  import { countdownFor, statusLine } from "$lib/components/marathons/format";
  import RaceCountdown from "$lib/components/marathons/RaceCountdown.svelte";
  import { readRoomChoice, saveRoomChoice } from "$lib/components/display/lobby/room-choice";
  import JoinSign from "$lib/components/marathons/JoinSign.svelte";
  import { canEnter, liveScore, marathonStatus } from "$lib/sync/marathon-rules";
  import { loadMarathonDisplay, type MarathonDisplay } from "$lib/sync/marathons";
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
   * API, so the screen can be watched changing, and `?debug=lobby` a marathon
   * that has not started, filling up. Never anywhere but localhost: on the
   * real site the flag is ignored and the simulator never downloads.
   */
  const isDebug =
    page.url.searchParams.has("debug") &&
    (location.hostname === "localhost" || location.hostname === "127.0.0.1");
  const isDebugLobby = isDebug && page.url.searchParams.get("debug") === "lobby";
  /** `?debug=race`: a marathon a day into its race. See createRaceSimulator. */
  const isDebugRace = isDebug && page.url.searchParams.get("debug") === "race";
  /** `?debug=mochi`: the room button's two pictures, rendered to save (see MochiPortrait). */
  let MochiPortrait = $state.raw<Component | null>(null);
  if (isDebug && page.url.searchParams.get("debug") === "mochi") {
    void import("$lib/components/display/lobby/MochiPortrait.svelte").then((module) => {
      MochiPortrait = module.default;
    });
  }

  let code = $derived(page.params.code ?? "");
  /**
   * The code for the global board. Everyone on it chose to be public, so its
   * screen needs no secret link: /display/global is the same for everyone.
   */
  const GLOBAL = "global";
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
  /**
   * The clock the offline note and a marathon's countdown are worked out from,
   * ticked every second rather than read on every render.
   */
  let now = $state(Date.now());

  /**
   * A marathon's times, when the screen shows a marathon: its header says
   * when it ends, and counts down through the last day.
   */
  let marathonTimes = $state.raw<MarathonDisplay | null>(null);

  /**
   * The podium, once a marathon's results are final: the first three places
   * as medals, which read from across a room where a small "1" does not.
   */
  const MEDALS = ["🥇", "🥈", "🥉"];
  let countdown = $derived(marathonTimes === null ? null : countdownFor(marathonTimes, now));
  let isFinal = $derived(
    marathonTimes !== null && marathonStatus(marathonTimes, now) === "finished",
  );

  /**
   * What stands left of a name: the place, a medal for the podium once a
   * marathon is final, or nothing for someone at 0, who has no place yet.
   */
  function rankLabel(entry: RankedEntry): string {
    if (entry.score <= 0) return "";
    if (isFinal && entry.rank <= MEDALS.length) return MEDALS[entry.rank - 1] ?? "";
    return String(entry.rank);
  }

  /**
   * One kind of screen link for groups and marathons, as for invites. A code
   * that is not a group's may be a marathon's. A marathon's scores are drawn
   * as they stand now, falling between syncs (see liveScore), and the next
   * refresh moves the rows.
   */
  async function loadGroupOrMarathon(
    code: string,
  ): Promise<{ value: DisplayBoard } | { problem: GroupProblem }> {
    const group = await loadDisplayBoard(code);
    if (!("problem" in group) || group.problem !== "not-found") return group;
    const found = await loadMarathonDisplay(code);
    if ("problem" in found) return group;
    return showMarathon(found.value);
  }

  /** A marathon's board, as the screen draws it. Its times go to the header and the lobby. */
  function showMarathon(marathon: MarathonDisplay): { value: DisplayBoard } {
    marathonTimes = marathon;
    const at = Date.now();
    return {
      value: {
        name: marathon.name,
        members: marathon.runners.map((runner) => ({
          username: runner.username,
          displayName: runner.displayName,
          cardColor: runner.cardColor,
          score: liveScore(runner, marathon.endsAt, at),
          scoredAt: runner.scoredAt,
          role: "member",
          isYou: false,
          badges: runner.badges,
        })),
      },
    };
  }

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
    let stopPolling: (() => void) | undefined;
    // Set when the page goes away before the simulator has loaded.
    const stopped = new AbortController();
    void (async () => {
      const simulator = isDebug ? await import("$lib/sync/display-simulator") : null;
      const asked = (name: string): number | null => {
        const value = Number.parseInt(page.url.searchParams.get(name) ?? "", 10);
        return Number.isNaN(value) ? null : value;
      };
      const hasInvite = page.url.searchParams.has("invite");
      const marathon = isDebugLobby
        ? simulator?.createLobbySimulator(
            hasInvite,
            asked("start"),
            asked("people") ?? 0,
            asked("end"),
          )
        : isDebugRace
          ? simulator?.createRaceSimulator(hasInvite, asked("end"), asked("people") ?? 0)
          : undefined;
      const load: Load =
        marathon !== undefined
          ? async () => showMarathon(await marathon())
          : simulator !== null
            ? simulator.createDisplaySimulator()
            : invite === GLOBAL
              ? () => loadGlobalDisplayBoard(m.leaderboards_global_title())
              : () => loadGroupOrMarathon(invite);
      if (stopped.signal.aborted) return;
      void refresh(load);
      stopPolling = pollWhileVisible(() => {
        void refresh(load);
      }, REFRESH_MS);
    })();
    const clock = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => {
      stopped.abort();
      stopPolling?.();
      clearInterval(clock);
    };
  });

  let ranked = $derived(board === null ? [] : rankBoard(boardOf(board.members), 0));
  let colors = $derived(
    new Map(board?.members.map((member) => [member.username, member.cardColor]) ?? []),
  );

  /**
   * A marathon's board hangs in a little wagashi shop where everyone in it
   * is a daifuku (see display/lobby/): milling about before the start, racing
   * while it runs, on the podium after. The lobby stays a few seconds past
   * the start, and the count a few past either end, for the room's moment
   * at zero.
   */
  const AFTER_ZERO_MS = 6000;
  /** The room counts the last minute down itself, on its screen. */
  const ROOM_COUNTDOWN_MS = 60_000;
  let roomPhase = $derived.by<RoomPhase | null>(() => {
    if (marathonTimes === null) return null;
    if (now < marathonTimes.startsAt + AFTER_ZERO_MS) return "lobby";
    const status = marathonStatus(marathonTimes, now);
    return status === "finished" ? "final" : status === "counting" ? "counting" : "race";
  });
  let isLobby = $derived(roomPhase !== null);
  /**
   * Whether this machine shows the room, rather than the plain board. The
   * room is all motion, so with reduced motion the plain board comes first,
   * and the switch is there for anyone who wants the room anyway.
   */
  let isRoomChosen = $state(readRoomChoice(!prefersReducedMotion.current));
  /** The room, loaded the first time it shows, so three.js stays out of every other page. */
  let LobbyStage = $state.raw<Component<{
    members: readonly LobbyMember[];
    children: Snippet;
    sign?: Snippet;
    phase: RoomPhase;
    countdown: Countdown | null;
    gains: ReadonlyMap<string, number>;
    gainsFrom: number | null;
  }> | null>(null);
  let isRoomShown = $derived(isLobby && isRoomChosen && LobbyStage !== null);
  /** The start or the end, through the room's last minute and its moment after, or null. */
  let roomCountdown = $derived.by<Countdown | null>(() => {
    if (!isRoomShown || marathonTimes === null) return null;
    for (const [at, kind] of [
      [marathonTimes.startsAt, "start"],
      [marathonTimes.endsAt, "end"],
    ] as const) {
      if (now >= at - ROOM_COUNTDOWN_MS && now < at + AFTER_ZERO_MS) return { at, kind };
    }
    return null;
  });
  /**
   * The invite, when the organiser shows it on the screen and people can
   * still join to run. The server only sends it then; this also takes it
   * down the second joining closes, without waiting for the next refresh.
   */
  let inviteLink = $derived(
    marathonTimes?.inviteCode != null && canEnter(marathonTimes, now)
      ? `${location.origin}/join/${marathonTimes.inviteCode}`
      : null,
  );
  $effect(() => {
    if (!isLobby || !isRoomChosen || LobbyStage !== null) return;
    void import("$lib/components/display/lobby/LobbyStage.svelte").then((module) => {
      LobbyStage = module.default;
    });
  });
  /** Places on the board, for the podium: none for anyone on 0, who has no place yet. */
  let places = $derived(
    new Map(ranked.map((entry) => [entry.username, entry.score > 0 ? entry.rank : null])),
  );
  // In the order they joined, so the first ones are the ones in the room.
  let lobbyMembers = $derived(
    (board?.members ?? []).map((member) => ({
      username: member.username,
      name: member.displayName ?? member.username,
      color: member.cardColor,
      rank: places.get(member.username) ?? null,
      readAt: member.scoredAt,
    })),
  );

  /** The first character of a name, whole, so an emoji or a kanji is not cut in half. */
  function initialOf(entry: RankedEntry): string {
    return (
      graphemes.segment(nameOf(entry))[Symbol.iterator]().next().value?.segment ?? ""
    ).toUpperCase();
  }

  // This page never scrolls (the board scrolls itself), so the space the app
  // keeps for a scrollbar would only show as a strip down the right edge,
  // across the lobby's room. Given back while the page is open.
  $effect(() => {
    const root = document.documentElement;
    root.style.scrollbarGutter = "auto";
    return () => {
      root.style.removeProperty("scrollbar-gutter");
    };
  });

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
    if (document.fullscreenElement !== null) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen();
    // A board is wide, so on a phone it asks to stay sideways. Only some
    // browsers allow it, and only in full screen; the others refuse, or have
    // no lock at all (Safari), and the page turns itself instead (see the
    // style below).
    const orientation: Partial<Pick<ScreenOrientation, "lock">> = screen.orientation;
    await orientation.lock?.("landscape").catch(() => undefined);
  }
</script>

<svelte:head>
  <title>{board?.name ?? m.common_app_name()}</title>
</svelte:head>

<main
  class={[
    "display relative flex min-h-0 w-full flex-1 flex-col",
    isLobby && "overflow-hidden",
    !isPointerActive && "cursor-none",
  ]}
>
  <!--
    The room counts down on its own screen; this is for everything else.
    Inside the page, so it turns with it on a phone held upright.
  -->
  {#if countdown !== null && countdown.kind !== roomCountdown?.kind}
    {#key countdown.at}
      <RaceCountdown at={countdown.at} kind={countdown.kind} />
    {/key}
  {/if}
  {#if MochiPortrait !== null}
    <MochiPortrait />
  {:else if board === null}
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
    <!--
      Nothing here most of the time. A small spinner while it fetches, and a
      note when the connection is gone, because then the board on the wall
      may be behind and whoever set it up should know. The buttons show only
      while someone moves the mouse.
    -->
    {#snippet controls()}
      <div class="display-meta flex shrink-0 items-center gap-3 text-muted-foreground">
        {#if isOffline}
          <WifiOff class="display-icon" aria-hidden="true" />
          <span>
            {m.leaderboards_groups_display_offline({ when: timeAgo(updatedAt ?? now, now) })}
          </span>
        {:else if isRefreshing}
          <Spinner class="display-icon" aria-label={m.common_status_loading()} />
        {/if}
        {#if isLobby}
          <Button
            variant="ghost"
            size="icon"
            class={[
              "group transition-opacity duration-150",
              isPointerActive ? "opacity-100" : "pointer-events-none opacity-0",
            ]}
            aria-label={isRoomChosen
              ? m.marathon_display_button_board()
              : m.marathon_display_button_room()}
            onclick={() => {
              isRoomChosen = !isRoomChosen;
              saveRoomChoice(isRoomChosen);
            }}
          >
            {#if isRoomChosen}
              <List class="size-5" />
            {:else}
              <!--
                One of the room's daifuku, as a picture so this board loads
                nothing of the room. It glances up when the button is hovered.
                Rendered by /display?debug=mochi.
              -->
              <span class="relative size-8" aria-hidden="true">
                <img
                  src="/lobby/mochi.png"
                  alt=""
                  class="absolute inset-0 size-full group-hover:opacity-0 group-focus-visible:opacity-0"
                />
                <img
                  src="/lobby/mochi-look.png"
                  alt=""
                  class="absolute inset-0 size-full opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                />
              </span>
            {/if}
          </Button>
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
    {/snippet}

    {#snippet boardView(name: string)}
      <header class="display-header flex items-end justify-between gap-8">
        <div class="flex min-w-0 flex-col">
          <h1 class="display-title min-w-0 truncate font-semibold tracking-tight">{name}</h1>
          {#if marathonTimes !== null}
            <p class="display-status text-muted-foreground tabular-nums">
              {statusLine(marathonTimes, now)}
            </p>
          {/if}
        </div>
        <!-- In the room the controls sit in the page's corner, not on the screen. -->
        {#if !isRoomShown}
          <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
          {@render controls()}
        {/if}
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
                >{rankLabel(entry)}</span
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
                <!-- Only the first badge, as on every board row. -->
                {#if entry.badges?.[0]}
                  <WornBadge
                    worn={entry.badges[0]}
                    class="display-badge self-center"
                    sealClass="display-seal self-center"
                  />
                {/if}
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
    {/snippet}

    <!--
      Before the start: the board on a big screen in a room where everyone
      waits. The lint rule misreads a snippet declared in markup as returning
      nothing; rendering one is what it is for.
    -->
    {#snippet joinSign()}
      <!-- On the room's sign the paper round the code carries its margin on. -->
      <JoinSign link={inviteLink ?? ""} quietZone={1} />
    {/snippet}

    {#if isRoomShown && LobbyStage !== null}
      <LobbyStage
        members={lobbyMembers}
        sign={inviteLink === null ? undefined : joinSign}
        phase={roomPhase ?? "lobby"}
        countdown={roomCountdown}
        {gains}
        gainsFrom={updatedAt}
      >
        <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
        {@render boardView(board.name)}
      </LobbyStage>
      <!-- A backing only while the buttons show, or the note that the board may be behind. -->
      <div
        class={[
          "absolute top-5 right-8 rounded-full px-3 transition-colors duration-150",
          (isPointerActive || isOffline) && "bg-background/85",
        ]}
      >
        <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
        {@render controls()}
      </div>
    {:else if inviteLink !== null}
      <!-- The plain board, with the invite beside it while people can still join. -->
      <div class="flex min-h-0 flex-1">
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
          {@render boardView(board.name)}
        </div>
        <aside class="display-invite shrink-0 overflow-hidden rounded-xl">
          <JoinSign link={inviteLink} />
        </aside>
      </div>
    {:else}
      <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
      {@render boardView(board.name)}
    {/if}

    <!-- Where the board comes from, small, for anyone in the room who wants to try it. -->
    <footer
      class={[
        "display-footer display-meta flex items-baseline justify-between gap-8 border-t border-border text-muted-foreground",
        isLobby && "lobby-footer absolute inset-x-0 bottom-0 bg-background/85",
      ]}
    >
      <span class="font-medium text-foreground">{m.common_app_name()}</span>
      <!-- A classroom screen is often a Windows PC, where flags on badges need the credit. -->
      <FlagCredit />
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

  /*
    A board is wide. On a phone held upright the page lays itself out on its
    side, as a landscape screen, so turning the phone shows it the right way
    up, and the room and the board are never squeezed into a tall strip.
    Its line is then measured from the screen's short side, which is its
    width.
  */
  @media (orientation: portrait) and (max-width: 768px) {
    .display {
      --line: clamp(0.9rem, 3.6vw, 3.5rem);
      position: fixed;
      top: 0;
      left: 100dvw;
      width: 100dvh;
      height: 100dvw;
      transform: rotate(90deg);
      transform-origin: top left;
    }
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

  /* A marathon's countdown: what a class watches on its last evening. */
  .display-status {
    font-size: calc(var(--line) * 0.8);
  }

  .display-meta {
    font-size: calc(var(--line) * 0.55);
  }

  /* The badge, sized from the screen like everything else here. In em, so
     the pill's padding grows with its text. */
  /* A seal sizes itself from its text size; the rest of it is its own. */
  :global(.display-seal) {
    font-size: calc(var(--line) * 0.55);
  }

  :global(.display-badge) {
    font-size: calc(var(--line) * 0.55);
    gap: 0.35em;
    padding: 0.35em 0.75em;
  }

  .display-status {
    font-size: calc(var(--line) * 0.8);
  }

  /* The invite beside the plain board, big enough to scan from a few rows back. */
  .display-invite {
    width: 11em;
    height: 13em;
    margin: 4vh 4vw 0 0;
    font-size: calc(var(--line) * 0.85);
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
