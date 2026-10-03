<script lang="ts">
  import { Check, Copy } from "@lucide/svelte";
  import QrCode from "$lib/components/profile/QrCode.svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Spinner } from "$lib/components/ui/spinner";
  import { m } from "$lib/paraglide/messages";
  import { JOIN_PATH } from "$lib/sync/group-rules";
  import {
    replaceMarathonInvite,
    stopMarathonInvite,
    type MarathonProblem,
  } from "$lib/sync/marathons";
  import { marathonProblemMessage } from "./problems";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
    marathonId: string;
    name: string;
    /** The invite's code, or null while invites are off. */
    inviteCode: string | null;
    /** Called with the code as it is now, or null once invites are off. */
    onChange: (code: string | null) => void;
  }

  let {
    // `$bindable()` marks the prop as bindable, it is not a default. The rule
    // cannot tell a rune from a value.
    // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
    open = $bindable(),
    marathonId,
    name,
    inviteCode,
    onChange,
  }: Props = $props();

  let pending = $state<"replace" | "off" | null>(null);
  let problem = $state<MarathonProblem | null>(null);
  let isCopied = $state(false);

  let link = $derived(inviteCode === null ? "" : `${location.origin}${JOIN_PATH}${inviteCode}`);

  async function replace(): Promise<void> {
    pending = "replace";
    const result = await replaceMarathonInvite(marathonId);
    pending = null;
    problem = "problem" in result ? result.problem : null;
    if ("value" in result) onChange(result.value.code);
  }

  async function turnOff(): Promise<void> {
    pending = "off";
    const result = await stopMarathonInvite(marathonId);
    pending = null;
    problem = "problem" in result ? result.problem : null;
    if (!("problem" in result)) onChange(null);
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
  For the organiser in front of a room: the code to scan, then the link to
  send. It lasts as long as the marathon, so unlike a group's there is no end
  date to set. What to do if it spread too far is there, out of the way.
-->
<Dialog.Root bind:open>
  <Dialog.Content class="max-h-svh overflow-y-auto sm:max-w-[448px]">
    <Dialog.Header>
      <Dialog.Title>{m.marathon_invite_title({ name })}</Dialog.Title>
      <Dialog.Description>
        {inviteCode === null ? m.marathon_invite_off() : m.marathon_invite_description()}
      </Dialog.Description>
    </Dialog.Header>

    {#if inviteCode === null}
      <div>
        <Button
          disabled={pending !== null}
          onclick={() => {
            void replace();
          }}
        >
          {#if pending === "replace"}<Spinner aria-label={m.common_status_loading()} />{/if}
          {m.leaderboards_groups_invite_button_on()}
        </Button>
      </div>
    {:else}
      <div class="relative" aria-busy={pending !== null}>
        <QrCode
          value={link}
          label={m.leaderboards_groups_invite_label_qr()}
          class={[
            "w-full transition-[filter,opacity] duration-150 motion-reduce:transition-none",
            pending !== null && "opacity-40 blur-sm",
          ]}
        />
        {#if pending !== null}
          <div class="absolute inset-0 flex items-center justify-center">
            <Spinner class="size-8 text-qr-dark" aria-label={m.common_status_loading()} />
          </div>
        {/if}
      </div>

      <p
        class="text-center font-mono text-3xl tracking-widest"
        aria-label={m.leaderboards_groups_join_label_code()}
      >
        {inviteCode.slice(0, 4)}&nbsp;{inviteCode.slice(4)}
      </p>

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
    {/if}

    {#if problem !== null}
      <StatusLine message={marathonProblemMessage(problem)} isError={true} />
    {/if}

    {#if inviteCode !== null}
      <div class="flex flex-col gap-1 border-t border-border pt-4 text-sm">
        <span class="text-muted-foreground">{m.leaderboards_groups_label_leaked()}</span>
        <div class="-ml-3 flex flex-wrap gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={pending !== null}
            onclick={() => {
              void replace();
            }}
          >
            {m.leaderboards_groups_button_replace()}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending !== null}
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
