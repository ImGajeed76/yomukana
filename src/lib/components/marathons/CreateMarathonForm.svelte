<script lang="ts">
  import { ChevronDown } from "@lucide/svelte";
  import { slide } from "svelte/transition";
  import ChoiceRow from "$lib/components/ChoiceRow.svelte";
  import DateTimeField from "$lib/components/DateTimeField.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Spinner } from "$lib/components/ui/spinner";
  import { Switch } from "$lib/components/ui/switch";
  import { m } from "$lib/paraglide/messages";
  import {
    DEFAULT_RESULTS_DELAY,
    MARATHON_NAME_MAX,
    RESULTS_DELAY_MINUTES,
    type ResultsDelay,
  } from "$lib/sync/marathon-rules";
  import { createMarathon, type MarathonProblem } from "$lib/sync/marathons";
  import { marathonProblemMessage } from "./problems";
  import { resultsLabel } from "./results";
  import {
    nextFullHour,
    scheduleProblem,
    scheduleProblemMessage,
    type ScheduleProblem,
  } from "./schedule";

  interface Props {
    /** Back to choosing what to make. */
    onBack: () => void;
    /** Called with the new marathon's id once it exists. */
    onCreated: (id: string) => void;
  }

  let { onBack, onCreated }: Props = $props();

  const WEEK_MS = 7 * 86_400_000;
  const opened = Date.now();

  let name = $state("");
  // The next full hour, for a week: a start nobody has to adjust to the minute.
  let startsAt = $state(nextFullHour(opened));
  let endsAt = $state(nextFullHour(opened) + WEEK_MS);
  /**
   * Off, because the case this was made for is a teacher racing a class,
   * not racing it. Friends racing each other turn it on.
   */
  let isRunning = $state(false);
  let isMoreOpen = $state(false);
  let allowsLateEntry = $state(true);
  let resultsDelay = $state<ResultsDelay>(DEFAULT_RESULTS_DELAY);
  let isSaving = $state(false);
  let problem = $state<MarathonProblem | null>(null);

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  let timesProblem = $derived<ScheduleProblem | null>(
    scheduleProblem(startsAt, endsAt, Date.now()),
  );
  let isReady = $derived(name.trim() !== "" && timesProblem === null);

  async function create(): Promise<void> {
    if (!isReady) return;
    isSaving = true;
    const result = await createMarathon({
      name: name.trim(),
      startsAt,
      endsAt,
      allowsLateEntry,
      resultsDelay,
      isRunning,
    });
    isSaving = false;
    if ("problem" in result) {
      problem = result.problem;
      return;
    }
    onCreated(result.value.id);
  }
</script>

<!--
  Everything a marathon needs and nothing more: a name, when, and whether the
  maker runs too. What most never change waits behind "More options", with
  defaults that suit a class.
-->
<form
  class="flex flex-col gap-5"
  onsubmit={(event) => {
    event.preventDefault();
    void create();
  }}
>
  <Dialog.Header>
    <Dialog.Title>{m.marathon_create_title()}</Dialog.Title>
    <Dialog.Description>{m.marathon_create_description()}</Dialog.Description>
  </Dialog.Header>

  <div class="flex flex-col gap-2">
    <Label for="marathon-name">{m.marathon_create_label_name()}</Label>
    <Input
      id="marathon-name"
      bind:value={name}
      maxlength={MARATHON_NAME_MAX}
      autocomplete="off"
      aria-describedby="marathon-name-hint"
      required
      disabled={isSaving}
    />
    <p id="marathon-name-hint" class="text-xs text-muted-foreground">
      {m.marathon_create_hint_name()}
    </p>
  </div>

  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-2">
      <Label for="marathon-starts">{m.marathon_create_label_starts()}</Label>
      <DateTimeField
        id="marathon-starts"
        bind:value={startsAt}
        min={opened}
        timeLabel={m.marathon_create_label_time()}
        isInvalid={timesProblem === "past" || timesProblem === "far"}
        describedBy="marathon-times-hint"
        disabled={isSaving}
      />
    </div>
    <div class="flex flex-col gap-2">
      <Label for="marathon-ends">{m.marathon_create_label_ends()}</Label>
      <DateTimeField
        id="marathon-ends"
        bind:value={endsAt}
        min={startsAt}
        timeLabel={m.marathon_create_label_time()}
        isInvalid={timesProblem === "order" || timesProblem === "short" || timesProblem === "long"}
        describedBy="marathon-times-hint"
        disabled={isSaving}
      />
    </div>
    <p
      id="marathon-times-hint"
      class={["text-xs", timesProblem === null ? "text-muted-foreground" : "text-destructive"]}
      role={timesProblem === null ? undefined : "alert"}
    >
      {timesProblem === null
        ? m.marathon_create_hint_times({ zone: timeZone })
        : scheduleProblemMessage(timesProblem)}
    </p>
  </div>

  <div class="flex items-start justify-between gap-4">
    <div class="flex flex-col gap-1">
      <Label for="marathon-running">{m.marathon_create_label_running()}</Label>
      <p id="marathon-running-hint" class="text-xs text-muted-foreground">
        {m.marathon_create_hint_running()}
      </p>
    </div>
    <Switch
      id="marathon-running"
      bind:checked={isRunning}
      aria-describedby="marathon-running-hint"
      disabled={isSaving}
    />
  </div>

  <div class="flex flex-col gap-4">
    <div>
      <Button
        variant="ghost"
        size="sm"
        class="-ml-3 text-muted-foreground"
        aria-expanded={isMoreOpen}
        aria-controls="marathon-more"
        onclick={() => {
          isMoreOpen = !isMoreOpen;
        }}
      >
        {m.marathon_create_button_more()}
        <ChevronDown class={["size-4 transition-transform", isMoreOpen && "rotate-180"]} />
      </Button>
    </div>
    {#if isMoreOpen}
      <div id="marathon-more" class="flex flex-col gap-5" transition:slide={{ duration: 200 }}>
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-1">
            <Label for="marathon-late">{m.marathon_create_label_late()}</Label>
            <p class="text-xs text-muted-foreground">{m.marathon_create_hint_late()}</p>
          </div>
          <Switch id="marathon-late" bind:checked={allowsLateEntry} disabled={isSaving} />
        </div>
        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium">{m.marathon_create_label_results()}</span>
          <div class="-ml-3">
            <ChoiceRow
              label={m.marathon_create_label_results()}
              value={String(resultsDelay)}
              options={RESULTS_DELAY_MINUTES.map((minutes) => ({
                value: String(minutes),
                label: resultsLabel(minutes),
              }))}
              onChange={(value: string) => {
                const minutes = RESULTS_DELAY_MINUTES.find((each) => String(each) === value);
                if (minutes !== undefined) resultsDelay = minutes;
              }}
            />
          </div>
          <p class="text-xs text-muted-foreground">{m.marathon_create_hint_results()}</p>
        </div>
      </div>
    {/if}
  </div>

  {#if problem !== null}
    <p class="text-sm text-destructive" role="alert">{marathonProblemMessage(problem)}</p>
  {/if}

  <Dialog.Footer>
    <Button variant="ghost" disabled={isSaving} onclick={onBack}>
      {m.common_button_back()}
    </Button>
    <Button type="submit" disabled={isSaving || !isReady}>
      {#if isSaving}<Spinner aria-label={m.common_status_loading()} />{/if}
      {m.marathon_create_button()}
    </Button>
  </Dialog.Footer>
</form>
