<script lang="ts">
  import SentenceDisplay from "./SentenceDisplay.svelte";
  import type { DisplayToken } from "$lib/corpus/display";
  import { SvelteSet } from "svelte/reactivity";
  import { m } from "$lib/paraglide/messages";
  import { typedInCurrentSegment, type Segment } from "$lib/romaji";
  import { activity, startAttempt, type Attempt } from "$lib/session";
  import { applyKey, classifyKey, shouldPreventDefault } from "$lib/session/keyboard";

  interface Props {
    /** The sentence to read, already segmented. */
    segments: readonly Segment[];
    /** The same sentence as it should appear on screen. */
    tokens: readonly DisplayToken[];
    /** Called with the attempt and the written words the reader looked up. */
    onFinished?: (attempt: Attempt, revealed: ReadonlySet<number>) => void;
  }

  let { segments, tokens, onFinished }: Props = $props();

  // Wrong keys against the current segment before the accepted spellings appear.
  // Two is enough to tell a slip from not knowing how to spell the mora.
  const ERRORS_BEFORE_HINT = 2;
  const HINTS_SHOWN = 3;

  // Raw: an attempt carries a timing per segment and is replaced on every
  // keystroke. Proxying it would put allocation on the one path that cannot
  // afford any. See CLAUDE.md 1.8.
  let attempt = $state.raw<Attempt>(startAttempt([], 0));
  let hasStarted = $state(false);
  // Written words the reader asked the reading for. They are not measurements
  // any more, so the caller drops them rather than grading a lookup as a read.
  const revealed = new SvelteSet<number>();

  // A new sentence is a new attempt, including the first one. This runs before
  // the DOM updates, so the reader never sees a frame of the old sentence
  // against the new attempt. The clock starts on the first key, not here, so a
  // reader who looks away before starting is not charged for it.
  $effect.pre(() => {
    attempt = startAttempt(segments, performance.now());
    hasStarted = false;
    revealed.clear();
  });

  let typed = $derived(typedInCurrentSegment(attempt.typing));
  // Red for as long as a wrong key is on screen, not just for the frame after
  // it was pressed: the reader has to delete it, and should be able to see why.
  let hasError = $derived(attempt.stray !== "");
  let current = $derived(segments[attempt.typing.settled]);
  let hints = $derived(
    attempt.pendingErrors >= ERRORS_BEFORE_HINT
      ? (current?.spellings.slice(0, HINTS_SHOWN) ?? [])
      : [],
  );

  /** The word on screen right now, if it is written rather than read out. */
  let currentWritten = $derived(
    tokens.find(
      (token) =>
        token.isWritten &&
        attempt.typing.settled >= token.from &&
        attempt.typing.settled < token.to,
    ),
  );

  function reveal(segment: number) {
    revealed.add(segment);
  }

  function handleKeydown(event: KeyboardEvent) {
    // Timestamp first, before any other work in this handler. See CLAUDE.md 1.8.
    const at = performance.now();
    if (attempt.finishedAt !== null) return;

    // Up, because the reading appears above the word. It is not a character, so
    // it cannot collide with typing, and it leaves Tab alone for navigation.
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (currentWritten !== undefined) reveal(currentWritten.from);
      return;
    }

    const action = classifyKey(event);
    if (!shouldPreventDefault(action)) return;
    event.preventDefault();

    if (action.kind === "type") hasStarted = true;

    const outcome = applyKey(attempt, action, at);
    attempt = outcome.attempt;

    // After the timestamp, after the key is matched and after the state the
    // reader can see is updated. Nothing decorative sits between a key being
    // pressed and that key being measured. See CLAUDE.md 1.8.
    if (action.kind === "type") activity.record(!outcome.wasRejected);

    if (attempt.finishedAt !== null) onFinished?.(attempt, revealed);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex flex-col gap-6">
  <SentenceDisplay
    {tokens}
    settled={attempt.typing.settled}
    {hasError}
    typedBySegment={attempt.typedBySegment}
    typing={typed}
    stray={attempt.stray}
    {revealed}
    onReveal={reveal}
  />

  <!-- Height is reserved so the line appearing never moves the sentence. -->
  <div class="flex min-h-6 items-baseline gap-4">
    <!-- What was typed now sits under each character; this only invites a start. -->
    {#if !hasStarted}
      <span class="text-sm text-muted-foreground">{m.session_typing_status_ready()}</span>
    {/if}

    {#if hints.length > 0}
      <span class="text-sm text-muted-foreground">
        {m.session_typing_hint_label()}
        <span class="font-mono">{hints.join(" / ")}</span>
      </span>
    {/if}

    <!--
      The way out appears alongside the spellings, at the point the reader is
      stuck. Offering it before they need it is noise on the one screen that
      cannot afford any.
    -->
    {#if currentWritten !== undefined && !revealed.has(currentWritten.from)}
      <span class="text-xs text-muted-foreground">{m.session_typing_hint_reading()}</span>
    {/if}

    {#if hints.length > 0}
      <span class="ml-auto text-xs text-muted-foreground">{m.session_typing_hint_skip()}</span>
    {/if}
  </div>
</div>
