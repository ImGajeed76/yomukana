<script lang="ts">
  import { Check, Copy, Pencil, X } from "@lucide/svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import UsernameDialog from "$lib/components/UsernameDialog.svelte";
  import { Button } from "$lib/components/ui/button";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Input } from "$lib/components/ui/input";
  import { m } from "$lib/paraglide/messages";
  import { timeAgo } from "$lib/stats";
  import { rankBoard, standingOf, type BoardEntry, type Standing } from "$lib/sync/board";
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
  let isRenaming = $state(false);
  let list = $state<HTMLElement | null>(null);
  /** Whether there are rows scrolled out of view above, and below. */
  let hasMoreAbove = $state(false);
  let hasMoreBelow = $state(false);

  /** How far each faded edge reaches into the list. */
  const FADE = "24px";

  // Tracks whether the list can scroll further each way, so the faded edges
  // say "there is more" and go away at the ends. Rechecked on scroll, when the
  // list changes size, and when the board changes.
  $effect(() => {
    if (list === null) return;
    const viewport = list;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- read so the edges are rechecked when the board changes
    ranked;

    const measure = (): void => {
      hasMoreAbove = viewport.scrollTop > 1;
      hasMoreBelow = viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1;
    };
    measure();
    viewport.addEventListener("scroll", measure, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", measure);
      resize.disconnect();
    };
  });

  // On a board longer than it is tall, open on the reader's own line: it is
  // the one they came to see. Scrolled inside the list only, never the page.
  $effect(() => {
    if (list === null || ranked.length === 0) return;
    const own = list.querySelector<HTMLElement>("[data-you]");
    if (own === null) return;
    const offset = own.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTop += offset - (list.clientHeight - own.offsetHeight) / 2;
  });

  const PROBLEM_MESSAGES: Record<FriendProblem, () => string> = {
    "not-found": m.stats_friends_error_not_found,
    self: m.stats_friends_error_self,
    offline: m.stats_friends_error_offline,
    unknown: m.stats_friends_error_unknown,
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
    if (state.kind === "leading") return m.stats_friends_standing_leading();
    if (state.kind === "tied") return m.stats_friends_standing_tied({ username: state.username });
    if (state.kind === "behind") {
      return m.stats_friends_standing_behind({
        points: String(state.points),
        username: state.username,
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
  A narrow column beside the score, because it is about the score: the same
  number, next to the numbers it is being measured against.
-->
<section class="flex h-full flex-col gap-5 rounded-lg border border-border p-6">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="text-lg leading-snug font-medium">{m.stats_friends_title()}</h2>
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
          aria-label={m.stats_friends_button_copy()}
          title={m.stats_friends_label_your_name()}
          onclick={() => {
            void copyName();
          }}
        >
          {isCopied ? m.stats_friends_status_copied() : you.username}
          {#if isCopied}
            <Check class="size-4" />
          {:else}
            <Copy class="size-4" />
          {/if}
        </Button>
        <!-- The name is edited where it is used, not in the account settings. -->
        <Button
          variant="ghost"
          size="icon"
          class="size-8 text-muted-foreground"
          aria-label={m.stats_friends_button_rename()}
          title={m.stats_friends_button_rename()}
          onclick={() => {
            isRenaming = true;
          }}
        >
          <Pencil class="size-4" />
        </Button>
      </div>
    {/if}
  </div>

  {#if you !== null}
    <UsernameDialog
      bind:open={isRenaming}
      current={you.username}
      isReadOnly={demo !== null}
      onSaved={() => {
        void refresh();
      }}
    />
  {/if}

  {#if !isSignedIn}
    <!--
      Friends need an account, and an account is a choice. So this asks rather
      than nags: one line and one button. See CLAUDE.md 1.7.
    -->
    <p class="text-sm text-muted-foreground">{m.stats_friends_signed_out()}</p>
    <div>
      <Button href="/account" variant="outline">{m.stats_friends_button_sign_in()}</Button>
    </div>
  {:else if hasFailed && entries === null}
    <p class="text-sm text-destructive" role="alert">{m.stats_friends_error_load()}</p>
  {:else if entries === null}
    <p class="text-sm text-muted-foreground" role="status">{m.stats_friends_loading()}</p>
  {:else}
    <!--
      The list scrolls, and the name above and the field below stay put. Beside
      the score it gets the score card's height and no more, so a long board
      never stretches the card next to it. Stacked on a phone the page already
      scrolls, and a box scrolling inside a scrolling page is a trap, so there
      it simply shows everyone.
    -->
    <ScrollArea
      bind:viewportRef={list}
      class="friends-list -mx-3 min-h-0 lg:flex-1"
      style="--fade-top: {hasMoreAbove ? FADE : '0px'}; --fade-bottom: {hasMoreBelow
        ? FADE
        : '0px'}"
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
              <span class={["truncate text-sm", entry.isYou && "font-medium"]}
                >{entry.username}</span
              >
              <span class="truncate text-xs text-muted-foreground">
                {#if entry.isYou}
                  {describe(standing) ?? ""}
                {:else if entry.scoredAt === null}
                  {m.stats_friends_label_never()}
                {:else}
                  {m.stats_friends_label_active({ when: timeAgo(entry.scoredAt) })}
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
                  aria-label={m.stats_friends_button_remove({ username: entry.username })}
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
      <p class="text-sm text-muted-foreground">{m.stats_friends_empty()}</p>
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
          aria-label={m.stats_friends_label_add()}
          placeholder={m.stats_friends_label_add()}
          autocomplete="off"
          autocapitalize="none"
          spellcheck={false}
          required
          disabled={isAdding || demo !== null}
        />
        <Button type="submit" variant="outline" disabled={isAdding || demo !== null}>
          {m.stats_friends_button_add()}
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
    The rows fade out at an edge while there is more to scroll that way. A mask
    rather than a shadow laid on top: it paints no colour, only takes some away
    from the rows themselves, so it needs no second shade and survives a theme
    flip. See CLAUDE.md 8.5.
  */
  :global(.friends-list) {
    mask-image: linear-gradient(
      to bottom,
      transparent,
      black var(--fade-top),
      black calc(100% - var(--fade-bottom)),
      transparent
    );
  }
</style>
