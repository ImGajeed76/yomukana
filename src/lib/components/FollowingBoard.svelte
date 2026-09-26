<script lang="ts">
  import { Check, Copy, X } from "@lucide/svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { Button } from "$lib/components/ui/button";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Input } from "$lib/components/ui/input";
  import { m } from "$lib/paraglide/messages";
  import { timeAgo } from "$lib/stats";
  import { nameOf, rankBoard, standingOf, type BoardEntry, type Standing } from "$lib/sync/board";
  import { addFriend, loadBoard, removeFriend, type FriendProblem } from "$lib/sync/friends";

  interface Props {
    /** The email this device syncs as, or null when signed out. */
    account: string | null;
    /** Whether the page's own sync has finished, so the board shows the score just sent. */
    isSynced: boolean;
    /** The reader's score right now, which is newer than the one on the server. */
    ownScore: number;
    /** A made-up board for `?demo`, drawn instead of asking the server. */
    demo?: readonly BoardEntry[] | null;
  }

  let { account, isSynced, ownScore, demo = null }: Props = $props();

  // Raw: replaced whole on every load, never edited in place. See CLAUDE.md 1.8.
  let loaded = $state.raw<readonly BoardEntry[] | null>(null);
  let hasFailed = $state(false);
  let name = $state("");
  let isAdding = $state(false);
  let problem = $state<FriendProblem | null>(null);
  let isCopied = $state(false);

  /** The scroll area, and the part of it that scrolls. */
  let listArea = $state<HTMLElement | null>(null);
  let list = $state<HTMLElement | null>(null);
  /** Whether there are rows scrolled out of view above, and below. */
  let hasMoreAbove = $state(false);
  let hasMoreBelow = $state(false);
  /** How tall the list is, so the page fits the window. Null lets it be as tall as its rows. */
  let listHeight = $state<number | null>(null);

  /** How far each faded edge reaches into the list. */
  const FADE = "24px";
  /**
   * The shortest the list gets. On a window too short for this the page
   * scrolls instead: a list a row and a half tall is worse than a scroll.
   */
  const MIN_LIST_HEIGHT = 240;

  // The list takes the height the page has left in the window, so the page
  // itself never scrolls. Measured rather than worked out from the heights of
  // the nav, heading and footer, which change with the language and the
  // screen. Runs on load, on resize and when the board changes, never while
  // typing.
  $effect(() => {
    const area = listArea;
    if (area === null) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- read so a changed board is measured again
    ranked;

    const fit = (): void => {
      area.style.height = "";
      const overflow = document.documentElement.scrollHeight - window.innerHeight;
      listHeight = overflow > 0 ? Math.max(MIN_LIST_HEIGHT, area.offsetHeight - overflow) : null;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
    };
  });

  // Tracks whether the list can scroll further each way, so the faded edges
  // say "there is more" and go away at the ends.
  $effect(() => {
    const viewport = list;
    if (viewport === null) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- read so the edges are rechecked when the board or its height changes
    ranked;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- see above
    listHeight;

    const measure = (): void => {
      hasMoreAbove = viewport.scrollTop > 1;
      hasMoreBelow = viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1;
    };
    measure();
    viewport.addEventListener("scroll", measure, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", measure);
    };
  });

  // On a board longer than the list, open on the reader's own line: it is the
  // one they came to see. Scrolled inside the list only, never the page.
  $effect(() => {
    const viewport = list;
    if (viewport === null || ranked.length === 0 || listHeight === null) return;
    const own = viewport.querySelector<HTMLElement>("[data-you]");
    if (own === null) return;
    const offset = own.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    viewport.scrollTop += offset - (viewport.clientHeight - own.offsetHeight) / 2;
  });

  const PROBLEM_MESSAGES: Record<FriendProblem, () => string> = {
    "not-found": m.leaderboards_following_error_not_found,
    self: m.leaderboards_following_error_self,
    offline: m.leaderboards_following_error_offline,
    unknown: m.leaderboards_following_error_unknown,
  };

  async function refresh(): Promise<void> {
    const board = await loadBoard();
    hasFailed = board === null;
    if (board !== null) loaded = board;
  }

  $effect(() => {
    if (demo !== null || account === null || !isSynced) return;
    void refresh();
  });

  let entries = $derived(demo ?? loaded);
  let isSignedIn = $derived(demo !== null || account !== null);
  let ranked = $derived(entries === null ? [] : rankBoard(entries, ownScore));
  let standing = $derived(standingOf(ranked));
  let you = $derived(ranked.find((entry) => entry.isYou) ?? null);

  function describe(state: Standing): string | null {
    if (state.kind === "leading") return m.leaderboards_following_standing_leading();
    if (state.kind === "tied")
      return m.leaderboards_following_standing_tied({ username: state.name });
    if (state.kind === "behind") {
      return m.leaderboards_following_standing_behind({
        points: String(state.points),
        username: state.name,
      });
    }
    return null;
  }

  async function copyName(): Promise<void> {
    if (you === null) return;
    await navigator.clipboard.writeText(you.username);
    isCopied = true;
    setTimeout(() => {
      isCopied = false;
    }, 1500);
  }

  async function add(): Promise<void> {
    isAdding = true;
    problem = await addFriend(name);
    if (problem === null) {
      name = "";
      await refresh();
    }
    isAdding = false;
  }

  async function remove(entry: BoardEntry): Promise<void> {
    // Off the board at once, back on only if the server says no.
    loaded = (loaded ?? []).filter((other) => other.userId !== entry.userId);
    if (!(await removeFriend(entry.userId))) await refresh();
  }
</script>

<!--
  The reader, and the people they follow, ranked by score. Following is
  one-way: nobody is asked, and nobody is told when they are unfollowed.
-->
<section class="flex flex-col gap-5 rounded-lg border border-border bg-background p-6">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="text-lg leading-snug font-medium">{m.leaderboards_following_title()}</h2>
    <!--
      The reader's own name, one click from the clipboard. Telling a friend
      what to type is the first thing anyone does with this board.
    -->
    {#if you !== null}
      <div class="-mr-2 flex items-center">
        <Button
          variant="ghost"
          size="sm"
          class="font-normal text-muted-foreground"
          aria-label={m.leaderboards_following_button_copy()}
          title={m.leaderboards_following_label_your_name()}
          onclick={() => {
            void copyName();
          }}
        >
          {isCopied ? m.leaderboards_following_status_copied() : you.username}
          {#if isCopied}
            <Check class="size-4" />
          {:else}
            <Copy class="size-4" />
          {/if}
        </Button>
      </div>
    {/if}
  </div>

  {#if !isSignedIn}
    <!--
      Friends need an account, and an account is a choice. So this asks rather
      than nags: one line and one button. See CLAUDE.md 1.7.
    -->
    <p class="text-sm text-muted-foreground">{m.leaderboards_following_signed_out()}</p>
    <div>
      <Button href="/account" variant="outline">{m.leaderboards_following_button_sign_in()}</Button>
    </div>
  {:else if hasFailed && entries === null}
    <p class="text-sm text-destructive" role="alert">{m.leaderboards_following_error_load()}</p>
  {:else if entries === null}
    <p class="text-sm text-muted-foreground" role="status">{m.leaderboards_following_loading()}</p>
  {:else}
    <!--
      The list scrolls inside the board, and the page around it stays put. The
      rows fade out at an edge while there is more to scroll that way.
    -->
    <ScrollArea
      bind:ref={listArea}
      bind:viewportRef={list}
      class="following-list -mx-3"
      style="height: {listHeight === null
        ? 'auto'
        : `${String(listHeight)}px`}; --fade-top: {hasMoreAbove
        ? FADE
        : '0px'}; --fade-bottom: {hasMoreBelow ? FADE : '0px'}"
    >
      <ol class="flex flex-col gap-1">
        {#each ranked as entry (entry.userId)}
          <li
            data-you={entry.isYou || undefined}
            class={[
              "group flex items-center gap-2 rounded-md px-3 py-2",
              entry.isYou && "bg-muted",
            ]}
          >
            <span class="w-5 shrink-0 text-sm text-muted-foreground tabular-nums">{entry.rank}</span
            >
            <div class="flex min-w-0 flex-1 flex-col">
              <!-- The name opens their profile. The row stays a row, so the remove button is not inside a link. -->
              <a
                href="/@{entry.username}"
                class={["truncate text-sm hover:underline", entry.isYou && "font-medium"]}
                >{nameOf(entry)}</a
              >
              <span class="truncate text-xs text-muted-foreground">
                {#if entry.isYou}
                  {describe(standing) ?? ""}
                {:else if entry.scoredAt === null}
                  {m.leaderboards_following_label_never()}
                {:else}
                  {m.leaderboards_following_label_active({ when: timeAgo(entry.scoredAt) })}
                {/if}
              </span>
            </div>
            <!-- A fixed column, read down the left edge like a list of numbers. -->
            <span class="w-16 shrink-0 text-left text-base font-semibold tabular-nums"
              >{entry.score}</span
            >
            <!--
            Removing is a quiet action, so with a mouse it waits for hover or
            focus. A touch screen has no hover, so there it stays in view.
            The slot is always there, so every score lines up.
          -->
            <div class="flex size-8 shrink-0 items-center justify-center">
              {#if !entry.isYou}
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 text-muted-foreground pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
                  aria-label={m.leaderboards_following_button_remove({ username: nameOf(entry) })}
                  onclick={() => {
                    void remove(entry);
                  }}
                >
                  <X class="size-4" />
                </Button>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
    </ScrollArea>

    {#if standing.kind === "alone"}
      <p class="text-sm text-muted-foreground">{m.leaderboards_following_empty()}</p>
    {/if}

    <!-- Pinned to the bottom edge, under however much board there is. -->
    <form
      class="mt-auto flex flex-col gap-2"
      onsubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <div class="flex gap-2">
        <Input
          bind:value={name}
          aria-label={m.leaderboards_following_label_add()}
          placeholder={m.leaderboards_following_label_add()}
          autocomplete="off"
          autocapitalize="none"
          spellcheck={false}
          required
          disabled={isAdding || demo !== null}
        />
        <Button type="submit" variant="outline" disabled={isAdding || demo !== null}>
          {m.leaderboards_following_button_add()}
        </Button>
      </div>
      <!--
        Only when there is something to say. Beside the score the list above
        takes whatever room is left, so a line appearing here shortens the list
        instead of pushing anything, and an empty reserved line was only a gap.
      -->
      {#if problem !== null}
        <div class="text-center">
          <StatusLine message={PROBLEM_MESSAGES[problem]()} isError={true} />
        </div>
      {/if}
    </form>
  {/if}
</section>

<style>
  /*
    A mask rather than a shadow laid on top: it paints no colour, only takes
    some away from the rows themselves, so it needs no second shade and
    survives a theme flip. See CLAUDE.md 8.5.
  */
  :global(.following-list) {
    mask-image: linear-gradient(
      to bottom,
      transparent,
      black var(--fade-top),
      black calc(100% - var(--fade-bottom)),
      transparent
    );
  }
</style>
