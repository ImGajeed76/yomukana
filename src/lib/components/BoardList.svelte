<script lang="ts">
  import { X } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { nameOf, type RankedEntry } from "$lib/sync/board";

  interface Props {
    /** The lines, ranked. See board.ts. */
    ranked: readonly RankedEntry[];
    /** The small line under a name: how the reader stands, or when someone was last active. */
    describe: (entry: RankedEntry) => string;
    /** Takes someone off the board. Without it there is no remove button. */
    onRemove?: (entry: RankedEntry) => void;
    /** What the remove button says to a screen reader. */
    removeLabel?: (entry: RankedEntry) => string;
  }

  let { ranked, describe, onRemove, removeLabel = nameOf }: Props = $props();

  /** The scroll area, and the part of it that scrolls. */
  let listArea = $state<HTMLElement | null>(null);
  let list = $state<HTMLElement | null>(null);
  /** Whether there are rows scrolled out of view above, and below. */
  let hasMoreAbove = $state(false);
  let hasMoreBelow = $state(false);
  /** How tall the list is, so the page fits the window. Null lets it be as tall as its rows. */
  let listHeight = $state<number | null>(null);

  /** How far each faded edge reaches into the list. */
  const FADE = "24px";
  /**
   * The shortest the list gets. On a window too short for this the page
   * scrolls instead: a list a row and a half tall is worse than a scroll.
   */
  const MIN_LIST_HEIGHT = 240;

  // The list takes the height the page has left in the window, so the page
  // itself never scrolls. Measured rather than worked out from the heights of
  // the nav, heading and footer, which change with the language and the
  // screen. Runs on load, on resize and when the board changes, never while
  // typing.
  $effect(() => {
    const area = listArea;
    if (area === null) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- read so a changed board is measured again
    ranked;

    const fit = (): void => {
      area.style.height = "";
      const overflow = document.documentElement.scrollHeight - window.innerHeight;
      listHeight = overflow > 0 ? Math.max(MIN_LIST_HEIGHT, area.offsetHeight - overflow) : null;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
    };
  });

  // Tracks whether the list can scroll further each way, so the faded edges
  // say "there is more" and go away at the ends.
  $effect(() => {
    const viewport = list;
    if (viewport === null) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- read so the edges are rechecked when the board or its height changes
    ranked;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- see above
    listHeight;

    const measure = (): void => {
      hasMoreAbove = viewport.scrollTop > 1;
      hasMoreBelow = viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1;
    };
    measure();
    viewport.addEventListener("scroll", measure, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", measure);
    };
  });

  // On a board longer than the list, open on the reader's own line: it is the
  // one they came to see. Scrolled inside the list only, never the page.
  $effect(() => {
    const viewport = list;
    if (viewport === null || ranked.length === 0 || listHeight === null) return;
    const own = viewport.querySelector<HTMLElement>("[data-you]");
    if (own === null) return;
    const offset = own.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    viewport.scrollTop += offset - (viewport.clientHeight - own.offsetHeight) / 2;
  });
</script>

<!--
  The list scrolls inside the board, and the page around it stays put. The
  rows fade out at an edge while there is more to scroll that way.
-->
<ScrollArea
  bind:ref={listArea}
  bind:viewportRef={list}
  class="board-list -mx-3"
  style="height: {listHeight === null
    ? 'auto'
    : `${String(listHeight)}px`}; --fade-top: {hasMoreAbove
    ? FADE
    : '0px'}; --fade-bottom: {hasMoreBelow ? FADE : '0px'}"
>
  <ol class="flex flex-col gap-1">
    {#each ranked as entry (entry.userId)}
      <li
        data-you={entry.isYou || undefined}
        class={["group flex items-center gap-2 rounded-md px-3 py-2", entry.isYou && "bg-muted"]}
      >
        <span class="w-5 shrink-0 text-sm text-muted-foreground tabular-nums">{entry.rank}</span>
        <div class="flex min-w-0 flex-1 flex-col">
          <!--
            The name opens their profile. The row stays a row, so the remove
            button is not inside a link. A display name is free text, so
            anyone can call themselves anything: the username beside it is
            the one nobody else can have, and shows who this really is. It
            gives way first when the row is narrow.
          -->
          <a
            href="/@{entry.username}"
            class="flex min-w-0 items-baseline gap-2 text-sm hover:underline"
          >
            <span class={["max-w-full shrink-0 truncate", entry.isYou && "font-medium"]}
              >{nameOf(entry)}</span
            >
            {#if entry.displayName !== null}
              <span class="min-w-0 truncate text-xs text-muted-foreground">@{entry.username}</span>
            {/if}
          </a>
          <span class="truncate text-xs text-muted-foreground">{describe(entry)}</span>
        </div>
        <!-- A fixed column, read down the left edge like a list of numbers. -->
        <span class="w-16 shrink-0 text-left text-base font-semibold tabular-nums"
          >{Math.round(entry.score)}</span
        >
        <!--
          Removing is a quiet action, so with a mouse it waits for hover or
          focus. A touch screen has no hover, so there it stays in view. The
          slot is always there, so every score lines up.
        -->
        {#if onRemove !== undefined}
          <div class="flex size-8 shrink-0 items-center justify-center">
            {#if !entry.isYou}
              <Button
                variant="ghost"
                size="icon"
                class="size-8 text-muted-foreground pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
                aria-label={removeLabel(entry)}
                onclick={() => {
                  onRemove(entry);
                }}
              >
                <X class="size-4" />
              </Button>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ol>
</ScrollArea>

<style>
  /*
    A mask rather than a shadow laid on top: it paints no colour, only takes
    some away from the rows themselves, so it needs no second shade and
    survives a theme flip. See CLAUDE.md 8.5.
  */
  :global(.board-list) {
    mask-image: linear-gradient(
      to bottom,
      transparent,
      black var(--fade-top),
      black calc(100% - var(--fade-bottom)),
      transparent
    );
  }
</style>
