<script lang="ts">
  import ChartColumnIcon from "@lucide/svelte/icons/chart-column";
  import InfoIcon from "@lucide/svelte/icons/info";
  import { DitherArea } from "$lib/charts";
  import CharacterDetail from "$lib/components/CharacterDetail.svelte";
  import KanaGrid from "$lib/components/KanaGrid.svelte";
  import WordGrid from "$lib/components/WordGrid.svelte";
  import SpanPicker from "$lib/components/SpanPicker.svelte";
  import * as Popover from "$lib/components/ui/popover";
  import * as Tabs from "$lib/components/ui/tabs";
  import { Button } from "$lib/components/ui/button";
  import { Progress as ProgressBar } from "$lib/components/ui/progress";
  import {
    DAKUTEN,
    DAKUTEN_KATAKANA,
    GOJUON,
    GOJUON_KATAKANA,
    type ChartRow,
  } from "$lib/japanese/chart";
  import { page } from "$app/state";
  import { Progress, type AttemptRecord } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import { allowsKanji, hiraganaMastery, katakanaMastery } from "$lib/selection";
  import { EMPTY_STORE, kanaItem, type Item, type ItemStore } from "$lib/srs";
  import {
    NO_TOTALS,
    characterStats,
    dailyScores,
    dayLabel,
    demoProgress,
    scoreOf,
    totalsOf,
    type Totals,
  } from "$lib/stats";

  /** How many attempts the overall figures are drawn from. */
  const ATTEMPT_WINDOW = 500;
  /** Characters listed before the table stops being scannable. */
  const CHARACTERS_SHOWN = 60;
  // Where the basic chart breaks into two columns on a wide screen: after the
  // na row, which leaves six rows beside five and keeps the whole chart within
  // a screen height instead of running eleven rows down a narrow strip.
  const BASIC_SPLIT = 6;

  const progress = new Progress();

  // Raw, not proxied. `$state` deep-proxies every object it is handed and makes
  // a signal for every property read off it. A reader with a few months behind
  // them has thousands of stored objects, every one of which would be wrapped,
  // and then walked again by each derived that reads the store. All of this is
  // replaced wholesale and never edited in place, which is exactly what
  // `$state.raw` is for.
  let store = $state.raw<ItemStore>(EMPTY_STORE);
  let totals = $state.raw<Totals>(NO_TOTALS);
  let score = $state(0);
  let attempts = $state.raw<readonly AttemptRecord[]>([]);
  /** Days of score the chart covers. The reader picks this. */
  let span = $state(30);
  /** The character the reader is looking at up close, if any. */
  let selected = $state.raw<Item | null>(null);
  let isLoaded = $state(false);

  /**
   * Whether to draw an invented reader instead of this one.
   *
   * `?demo` in dev only, for looking at the charts with four months of history
   * behind them. It replaces what is loaded and writes nothing, so the reader's
   * own progress is untouched either way. See stats/demo.ts.
   */
  let isDemo = $derived(import.meta.env.DEV && page.url.searchParams.has("demo"));

  $effect(() => {
    void (async () => {
      if (isDemo) {
        const demo = demoProgress(new Date());
        store = demo.store;
        attempts = demo.attempts;
      } else {
        store = await progress.load();
        attempts = await progress.recentAttempts(ATTEMPT_WINDOW);
      }

      totals = totalsOf(attempts);
      score = scoreOf(store);
      isLoaded = true;
    })();
  });

  let at = $derived(isLoaded ? new Date() : new Date(0));
  let allStats = $derived(isLoaded ? characterStats(store, at) : []);
  let words = $derived(allStats.filter((stat) => stat.item.kind === "kanji"));
  let isKanjiOpen = $derived(isLoaded && allowsKanji(store, at));
  let hiragana = $derived(isLoaded ? hiraganaMastery(store, at) : 0);
  let katakana = $derived(isLoaded ? katakanaMastery(store, at) : 0);

  function percent(value: number): string {
    return `${String(Math.round(value * 100))}%`;
  }

  // The overview is data, not markup: four figures and two bars, each rendered
  // once from a list. Written out longhand they drifted apart a label at a time.
  let figures = $derived([
    { label: m.stats_totals_label_sentences(), value: String(totals.sentences) },
    { label: m.stats_totals_label_characters(), value: String(totals.characters) },
    { label: m.stats_totals_label_speed(), value: String(Math.round(totals.charactersPerMinute)) },
    { label: m.stats_totals_label_accuracy(), value: percent(totals.accuracy) },
  ]);

  /**
   * One point per day, so the line says how the reader is doing over a month
   * rather than how many sentences they happened to read. `dailyScores` holds
   * the last score it knows through a quiet day, and days before the reader
   * started are zero, which is not a gap, it is what was true.
   */
  let series = $derived(isLoaded ? dailyScores(attempts, span, new Date()) : []);
  let chart = $derived(series.map((day) => ({ label: dayLabel(day.date), value: day.value })));

  function inspect(item: Item): void {
    selected = item;
  }

  let scripts = $derived([
    { label: m.stats_scripts_label_hiragana(), mastery: hiragana },
    { label: m.stats_scripts_label_katakana(), mastery: katakana },
  ]);

  const kanaTabs: readonly {
    value: string;
    basic: readonly ChartRow[];
    voiced: readonly ChartRow[];
  }[] = [
    { value: "hiragana", basic: GOJUON, voiced: DAKUTEN },
    { value: "katakana", basic: GOJUON_KATAKANA, voiced: DAKUTEN_KATAKANA },
  ];
</script>

<main class="flex w-full flex-1 flex-col gap-10">
  <div class="flex flex-col gap-2">
    <h1 class="text-3xl leading-tight font-semibold tracking-tight">{m.stats_page_title()}</h1>
    <p class="text-sm text-muted-foreground">{m.stats_page_description()}</p>
  </div>

  {#if isLoaded && totals.sentences === 0}
    <!--
      The most important empty state in the app: someone who has not read
      anything yet. It sends them to the one place that fixes it rather than
      explaining what would have been here. See CLAUDE.md 12.3.
    -->
    <div
      class="flex flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-background p-12 text-center"
    >
      <ChartColumnIcon class="size-6 text-muted-foreground" aria-hidden="true" />
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-medium">{m.stats_empty_title()}</h2>
        <p class="text-sm text-muted-foreground">{m.stats_empty_description()}</p>
      </div>
      <Button href="/">{m.stats_empty_button()}</Button>
    </div>
  {:else}
    <!--
      One block answers "how am I doing", in the order the question is asked:
      how good am I, is that getting better, how much have I done, and where am
      I in each script. The level is the largest thing on the page because it is
      the one number the reader can hold in their head and say out loud.
    -->
    <section class="overflow-hidden rounded-lg border border-border">
      <div class="flex flex-wrap items-start justify-between gap-6 p-6">
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">{m.stats_score_label()}</span>
          <span class="text-5xl leading-none font-semibold tabular-nums">{score}</span>
        </div>

        <SpanPicker
          value={span}
          onChange={(days: number) => {
            span = days;
          }}
        />
      </div>

      <!--
        The score line runs the full width of the card with no padding of its
        own. It is the shape of the reader getting better, so it is drawn as a
        surface rather than as a line on axes: the number is already above it,
        and what is worth reading here is the slope.
      -->
      <DitherArea
        points={chart}
        label={m.stats_score_chart_label()}
        seriesLabel={m.stats_score_label()}
        height={140}
      />

      <dl class="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
        {#each figures as figure (figure.label)}
          <div class="flex flex-col gap-1 bg-card p-6">
            <dt class="text-xs text-muted-foreground">{figure.label}</dt>
            <dd class="text-2xl font-semibold tabular-nums">{figure.value}</dd>
          </div>
        {/each}
      </dl>

      <div class="flex flex-col gap-3 border-t border-border bg-card p-6">
        {#each scripts as script (script.label)}
          <div class="flex items-center gap-4">
            <span class="w-20 text-sm font-medium">{script.label}</span>
            <ProgressBar value={script.mastery * 100} class="flex-1" />
            <span class="w-10 text-right text-sm text-muted-foreground tabular-nums">
              {percent(script.mastery)}
            </span>
          </div>
        {/each}
      </div>
    </section>

    <!--
      The tab labels are the heading. A "Characters" heading above a strip that
      already says Hiragana, Katakana, Words and Slowest would only repeat them.
    -->
    <Tabs.Root value="hiragana">
      <div class="flex items-center justify-between gap-4">
        <Tabs.List>
          <Tabs.Trigger value="hiragana">{m.stats_tab_hiragana()}</Tabs.Trigger>
          <Tabs.Trigger value="katakana">{m.stats_tab_katakana()}</Tabs.Trigger>
          <Tabs.Trigger value="words">{m.stats_tab_words()}</Tabs.Trigger>
        </Tabs.List>

        <!--
          How the charts are filled is worth one read and then never again, so
          it waits behind an icon instead of taking a line above every tab.
          See CLAUDE.md 12.5.
        -->
        <Popover.Root>
          <Popover.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon"
                aria-label={m.stats_grid_legend_label()}
              >
                <InfoIcon class="size-4" />
              </Button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Content class="max-w-[320px] text-sm">
            {m.stats_grid_legend()}
          </Popover.Content>
        </Popover.Root>
      </div>

      <!--
        The charts are pushed to opposite edges rather than sat in equal columns.
        A gojuon chart is a fixed five boxes wide, so equal columns leave a strip
        of nothing on the right of each one. Spread, the slack falls between the
        two groups, where it reads as the gap between basic and voiced.
      -->
      {#each kanaTabs as tab (tab.value)}
        <Tabs.Content value={tab.value} class="pt-4">
          <div class="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div class="flex flex-col gap-3">
              <h3 class="text-sm font-medium">{m.stats_grid_section_basic()}</h3>
              <!--
                The basic chart is five columns wide and eleven rows tall, which
                on a wide screen leaves most of the page empty and pushes its own
                last rows off the bottom. Split in two it sits beside the voiced
                chart in three columns. Stacked, the halves keep the row gap
                exactly, so below xl they read as the single chart they are.
              -->
              <div class="flex flex-col gap-2 xl:flex-row xl:gap-8">
                <KanaGrid
                  rows={tab.basic.slice(0, BASIC_SPLIT)}
                  {store}
                  baselineMs={store.reader.baselineLatencyMs}
                  onSelect={(kana: string) => {
                    inspect(kanaItem(kana));
                  }}
                />
                <KanaGrid
                  rows={tab.basic.slice(BASIC_SPLIT)}
                  {store}
                  baselineMs={store.reader.baselineLatencyMs}
                  onSelect={(kana: string) => {
                    inspect(kanaItem(kana));
                  }}
                />
              </div>
            </div>
            <div class="flex flex-col gap-3">
              <h3 class="text-sm font-medium">{m.stats_grid_section_voiced()}</h3>
              <KanaGrid
                rows={tab.voiced}
                {store}
                baselineMs={store.reader.baselineLatencyMs}
                onSelect={(kana: string) => {
                  inspect(kanaItem(kana));
                }}
              />
            </div>
          </div>
        </Tabs.Content>
      {/each}

      <Tabs.Content value="words" class="flex flex-col gap-4 pt-6">
        {#if words.length === 0}
          <!--
            The tab is always here, empty or not. A reader who wants to know how
            their kanji are going should find an answer, and "not yet, and here
            is why" is an answer. See CLAUDE.md 12.3.
          -->
          <p class="text-sm text-muted-foreground">
            {isKanjiOpen ? m.stats_words_empty_open() : m.stats_words_empty()}
          </p>
        {:else}
          <p class="text-sm text-muted-foreground">{m.stats_words_description()}</p>
          <WordGrid
            words={words.slice(0, CHARACTERS_SHOWN)}
            baselineMs={store.reader.baselineLatencyMs}
            onSelect={inspect}
          />
        {/if}
      </Tabs.Content>
    </Tabs.Root>
  {/if}
</main>

<!--
  One dialog for the whole page: a character is a character whether the reader
  reached it from the chart or from a table.
-->
<CharacterDetail
  item={selected}
  {store}
  onClose={() => {
    selected = null;
  }}
/>
