<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { m } from "$lib/paraglide/messages";
  import { renameProfile, type RenameProblem } from "$lib/sync/friends";
  import { normaliseUsername } from "$lib/sync/username";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
    /** The name as it is now, to start editing from. */
    current: string;
    /** Whether saving is off, as it is on the made-up `?demo` board. */
    isReadOnly?: boolean;
    /** Called with the new name once the server has taken it. */
    onSaved: (username: string) => void;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable(), current, isReadOnly = false, onSaved }: Props = $props();

  let draft = $state("");
  let isSaving = $state(false);
  let problem = $state<RenameProblem | null>(null);

  const PROBLEM_MESSAGES: Record<RenameProblem, () => string> = {
    taken: m.leaderboards_following_rename_error_taken,
    invalid: m.leaderboards_following_rename_error_invalid,
    offline: m.leaderboards_following_error_offline,
    unknown: m.leaderboards_following_error_unknown,
  };

  // Each time it opens it starts from the name the reader has now, with no
  // leftover error from last time. Renaming is usually a small edit, not a
  // fresh start, so the old name is the starting point.
  $effect(() => {
    if (!open) return;
    draft = current;
    problem = null;
  });

  async function save(): Promise<void> {
    isSaving = true;
    problem = await renameProfile(draft);
    isSaving = false;
    if (problem !== null) return;
    open = false;
    onSaved(normaliseUsername(draft));
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[448px]">
    <form
      class="flex flex-col gap-5"
      onsubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Dialog.Header>
        <Dialog.Title>{m.leaderboards_following_rename_title()}</Dialog.Title>
        <Dialog.Description>{m.leaderboards_following_rename_description()}</Dialog.Description>
      </Dialog.Header>

      <div class="flex flex-col gap-2">
        <Label for="username">{m.leaderboards_following_label_username()}</Label>
        <Input
          id="username"
          aria-describedby="username-hint"
          aria-invalid={problem !== null}
          bind:value={draft}
          autocomplete="off"
          autocapitalize="none"
          spellcheck={false}
          required
          disabled={isSaving}
        />
        <!--
          One line under the field: the rules, or what was wrong with this
          name. Never empty, so an error takes the rules' place rather than
          pushing the buttons down.
        -->
        <p
          id="username-hint"
          class={["text-xs", problem === null ? "text-muted-foreground" : "text-destructive"]}
          role={problem === null ? undefined : "alert"}
        >
          {problem === null ? m.leaderboards_following_rename_hint() : PROBLEM_MESSAGES[problem]()}
        </p>
      </div>

      <Dialog.Footer>
        <Dialog.Close>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" disabled={isSaving}>
              {m.common_button_cancel()}
            </Button>
          {/snippet}
        </Dialog.Close>
        <Button type="submit" disabled={isSaving || isReadOnly}>{m.common_button_save()}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
