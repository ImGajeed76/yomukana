<script lang="ts">
  import { Check, Copy } from "@lucide/svelte";
  import QrCode from "$lib/components/profile/QrCode.svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Popover from "$lib/components/ui/popover";
  import { m } from "$lib/paraglide/messages";
  import { getLocale } from "$lib/paraglide/runtime";
  import { DEFAULT_INVITE_DAYS, INVITE_DAYS, type InviteDays } from "$lib/sync/group-rules";
  import {
    extendInvite,
    makeInvite,
    replaceInvite,
    stopInvite,
    type GroupProblem,
    type Invite,
  } from "$lib/sync/groups";
  import { groupProblemMessage } from "./problems";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
    groupId: string;
    groupName: string;
    /** The invite while it works, or null. */
    invite: Invite | null;
    /** Called with the invite as it is now, or null once it is turned off. */
    onChange: (invite: Invite | null) => void;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable(), groupId, groupName, invite, onChange }: Props = $props();

  /**
   * The change on its way to the server, if any. Each shows its wait where it
   * lands: a new or stopped link over the code, a new end date on the date.
   */
  let pending = $state<"end" | "replace" | "on" | "off" | null>(null);
  let isBusy = $derived(pending !== null);
  let problem = $state<GroupProblem | null>(null);
  /** Whether the link was just replaced, which is worth saying: the old one is dead now. */
  let isReplaced = $state(false);
  let isCopied = $state(false);
  let isChoosingEnd = $state(false);

  $effect(() => {
    if (!open) return;
    problem = null;
    isReplaced = false;
  });

  let link = $derived(invite === null ? "" : `${location.origin}/join/${invite.code}`);

  // A date and a time, because what an admin plans around is "until Friday's
  // class", not "in 7 days".
  let ends = $derived(
    invite === null
      ? ""
      : new Intl.DateTimeFormat(getLocale(), {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        }).format(invite.expiresAt),
  );

  // "1 day", "7 days", "7 Tage", in the reader's language, from the browser.
  let durations = $derived.by(() => {
    const format = new Intl.NumberFormat(getLocale(), {
      style: "unit",
      unit: "day",
      unitDisplay: "long",
    });
    return INVITE_DAYS.map((days) => ({ days, label: format.format(days) }));
  });

  /** Runs one change to the invite and passes on what it became. */
  async function change(
    kind: NonNullable<typeof pending>,
    call: () => Promise<{ value: Invite | undefined } | { problem: GroupProblem }>,
  ): Promise<boolean> {
    pending = kind;
    const result = await call();
    pending = null;
    if ("problem" in result) {
      problem = result.problem;
      return false;
    }
    problem = null;
    onChange(result.value ?? null);
    return true;
  }

  async function moveEnd(days: InviteDays): Promise<void> {
    isChoosingEnd = false;
    isReplaced = false;
    await change("end", () => extendInvite(groupId, days));
  }

  async function replace(): Promise<void> {
    isReplaced = await change("replace", () => replaceInvite(groupId));
  }

  async function turnOn(): Promise<void> {
    isReplaced = false;
    await change("on", () => makeInvite(groupId, DEFAULT_INVITE_DAYS));
  }

  async function turnOff(): Promise<void> {
    isReplaced = false;
    await change("off", () => stopInvite(groupId));
  }

  async function copyLink(): Promise<void> {
    await navigator.clipboard.writeText(link);
    isCopied = true;
    setTimeout(() => {
      isCopied = false;
    }, 1500);
  }
</script>

<!--
  For the admin getting people in, usually in front of a room: the code to
  scan and the link to send come first. When it ends and what to do if it
  spread too far are there, but out of the way.
-->
<Dialog.Root bind:open>
  <Dialog.Content class="max-h-svh overflow-y-auto sm:max-w-[448px]">
    <Dialog.Header>
      <Dialog.Title>{m.leaderboards_groups_invite_title({ name: groupName })}</Dialog.Title>
      <Dialog.Description>
        {invite === null
          ? m.leaderboards_groups_invite_off()
          : m.leaderboards_groups_invite_description()}
      </Dialog.Description>
    </Dialog.Header>

    {#if invite === null}
      <div>
        <Button
          disabled={isBusy}
          onclick={() => {
            void turnOn();
          }}
        >
          {#if pending === "on"}
            <Spinner aria-label={m.common_status_loading()} />
          {/if}
          {m.leaderboards_groups_invite_button_on()}
        </Button>
      </div>
    {:else}
      <!--
        While the link is being replaced or stopped, the code on screen is about
        to stop working, so it blurs under a spinner rather than stay scannable.
      -->
      <div class="relative" aria-busy={pending === "replace" || pending === "off"}>
        <QrCode
          value={link}
          label={m.leaderboards_groups_invite_label_qr()}
          class={[
            "w-full transition-[filter,opacity] duration-150 motion-reduce:transition-none",
            (pending === "replace" || pending === "off") && "opacity-40 blur-sm",
          ]}
        />
        {#if pending === "replace" || pending === "off"}
          <div class="absolute inset-0 flex items-center justify-center">
            <Spinner class="size-8 text-qr-dark" aria-label={m.common_status_loading()} />
          </div>
        {/if}
      </div>

      <div class="flex flex-col gap-3">
        <Button
          class="w-full"
          onclick={() => {
            void copyLink();
          }}
        >
          {#if isCopied}
            <Check class="size-4" />
            {m.leaderboards_following_status_copied()}
          {:else}
            <Copy class="size-4" />
            {m.settings_profile_button_copy_link()}
          {/if}
        </Button>

        <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span
            class={[
              "flex items-center gap-2 text-muted-foreground",
              pending === "end" && "opacity-60",
            ]}
          >
            {m.leaderboards_groups_invite_label_until({ when: ends })}
            {#if pending === "end"}
              <Spinner aria-label={m.common_status_loading()} />
            {/if}
          </span>
          <Popover.Root bind:open={isChoosingEnd}>
            <Popover.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="sm" class="-mr-3" disabled={isBusy}>
                  {m.leaderboards_groups_invite_button_change()}
                </Button>
              {/snippet}
            </Popover.Trigger>
            <Popover.Content class="flex w-auto flex-col gap-1 p-2" align="end">
              <!-- The same link, lasting longer or shorter. Nothing already sent stops working. -->
              {#each durations as option (option.days)}
                <Button
                  variant="ghost"
                  size="sm"
                  class="justify-start"
                  onclick={() => {
                    void moveEnd(option.days);
                  }}
                >
                  {m.leaderboards_groups_invite_option_from_now({ duration: option.label })}
                </Button>
              {/each}
            </Popover.Content>
          </Popover.Root>
        </div>
      </div>
    {/if}

    {#if problem !== null}
      <StatusLine message={groupProblemMessage(problem)} isError={true} />
    {:else if isReplaced}
      <StatusLine message={m.leaderboards_groups_invite_status_replaced()} isError={false} />
    {/if}

    {#if invite !== null}
      <!--
        The two things an admin does only when something went wrong: the link
        reached people it should not have, or the group is complete.
      -->
      <div class="flex flex-col gap-1 border-t border-border pt-4 text-sm">
        <span class="text-muted-foreground">{m.leaderboards_groups_invite_label_leaked()}</span>
        <!-- Pulled left by their own padding, so the words line up with the question. -->
        <div class="-ml-3 flex flex-wrap gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={isBusy}
            onclick={() => {
              void replace();
            }}
          >
            {m.leaderboards_groups_invite_button_replace()}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={isBusy}
            onclick={() => {
              void turnOff();
            }}
          >
            {m.leaderboards_groups_invite_button_off()}
          </Button>
        </div>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
