<script lang="ts">
  import ChoiceRow from "$lib/components/ChoiceRow.svelte";
  import DateTimeField from "$lib/components/DateTimeField.svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Spinner } from "$lib/components/ui/spinner";
  import { Switch } from "$lib/components/ui/switch";
  import { m } from "$lib/paraglide/messages";
  import {
    MARATHON_NAME_MAX,
    RESULTS_DELAY_MINUTES,
    marathonStatus,
    type ResultsDelay,
  } from "$lib/sync/marathon-rules";
  import {
    deleteMarathon,
    updateMarathon,
    type MarathonHeader,
    type MarathonProblem,
  } from "$lib/sync/marathons";
  import { marathonProblemMessage } from "./problems";
  import { resultsLabel } from "./results";
  import { scheduleProblem, scheduleProblemMessage, type ScheduleProblem } from "./schedule";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
    marathon: MarathonHeader;
    /** Called with the marathon as saved. */
    onChange: (marathon: MarathonHeader) => void;
    onDeleted: () => void;
  }

  let {
    // `$bindable()` marks the prop as bindable, it is not a default. The rule
    // cannot tell a rune from a value.
    // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
    open = $bindable(),
    marathon,
    onChange,
    onDeleted,
  }: Props = $props();

  let name = $state("");
  let startsAt = $state(0);
  let endsAt = $state(0);
  let isLateOn = $state(true);
  /** The change on its way to the server, so its own control shows the wait. */
  let pending = $state<"name" | "times" | "late" | "results" | "delete" | null>(null);
  let isBusy = $derived(pending !== null);
  let problem = $state<MarathonProblem | null>(null);
  let isConfirmingDelete = $state(false);

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Each time it opens it starts from the marathon as it is.
  $effect(() => {
    if (!open) return;
    name = marathon.name;
    startsAt = marathon.startsAt;
    endsAt = marathon.endsAt;
    isLateOn = marathon.allowsLateEntry;
    problem = null;
    isConfirmingDelete = false;
  });

  /**
   * What can still change shows, and nothing else: the times until it starts,
   * who may join and when results are final until it ends. Past those
   * points they are part of what the runners were promised.
   */
  let status = $derived(marathonStatus(marathon, Date.now()));
  let isUpcoming = $derived(status === "upcoming");
  let isOn = $derived(status === "upcoming" || status === "running");

  let timesProblem = $derived<ScheduleProblem | null>(
    scheduleProblem(startsAt, endsAt, Date.now()),
  );
  let isTimesChanged = $derived(startsAt !== marathon.startsAt || endsAt !== marathon.endsAt);

  // The times save themselves, like the switch and the results choice: as
  // soon as both are set to something that makes a marathon. A start moved
  // past the end waits, with the reason under it, until the end follows.
  $effect(() => {
    if (!open || !isUpcoming || !isTimesChanged || timesProblem !== null || pending !== null) {
      return;
    }
    // Each pair once: a refusal is shown, not retried in a loop.
    const pair = `${String(startsAt)}-${String(endsAt)}`;
    if (pair === lastTriedTimes) return;
    lastTriedTimes = pair;
    void save("times", { startsAt, endsAt });
  });

  /** The last start and end sent, so a refused pair is not sent again. */
  let lastTriedTimes = "";

  /** Saves one change. Returns whether it saved. */
  async function save(
    kind: NonNullable<typeof pending>,
    changes: Parameters<typeof updateMarathon>[1],
  ): Promise<boolean> {
    pending = kind;
    const result = await updateMarathon(marathon.id, changes);
    pending = null;
    problem = "problem" in result ? result.problem : null;
    if ("value" in result) onChange(result.value);
    return "value" in result;
  }

  async function remove(): Promise<void> {
    pending = "delete";
    const result = await deleteMarathon(marathon.id);
    pending = null;
    if ("problem" in result) {
      problem = result.problem;
      return;
    }
    open = false;
    onDeleted();
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-svh overflow-y-auto sm:max-w-[448px]">
    {#if isConfirmingDelete}
      <!-- Irreversible, for everyone in it, so it says so and asks. See CLAUDE.md 12.4. -->
      <Dialog.Header>
        <Dialog.Title>{m.marathon_delete_title({ name: marathon.name })}</Dialog.Title>
        <Dialog.Description>{m.marathon_delete_description()}</Dialog.Description>
      </Dialog.Header>
      {#if problem !== null}
        <StatusLine message={marathonProblemMessage(problem)} isError={true} />
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
          {#if pending === "delete"}<Spinner aria-label={m.common_status_loading()} />{/if}
          {m.leaderboards_groups_delete_confirm()}
        </Button>
      </Dialog.Footer>
    {:else}
      <Dialog.Header>
        <Dialog.Title>{m.marathon_settings_title()}</Dialog.Title>
      </Dialog.Header>

      <form
        class="flex flex-col gap-2"
        onsubmit={(event) => {
          event.preventDefault();
          void save("name", { name });
        }}
      >
        <Label for="marathon-settings-name">{m.marathon_create_label_name()}</Label>
        <div class="flex gap-2">
          <Input
            id="marathon-settings-name"
            bind:value={name}
            maxlength={MARATHON_NAME_MAX}
            autocomplete="off"
            required
            disabled={isBusy}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={isBusy || name.trim() === marathon.name || name.trim() === ""}
          >
            {#if pending === "name"}<Spinner aria-label={m.common_status_loading()} />{/if}
            {m.common_button_save()}
          </Button>
        </div>
      </form>

      {#if isUpcoming}
        <div class="flex flex-col gap-2">
          <div class="flex flex-col gap-2">
            <Label for="marathon-settings-starts">{m.marathon_create_label_starts()}</Label>
            <DateTimeField
              id="marathon-settings-starts"
              bind:value={startsAt}
              min={Date.now()}
              timeLabel={m.marathon_create_label_time()}
              isInvalid={timesProblem === "past" || timesProblem === "far"}
              describedBy="marathon-settings-times-hint"
              disabled={isBusy}
            />
          </div>
          <div class="flex flex-col gap-2">
            <Label for="marathon-settings-ends">{m.marathon_create_label_ends()}</Label>
            <DateTimeField
              id="marathon-settings-ends"
              bind:value={endsAt}
              min={startsAt}
              timeLabel={m.marathon_create_label_time()}
              isInvalid={timesProblem === "order" ||
                timesProblem === "short" ||
                timesProblem === "long"}
              describedBy="marathon-settings-times-hint"
              disabled={isBusy}
            />
          </div>
          <p
            id="marathon-settings-times-hint"
            class={[
              "text-xs",
              timesProblem === null ? "text-muted-foreground" : "text-destructive",
            ]}
            role={timesProblem === null ? undefined : "alert"}
          >
            {timesProblem === null
              ? m.marathon_settings_hint_times({ zone: timeZone })
              : scheduleProblemMessage(timesProblem)}
          </p>
        </div>
      {/if}

      {#if isOn}
        <!-- Saved as soon as it is switched, like a switch anywhere else. -->
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-1">
            <Label for="marathon-settings-late">{m.marathon_create_label_late()}</Label>
            <span class="text-sm text-balance text-muted-foreground">
              {m.marathon_create_hint_late()}
            </span>
          </div>
          <Switch
            id="marathon-settings-late"
            bind:checked={isLateOn}
            disabled={isBusy}
            onCheckedChange={(checked: boolean) => {
              void save("late", { allowsLateEntry: checked }).then((isSaved) => {
                if (!isSaved) isLateOn = marathon.allowsLateEntry;
              });
            }}
          />
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium">{m.marathon_create_label_results()}</span>
          <div class="-ml-3">
            <ChoiceRow
              label={m.marathon_create_label_results()}
              value={String(marathon.resultsDelay)}
              options={RESULTS_DELAY_MINUTES.map((minutes) => ({
                value: String(minutes),
                label: resultsLabel(minutes),
              }))}
              onChange={(value: string) => {
                const minutes = RESULTS_DELAY_MINUTES.find((each) => String(each) === value);
                if (minutes !== undefined && minutes !== marathon.resultsDelay) {
                  void save("results", { resultsDelay: minutes satisfies ResultsDelay });
                }
              }}
            />
          </div>
          <p class="text-xs text-muted-foreground">{m.marathon_create_hint_results()}</p>
        </div>
      {/if}

      {#if problem !== null}
        <StatusLine message={marathonProblemMessage(problem)} isError={true} />
      {/if}

      <!--
        The rarest thing anyone does here, so the quietest: red text rather
        than a red button, away from the rest, and it still asks first.
      -->
      <div class="border-t border-border pt-4">
        <Button
          variant="ghost"
          size="sm"
          class="-ml-3 text-destructive hover:text-destructive"
          disabled={isBusy}
          onclick={() => {
            problem = null;
            isConfirmingDelete = true;
          }}
        >
          {m.marathon_delete_button()}
        </Button>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
