<script lang="ts">
  import { untrack } from "svelte";
  import { Check, Copy, ExternalLink } from "@lucide/svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Spinner } from "$lib/components/ui/spinner";
  import { m } from "$lib/paraglide/messages";
  import { makeDisplayLink, stopDisplayLink, type GroupProblem } from "$lib/sync/groups";
  import { groupProblemMessage } from "./problems";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
    groupId: string;
    groupName: string;
    /** The screen link's code, or null when there is none. */
    displayCode: string | null;
    /** Called with the new code, or null once the link is turned off. */
    onChange: (code: string | null) => void;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable(), groupId, groupName, displayCode, onChange }: Props = $props();

  /** The change on its way to the server, if any, so its own place shows the wait. */
  let pending = $state<"make" | "replace" | "off" | null>(null);
  let isBusy = $derived(pending !== null);
  let problem = $state<GroupProblem | null>(null);
  let isCopied = $state(false);

  let link = $derived(displayCode === null ? "" : `${location.origin}/display/${displayCode}`);

  async function make(kind: "make" | "replace"): Promise<void> {
    pending = kind;
    const result = await makeDisplayLink(groupId);
    pending = null;
    problem = "problem" in result ? result.problem : null;
    if ("value" in result) onChange(result.value.code);
  }

  async function turnOff(): Promise<void> {
    pending = "off";
    const result = await stopDisplayLink(groupId);
    pending = null;
    problem = "problem" in result ? result.problem : null;
    if (!("problem" in result)) onChange(null);
  }

  // Opening this is asking for a link, so there is one without a second
  // click. Only on opening: a link the admin just turned off stays off.
  $effect(() => {
    if (!open) return;
    // Untracked, so turning the link off does not count as opening again.
    untrack(() => {
      problem = null;
      if (displayCode === null) void make("make");
    });
  });

  async function copyLink(): Promise<void> {
    await navigator.clipboard.writeText(link);
    isCopied = true;
    setTimeout(() => {
      isCopied = false;
    }, 1500);
  }
</script>

<!--
  For an admin putting the board up in a classroom. The link is opened on
  the computer attached to the projector, not on theirs, so copying it comes
  first. What it gives away is said plainly, on its own line.
-->
<Dialog.Root bind:open>
  <Dialog.Content class="max-h-svh overflow-y-auto sm:max-w-[448px]">
    <Dialog.Header>
      <Dialog.Title>{m.leaderboards_groups_screen_title({ name: groupName })}</Dialog.Title>
      <Dialog.Description>
        {displayCode === null && pending === null
          ? m.leaderboards_groups_screen_off()
          : m.leaderboards_groups_screen_description()}
      </Dialog.Description>
    </Dialog.Header>

    {#if displayCode === null}
      {#if pending === "make"}
        <p class="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner aria-label={m.common_status_loading()} />
          {m.leaderboards_groups_screen_making()}
        </p>
      {:else}
        <div>
          <Button
            onclick={() => {
              void make("make");
            }}
          >
            {m.leaderboards_groups_screen_button_on()}
          </Button>
        </div>
      {/if}
    {:else}
      <div class="flex flex-col gap-2">
        <Button
          class="w-full"
          disabled={isBusy}
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
        <Button variant="outline" class="w-full" href={link} target="_blank" disabled={isBusy}>
          <ExternalLink class="size-4" />
          {m.leaderboards_groups_screen_button_open()}
        </Button>
      </div>
      <p class="text-sm text-muted-foreground">{m.leaderboards_groups_screen_warning()}</p>
    {/if}

    {#if problem !== null}
      <StatusLine message={groupProblemMessage(problem)} isError={true} />
    {/if}

    {#if displayCode !== null}
      <div class="flex flex-col gap-1 border-t border-border pt-4 text-sm">
        <span class="text-muted-foreground">{m.leaderboards_groups_label_leaked()}</span>
        <!-- Pulled left by their own padding, so the words line up with the question. -->
        <div class="-ml-3 flex flex-wrap gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={isBusy}
            onclick={() => {
              void make("replace");
            }}
          >
            {#if pending === "replace"}<Spinner aria-label={m.common_status_loading()} />{/if}
            {m.leaderboards_groups_button_replace()}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={isBusy}
            onclick={() => {
              void turnOff();
            }}
          >
            {#if pending === "off"}<Spinner aria-label={m.common_status_loading()} />{/if}
            {m.leaderboards_groups_screen_button_off()}
          </Button>
        </div>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
