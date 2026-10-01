<script lang="ts">
  import { Check } from "@lucide/svelte";
  import { CARD_BACKGROUNDS } from "$lib/components/profile/colors";
  import StreakFlame from "$lib/components/streak/StreakFlame.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Spinner } from "$lib/components/ui/spinner";
  import { m } from "$lib/paraglide/messages";
  import { isCardColor } from "$lib/sync/profile-rules";
  import { nudge, type Nudgeable } from "$lib/sync/push";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
    friends: readonly Nudgeable[];
    /** Whether the nudges are only shown, never sent: the dev preview. */
    isDemo?: boolean;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable(), friends, isDemo = false }: Props = $props();

  /** Each friend's nudge: on its way, sent, or not tried yet. */
  let sent = $state<Record<string, "sending" | "sent">>({});

  async function send(friend: Nudgeable): Promise<void> {
    sent = { ...sent, [friend.username]: "sending" };
    // A refusal means someone else nudged them first or they read meanwhile:
    // either way there is nothing more to do here, so it shows as done.
    if (!isDemo) await nudge(friend.username);
    sent = { ...sent, [friend.username]: "sent" };
  }

  function nameOf(friend: Nudgeable): string {
    return friend.displayName ?? friend.username;
  }
</script>

<!--
  Right after the reader's own goal for the day, while they are ahead: the
  friends whose streak is still at risk tonight, their flame not lit yet. One tap each.
  Only shown when there is someone to nudge, so never an empty list.
-->
<Dialog.Root bind:open>
  <Dialog.Content class="gap-5 sm:max-w-[384px]" showCloseButton={false}>
    <Dialog.Header>
      <Dialog.Title>{m.nudge_title()}</Dialog.Title>
      <Dialog.Description>{m.nudge_description()}</Dialog.Description>
    </Dialog.Header>

    <ul class="flex flex-col gap-3">
      {#each friends as friend (friend.username)}
        {@const state = sent[friend.username]}
        <li class="flex items-center gap-3">
          <span
            class={[
              "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
              CARD_BACKGROUNDS[isCardColor(friend.cardColor) ? friend.cardColor : "green"],
            ]}
            aria-hidden="true"
          >
            {nameOf(friend).slice(0, 1).toUpperCase()}
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm font-medium">{nameOf(friend)}</span>
            <span class="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
              <StreakFlame class="size-3" isLit={false} />{m.streak_nav_label({
                days: String(friend.streak),
              })}
            </span>
          </span>
          <Button
            size="sm"
            variant={state === "sent" ? "ghost" : "default"}
            disabled={state !== undefined}
            onclick={() => {
              void send(friend);
            }}
          >
            {#if state === "sending"}
              <Spinner aria-label={m.common_status_loading()} />
            {:else if state === "sent"}
              <Check class="size-4" />
              {m.nudge_status_sent()}
            {:else}
              {m.nudge_button()}
            {/if}
          </Button>
        </li>
      {/each}
    </ul>

    <Button
      variant="outline"
      class="w-full"
      onclick={() => {
        open = false;
      }}
    >
      {m.streak_button_continue()}
    </Button>
  </Dialog.Content>
</Dialog.Root>
