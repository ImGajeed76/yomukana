<script lang="ts">
  import { m } from "$lib/paraglide/messages";
  import type { MarathonSummary } from "$lib/sync/marathons";

  interface Props {
    /** Marathons the reader runs in that are on now. */
    running: readonly MarathonSummary[];
    /** The marathon read in, or null for the reader's own track. */
    selected: string | null;
    onSelect: (id: string | null) => void;
    /**
     * Where the row sits is the page's to say: on the practice page it is
     * pulled out so the tab text lines up with the sentence, on the stats
     * page the tabs line up with the cards' edge.
     */
    class?: string;
  }

  let { running, selected, onSelect, class: className }: Props = $props();

  let tabs = $derived([
    { id: null, name: m.session_tracks_own(), place: null },
    ...running.map((marathon) => ({ id: marathon.id, name: marathon.name, place: marathon.place })),
  ]);

  function select(id: string | null, event: MouseEvent): void {
    // Let go of focus, so the next Space or Enter goes to the sentence and
    // not to this button again.
    (event.currentTarget as HTMLElement).blur();
    if (id !== selected) onSelect(id);
  }
</script>

<!--
  Where the next sentence counts: the reader's own track, or one of the
  marathons they run in. Only there while one is on, so most readers never see
  it. Quiet, like the board tabs on the leaderboards page, because the
  sentence is still the one thing on this screen: it says where, and gets out
  of the way.

  Keys never reach it. Typing goes to the sentence wherever focus is, and a
  tab has to be clicked or tapped, so nobody switches by accident mid-word.
  Out of the Tab order too: Tab belongs to the exercise.
-->
<div
  class={["flex [scrollbar-width:none] gap-1 overflow-x-auto", className]}
  role="group"
  aria-label={m.session_tracks_label()}
>
  {#each tabs as tab (tab.id ?? "own")}
    <button
      type="button"
      tabindex={-1}
      class={[
        "flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap transition-colors",
        tab.id === selected
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60",
      ]}
      aria-pressed={tab.id === selected}
      onclick={(event) => {
        select(tab.id, event);
      }}
    >
      {tab.name}
      {#if tab.place !== null}
        <span class="text-muted-foreground tabular-nums">
          {m.session_tracks_place({ place: String(tab.place) })}
        </span>
      {/if}
    </button>
  {/each}
</div>
