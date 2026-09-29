<script lang="ts">
  import { Check, Plus } from "@lucide/svelte";
  import EmojiGrid from "./EmojiGrid.svelte";
  import GroupBadge from "./GroupBadge.svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { groupProblemMessage } from "$lib/components/groups/problems";
  import { BADGE_SWATCHES, COLOR_NAMES } from "$lib/components/profile/colors";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { Spinner } from "$lib/components/ui/spinner";
  import { m } from "$lib/paraglide/messages";
  import { BADGE_COLORS, BADGE_TAG_MAX, badgeTagFrom, type Badge } from "$lib/sync/badge-rules";
  import { removeGroupBadge, setGroupBadge, type GroupProblem } from "$lib/sync/groups";
  import type { CardColor } from "$lib/sync/profile-rules";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
    groupId: string;
    /** The group's badge as it is, or null when it has none. */
    badge: Badge | null;
    /** The admin's own name and score, for their line in the preview. */
    previewName: string;
    previewScore: number;
    onChange: (badge: Badge | null) => void;
  }

  let {
    // `$bindable()` marks the prop as bindable, it is not a default. The rule
    // cannot tell a rune from a value.
    // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
    open = $bindable(),
    groupId,
    badge,
    previewName,
    previewScore,
    onChange,
  }: Props = $props();

  let emoji = $state<string | null>(null);
  let tag = $state("");
  let color = $state<CardColor>("green");
  let isPickingEmoji = $state(false);
  let pending = $state<"save" | "remove" | null>(null);
  let problem = $state<GroupProblem | null>(null);

  // Each time it opens it starts from the badge as it is.
  $effect(() => {
    if (!open) return;
    emoji = badge?.emoji ?? null;
    tag = badge?.tag ?? "";
    color = badge?.color ?? "green";
    isPickingEmoji = false;
    problem = null;
  });

  let cleanTag = $derived(badgeTagFrom(tag));
  /**
   * What the preview wears: the badge as it will be, and while the tag is not
   * finished, what has been typed so far, so every key shows up at once.
   */
  let shown = $derived<Badge | null>(
    tag.trim() === "" ? null : { emoji, tag: cleanTag ?? tag.trim().toUpperCase(), color },
  );
  let isChanged = $derived(
    cleanTag !== null &&
      !(badge?.tag === cleanTag && badge.emoji === emoji && badge.color === color),
  );
  /** Whether what is typed so far could never be a tag, said while typing rather than on save. */
  let isTagWrong = $derived(tag.trim() !== "" && cleanTag === null);

  async function save(): Promise<void> {
    if (cleanTag === null) return;
    pending = "save";
    const result = await setGroupBadge(groupId, { emoji, tag: cleanTag, color });
    pending = null;
    if ("problem" in result) {
      problem = result.problem;
      return;
    }
    onChange(result.value);
    open = false;
  }

  async function remove(): Promise<void> {
    pending = "remove";
    const result = await removeGroupBadge(groupId);
    pending = null;
    if ("problem" in result) {
      problem = result.problem;
      return;
    }
    onChange(null);
    open = false;
  }
</script>

<!--
  Making the group's badge, for its admin. On top, a board with their own line
  wearing it, so what it will look like is never a guess; the lines around it
  are blank and fade out, there only to make it read as a board. Below, the
  tag, which is the badge, then the emoji, which is optional, then the colour.
-->
<Dialog.Root bind:open>
  <Dialog.Content class="max-h-svh gap-5 overflow-y-auto sm:max-w-[448px]">
    <Dialog.Header>
      <Dialog.Title>{m.leaderboards_badges_title()}</Dialog.Title>
      <Dialog.Description>{m.leaderboards_badges_description()}</Dialog.Description>
    </Dialog.Header>

    <div class="badge-preview flex flex-col gap-1 rounded-lg px-3 py-2" aria-hidden="true">
      {#each [0, 1] as row (row)}
        <div class="flex items-center gap-3 px-3 py-2.5">
          <span class="h-2.5 w-3 rounded-full bg-muted-foreground/20"></span>
          <span class={["h-2.5 rounded-full bg-muted-foreground/20", row === 0 ? "w-20" : "w-28"]}
          ></span>
          <span class="ml-auto h-2.5 w-10 rounded-full bg-muted-foreground/20"></span>
        </div>
      {/each}
      <div class="flex items-center gap-3 rounded-md bg-muted px-3 py-2.5">
        <span class="w-3 text-sm text-muted-foreground tabular-nums">3</span>
        <span class="min-w-0 truncate text-sm font-medium">{previewName}</span>
        {#if shown === null}
          <span
            class="h-5 w-14 shrink-0 rounded-full border border-dashed border-muted-foreground/40"
          ></span>
        {:else}
          <GroupBadge badge={shown} />
        {/if}
        <span class="ml-auto text-base font-semibold tabular-nums">{Math.round(previewScore)}</span>
      </div>
      {#each [0, 1] as row (row)}
        <div class="flex items-center gap-3 px-3 py-2.5">
          <span class="h-2.5 w-3 rounded-full bg-muted-foreground/20"></span>
          <span class={["h-2.5 rounded-full bg-muted-foreground/20", row === 0 ? "w-24" : "w-16"]}
          ></span>
          <span class="ml-auto h-2.5 w-10 rounded-full bg-muted-foreground/20"></span>
        </div>
      {/each}
    </div>

    <form
      class="flex flex-col gap-5"
      onsubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div class="flex flex-col gap-2">
        <div class="flex gap-2">
          <!-- The emoji sits before the tag, where it will sit on the badge. -->
          <Button
            variant="outline"
            size="icon"
            class={["size-11 shrink-0 text-2xl", isPickingEmoji && "ring-2 ring-ring"]}
            aria-label={m.leaderboards_badges_button_emoji()}
            title={m.leaderboards_badges_button_emoji()}
            aria-expanded={isPickingEmoji}
            disabled={pending !== null}
            onclick={() => {
              isPickingEmoji = !isPickingEmoji;
            }}
          >
            {#if emoji === null}
              <Plus class="size-4 text-muted-foreground" />
            {:else}
              {emoji}
            {/if}
          </Button>
          <Input
            bind:value={tag}
            class="h-11 text-lg font-semibold tracking-wider uppercase"
            placeholder={m.leaderboards_badges_placeholder_tag()}
            maxlength={BADGE_TAG_MAX}
            autocomplete="off"
            autocapitalize="characters"
            spellcheck={false}
            aria-label={m.leaderboards_badges_label_tag()}
            aria-describedby="badge-tag-hint"
            aria-invalid={isTagWrong}
            disabled={pending !== null}
          />
        </div>
        <p
          id="badge-tag-hint"
          class={["text-xs", isTagWrong ? "text-destructive" : "text-muted-foreground"]}
        >
          {m.leaderboards_badges_hint_tag()}
        </p>
      </div>

      {#if isPickingEmoji}
        <EmojiGrid
          value={emoji}
          onPick={(picked: string | null) => {
            emoji = picked;
            isPickingEmoji = false;
          }}
        />
      {/if}

      <div
        class="grid grid-cols-6 justify-items-center gap-y-2"
        role="group"
        aria-label={m.leaderboards_badges_label_color()}
      >
        {#each BADGE_COLORS as option (option)}
          {@const isPicked = color === option}
          <button
            type="button"
            class={[
              "flex size-11 items-center justify-center rounded-full text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              BADGE_SWATCHES[option],
              isPicked && "outline-2 outline-offset-2 outline-foreground",
            ]}
            aria-label={COLOR_NAMES[option]()}
            aria-pressed={isPicked}
            disabled={pending !== null}
            onclick={() => {
              color = option;
            }}
          >
            {#if isPicked}
              <Check class="size-5" />
            {/if}
          </button>
        {/each}
      </div>

      {#if problem !== null}
        <StatusLine
          message={problem === "invalid"
            ? m.leaderboards_badges_hint_tag()
            : groupProblemMessage(problem)}
          isError={true}
        />
      {/if}

      <Dialog.Footer class="sm:justify-between">
        {#if badge !== null}
          <Button
            variant="ghost"
            class="text-muted-foreground sm:-ml-3"
            disabled={pending !== null}
            onclick={() => {
              void remove();
            }}
          >
            {#if pending === "remove"}<Spinner aria-label={m.common_status_loading()} />{/if}
            {m.leaderboards_badges_button_remove()}
          </Button>
        {:else}
          <span class="hidden sm:block"></span>
        {/if}
        <Button type="submit" disabled={pending !== null || !isChanged}>
          {#if pending === "save"}<Spinner aria-label={m.common_status_loading()} />{/if}
          {m.leaderboards_badges_button_save()}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<style>
  /*
    The blank lines fade into the dialog, so the board reads as going on above
    and below. A mask, as on the real boards: it takes colour away rather than
    painting any, so it holds in both themes. See BoardList.svelte.
  */
  .badge-preview {
    mask-image: linear-gradient(to bottom, transparent, black 35%, black 65%, transparent);
  }
</style>
