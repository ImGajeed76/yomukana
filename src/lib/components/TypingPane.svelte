<script lang="ts">
  import SentenceDisplay from "./SentenceDisplay.svelte";
  import { Button } from "$lib/components/ui/button";
  import type { DisplayToken } from "$lib/corpus/display";
  import { SvelteSet } from "svelte/reactivity";
  import { m } from "$lib/paraglide/messages";
  import { typedInCurrentSegment, type Segment } from "$lib/romaji";
  import { activity, startAttempt, type Attempt } from "$lib/session";
  import { fieldChange } from "$lib/session/field";
  import {
    applyKey,
    classifyKey,
    shouldPreventDefault,
    type KeyAction,
  } from "$lib/session/keyboard";
  import type { InputMethod } from "$lib/srs";

  interface Props {
    /** The sentence to read, already segmented. */
    segments: readonly Segment[];
    /** The same sentence as it should appear on screen. */
    tokens: readonly DisplayToken[];
    /**
     * Counts sentences shown. A new value is a new attempt, even when the
     * selector picked the same sentence again.
     */
    round: number;
    /** Called with the attempt and the written words the reader looked up. */
    onFinished?: (attempt: Attempt, revealed: ReadonlySet<number>) => void;
    /** Leaves the sentence without scoring it. */
    onSkip?: () => void;
    /**
     * Whether something is open over the sentence. Keys then belong to that,
     * not to the exercise. The clock starts on the first key the exercise
     * takes, so time spent on whatever was open is never counted as reading.
     */
    isPaused?: boolean;
  }

  let { segments, tokens, round, onFinished, onSkip, isPaused = false }: Props = $props();

  // Wrong keys against the current segment before the accepted spellings appear.
  // Two is enough to tell a slip from not knowing how to spell the mora.
  const ERRORS_BEFORE_HINT = 2;
  const HINTS_SHOWN = 3;

  /**
   * What the phone keyboard's field holds when nothing has been typed into it.
   *
   * Never empty: a phone keyboard's backspace does nothing in an empty field,
   * so there has to be something there for it to delete, and its disappearing
   * is how a backspace is seen.
   */
  const RESTING = " ";

  // Raw: an attempt carries a timing per segment and is replaced on every
  // keystroke. Proxying it would put allocation on the one path that cannot
  // afford any. See CLAUDE.md 1.8.
  let attempt = $state.raw<Attempt>(startAttempt([], 0));
  let hasStarted = $state(false);
  // Written words the reader asked the reading for. They are not measurements
  // any more, so the caller drops them rather than grading a lookup as a read.
  const revealed = new SvelteSet<number>();

  /**
   * Whether this is a phone or a tablet read by touch.
   *
   * Decided by the screen, not by which event a key arrived on. Safari's own
   * keyboard sends proper keydowns, so going by the event would grade an
   * iPhone reader against their keyboard baseline.
   */
  let isTouch = $state(false);
  let field = $state<HTMLInputElement | null>(null);
  let isFieldFocused = $state(false);
  /** What the field held after the last change that was read. */
  let fieldWas = RESTING;

  let method = $derived<InputMethod>(isTouch ? "touch" : "keyboard");

  $effect(() => {
    const query = window.matchMedia("(hover: none) and (pointer: coarse)");
    isTouch = query.matches;
    const update = () => {
      isTouch = query.matches;
    };
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
    };
  });

  // A new sentence is a new attempt, including the first one. This runs before
  // the DOM updates, so the reader never sees a frame of the old sentence
  // against the new attempt. The clock starts on the first key, not here, so a
  // reader who looks away before starting is not charged for it.
  //
  // Reset here rather than by rebuilding the pane for each sentence. Rebuilding
  // would destroy the phone keyboard's field and snap the keyboard shut between
  // every sentence.
  $effect.pre(() => {
    // Read only so that a new round re-runs this, even for the same sentence.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- see above
    round;
    attempt = startAttempt(segments, performance.now());
    hasStarted = false;
    revealed.clear();
    resetField();
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

  /** One key, from either keyboard, into the attempt. */
  function apply(action: KeyAction, at: number) {
    if (action.kind === "type") hasStarted = true;

    const outcome = applyKey(attempt, action, at, method);
    attempt = outcome.attempt;

    // After the timestamp, after the key is matched and after the state the
    // reader can see is updated. Nothing decorative sits between a key being
    // pressed and that key being measured. See CLAUDE.md 1.9.
    if (action.kind === "type") activity.record(!outcome.wasRejected);

    if (attempt.finishedAt !== null) onFinished?.(attempt, revealed);
  }

  function handleKeydown(event: KeyboardEvent) {
    // Timestamp first, before any other work in this handler. See CLAUDE.md 1.9.
    const at = performance.now();
    if (attempt.finishedAt !== null || isPaused) return;

    // Up, because the reading appears above the word. It is not a character, so
    // it cannot collide with typing, and it leaves Tab alone for navigation.
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (currentWritten !== undefined) reveal(currentWritten.from);
      return;
    }

    // A key this can read is taken here and kept out of the field, so the field
    // only ever sees what a composing phone keyboard sends as "Unidentified".
    // That keeps the two paths from counting one key twice.
    const action = classifyKey(event);
    if (!shouldPreventDefault(action)) return;
    event.preventDefault();

    apply(action, at);
  }

  /** Reads whatever a phone keyboard just did to the field. */
  function handleInput() {
    const at = performance.now();
    const element = field;
    if (element === null) return;

    const change = fieldChange(fieldWas, element.value);
    fieldWas = element.value;

    if (attempt.finishedAt === null) {
      for (let count = 0; count < change.deleted; count++) apply({ kind: "backspace" }, at);
      for (const key of change.inserted) {
        const action = classifyKey({ key, ctrlKey: false, metaKey: false, altKey: false });
        if (action.kind === "type") apply(action, at);
      }
    }

    // Emptied, or backspaced past the resting value: put it back, or the next
    // backspace has nothing to delete and is lost.
    if (!element.value.startsWith(RESTING)) resetField();
  }

  /**
   * Puts the field back to resting.
   *
   * Only between words, never in the middle of one a composing keyboard is
   * still building: pulling the text out from under it makes it retype the
   * whole word, and every letter would arrive twice.
   */
  function resetField() {
    fieldWas = RESTING;
    if (field !== null) field.value = RESTING;
  }

  function focusField() {
    field?.focus();
  }

  /** Keeps a tap on a button from taking focus away and closing the keyboard. */
  function keepKeyboard(event: PointerEvent) {
    if (isTouch) event.preventDefault();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!--
  On a phone the whole pane is the place to tap to bring the keyboard back:
  there is no one obvious control to aim at, and a reader who has dismissed the
  keyboard wants it back with the least thought.
-->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="flex flex-col gap-6" onclick={isTouch ? focusField : undefined}>
  {#if isTouch}
    <!--
      The field a phone keyboard types into. Invisible and pinned to the top of
      the screen, so focusing it never scrolls the page to bring it into view.
      Sixteen pixels, because iOS zooms the whole page into any smaller field.
    -->
    <input
      bind:this={field}
      class="capture"
      type="text"
      value={RESTING}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      enterkeyhint="next"
      aria-label={m.session_typing_field_label()}
      oninput={handleInput}
      oncompositionend={resetField}
      onfocus={() => {
        isFieldFocused = true;
      }}
      onblur={() => {
        isFieldFocused = false;
      }}
    />
  {/if}

  <SentenceDisplay
    {tokens}
    settled={attempt.typing.settled}
    {hasError}
    typedBySegment={attempt.typedBySegment}
    typing={typed}
    stray={attempt.stray}
    {revealed}
    onReveal={reveal}
    onPointerDown={keepKeyboard}
  />

  <!-- Height is reserved so the line appearing never moves the sentence. -->
  <div class="flex min-h-6 flex-wrap items-baseline gap-x-4 gap-y-2">
    <!-- What was typed sits under each character; this only invites a start. -->
    {#if !hasStarted}
      <span class="text-sm text-muted-foreground">
        {isTouch && !isFieldFocused
          ? m.session_typing_status_tap()
          : m.session_typing_status_ready()}
      </span>
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
      <span class="text-xs text-muted-foreground">
        {isTouch ? m.session_typing_hint_reading_touch() : m.session_typing_hint_reading()}
      </span>
    {/if}

    <!--
      A phone keyboard has no Escape, so on touch the way out is a button, and
      it is always there: a reader on a train who cannot read a sentence should
      not have to get stuck on it twice before being offered a way past.
    -->
    {#if isTouch}
      <Button
        variant="ghost"
        size="sm"
        class="ml-auto"
        onpointerdown={keepKeyboard}
        onclick={() => {
          onSkip?.();
        }}
      >
        {m.session_typing_button_skip()}
      </Button>
    {:else if hints.length > 0}
      <span class="ml-auto text-xs text-muted-foreground">{m.session_typing_hint_skip()}</span>
    {/if}
  </div>
</div>

<style>
  .capture {
    position: fixed;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;
    font-size: 16px;
    opacity: 0;
    pointer-events: none;
  }
</style>
