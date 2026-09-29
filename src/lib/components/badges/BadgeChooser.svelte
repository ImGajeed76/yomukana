<script lang="ts">
  import GroupBadge from "./GroupBadge.svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { Switch } from "$lib/components/ui/switch";
  import { m } from "$lib/paraglide/messages";
  import { BADGES_WORN_MAX, type Badge } from "$lib/sync/badge-rules";
  import { loadOwnBadges, wearBadges, type OwnBadge } from "$lib/sync/badges";

  interface Props {
    /** Called with the badges worn, in order, each time that changes, so the card above can follow. */
    onChange: (badges: readonly Badge[]) => void;
  }

  let { onChange }: Props = $props();

  // Raw: replaced whole, never edited in place. See CLAUDE.md 1.8.
  let available = $state.raw<readonly OwnBadge[] | null>(null);
  /** Group ids of the badges worn, in the order they are shown. */
  let worn = $state.raw<readonly string[]>([]);
  let hasFailed = $state(false);
  let hasSaveFailed = $state(false);

  $effect(() => {
    void loadOwnBadges().then((badges) => {
      hasFailed = badges === null;
      if (badges === null) return;
      available = badges;
      worn = badges
        .filter((own) => own.position !== null)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((own) => own.groupId);
    });
  });

  function badgesOf(groupIds: readonly string[]): Badge[] {
    return groupIds.flatMap((id) => available?.find((own) => own.groupId === id)?.badge ?? []);
  }

  /** Wears or takes off one badge. Shown at once, put back if the server says no. */
  async function toggle(groupId: string, isOn: boolean): Promise<void> {
    const before = worn;
    // A badge put on goes to the end, so the order is the order they were chosen.
    worn = isOn ? [...worn, groupId] : worn.filter((id) => id !== groupId);
    onChange(badgesOf(worn));
    const isSaved = await wearBadges(worn);
    hasSaveFailed = !isSaved;
    if (isSaved) return;
    worn = before;
    onChange(badgesOf(worn));
  }
</script>

<!--
  The badges of the reader's groups, to wear on their card. Only groups whose
  admin made one are here, and only the reader sees the group names.
-->
<section class="flex flex-col gap-5 rounded-lg border border-border bg-card p-6">
  <div class="flex flex-col gap-1">
    <h2 class="text-lg leading-snug font-medium">{m.settings_profile_badges_title()}</h2>
    <p class="text-sm text-muted-foreground">{m.settings_profile_badges_description()}</p>
  </div>

  {#if available === null}
    {#if hasFailed}
      <p class="text-sm text-destructive" role="alert">{m.settings_profile_badges_error_load()}</p>
    {:else}
      <p class="text-sm text-muted-foreground" role="status">{m.settings_profile_loading()}</p>
    {/if}
  {:else if available.length === 0}
    <p class="text-sm text-muted-foreground">{m.settings_profile_badges_empty()}</p>
  {:else}
    <ul class="flex flex-col gap-3">
      {#each available as own (own.groupId)}
        {@const isOn = worn.includes(own.groupId)}
        <li class="flex items-center justify-between gap-4">
          <label for="badge-{own.groupId}" class="flex min-w-0 items-center gap-3">
            <GroupBadge badge={own.badge} />
            <span class="truncate text-sm text-muted-foreground">{own.groupName}</span>
          </label>
          <Switch
            id="badge-{own.groupId}"
            checked={isOn}
            disabled={!isOn && worn.length >= BADGES_WORN_MAX}
            onCheckedChange={(checked: boolean) => {
              void toggle(own.groupId, checked);
            }}
          />
        </li>
      {/each}
    </ul>
    {#if hasSaveFailed}
      <StatusLine message={m.settings_profile_badges_error_save()} isError={true} />
    {/if}
  {/if}
</section>
