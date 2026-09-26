<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { m } from "$lib/paraglide/messages";
  import { GROUP_NAME_MAX } from "$lib/sync/group-rules";
  import { createGroup, type GroupProblem } from "$lib/sync/groups";
  import { groupProblemMessage } from "./problems";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
    /** Called with the new group's id once it exists. */
    onCreated: (id: string) => void;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable(), onCreated }: Props = $props();

  let name = $state("");
  let isSaving = $state(false);
  let problem = $state<GroupProblem | null>(null);

  $effect(() => {
    if (!open) return;
    name = "";
    problem = null;
  });

  async function create(): Promise<void> {
    isSaving = true;
    const result = await createGroup(name);
    isSaving = false;
    if ("problem" in result) {
      problem = result.problem;
      return;
    }
    open = false;
    onCreated(result.value.id);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-[448px]">
    <form
      class="flex flex-col gap-5"
      onsubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <Dialog.Header>
        <Dialog.Title>{m.leaderboards_groups_create_title()}</Dialog.Title>
        <Dialog.Description>{m.leaderboards_groups_create_description()}</Dialog.Description>
      </Dialog.Header>
      <div class="flex flex-col gap-2">
        <Label for="new-group-name">{m.leaderboards_groups_label_name()}</Label>
        <Input
          id="new-group-name"
          bind:value={name}
          maxlength={GROUP_NAME_MAX}
          autocomplete="off"
          aria-describedby="new-group-hint"
          aria-invalid={problem !== null}
          required
          disabled={isSaving}
        />
        <p
          id="new-group-hint"
          class={["text-xs", problem === null ? "text-muted-foreground" : "text-destructive"]}
          role={problem === null ? undefined : "alert"}
        >
          {problem === null ? m.leaderboards_groups_create_hint() : groupProblemMessage(problem)}
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
        <Button type="submit" disabled={isSaving || name.trim() === ""}>
          {#if isSaving}<Spinner aria-label={m.common_status_loading()} />{/if}
          {m.leaderboards_groups_create_button()}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
