<script lang="ts">
  import { Bell, Check } from "@lucide/svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import StreakFlame from "$lib/components/streak/StreakFlame.svelte";
  import { Spinner } from "$lib/components/ui/spinner";
  import { dismissPrompt } from "$lib/prompts";
  import { turnOnPush } from "$lib/sync/push";
  import IceDrop from "./IceDrop.svelte";
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
    /**
     * Whether to offer the daily reminder here: on a first streak, for a
     * signed-in reader whose browser can take pushes and has not said yes.
     */
    offersReminders?: boolean;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable(), news, streak, offersReminders = false }: Props = $props();

  let reminders = $state<"idle" | "turning-on" | "on" | "denied">("idle");

  async function turnOnReminders(): Promise<void> {
    reminders = "turning-on";
    const outcome = await turnOnPush();
    reminders = outcome === "on" ? "on" : outcome === "denied" ? "denied" : "idle";
    if (outcome === "on") dismissPrompt("notifications");
  }

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
          <IceDrop class="size-12" />
        {:else}
          <StreakFlame class="size-12" />
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
      <!--
        On a first streak, the moment the reader has something to keep: one
        tap to have it kept, ahead of moving on.
      -->
      {#if offersReminders}
        {#if reminders === "on"}
          <p class="flex items-center justify-center gap-2 text-sm font-medium" role="status">
            <Check class="size-4 text-streak" />{m.prompt_notify_status_on()}
          </p>
        {:else}
          <Button
            class="w-full"
            disabled={reminders === "turning-on"}
            onclick={() => {
              void turnOnReminders();
            }}
          >
            {#if reminders === "turning-on"}
              <Spinner aria-label={m.common_status_loading()} />
            {:else}
              <Bell class="size-4" />
            {/if}
            {m.prompt_notify_button()}
          </Button>
        {/if}
        {#if reminders === "denied"}
          <StatusLine message={m.settings_notifications_error_denied()} isError={true} />
        {/if}
      {/if}
      <Button
        class="w-full"
        variant={offersReminders && reminders !== "on" ? "outline" : "default"}
        onclick={() => {
          open = false;
        }}
      >
        {m.streak_button_continue()}
      </Button>
    {/if}
  </Dialog.Content>
</Dialog.Root>
