<script lang="ts">
  import { X } from "@lucide/svelte";
  import GroupBadge from "./GroupBadge.svelte";
  import WornBadge from "./WornBadge.svelte";
  import SealPill from "$lib/components/seals/SealPill.svelte";
  import { sealKindName, sealName } from "$lib/components/seals/seal-copy";
  import { m } from "$lib/paraglide/messages";
  import { BADGES_WORN_MAX, type Worn } from "$lib/sync/badge-rules";
  import type { OwnBadge, OwnSeal } from "$lib/sync/badges";
  import { sealOf, type Seal, type SealKind } from "$lib/sync/seal-rules";

  interface Props {
    /** Every group badge the reader could wear. */
    badges: readonly OwnBadge[];
    /** Every seal the reader has earned. */
    seals: readonly OwnSeal[];
    /** What is worn, in the order shown: group ids for badges, seal ids for seals. */
    worn: readonly string[];
    /** Called with the new order when something is put on or taken off. */
    onChange: (worn: readonly string[]) => void;
  }

  let { badges, seals, worn, onChange }: Props = $props();

  interface Slot {
    readonly key: string;
    readonly worn: Worn;
    /** What it is called, for taking it off. */
    readonly label: string;
  }

  /** Each earned seal, with its rules looked up. Unknown ids are left out. */
  let ownSeals = $derived(
    seals.flatMap((own) => {
      const seal = sealOf(own.seal);
      return seal === null ? [] : [{ own, seal }];
    }),
  );

  let slots = $derived(
    worn.flatMap((key): Slot[] => {
      const badge = badges.find((own) => own.groupId === key);
      if (badge !== undefined) return [{ key, worn: badge.badge, label: badge.badge.tag }];
      const earned = ownSeals.find((entry) => entry.seal.id === key);
      if (earned === undefined) return [];
      return [
        {
          key,
          worn: { seal: earned.seal.id, earnedAt: earned.own.earnedAt },
          label: sealName(earned.seal, earned.own.earnedAt),
        },
      ];
    }),
  );
  interface Shelf {
    readonly kind: SealKind;
    /** Its seals not worn, in the order they are earned. */
    readonly seals: readonly { seal: Seal; earnedAt: number }[];
  }

  /** Kinds in the order the collection shows them: reading first, where it began last. */
  const SHELF_ORDER: readonly SealKind[] = [
    "streak",
    "days",
    "sentences",
    "perfect",
    "followers",
    "invited",
    "years",
    "joined",
  ];

  /** The seals not worn, a shelf a kind, each shelf in the order its seals are earned. */
  let shelves = $derived<Shelf[]>(
    SHELF_ORDER.flatMap((kind) => {
      const onShelf = ownSeals
        .filter((entry) => entry.seal.kind === kind && !worn.includes(entry.seal.id))
        .sort((a, b) => (a.seal.count ?? 0) - (b.seal.count ?? 0))
        .map((entry) => ({ seal: entry.seal, earnedAt: entry.own.earnedAt }));
      return onShelf.length === 0 ? [] : [{ kind, seals: onShelf }];
    }),
  );
  let groupShelf = $derived(badges.filter((own) => !worn.includes(own.groupId)));
  let hasTray = $derived(shelves.length > 0 || groupShelf.length > 0);
  let isFull = $derived(worn.length >= BADGES_WORN_MAX);
  /** The slots left empty, drawn as outlines so the limit can be seen rather than read. */
  let emptySlots = $derived(Math.max(0, BADGES_WORN_MAX - worn.length));
</script>

<!--
  Badges and seals are put on and taken off, like clothes, not switched on:
  three slots on the card, in order, and a tray of the rest. The first slot is
  the one a board row shows, so the order is not decoration. A worn seal is
  still itself, opening its story when pressed, so taking it off is a mark of
  its own beside it.
-->
<div class="flex flex-col gap-5">
  <div class="flex flex-col gap-2">
    <span class="text-sm font-medium">{m.settings_profile_badges_label_worn()}</span>
    <ul class="flex flex-wrap items-center gap-x-3 gap-y-2">
      {#each slots as slot (slot.key)}
        <li class="flex items-center gap-1">
          <WornBadge worn={slot.worn} class="h-8 text-sm" sealClass="text-sm" />
          <button
            type="button"
            class="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={m.settings_profile_badges_button_take_off({ tag: slot.label })}
            title={m.settings_profile_badges_button_take_off({ tag: slot.label })}
            onclick={() => {
              onChange(worn.filter((key) => key !== slot.key));
            }}
          >
            <X class="size-3.5" />
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
    {#if isFull && hasTray}
      <p class="text-xs text-muted-foreground">{m.settings_profile_badges_hint_full()}</p>
    {/if}
  </div>

  {#if hasTray}
    <!--
      A shelf a kind, left to right in the order they are earned, so how far
      along each path the reader is shows at a glance. Drawn still: the one
      that moves is the one on the card.
    -->
    <div class="flex flex-col gap-4">
      <span class="text-sm font-medium">{m.settings_profile_badges_label_tray()}</span>
      {#each shelves as shelf (shelf.kind)}
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">{sealKindName(shelf.kind)}</span>
          <ul class="-mx-1 flex flex-wrap gap-x-1 gap-y-1">
            {#each shelf.seals as entry (entry.seal.id)}
              <li>
                <button
                  type="button"
                  class="rounded-full px-1 pt-2 pb-1 transition-[background-color,opacity] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                  aria-label={m.settings_profile_badges_button_wear_seal({
                    name: sealName(entry.seal, entry.earnedAt),
                  })}
                  disabled={isFull}
                  onclick={() => {
                    onChange([...worn, entry.seal.id]);
                  }}
                >
                  <SealPill
                    seal={entry.seal}
                    earnedAt={entry.earnedAt}
                    isStatic={true}
                    isCalm={true}
                  />
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
      {#if groupShelf.length > 0}
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground"
            >{m.settings_profile_badges_label_groups()}</span
          >
          <ul class="-mx-1 flex flex-wrap gap-x-1 gap-y-1">
            {#each groupShelf as own (own.groupId)}
              <li>
                <button
                  type="button"
                  class="flex items-center gap-2 rounded-full px-1 py-1 pr-3 transition-[background-color,opacity] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
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
                  <span class="text-xs text-muted-foreground">{own.groupName}</span>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}
</div>
