<script lang="ts">
  import SentenceDisplay from "./SentenceDisplay.svelte";
  import { Button } from "$lib/components/ui/button";
  import type { DisplayToken } from "$lib/corpus/display";
  import { SvelteSet } from "svelte/reactivity";
  import { m } from "$lib/paraglide/messages";
  import { typedInCurrentSegment, type Segment } from "$lib/romaji";
  import { activity, startAttempt, type Attempt } from "$lib/session";
  import { isSpellableKana, keysForCharacter } from "$lib/romaji/kana-keys";
  import { fieldChange, readFieldChange } from "$lib/session/field";
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
  /**
   * How many keys each character in the field stands for. One per letter from
   * a romaji keyboard, more for kana from a Japanese one, so deleting ね takes
   * back both of its keys. The resting space stands for none.
   */
  let fieldKeyCounts: readonly number[] = [0];
  /**
   * The same for the desktop path: how many keys each key press stood for, so
   * a backspace after a kana typed in a Japanese keyboard's kana mode takes it
   * back whole. A plain letter is one, as it always was.
   */
  let pressGroups: number[] = [];
  /**
   * Whether a Japanese keyboard is composing in the field. While it is, the
   * field and its keys belong to the keyboard: changing the value under it, or
   * cancelling one of its keys, breaks or doubles what it is writing.
   */
  let isComposing = false;

  /**
   * The last events a keyboard sent, shown with `?debug` in the address. For
   * working out what a phone keyboard actually does, which no documentation
   * says reliably. Kept in the page, never sent anywhere.
   */
  let debugLog = $state.raw<readonly string[]>([]);
  let isDebugging = $state(false);

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
    pressGroups = [];
    revealed.clear();
    // A sentence can end on a kana the keyboard is still composing. The field
    // is left to it, and what is in there stops counting towards this sentence.
    // It is reset when the keyboard finishes. See finishComposing.
    if (isComposing) fieldKeyCounts = fieldKeyCounts.map(() => 0);
    else resetField();
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
  /**
   * Applies one key. `from` is the input it came through, which the first key
   * of a sentence decides for the whole sentence: the device's own method, or
   * `kana` when the key arrived as kana from a Japanese keyboard.
   */
  function apply(action: KeyAction, at: number, from: InputMethod = method) {
    if (action.kind === "type") hasStarted = true;

    const outcome = applyKey(attempt, action, at, from);
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
    // A key a Japanese keyboard is composing with belongs to it. It reaches the
    // exercise through the field. Safari marks some of these only with the
    // old key code 229, and says isComposing is false for them.
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- the only signal Safari gives
    if (event.isComposing || event.keyCode === 229) return;

    // Up, because the reading appears above the word. It is not a character, so
    // it cannot collide with typing, and it leaves Tab alone for navigation.
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (currentWritten !== undefined) reveal(currentWritten.from);
      return;
    }

    // A Japanese keyboard in kana mode sends the kana itself as the key. It is
    // read as the keys that spell it. See kana-keys.ts.
    if (isSpellableKana(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const keys = keysForCharacter(event.key) ?? "";
      for (const key of keys) apply({ kind: "type", key }, at, "kana");
      pressGroups.push(keys.length);
      return;
    }

    // A key this can read is taken here and kept out of the field, so the field
    // only ever sees what a composing phone keyboard sends as "Unidentified".
    // That keeps the two paths from counting one key twice.
    const action = classifyKey(event);
    if (!shouldPreventDefault(action)) return;
    event.preventDefault();

    if (action.kind === "backspace") {
      const group = pressGroups.pop() ?? 1;
      for (let count = 0; count < group; count++) apply(action, at);
      return;
    }
    if (action.kind === "type") pressGroups.push(1);
    apply(action, at);
  }

  /** Reads whatever a phone keyboard just did to the field. */
  function handleInput() {
    const at = performance.now();
    const element = field;
    if (element === null) return;

    const change = fieldChange(fieldWas, element.value);
    const reading = readFieldChange(fieldKeyCounts, change, keysForCharacter);
    const from: InputMethod = change.inserted.some(isSpellableKana) ? "kana" : method;
    fieldWas = element.value;
    fieldKeyCounts = reading.keyCounts;

    if (attempt.finishedAt === null) {
      for (let count = 0; count < reading.backspaces; count++) apply({ kind: "backspace" }, at);
      for (const key of reading.keys) apply({ kind: "type", key }, at, from);
    }

    // Emptied, or backspaced past the resting value: put it back, or the next
    // backspace has nothing to delete and is lost. Not while composing.
    if (!element.value.startsWith(RESTING) && !isComposing) resetField();
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
    fieldKeyCounts = [0];
    if (field !== null) field.value = RESTING;
  }

  function startComposing() {
    isComposing = true;
  }

  /**
   * The keyboard finished a word. The field is reset after it has let go, on
   * the next turn, not inside its own event: Safari is still finishing the
   * word when this fires, and a value changed now can come back doubled.
   */
  function finishComposing() {
    isComposing = false;
    setTimeout(() => {
      if (!isComposing) resetField();
    }, 0);
  }

  // Only with `?debug`: every keyboard event, newest first. Listeners of its
  // own, so the key and input handlers above carry no debugging code at all.
  $effect(() => {
    isDebugging = new URLSearchParams(location.search).has("debug");
    const element = field;
    if (!isDebugging || element === null) return;

    const log = (line: string): void => {
      debugLog = [line, ...debugLog].slice(0, 16);
    };
    const onKey = (event: KeyboardEvent): void => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- logged because Safari relies on it
      const code = event.keyCode;
      log(
        `keydown ${JSON.stringify(event.key)} code=${String(code)} composing=${String(event.isComposing)}`,
      );
    };
    const onBefore = (event: Event): void => {
      const input = event as InputEvent;
      log(`beforeinput ${input.inputType} ${JSON.stringify(input.data)}`);
    };
    const onComposition = (event: CompositionEvent): void => {
      log(`${event.type} ${JSON.stringify(event.data)}`);
    };
    const onInput = (): void => {
      log(`input value=${JSON.stringify(element.value)}`);
    };
    window.addEventListener("keydown", onKey, true);
    element.addEventListener("beforeinput", onBefore);
    element.addEventListener("compositionstart", onComposition);
    element.addEventListener("compositionupdate", onComposition);
    element.addEventListener("compositionend", onComposition);
    element.addEventListener("input", onInput);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      element.removeEventListener("beforeinput", onBefore);
      element.removeEventListener("compositionstart", onComposition);
      element.removeEventListener("compositionupdate", onComposition);
      element.removeEventListener("compositionend", onComposition);
      element.removeEventListener("input", onInput);
    };
  });

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
      oncompositionstart={startComposing}
      oncompositionend={finishComposing}
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

  <!-- Only with ?debug: what the keyboard sent, newest first. Not translated,
       because it is for working out a bug, not for reading. -->
  {#if isDebugging}
    <pre class="max-h-64 overflow-auto rounded-md border border-border p-2 text-xs">{debugLog.join(
        "\n",
      )}</pre>
  {/if}
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
