<script lang="ts">
  import { Plus, X } from "@lucide/svelte";
  import GroupBadge from "./GroupBadge.svelte";
  import { m } from "$lib/paraglide/messages";
  import { BADGES_WORN_MAX } from "$lib/sync/badge-rules";
  import type { OwnBadge } from "$lib/sync/badges";

  interface Props {
    /** Every badge the reader could wear. */
    available: readonly OwnBadge[];
    /** Group ids of the badges worn, in the order they are shown. */
    worn: readonly string[];
    /** Called with the new order when a badge is put on or taken off. */
    onChange: (worn: readonly string[]) => void;
  }

  let { available, worn, onChange }: Props = $props();

  let wornBadges = $derived(
    worn.flatMap((id) => available.find((own) => own.groupId === id) ?? []),
  );
  let tray = $derived(available.filter((own) => !worn.includes(own.groupId)));
  let isFull = $derived(worn.length >= BADGES_WORN_MAX);
  /** The slots left empty, drawn as outlines so the limit can be seen rather than read. */
  let emptySlots = $derived(Math.max(0, BADGES_WORN_MAX - worn.length));
</script>

<!--
  Badges are put on and taken off, like clothes, not switched on: three slots
  on the card, in order, and a tray of the rest. The first slot is the one a
  board row shows, so the order is not decoration.
-->
<div class="flex flex-col gap-5">
  <div class="flex flex-col gap-2">
    <span class="text-sm font-medium">{m.settings_profile_badges_label_worn()}</span>
    <ul class="flex flex-wrap items-center gap-2">
      {#each wornBadges as own (own.groupId)}
        <li>
          <button
            type="button"
            class="group flex items-center gap-1 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={m.settings_profile_badges_button_take_off({ tag: own.badge.tag })}
            title={m.settings_profile_badges_button_take_off({ tag: own.badge.tag })}
            onclick={() => {
              onChange(worn.filter((id) => id !== own.groupId));
            }}
          >
            <GroupBadge badge={own.badge} class="h-8 gap-1.5 pr-2 text-sm">
              <X class="size-3.5 opacity-60 transition-opacity group-hover:opacity-100" />
            </GroupBadge>
          </button>
        </li>
      {/each}
      {#each { length: emptySlots }, index (index)}
        <li
          class="h-8 w-20 rounded-full border border-dashed border-muted-foreground/40"
          aria-hidden="true"
        ></li>
      {/each}
    </ul>
  </div>

  {#if tray.length > 0}
    <div class="flex flex-col gap-2">
      <span class="text-sm font-medium">{m.settings_profile_badges_label_tray()}</span>
      <ul class="-mx-3 flex flex-col">
        {#each tray as own (own.groupId)}
          <li>
            <button
              type="button"
              class="group flex h-11 w-full items-center gap-3 rounded-md px-3 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              aria-label={m.settings_profile_badges_button_wear({
                tag: own.badge.tag,
                group: own.groupName,
              })}
              disabled={isFull}
              onclick={() => {
                onChange([...worn, own.groupId]);
              }}
            >
              <GroupBadge badge={own.badge} />
              <span class="min-w-0 flex-1 truncate text-sm text-muted-foreground"
                >{own.groupName}</span
              >
              <Plus
                class="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
              />
            </button>
          </li>
        {/each}
      </ul>
      {#if isFull}
        <p class="text-xs text-muted-foreground">{m.settings_profile_badges_hint_full()}</p>
      {/if}
    </div>
  {/if}
</div>
