<script lang="ts">
  import { Plus } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { m } from "$lib/paraglide/messages";
  import type { Standing, Standings } from "$lib/sync/boards";

  interface Props {
    /** Where the reader stands on each board, or null before it has arrived. */
    standings: Standings | null;
    /** Their score: the same number on every board, so shown once. */
    score: number;
    /** Whether they are signed in. Following and groups need an account. */
    isSignedIn: boolean;
    /** The board on show: "following", "global", or a group's id. */
    selected: string;
    onSelect: (board: string) => void;
    onCreate: () => void;
  }

  let { standings, score, isSignedIn, selected, onSelect, onCreate }: Props = $props();

  function place(standing: Standing | null): string {
    if (standing === null) return "";
    return m.leaderboards_overview_place({
      rank: String(standing.rank),
      size: String(standing.size),
    });
  }

  let globalPlace = $derived.by(() => {
    if (!isSignedIn || standings === null) return "";
    const { rank, size } = standings.global;
    return rank === null ? m.leaderboards_overview_not_listed() : place({ rank, size });
  });

  let rows = $derived([
    {
      id: "following",
      name: m.leaderboards_following_title(),
      place: isSignedIn ? place(standings?.following ?? null) : m.leaderboards_overview_sign_in(),
    },
    { id: "global", name: m.leaderboards_global_title(), place: globalPlace },
    ...(standings?.groups ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      place: place(group),
    })),
  ]);
</script>

<!--
  Every board the reader is on, and where they stand on each: the answer to
  "how am I doing" at a glance, and the way to the full board beside it. The
  score is the same number on every board, so it is said once, above them.
-->
<nav
  class="flex flex-col gap-5 rounded-lg border border-border bg-background p-6"
  aria-label={m.leaderboards_groups_label_boards()}
>
  <div class="flex items-baseline justify-between gap-4">
    <span class="text-sm text-muted-foreground">{m.leaderboards_overview_score()}</span>
    <span class="text-3xl leading-none font-semibold tabular-nums">{score}</span>
  </div>

  <ul class="-mx-3 flex flex-col gap-1">
    {#each rows as row (row.id)}
      <li>
        <button
          type="button"
          class={[
            "flex w-full items-center justify-between gap-4 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
            row.id === selected && "bg-accent font-medium",
          ]}
          aria-current={row.id === selected ? "page" : undefined}
          onclick={() => {
            onSelect(row.id);
          }}
        >
          <span class="min-w-0 truncate">{row.name}</span>
          <span class="shrink-0 text-muted-foreground tabular-nums">{row.place}</span>
        </button>
      </li>
    {/each}
  </ul>

  {#if isSignedIn}
    <div class="-mx-3 -mt-3">
      <Button
        variant="ghost"
        size="sm"
        class="w-full justify-start text-muted-foreground"
        onclick={onCreate}
      >
        <Plus class="size-4" />
        {m.leaderboards_groups_create_title()}
      </Button>
    </div>
  {/if}
</nav>
