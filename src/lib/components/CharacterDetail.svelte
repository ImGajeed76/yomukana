<script lang="ts">
  import { DitherArea, type ChartPoint } from "$lib/charts";
  import * as Dialog from "$lib/components/ui/dialog";
  import SpanPicker from "./SpanPicker.svelte";
  import { m } from "$lib/paraglide/messages";
  import { bucketFor } from "$lib/selection";
  import { dailyLatencies, dayLabel } from "$lib/stats";
  import type { Item, ItemStore } from "$lib/srs";

  interface Props {
    /** The character or word to look at, or nothing when the dialog is closed. */
    item: Item | null;
    store: ItemStore;
    onClose: () => void;
  }

  let { item, store, onClose }: Props = $props();

  let span = $state(30);

  let itemState = $derived(item === null ? undefined : store.items.get(item.id));
  let bucket = $derived(bucketFor(itemState, new Date()));

  /**
   * Recognition time by day, the same shape as the score chart on the page
   * behind this one. A day is the mean of its reads, and a quiet day holds the
   * last one, so what the line shows is the character getting easier rather
   * than how often it happened to come up.
   *
   * Drawn in milliseconds, which falls as the reader improves. That is the
   * right way round for a time: the mountain shrinking is the good news.
   */
  let chart = $derived<ChartPoint[]>(
    dailyLatencies(itemState?.history ?? [], span, new Date()).map((day) => ({
      label: dayLabel(day.date),
      value: day.value,
    })),
  );

  function accuracy(reviews: number, errors: number): string {
    const total = reviews + errors;
    return total === 0 ? "" : `${String(Math.round((reviews / total) * 100))}%`;
  }

  function milliseconds(value: number): string {
    return `${String(Math.round(value))} ms`;
  }

  function statusLabel(): string {
    if (bucket === "new") return m.stats_detail_status_new();
    return bucket === "weak" ? m.stats_detail_status_weak() : m.stats_detail_status_known();
  }
</script>

<Dialog.Root
  open={item !== null}
  onOpenChange={(open) => {
    if (!open) onClose();
  }}
>
  <Dialog.Content class="overflow-hidden sm:max-w-[520px]">
    {#if item !== null}
      <Dialog.Header>
        <Dialog.Title class="flex items-baseline gap-3">
          <span class="font-japanese text-4xl leading-none" lang="ja">{item.surface}</span>
          {#if item.kind === "kanji"}
            <span class="font-japanese text-base text-muted-foreground" lang="ja">
              {item.reading}
            </span>
          {/if}
        </Dialog.Title>
        <Dialog.Description>{statusLabel()}</Dialog.Description>
      </Dialog.Header>

      {#if itemState === undefined || itemState.reviews === 0}
        <p class="text-sm text-muted-foreground">{m.stats_detail_empty()}</p>
      {:else}
        <dl class="grid grid-cols-3 gap-4">
          <div class="flex flex-col gap-1">
            <dt class="text-xs text-muted-foreground">{m.stats_characters_column_reads()}</dt>
            <dd class="text-2xl font-semibold tabular-nums">{itemState.reviews}</dd>
          </div>
          <div class="flex flex-col gap-1">
            <dt class="text-xs text-muted-foreground">{m.stats_characters_column_speed()}</dt>
            <dd class="text-2xl font-semibold tabular-nums">
              {itemState.meanLatencyMs === null
                ? ""
                : `${String(Math.round(itemState.meanLatencyMs))} ms`}
            </dd>
          </div>
          <div class="flex flex-col gap-1">
            <dt class="text-xs text-muted-foreground">{m.stats_characters_column_accuracy()}</dt>
            <dd class="text-2xl font-semibold tabular-nums">
              {accuracy(itemState.reviews, itemState.errors)}
            </dd>
          </div>
        </dl>

        <div class="-mx-6 -mb-6 flex flex-col gap-2 border-t border-border pt-4">
          <div class="flex items-center justify-between gap-4 px-6">
            <span class="text-xs text-muted-foreground">{m.stats_detail_chart_title()}</span>
            <SpanPicker
              value={span}
              onChange={(days: number) => {
                span = days;
              }}
            />
          </div>
          <DitherArea
            points={chart}
            label={m.stats_detail_chart_label()}
            seriesLabel={m.stats_characters_column_speed()}
            format={milliseconds}
            height={120}
          />
        </div>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
