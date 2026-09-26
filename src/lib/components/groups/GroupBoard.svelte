<script lang="ts">
  import { Presentation, Settings2, UserPlus } from "@lucide/svelte";
  import BoardList from "$lib/components/BoardList.svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import type { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import { timeAgo } from "$lib/stats";
  import { nameOf, rankBoard, standingOf, type RankedEntry, type Standing } from "$lib/sync/board";
  import {
    boardOf,
    forgetGroup,
    lastShownGroup,
    leaveGroup,
    loadGroup,
    rememberGroup,
    removeMember,
    type Group,
    type GroupProblem,
    type Invite,
  } from "$lib/sync/groups";
  import GroupSettingsDialog from "./GroupSettingsDialog.svelte";
  import ScreenDialog from "./ScreenDialog.svelte";
  import InviteDialog from "./InviteDialog.svelte";
  import { groupProblemMessage } from "./problems";

  interface Props {
    progress: Progress;
    groupId: string;
    /** The reader's score right now, newer than the one on the server. */
    ownScore: number;
    /** Whether to open the invite as soon as the group has loaded, as after making one. */
    isInviting?: boolean;
    /** Called when the reader is no longer in the group: they left, or deleted it. */
    onGone: () => void;
    /** Called when the group's name changes, so the list of boards can follow. */
    onRenamed: (name: string) => void;
  }

  let { progress, groupId, ownScore, isInviting = false, onGone, onRenamed }: Props = $props();

  // Raw: replaced whole on every load, never edited in place. See CLAUDE.md 1.8.
  let group = $state.raw<Group | null>(null);
  let hasFailed = $state(false);
  let problem = $state<GroupProblem | null>(null);
  let isInviteOpen = $state(false);
  let isSettingsOpen = $state(false);
  let isScreenOpen = $state(false);
  let isLeaving = $state(false);
  /** Whoever the admin asked to remove, while the dialog asks to confirm. */
  let removing = $state<RankedEntry | null>(null);

  async function refresh(id: string): Promise<void> {
    const result = await loadGroup(id);
    if (id !== groupId) return;
    if ("problem" in result) {
      // Removed, or the group is gone: it is not the reader's board any more.
      if (result.problem === "not-found") {
        await forgetGroup(progress, id);
        onGone();
        return;
      }
      hasFailed = true;
      return;
    }
    hasFailed = false;
    group = result.value;
    await rememberGroup(progress, result.value);
  }

  // The board as it was last time, at once, then asked for again. Switching
  // to another group starts over.
  $effect(() => {
    const id = groupId;
    group = null;
    hasFailed = false;
    void (async () => {
      const kept = await lastShownGroup(progress, id);
      if (kept !== null && id === groupId) group = kept;
      await refresh(id);
      if (isInviting && group?.role === "admin") isInviteOpen = true;
    })();
  });

  let isAdmin = $derived(group?.role === "admin");
  let ranked = $derived(group === null ? [] : rankBoard(boardOf(group.members), ownScore));
  let standing = $derived(standingOf(ranked));

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

  function lineFor(entry: RankedEntry): string {
    if (entry.isYou) return describe(standing) ?? "";
    const active =
      entry.scoredAt === null
        ? m.leaderboards_following_label_never()
        : m.leaderboards_following_label_active({ when: timeAgo(entry.scoredAt) });
    const member = group?.members.find((candidate) => candidate.username === entry.username);
    return member?.role === "admin" ? m.leaderboards_groups_label_admin({ active }) : active;
  }

  async function confirmRemove(): Promise<void> {
    const entry = removing;
    if (entry === null || group === null) return;
    removing = null;
    // Off the board at once, back on only if the server says no.
    group = {
      ...group,
      members: group.members.filter((member) => member.username !== entry.username),
    };
    const result = await removeMember(groupId, entry.username);
    problem = "problem" in result ? result.problem : null;
    await refresh(groupId);
  }

  async function leave(): Promise<void> {
    const result = await leaveGroup(groupId);
    isLeaving = false;
    if ("problem" in result) {
      problem = result.problem;
      return;
    }
    await forgetGroup(progress, groupId);
    onGone();
  }
</script>

<!-- A group's board: everyone in it, ranked, the same for all of them. -->
<section class="flex flex-col gap-5 rounded-lg border border-border bg-background p-6">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div class="flex min-w-0 flex-col">
      <h2 class="truncate text-lg leading-snug font-medium">{group?.name ?? ""}</h2>
      {#if group !== null}
        <span class="text-xs text-muted-foreground">
          {m.leaderboards_groups_label_members({ count: String(group.members.length) })}
        </span>
      {/if}
    </div>
    {#if group !== null}
      <div class="-mr-2 flex items-center gap-1">
        {#if isAdmin}
          <Button
            variant="ghost"
            size="sm"
            onclick={() => {
              isInviteOpen = true;
            }}
          >
            <UserPlus class="size-4" />
            {m.leaderboards_groups_button_invite()}
          </Button>
          <!--
            A way to show the board somewhere else, not something done on the
            board itself, so it is an icon beside settings rather than a word.
          -->
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.leaderboards_groups_screen_button()}
            title={m.leaderboards_groups_screen_button()}
            onclick={() => {
              isScreenOpen = true;
            }}
          >
            <Presentation class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.leaderboards_groups_settings_title()}
            title={m.leaderboards_groups_settings_title()}
            onclick={() => {
              isSettingsOpen = true;
            }}
          >
            <Settings2 class="size-4" />
          </Button>
        {:else}
          <Button
            variant="ghost"
            size="sm"
            class="text-muted-foreground"
            onclick={() => {
              isLeaving = true;
            }}
          >
            {m.leaderboards_groups_leave_button()}
          </Button>
        {/if}
      </div>
    {/if}
  </div>

  {#if group === null}
    {#if hasFailed}
      <p class="text-sm text-destructive" role="alert">{m.leaderboards_groups_error_load()}</p>
    {:else}
      <p class="text-sm text-muted-foreground" role="status">
        {m.leaderboards_groups_loading()}
      </p>
    {/if}
  {:else}
    <BoardList
      {ranked}
      describe={lineFor}
      onRemove={isAdmin
        ? (entry: RankedEntry) => {
            removing = entry;
          }
        : undefined}
      removeLabel={(entry: RankedEntry) =>
        m.leaderboards_groups_remove_label({ username: nameOf(entry) })}
    />
    {#if ranked.length === 1 && isAdmin}
      <p class="text-sm text-muted-foreground">{m.leaderboards_groups_empty()}</p>
    {/if}
    {#if problem !== null}
      <StatusLine message={groupProblemMessage(problem)} isError={true} />
    {/if}
  {/if}
</section>

{#if group !== null && isAdmin}
  <InviteDialog
    bind:open={isInviteOpen}
    {groupId}
    groupName={group.name}
    invite={group.invite}
    onChange={(invite: Invite | null) => {
      if (group !== null) group = { ...group, invite };
    }}
  />
  <ScreenDialog
    bind:open={isScreenOpen}
    {groupId}
    groupName={group.name}
    displayCode={group.displayCode}
    onChange={(displayCode: string | null) => {
      if (group !== null) group = { ...group, displayCode };
    }}
  />
  <GroupSettingsDialog
    bind:open={isSettingsOpen}
    {groupId}
    groupName={group.name}
    onRenamed={(name: string) => {
      if (group !== null) group = { ...group, name };
      onRenamed(name);
    }}
    onDeleted={() => {
      void forgetGroup(progress, groupId).then(onGone);
    }}
  />
{/if}

<!--
  Removing someone and leaving both ask first. Neither can be undone without
  a fresh invite, and a class board is not the place for a slip of the mouse.
-->
<AlertDialog.Root
  open={removing !== null}
  onOpenChange={(open) => {
    if (!open) removing = null;
  }}
>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>
        {m.leaderboards_groups_remove_title({
          username: removing === null ? "" : nameOf(removing),
        })}
      </AlertDialog.Title>
      <AlertDialog.Description>{m.leaderboards_groups_remove_description()}</AlertDialog.Description
      >
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>{m.common_button_cancel()}</AlertDialog.Cancel>
      <AlertDialog.Action
        onclick={() => {
          void confirmRemove();
        }}
      >
        {m.leaderboards_groups_remove_confirm()}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={isLeaving}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title
        >{m.leaderboards_groups_leave_title({ name: group?.name ?? "" })}</AlertDialog.Title
      >
      <AlertDialog.Description>{m.leaderboards_groups_leave_description()}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>{m.common_button_cancel()}</AlertDialog.Cancel>
      <AlertDialog.Action
        onclick={() => {
          void leave();
        }}
      >
        {m.leaderboards_groups_leave_confirm()}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
