<script lang="ts">
  import { CalendarDate, type DateValue } from "@internationalized/date";
  import { CalendarIcon } from "@lucide/svelte";
  import { Calendar } from "$lib/components/ui/calendar";
  import { Input } from "$lib/components/ui/input";
  import * as Popover from "$lib/components/ui/popover";
  import { getLocale } from "$lib/paraglide/runtime";

  interface Props {
    /** The moment chosen, in epoch milliseconds, in the reader's own time zone. */
    value: number;
    /** Ties the date button to its label, for screen readers and for clicking the label. */
    id: string;
    /** The time field's name for screen readers: the label belongs to the date. */
    timeLabel: string;
    /** No day before this one can be picked. */
    min?: number;
    disabled?: boolean;
    isInvalid?: boolean;
    describedBy?: string;
  }

  let {
    // `$bindable()` marks the prop as bindable, it is not a default. The rule
    // cannot tell a rune from a value.
    // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
    value = $bindable(),
    id,
    timeLabel,
    min,
    disabled = false,
    isInvalid = false,
    describedBy,
  }: Props = $props();

  let isOpen = $state(false);

  function dayOf(at: number): CalendarDate {
    const date = new Date(at);
    return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  function twoDigits(part: number): string {
    return String(part).padStart(2, "0");
  }

  let day = $derived(dayOf(value));
  let time = $derived(
    `${twoDigits(new Date(value).getHours())}:${twoDigits(new Date(value).getMinutes())}`,
  );
  let label = $derived(
    new Intl.DateTimeFormat(getLocale(), {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(value),
  );

  /** The same time of day on another day. */
  function setDay(next: DateValue | undefined): void {
    if (next === undefined) return;
    const at = new Date(value);
    value = new Date(next.year, next.month - 1, next.day, at.getHours(), at.getMinutes()).getTime();
    isOpen = false;
  }

  /** Another time of day on the same day. A half-typed time changes nothing. */
  function setTime(text: string): void {
    const [hours, minutes] = text.split(":").map(Number);
    if (hours === undefined || minutes === undefined) return;
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return;
    const at = new Date(value);
    value = new Date(at.getFullYear(), at.getMonth(), at.getDate(), hours, minutes).getTime();
  }
</script>

<!--
  A day and a time, the way shadcn-svelte puts them together: the day from a
  calendar that opens under its button, the time typed into a field beside
  it. Both in the reader's own time zone and language, and weeks start on
  Monday, as the streak calendar's do.
-->
<div class="flex gap-2">
  <Popover.Root bind:open={isOpen}>
    <Popover.Trigger
      {id}
      {disabled}
      aria-invalid={isInvalid}
      aria-describedby={describedBy}
      class="flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-3xl border border-transparent bg-input/50 px-3 text-left text-base transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm"
    >
      <span class="truncate">{label}</span>
      <CalendarIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Popover.Trigger>
    <Popover.Content class="w-auto overflow-hidden p-0" align="start">
      <Calendar
        type="single"
        value={day}
        onValueChange={setDay}
        locale={getLocale()}
        weekStartsOn={1}
        minValue={min === undefined ? undefined : dayOf(min)}
        placeholder={day}
        initialFocus
      />
    </Popover.Content>
  </Popover.Root>
  <!-- The browser's own clock button is hidden: the field is typed into, like any other. -->
  <Input
    type="time"
    step={60}
    value={time}
    aria-label={timeLabel}
    aria-invalid={isInvalid}
    aria-describedby={describedBy}
    {disabled}
    class="w-28 shrink-0 appearance-none [&::-webkit-calendar-picker-indicator]:hidden"
    onchange={(event: Event) => {
      setTime((event.currentTarget as HTMLInputElement).value);
    }}
  />
</div>
