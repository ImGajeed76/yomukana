<script lang="ts">
  import BadgeSlots from "./BadgeSlots.svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { m } from "$lib/paraglide/messages";
  import type { Worn } from "$lib/sync/badge-rules";
  import { loadWearables, wearBadges, type Wearables } from "$lib/sync/badges";

  interface Props {
    /** Called with what is worn, in order, each time that changes, so the card above can follow. */
    onChange: (worn: readonly Worn[]) => void;
    /**
     * Wearables to show in place of the reader's own, which are never saved:
     * `?demo` in dev, for trying every seal on the card.
     */
    demo?: Wearables | null;
  }

  let { onChange, demo = null }: Props = $props();

  // Raw: replaced whole, never edited in place. See CLAUDE.md 1.8.
  let available = $state.raw<Wearables | null>(null);
  /** What is worn, in the order shown: group ids for badges, seal ids for seals. */
  let worn = $state.raw<readonly string[]>([]);
  let hasFailed = $state(false);
  let hasSaveFailed = $state(false);

  $effect(() => {
    void (demo === null ? loadWearables() : Promise.resolve(demo)).then((wearables) => {
      hasFailed = wearables === null;
      if (wearables === null) return;
      available = wearables;
      worn = [
        ...wearables.badges.map((own) => ({ key: own.groupId, position: own.position })),
        ...wearables.seals.map((own) => ({ key: own.seal, position: own.position })),
      ]
        .filter((entry) => entry.position !== null)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((entry) => entry.key);
    });
  });

  function wornOf(keys: readonly string[]): Worn[] {
    return keys.flatMap((key): Worn[] => {
      const badge = available?.badges.find((own) => own.groupId === key);
      if (badge !== undefined) return [badge.badge];
      const seal = available?.seals.find((own) => own.seal === key);
      return seal === undefined ? [] : [{ seal: seal.seal, earnedAt: seal.earnedAt }];
    });
  }

  /** Saves a new set of worn things. Shown at once, put back if the server says no. */
  async function wear(next: readonly string[]): Promise<void> {
    const before = worn;
    worn = next;
    onChange(wornOf(worn));
    if (demo !== null) return;
    const isSaved = await wearBadges(worn);
    hasSaveFailed = !isSaved;
    if (isSaved) return;
    worn = before;
    onChange(wornOf(worn));
  }
</script>

<!--
  What the reader can wear on their card: the seals they earned, and the
  badges of their groups. Only groups whose admin made one are here, and only
  the reader sees the group names.
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
  {:else if available.badges.length === 0 && available.seals.length === 0}
    <p class="text-sm text-muted-foreground">{m.settings_profile_badges_empty()}</p>
  {:else}
    <BadgeSlots
      badges={available.badges}
      seals={available.seals}
      {worn}
      onChange={(next: readonly string[]) => {
        void wear(next);
      }}
    />
    {#if hasSaveFailed}
      <StatusLine message={m.settings_profile_badges_error_save()} isError={true} />
    {/if}
  {/if}
</section>
