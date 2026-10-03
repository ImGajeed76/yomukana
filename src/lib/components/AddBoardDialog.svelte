<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { m } from "$lib/paraglide/messages";
  import { GROUP_NAME_MAX, JOIN_PATH, inviteCodeIn } from "$lib/sync/group-rules";
  import { createGroup, type GroupProblem } from "$lib/sync/groups";
  import { groupProblemMessage } from "./groups/problems";
  import CreateMarathonForm from "./marathons/CreateMarathonForm.svelte";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
    /** Called with a new group's or marathon's id once it exists. */
    onCreated: (made: { kind: "group" | "marathon"; id: string }) => void;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable(), onCreated }: Props = $props();

  /**
   * Joining is what most readers come here for, so it is what opens first.
   * Making something new asks what first: a group or a marathon.
   */
  let step = $state<"join" | "choose" | "group" | "marathon">("join");
  let code = $state("");
  let isCodeWrong = $state(false);
  let name = $state("");
  let isSaving = $state(false);
  let problem = $state<GroupProblem | null>(null);

  $effect(() => {
    if (!open) return;
    step = "join";
    code = "";
    isCodeWrong = false;
    name = "";
    problem = null;
  });

  /**
   * Goes to the invite's own page, which shows the group and asks once more.
   * Whether the code still works is its job, so it is not checked twice.
   */
  async function join(): Promise<void> {
    const invite = inviteCodeIn(code);
    isCodeWrong = invite === null;
    if (invite === null) return;
    open = false;
    await goto(`${JOIN_PATH}${invite}`);
  }

  async function create(): Promise<void> {
    isSaving = true;
    const result = await createGroup(name);
    isSaving = false;
    if ("problem" in result) {
      problem = result.problem;
      return;
    }
    open = false;
    onCreated({ kind: "group", id: result.value.id });
  }
</script>

<!--
  Joining a group or a marathon by its code, for a reader on a laptop who
  cannot scan the one on the board, or making a new one. A student joins, a
  teacher makes one, and there are more students.
-->
<Dialog.Root bind:open>
  <Dialog.Content class="max-h-svh overflow-y-auto sm:max-w-[448px]">
    {#if step === "join"}
      <form
        class="flex flex-col gap-5"
        onsubmit={(event) => {
          event.preventDefault();
          void join();
        }}
      >
        <Dialog.Header>
          <Dialog.Title>{m.leaderboards_groups_join_title()}</Dialog.Title>
        </Dialog.Header>
        <div class="flex flex-col gap-2">
          <Label for="invite-code">{m.leaderboards_groups_join_label_code()}</Label>
          <Input
            id="invite-code"
            bind:value={code}
            class="font-mono"
            placeholder="abcd 2345"
            autocomplete="off"
            autocapitalize="none"
            spellcheck={false}
            aria-describedby="invite-code-error"
            aria-invalid={isCodeWrong}
            required
          />
          {#if isCodeWrong}
            <p id="invite-code-error" class="text-xs text-destructive" role="alert">
              {m.leaderboards_groups_join_error_code()}
            </p>
          {/if}
        </div>
        <Dialog.Footer class="sm:justify-between">
          <Button
            variant="ghost"
            class="-ml-3"
            onclick={() => {
              step = "choose";
            }}
          >
            {m.leaderboards_groups_join_button_create()}
          </Button>
          <Button type="submit" disabled={code.trim() === ""}>
            {m.leaderboards_groups_join_button()}
          </Button>
        </Dialog.Footer>
      </form>
    {:else if step === "choose"}
      <div class="flex flex-col gap-5">
        <Dialog.Header>
          <Dialog.Title>{m.leaderboards_create_title()}</Dialog.Title>
        </Dialog.Header>
        <div class="-mx-3 flex flex-col gap-1">
          {#each [{ kind: "group", label: m.leaderboards_create_group_label(), description: m.leaderboards_create_group_description() }, { kind: "marathon", label: m.leaderboards_create_marathon_label(), description: m.leaderboards_create_marathon_description() }] as const as option (option.kind)}
            <button
              type="button"
              class="flex items-center justify-between gap-4 rounded-md px-3 py-3 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onclick={() => {
                step = option.kind;
              }}
            >
              <span class="flex min-w-0 flex-col gap-1">
                <span class="text-sm font-medium">{option.label}</span>
                <span class="text-sm text-muted-foreground">{option.description}</span>
              </span>
              <ChevronRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          {/each}
        </div>
        <Dialog.Footer>
          <Button
            variant="ghost"
            onclick={() => {
              step = "join";
            }}
          >
            {m.common_button_back()}
          </Button>
        </Dialog.Footer>
      </div>
    {:else if step === "marathon"}
      <CreateMarathonForm
        onBack={() => {
          step = "choose";
        }}
        onCreated={(id: string) => {
          open = false;
          onCreated({ kind: "marathon", id });
        }}
      />
    {:else}
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
          <Button
            variant="ghost"
            disabled={isSaving}
            onclick={() => {
              step = "choose";
            }}
          >
            {m.common_button_back()}
          </Button>
          <Button type="submit" disabled={isSaving || name.trim() === ""}>
            {#if isSaving}<Spinner aria-label={m.common_status_loading()} />{/if}
            {m.leaderboards_groups_create_button()}
          </Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>
