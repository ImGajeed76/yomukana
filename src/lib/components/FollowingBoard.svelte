<script lang="ts">
  import { Check, Copy, QrCode as QrCodeIcon } from "@lucide/svelte";
  import QrCode from "$lib/components/profile/QrCode.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import BoardList from "$lib/components/BoardList.svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import { Input } from "$lib/components/ui/input";
  import { m } from "$lib/paraglide/messages";
  import { timeAgo } from "$lib/stats";
  import {
    nameOf,
    rankBoard,
    standingOf,
    type BoardEntry,
    type RankedEntry,
    type Standing,
  } from "$lib/sync/board";
  import type { Progress } from "$lib/db";
  import {
    addFriend,
    lastShownBoard,
    loadBoard,
    rememberBoard,
    removeFriend,
    type FriendProblem,
  } from "$lib/sync/friends";

  interface Props {
    /** The email this device syncs as, or null when signed out. */
    account: string | null;
    /** The reader's progress, where the board is remembered between visits. */
    progress: Progress;
    /**
     * Whether the page's own sync has finished. The board does not wait for
     * it, but a reader signing in for the first time has no line on it until
     * sync has made their profile.
     */
    isSynced: boolean;
    /** The reader's score right now, which is newer than the one on the server. */
    ownScore: number;
    /** A made-up board for `?demo`, drawn instead of asking the server. */
    demo?: readonly BoardEntry[] | null;
  }

  let { account, progress, isSynced, ownScore, demo = null }: Props = $props();

  // Raw: replaced whole on every load, never edited in place. See CLAUDE.md 1.8.
  let loaded = $state.raw<readonly BoardEntry[] | null>(null);
  let hasFailed = $state(false);
  let name = $state("");
  let isAdding = $state(false);
  let problem = $state<FriendProblem | null>(null);
  let isCopied = $state(false);
  let isShowingCode = $state(false);

  const PROBLEM_MESSAGES: Record<FriendProblem, () => string> = {
    "not-found": m.leaderboards_following_error_not_found,
    self: m.leaderboards_following_error_self,
    offline: m.leaderboards_following_error_offline,
    unknown: m.leaderboards_following_error_unknown,
  };

  async function refresh(): Promise<void> {
    const board = await loadBoard();
    hasFailed = board === null;
    if (board === null) return;
    loaded = board;
    await rememberBoard(progress, board);
  }

  // The board as it was last time, drawn at once, then asked for again. The
  // reader's own line uses their live score either way, so only the others
  // can be a little behind, and only until the server answers.
  $effect(() => {
    if (demo !== null || account === null) return;
    void (async () => {
      const kept = await lastShownBoard(progress);
      if (loaded === null && kept !== null) loaded = kept;
      await refresh();
    })();
  });

  /** Whether the board was asked for again once sync had made the reader's profile. */
  let hasRefreshedAfterSync = false;

  // Only on a first sign-in: the reader's own line is missing until sync has
  // made their profile. Asked for once, so a failure cannot loop.
  $effect(() => {
    if (!isSynced || hasRefreshedAfterSync || loaded === null) return;
    if (loaded.some((entry) => entry.isYou)) return;
    hasRefreshedAfterSync = true;
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
      The reader's own name, one click from the clipboard, and their code one
      click from the screen. Telling a friend what to type, or holding a phone
      up to them, is the first thing anyone does with this board.
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
        <Button
          variant="ghost"
          size="icon"
          class="text-muted-foreground"
          aria-label={m.leaderboards_following_button_qr()}
          title={m.leaderboards_following_button_qr()}
          onclick={() => {
            isShowingCode = true;
          }}
        >
          <QrCodeIcon class="size-4" />
        </Button>
      </div>
      <Dialog.Root bind:open={isShowingCode}>
        <Dialog.Content class="gap-5 text-center sm:max-w-[384px]">
          <Dialog.Header class="items-center text-center">
            <Dialog.Title>{m.leaderboards_following_qr_title()}</Dialog.Title>
            <Dialog.Description>{m.leaderboards_following_qr_description()}</Dialog.Description>
          </Dialog.Header>
          <QrCode
            value={`${location.origin}/@${you.username}`}
            label={m.settings_profile_label_qr()}
            class="w-full"
          />
          <p class="text-sm text-muted-foreground">@{you.username}</p>
        </Dialog.Content>
      </Dialog.Root>
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
    <BoardList
      {ranked}
      describe={(entry: RankedEntry) => {
        if (entry.isYou) return describe(standing) ?? "";
        if (entry.scoredAt === null) return m.leaderboards_following_label_never();
        return m.leaderboards_following_label_active({ when: timeAgo(entry.scoredAt) });
      }}
      onRemove={(entry: RankedEntry) => {
        void remove(entry);
      }}
      removeLabel={(entry: RankedEntry) =>
        m.leaderboards_following_button_remove({ username: nameOf(entry) })}
    />

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
          {#if isAdding}<Spinner aria-label={m.common_status_loading()} />{/if}
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
