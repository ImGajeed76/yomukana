<script lang="ts">
  import { Plus, Presentation, Settings2, UserPlus } from "@lucide/svelte";
  import BoardList from "$lib/components/BoardList.svelte";
  import BadgeDialog from "$lib/components/badges/BadgeDialog.svelte";
  import GroupBadge from "$lib/components/badges/GroupBadge.svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import type { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import { timeAgo } from "$lib/stats";
  import type { Badge } from "$lib/sync/badge-rules";
  import { nameOf, rankBoard, standingOf, type RankedEntry, type Standing } from "$lib/sync/board";
  import {
    boardOf,
    forgetGroup,
    lastShownGroup,
    leaveGroup,
    loadGroup,
    makeDisplayLink,
    rememberGroup,
    removeMember,
    stopDisplayLink,
    type Group,
    type GroupProblem,
    type Invite,
  } from "$lib/sync/groups";
  import GroupSettingsDialog from "./GroupSettingsDialog.svelte";
  import ScreenDialog from "$lib/components/ScreenDialog.svelte";
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
      if (isInviting && canInvite) isInviteOpen = true;
    })();
  });

  let isAdmin = $derived(group?.role === "admin");
  /** Whether the reader may share the invite: the admin, or anyone once the admin allows it. */
  let canInvite = $derived(isAdmin || group?.membersCanInvite === true);
  let isBadgeOpen = $state(false);
  /** The reader's own name on this board, for the badge preview. */
  let ownName = $derived.by(() => {
    const own = group?.members.find((member) => member.isYou);
    return own === undefined ? "" : (own.displayName ?? own.username);
  });
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
      <!--
        The group's badge beside its name, so members see there is one to
        wear. For the admin it is also where the badge is made and changed.
      -->
      <div class="flex min-w-0 items-center gap-2">
        <h2 class="truncate text-lg leading-snug font-medium">{group?.name ?? ""}</h2>
        {#if group?.badge && isAdmin}
          <button
            type="button"
            class="rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={m.leaderboards_badges_button_edit()}
            title={m.leaderboards_badges_button_edit()}
            onclick={() => {
              isBadgeOpen = true;
            }}
          >
            <GroupBadge badge={group.badge} class="transition-opacity hover:opacity-80" />
          </button>
        {:else if group?.badge}
          <GroupBadge badge={group.badge} />
        {:else if isAdmin}
          <Button
            variant="ghost"
            size="sm"
            class="h-6 px-2 text-xs text-muted-foreground"
            onclick={() => {
              isBadgeOpen = true;
            }}
          >
            <Plus class="size-3" />
            {m.leaderboards_badges_button_add()}
          </Button>
        {/if}
      </div>
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
          {#if canInvite}
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
          {/if}
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

{#if group !== null && canInvite}
  <InviteDialog
    bind:open={isInviteOpen}
    {groupId}
    groupName={group.name}
    {isAdmin}
    invite={group.invite}
    onChange={(invite: Invite | null) => {
      if (group !== null) group = { ...group, invite };
    }}
  />
{/if}

{#if group !== null && isAdmin}
  <ScreenDialog
    bind:open={isScreenOpen}
    name={group.name}
    displayCode={group.displayCode}
    makeLink={async () => {
      const result = await makeDisplayLink(groupId);
      return "problem" in result ? { problem: groupProblemMessage(result.problem) } : result.value;
    }}
    stopLink={async () => {
      const result = await stopDisplayLink(groupId);
      return "problem" in result ? groupProblemMessage(result.problem) : null;
    }}
    onChange={(displayCode: string | null) => {
      if (group !== null) group = { ...group, displayCode };
    }}
  />
  <BadgeDialog
    bind:open={isBadgeOpen}
    {groupId}
    badge={group.badge ?? null}
    previewName={ownName}
    previewScore={ownScore}
    onChange={(badge: Badge | null) => {
      if (group !== null) group = { ...group, badge };
      // Members who wore it are shown without it once it is gone.
      void refresh(groupId);
    }}
  />
  <GroupSettingsDialog
    bind:open={isSettingsOpen}
    {groupId}
    groupName={group.name}
    membersCanInvite={group.membersCanInvite === true}
    onMembersCanInviteChange={(membersCanInvite: boolean) => {
      if (group !== null) group = { ...group, membersCanInvite };
    }}
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
