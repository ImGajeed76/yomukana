<script lang="ts">
  import { Check, Copy, ExternalLink } from "@lucide/svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { m } from "$lib/paraglide/messages";
  import { GROUP_NAME_MAX } from "$lib/sync/group-rules";
  import {
    deleteGroup,
    makeDisplayLink,
    renameGroup,
    stopDisplayLink,
    type GroupProblem,
  } from "$lib/sync/groups";
  import { groupProblemMessage } from "./problems";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
    groupId: string;
    groupName: string;
    /** The display link's code, or null when there is none. */
    displayCode: string | null;
    onRenamed: (name: string) => void;
    onDisplayChanged: (code: string | null) => void;
    onDeleted: () => void;
  }

  let {
    // `$bindable()` marks the prop as bindable, it is not a default. The rule
    // cannot tell a rune from a value.
    // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
    open = $bindable(),
    groupId,
    groupName,
    displayCode,
    onRenamed,
    onDisplayChanged,
    onDeleted,
  }: Props = $props();

  let name = $state("");
  let isBusy = $state(false);
  let problem = $state<GroupProblem | null>(null);
  /** Whether the dialog is asking to confirm the delete, in place of the settings. */
  let isConfirmingDelete = $state(false);
  let isCopied = $state(false);

  // Each time it opens it starts from the group as it is, with nothing left
  // over from last time.
  $effect(() => {
    if (!open) return;
    name = groupName;
    problem = null;
    isConfirmingDelete = false;
  });

  let displayLink = $derived(
    displayCode === null ? "" : `${location.origin}/display/${displayCode}`,
  );

  /** Runs one change, showing the refusal if there is one. Returns its answer, if it worked. */
  async function attempt<T>(
    call: () => Promise<{ value: T } | { problem: GroupProblem }>,
  ): Promise<T | undefined> {
    isBusy = true;
    const result = await call();
    isBusy = false;
    problem = "problem" in result ? result.problem : null;
    return "value" in result ? result.value : undefined;
  }

  async function rename(): Promise<void> {
    const renamed = await attempt(() => renameGroup(groupId, name));
    if (renamed !== undefined) onRenamed(renamed.name);
  }

  async function makeDisplay(): Promise<void> {
    const made = await attempt(() => makeDisplayLink(groupId));
    if (made !== undefined) onDisplayChanged(made.code);
  }

  async function stopDisplay(): Promise<void> {
    await attempt(() => stopDisplayLink(groupId));
    if (problem === null) onDisplayChanged(null);
  }

  async function remove(): Promise<void> {
    await attempt(() => deleteGroup(groupId));
    if (problem !== null) return;
    open = false;
    onDeleted();
  }

  async function copyDisplayLink(): Promise<void> {
    await navigator.clipboard.writeText(displayLink);
    isCopied = true;
    setTimeout(() => {
      isCopied = false;
    }, 1500);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-svh overflow-y-auto sm:max-w-[448px]">
    {#if isConfirmingDelete}
      <!-- Irreversible, for everyone in it, so it says so and asks. See CLAUDE.md 12.4. -->
      <Dialog.Header>
        <Dialog.Title>{m.leaderboards_groups_delete_title({ name: groupName })}</Dialog.Title>
        <Dialog.Description>{m.leaderboards_groups_delete_description()}</Dialog.Description>
      </Dialog.Header>
      {#if problem !== null}
        <StatusLine message={groupProblemMessage(problem)} isError={true} />
      {/if}
      <Dialog.Footer>
        <Button
          variant="ghost"
          disabled={isBusy}
          onclick={() => {
            isConfirmingDelete = false;
          }}
        >
          {m.common_button_cancel()}
        </Button>
        <Button
          variant="destructive"
          disabled={isBusy}
          onclick={() => {
            void remove();
          }}
        >
          {m.leaderboards_groups_delete_confirm()}
        </Button>
      </Dialog.Footer>
    {:else}
      <Dialog.Header>
        <Dialog.Title>{m.leaderboards_groups_settings_title()}</Dialog.Title>
      </Dialog.Header>

      <form
        class="flex flex-col gap-2"
        onsubmit={(event) => {
          event.preventDefault();
          void rename();
        }}
      >
        <Label for="group-name">{m.leaderboards_groups_label_name()}</Label>
        <div class="flex gap-2">
          <Input
            id="group-name"
            bind:value={name}
            maxlength={GROUP_NAME_MAX}
            autocomplete="off"
            required
            disabled={isBusy}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={isBusy || name.trim() === groupName || name.trim() === ""}
          >
            {m.common_button_save()}
          </Button>
        </div>
      </form>

      <!--
        A board for a screen in a classroom, which shows it without anyone
        signing in on that screen. Anyone with this link sees the names and
        scores, so it is off until the admin makes one, and can be stopped.
      -->
      <div class="flex flex-col gap-2">
        <span class="text-sm font-medium">{m.leaderboards_groups_display_title()}</span>
        <p class="text-sm text-muted-foreground">{m.leaderboards_groups_display_description()}</p>
        <div class="flex flex-wrap gap-2">
          {#if displayCode === null}
            <Button
              variant="outline"
              disabled={isBusy}
              onclick={() => {
                void makeDisplay();
              }}
            >
              {m.leaderboards_groups_display_button_make()}
            </Button>
          {:else}
            <Button variant="outline" href={displayLink} target="_blank">
              <ExternalLink class="size-4" />
              {m.leaderboards_groups_display_button_open()}
            </Button>
            <Button
              variant="outline"
              onclick={() => {
                void copyDisplayLink();
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
                void stopDisplay();
              }}
            >
              {m.leaderboards_groups_display_button_stop()}
            </Button>
          {/if}
        </div>
      </div>

      {#if problem !== null}
        <StatusLine message={groupProblemMessage(problem)} isError={true} />
      {/if}

      <Dialog.Footer class="sm:justify-start">
        <Button
          variant="destructive"
          disabled={isBusy}
          onclick={() => {
            problem = null;
            isConfirmingDelete = true;
          }}
        >
          {m.leaderboards_groups_delete_button()}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
