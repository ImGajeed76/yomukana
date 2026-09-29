<script lang="ts">
  import { Flame, Snowflake } from "@lucide/svelte";
  import StreakWeek from "./StreakWeek.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { m } from "$lib/paraglide/messages";
  import { FREEZES_MAX, type Streak, type StreakNews } from "$lib/stats/streak";

  interface Props {
    /** Whether the popup is showing. */
    open: boolean;
    news: StreakNews | null;
    /** The streak now, for the week row. */
    streak: Streak | null;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable(), news, streak }: Props = $props();

  /** The icon, title and line for what happened. A freeze leads only when it is all there is. */
  let content = $derived.by(() => {
    if (news === null) return null;
    if (news.kind === "saved") {
      return {
        isFreeze: true,
        number: null,
        title: m.streak_saved_title(),
        line: m.streak_saved_description({ days: String(news.days) }),
      };
    }
    const moment = news.moment;
    if (moment.isWeek) {
      return {
        isFreeze: false,
        number: moment.streak,
        title: m.streak_week_title(),
        line: moment.isFreezeEarned
          ? m.streak_week_description()
          : m.streak_week_description_full(),
      };
    }
    if (moment.isStarted) {
      return {
        isFreeze: false,
        number: moment.streak,
        title: m.streak_started_title(),
        line: m.streak_started_description(),
      };
    }
    return {
      isFreeze: true,
      number: null,
      title: m.streak_freeze_title(),
      line:
        moment.freezes >= FREEZES_MAX
          ? m.streak_freeze_description_two()
          : m.streak_freeze_description_one(),
    };
  });
</script>

<!--
  The streak's big moments: day one, every seventh day, a freeze earned, a
  freeze that saved the streak. Shown between sentences, and closed with the
  same Enter that moves on. A title, a picture, a line, one button: see
  CLAUDE.md on dialogs, and nothing more than that.
-->
<Dialog.Root bind:open>
  <Dialog.Content class="items-center gap-5 text-center sm:max-w-[384px]" showCloseButton={false}>
    {#if content !== null}
      <div
        class={[
          "mx-auto flex size-24 items-center justify-center rounded-full",
          content.isFreeze ? "bg-freeze/15" : "bg-streak/15",
        ]}
        aria-hidden="true"
      >
        {#if content.isFreeze}
          <Snowflake class="size-12 text-freeze" />
        {:else}
          <Flame class="size-12 fill-streak text-streak" />
        {/if}
      </div>
      {#if content.number !== null}
        <span class="text-5xl leading-none font-semibold tabular-nums">{content.number}</span>
      {/if}
      <Dialog.Header class="items-center text-center">
        <Dialog.Title>{content.title}</Dialog.Title>
        <Dialog.Description>{content.line}</Dialog.Description>
      </Dialog.Header>
      {#if streak !== null && !content.isFreeze}
        <div class="flex justify-center"><StreakWeek {streak} /></div>
      {/if}
      <Button
        class="w-full"
        onclick={() => {
          open = false;
        }}
      >
        {m.streak_button_continue()}
      </Button>
    {/if}
  </Dialog.Content>
</Dialog.Root>
