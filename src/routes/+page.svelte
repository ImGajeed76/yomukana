<script lang="ts">
  import TypingPane from "$lib/components/TypingPane.svelte";
  import WelcomeDialog from "$lib/components/WelcomeDialog.svelte";
  import { Button } from "$lib/components/ui/button";
  import { m } from "$lib/paraglide/messages";
  import { Practice } from "$lib/session/practice.svelte";
  import type { Attempt } from "$lib/session";

  const practice = new Practice();

  // IndexedDB only exists in the browser, so the prerendered page starts from an
  // empty model and the reader's own history replaces it on hydration.
  $effect(() => {
    void practice.load();
  });

  /** Where the first-visit welcome remembers it was closed. */
  const WELCOMED_KEY = "yomukana:welcomed";

  let isWelcoming = $state(false);

  /**
   * Whether the welcome has been closed in this browser before.
   *
   * localStorage, not IndexedDB: this is a convenience for one browser, not
   * progress, and losing it only means seeing three lines once more. It
   * throws in some private windows and with blocked site data, which cannot
   * be prevented, and then the answer is simply "no".
   */
  function hasBeenWelcomed(): boolean {
    try {
      return localStorage.getItem(WELCOMED_KEY) !== null;
    } catch {
      return false;
    }
  }

  function rememberWelcome(): void {
    try {
      localStorage.setItem(WELCOMED_KEY, "1");
    } catch {
      // Same failure as above. The welcome may show again, which is harmless.
    }
  }

  // A reader with no history in this browser, who has not closed it before.
  // Someone signing in on a new device already knows the page, and brings
  // their history with them on the first sync.
  // Remembered as soon as it shows, not when it closes: it has been seen, and
  // a reload with it still open should not show it again.
  $effect(() => {
    if (!practice.isLoaded || !practice.isNewReader || hasBeenWelcomed()) return;
    rememberWelcome();
    isWelcoming = true;
  });

  function isFromDialog(event: KeyboardEvent): boolean {
    return event.target instanceof Element && event.target.closest('[role="dialog"]') !== null;
  }

  function finish(attempt: Attempt, revealed: ReadonlySet<number>) {
    void practice.finish(attempt, revealed);
  }

  function handleKeydown(event: KeyboardEvent) {
    // A key pressed inside a dialog belongs to it. Checked by where the key
    // came from, not by whether the dialog is still open: the dialog closes on
    // this same Escape before it reaches here, and would read as a skip.
    if (isWelcoming || isFromDialog(event)) return;
    if (practice.summary !== null) {
      if (event.key === "Enter") practice.next();
      return;
    }
    // Escape is the way out of a sentence the reader cannot read. The typing
    // pane ignores it, so it reaches here untouched.
    if (event.key === "Escape") practice.skip();
  }

  function percent(value: number): string {
    return `${String(Math.round(value * 100))}%`;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<WelcomeDialog bind:open={isWelcoming} />

<!--
  This screen has one job and one thing on it. The sentence sits on the optical
  centre line of the space between the two rules, where the eye lands without
  being sent there, and nothing above it competes for that landing. Everything
  else here either arrives after the sentence is finished or is a warning the
  reader has to see.
-->
<!--
  On a phone the keyboard takes the bottom half of the screen, so the sentence
  sits at the top where it stays visible above it, not on a centre line the
  keyboard would cover. See CLAUDE.md 11.
-->
<main class="flex w-full flex-1 flex-col md:justify-center">
  <div class="mx-auto flex w-full max-w-[896px] flex-col gap-8">
    {#if practice.current}
      <!--
        Not rebuilt per sentence. It resets on the round instead, because
        rebuilding it would take the phone keyboard's field with it and close
        the keyboard between every sentence.
      -->
      <TypingPane
        segments={practice.current.segments}
        tokens={practice.current.tokens}
        round={practice.round}
        isPaused={isWelcoming}
        onFinished={finish}
        onSkip={() => {
          practice.skip();
        }}
      />

      <!--
        Said once, plainly, where it matters: a reader in a private window should
        know their session will not be there tomorrow before they spend an hour on
        it. See CLAUDE.md 1.7.
      -->
      {#if practice.isLoaded && !practice.isPersistent}
        <p class="text-sm text-destructive">{m.session_typing_warning_unsaved()}</p>
      {/if}

      <!--
        Said out loud rather than left to be guessed at. Without it a failed
        download just looks like an app that only has six sentences in it.
      -->
      {#if practice.hasCorpusFailed}
        <p class="text-sm text-destructive">{m.session_typing_error_corpus()}</p>
      {/if}

      <!--
        The summary appears below the sentence the reader just finished rather than
        replacing it, so their eye does not have to go looking for it.
      -->
      <!--
        The summary is always here, holding its own space, and only becomes
        visible once the sentence is finished. Appearing from nothing would push
        the sentence up the screen at the exact moment the reader's eye is still
        on it, and the sentence is the one thing on this page that must not move.
        See CLAUDE.md 16.

        The meaning is in the reserved copy too, held to two lines. Otherwise the
        block would be a different height for every sentence and the stage would
        settle somewhere new each time, which is the same problem one sentence
        later. Two lines covers almost every translation in the corpus, and the
        few that run longer lose their tail rather than moving the sentence.

        Invisible rather than absent, which also keeps it out of the
        accessibility tree and the button out of the tab order.
      -->
      {@const summary = practice.summary}
      <div
        class="flex flex-col gap-6 border-t border-border pt-8"
        class:invisible={summary === null}
        aria-hidden={summary === null}
      >
        <p class="line-clamp-2 min-h-12 text-base leading-normal text-muted-foreground">
          {practice.current.meaning}
        </p>

        <div class="flex flex-wrap items-end justify-between gap-6">
          <dl class="flex gap-10">
            <div class="flex flex-col gap-1">
              <dt class="text-xs text-muted-foreground">{m.session_summary_label_speed()}</dt>
              <dd class="text-2xl font-semibold tabular-nums">
                {Math.round(summary?.segmentsPerMinute ?? 0)}
              </dd>
            </div>
            <div class="flex flex-col gap-1">
              <dt class="text-xs text-muted-foreground">{m.session_summary_label_accuracy()}</dt>
              <dd class="text-2xl font-semibold tabular-nums">{percent(summary?.accuracy ?? 0)}</dd>
            </div>
            <div class="flex flex-col gap-1">
              <dt class="text-xs text-muted-foreground">{m.session_summary_label_errors()}</dt>
              <dd class="text-2xl font-semibold tabular-nums">{summary?.errors ?? 0}</dd>
            </div>
          </dl>

          <div class="flex items-center gap-3">
            <span class="text-xs text-muted-foreground">{m.session_summary_hint_enter()}</span>
            <Button
              onclick={() => {
                practice.next();
              }}>{m.session_summary_button_next()}</Button
            >
          </div>
        </div>
      </div>
    {:else}
      <!-- The first chunk is a download, and a blank stage looks broken. -->
      <p class="text-sm text-muted-foreground">{m.session_typing_status_loading()}</p>
    {/if}
  </div>
</main>
