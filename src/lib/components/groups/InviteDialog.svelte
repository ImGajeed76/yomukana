<script lang="ts">
  import { Check, Copy } from "@lucide/svelte";
  import ChoiceRow from "$lib/components/ChoiceRow.svelte";
  import QrCode from "$lib/components/profile/QrCode.svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { m } from "$lib/paraglide/messages";
  import { getLocale } from "$lib/paraglide/runtime";
  import { timeUntil } from "$lib/stats";
  import { DEFAULT_INVITE_DAYS, INVITE_DAYS, type InviteDays } from "$lib/sync/group-rules";
  import { makeInvite, stopInvite, type GroupProblem, type Invite } from "$lib/sync/groups";
  import { groupProblemMessage } from "./problems";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
    groupId: string;
    groupName: string;
    /** The invite while it works, or null. */
    invite: Invite | null;
    /** Called with the new invite, or null once it is turned off. */
    onChange: (invite: Invite | null) => void;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable(), groupId, groupName, invite, onChange }: Props = $props();

  let days = $state<InviteDays>(DEFAULT_INVITE_DAYS);
  let isBusy = $state(false);
  let problem = $state<GroupProblem | null>(null);
  let isCopied = $state(false);

  let link = $derived(invite === null ? "" : `${location.origin}/join/${invite.code}`);

  // "1 day", "7 days", "7 Tage", in the reader's language, from the browser.
  let durations = $derived.by(() => {
    const format = new Intl.NumberFormat(getLocale(), {
      style: "unit",
      unit: "day",
      unitDisplay: "long",
    });
    return INVITE_DAYS.map((count) => ({ value: String(count), label: format.format(count) }));
  });

  async function renew(): Promise<void> {
    isBusy = true;
    const result = await makeInvite(groupId, days);
    isBusy = false;
    problem = "problem" in result ? result.problem : null;
    if ("value" in result) onChange(result.value);
  }

  async function stop(): Promise<void> {
    isBusy = true;
    const result = await stopInvite(groupId);
    isBusy = false;
    problem = "problem" in result ? result.problem : null;
    if ("value" in result) onChange(null);
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
  The invite, big enough to scan off a projector or a phone held up in a
  classroom. Anyone with the link can join until it ends, so it always ends,
  and making a new one stops the old one.
-->
<Dialog.Root bind:open>
  <Dialog.Content class="max-h-svh overflow-y-auto sm:max-w-[448px]">
    <Dialog.Header>
      <Dialog.Title>{m.leaderboards_groups_invite_title({ name: groupName })}</Dialog.Title>
      <Dialog.Description>
        {invite === null
          ? m.leaderboards_groups_invite_description_off()
          : m.leaderboards_groups_invite_description_on({ when: timeUntil(invite.expiresAt) })}
      </Dialog.Description>
    </Dialog.Header>

    {#if invite !== null}
      <QrCode value={link} label={m.leaderboards_groups_invite_label_qr()} class="w-full" />
      <div class="flex flex-wrap gap-2">
        <Button
          variant="outline"
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
        <Button
          variant="ghost"
          disabled={isBusy}
          onclick={() => {
            void stop();
          }}
        >
          {m.leaderboards_groups_invite_button_stop()}
        </Button>
      </div>
    {/if}

    <div class="flex flex-col gap-2">
      <span class="text-sm font-medium">{m.leaderboards_groups_invite_label_duration()}</span>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <ChoiceRow
          options={durations}
          value={String(days)}
          label={m.leaderboards_groups_invite_label_duration()}
          onChange={(value: string) => {
            days = Number(value) as InviteDays;
          }}
        />
        <Button
          variant={invite === null ? "default" : "outline"}
          disabled={isBusy}
          onclick={() => {
            void renew();
          }}
        >
          {invite === null
            ? m.leaderboards_groups_invite_button_make()
            : m.leaderboards_groups_invite_button_renew()}
        </Button>
      </div>
      {#if problem !== null}
        <StatusLine message={groupProblemMessage(problem)} isError={true} />
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
