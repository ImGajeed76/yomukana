<script lang="ts">
  import { Ban, Search } from "@lucide/svelte";
  import { Input } from "$lib/components/ui/input";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { m } from "$lib/paraglide/messages";
  import { getLocale } from "$lib/paraglide/runtime";
  import { BADGE_EMOJI, type BadgeEmojiGroup } from "$lib/sync/badge-rules";
  import { loadEmojiNames, searchEmoji, type EmojiNames } from "$lib/sync/emoji-search";

  interface Props {
    /** The emoji chosen, or null for none. */
    value: string | null;
    /** Called with the emoji picked, or null when the badge is to have none. */
    onPick: (emoji: string | null) => void;
  }

  let { value, onPick }: Props = $props();

  let query = $state("");
  // Raw: a few hundred names each, replaced whole once they arrive. See CLAUDE.md 1.8.
  let names = $state.raw<readonly EmojiNames[]>([]);

  // Fetched when the grid first shows, so only someone making a badge pays for them.
  $effect(() => {
    void loadEmojiNames(getLocale()).then((loaded) => {
      names = loaded;
    });
  });

  const GROUP_NAMES: Record<BadgeEmojiGroup, () => string> = {
    animals: m.leaderboards_badges_emoji_animals,
    nature: m.leaderboards_badges_emoji_nature,
    food: m.leaderboards_badges_emoji_food,
    japan: m.leaderboards_badges_emoji_japan,
    play: m.leaderboards_badges_emoji_play,
    things: m.leaderboards_badges_emoji_things,
    symbols: m.leaderboards_badges_emoji_symbols,
    faces: m.leaderboards_badges_emoji_faces,
    flags: m.leaderboards_badges_emoji_flags,
  };

  /** Stands for "no emoji" in the grid's first cell. Never an emoji itself. */
  const NONE = "";

  let isSearching = $derived(query.trim() !== "");
  /**
   * What the grid shows: every group while browsing, with "no emoji" first,
   * and one untitled list of hits while searching.
   */
  let sections = $derived<readonly { title: string | null; emoji: readonly string[] }[]>(
    isSearching
      ? [{ title: null, emoji: searchEmoji(query, names) }]
      : BADGE_EMOJI.map((group, index) => ({
          title: GROUP_NAMES[group.group](),
          emoji: index === 0 ? [NONE, ...group.emoji] : group.emoji,
        })),
  );

  const CELL =
    "flex aspect-square items-center justify-center rounded-md text-2xl transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
</script>

<!--
  The app's own list of emoji, searchable by name, so nothing can be picked
  that the server would refuse. Grouped while browsing, one flat list of hits
  while searching. See src/lib/sync/badge-rules.ts.
-->
<div class="flex flex-col gap-2">
  <div class="relative">
    <Search
      class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
    />
    <Input
      bind:value={query}
      type="search"
      class="pl-9"
      placeholder={m.leaderboards_badges_search_placeholder()}
      aria-label={m.leaderboards_badges_search_placeholder()}
      autocomplete="off"
      spellcheck={false}
    />
  </div>
  <ScrollArea class="h-80 rounded-md border border-border">
    <div class="flex flex-col gap-3 p-2">
      {#each sections as section, index (section.title ?? index)}
        <section class="flex flex-col gap-1" aria-label={section.title ?? undefined}>
          {#if section.title !== null}
            <h3 class="px-1 text-xs font-medium text-muted-foreground">{section.title}</h3>
          {/if}
          {#if section.emoji.length === 0}
            <p class="px-1 py-8 text-center text-sm text-muted-foreground">
              {m.leaderboards_badges_search_empty()}
            </p>
          {:else}
            <div class="grid grid-cols-8 gap-0.5">
              {#each section.emoji as emoji (emoji)}
                {@const isPicked = emoji === NONE ? value === null : emoji === value}
                <button
                  type="button"
                  class={[CELL, isPicked && "bg-accent ring-2 ring-foreground"]}
                  aria-pressed={isPicked}
                  aria-label={emoji === NONE ? m.leaderboards_badges_button_no_emoji() : undefined}
                  title={emoji === NONE ? m.leaderboards_badges_button_no_emoji() : undefined}
                  onclick={() => {
                    onPick(emoji === NONE ? null : emoji);
                  }}
                >
                  {#if emoji === NONE}
                    <Ban class="size-5 text-muted-foreground" />
                  {:else}
                    {emoji}
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </section>
      {/each}
    </div>
  </ScrollArea>
</div>
