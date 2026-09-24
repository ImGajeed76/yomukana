# CLAUDE.md

This file is auto-loaded context for Claude. Follow these guidelines when writing frontend code, reviewing UI, or making design decisions.

---

## 0. Project

yomukana teaches reading Japanese by typing it. The reader sees a Japanese sentence and types its romaji as fast as they can, like a typing test. Every keystroke is timed, so the app learns how quickly the reader recognises each individual kana and each kanji reading, and picks the next sentence from that.

The name is 読む + かな, "read kana". It also reads as 読むかな, "shall I read?"

Core ideas:

- **Reading speed is the measurement.** Time-to-first-correct-keystroke on a token is recognition time. Everything after that is motor speed. The two must be separated, or a slow typist looks like a poor reader.
- **Per-character memory model.** Every kana, and every kanji-plus-reading pair, is its own scheduled item. FSRS holds the long-term model; the grade for each review is derived from latency and errors, not from a self-report button.
- **Sentences, not flashcards.** A sentence is picked because it contains a small number of items that are due or weak, surrounded by items the reader already knows. Reading in context is the skill being trained, so a sentence should never be uniformly hard.
- **Script gating.** Kanji are rendered as kana until the reader's kana knowledge passes a threshold, then revealed gradually. Katakana is withheld until hiragana is solid. The corpus carries a kana rendering of every sentence, so this is a display choice, not a separate dataset.
- **Fast promotion.** When the reader is clearly beyond the current difficulty band, the selector should notice within a handful of sentences and move them up, not grind through material they have already mastered.

Design goals:

- **Local-first.** All progress lives in the reader's browser (IndexedDB), and that copy is the source of truth. The site is static, hosted on Vercel at yomukana.oseifert.ch. There is no app server.
- **Sync is opt-in.** A reader who signs in (email and password, Neon Auth) gets a copy in Neon Postgres, Frankfurt, read and written from the browser through the Neon Data API. Row-level security keys every row to the token's user, so the browser only ever holds a short-lived token, never a connection string. A reader who never signs in never loads the sync code and never contacts Neon. Two Neon branches: `production` backs the live site, `dev` backs `bun run dev` and every test, so testing never touches a real reader. `.env.local` holds `dev`, `.env.production.local` holds `production`, and Vercel's environment variables name `production` for the live build. Schema and migrations are Drizzle, dev-time only, under `drizzle/`: `bun run db:generate`, then `bun run db:migrate` (dev), and only once that works, `bun run db:migrate:production`. Merge rules live in `src/lib/sync/merge.ts` and are mirrored by triggers in `drizzle/migrations/0001_merge_rules.sql`: newest review wins per item, attempts are append-only.
- **Friends board, for signed-in readers.** Every signed-in reader gets a profile with a random username (changeable in settings) and their score, sent with each sync. A profile is readable by its owner and by anyone who added them, and by no one else. People are found only by exact username through `find_profile`, so there is no list of everyone to browse. Adding is one-way, like following. There is no global leaderboard: the score is worked out on the device, so the server cannot vouch for it, and between friends that does not matter. Ranking rules live in `src/lib/sync/board.ts`.
- **One exception, made deliberately.** Plausible counts page views. It is cookieless, stores no personal data and builds no cross-site profile, and it never sees a sentence, a keystroke or a score. Apart from opt-in sync, nothing else leaves the browser, and nothing about a reader's progress is ever sent anywhere they did not choose.
- **Two inputs, one exercise.** A physical keyboard is read through `keydown`; a phone keyboard through `input` events on a focused field, because phone keyboards compose text and report most keydowns as `"Unidentified"`. The reader model keeps a baseline and a motor floor per input, so grading and the score are fair on both. See `InputMethod` in `src/lib/srs/grade.ts`.
- **Installable, and works offline.** A manifest and icons (`static/manifest.webmanifest`, `static/icons/`, rebuilt from the favicon with `bun run icons`) make it installable. The service worker in `src/service-worker/` caches the app when it installs and each corpus band the first time it is read, with the starting bands kept at install, so practice works with no signal and sync catches up later. It never touches other origins. A new deploy takes over only once every tab on the old one is closed. Settings offers to install where the browser can: its own dialog on Chromium, the Share steps on iPhone and iPad, nothing elsewhere. No prompt on first open.
- **Keystrokes must stay fast.** A typing trainer that stutters measures the stutter instead of the reader. Keystroke handling must stay off the critical path of anything expensive: no layout thrash per keystroke, no synchronous IndexedDB writes mid-sentence, no re-render of the whole sentence to advance one character.
- **The corpus is precomputed.** Readings, difficulty bands and token alignment are resolved offline by `scripts/corpus/` and shipped as static, difficulty-chunked assets under `static/corpus/`. Nothing morphologically analyses Japanese at runtime. Rebuild with `bun run corpus:build`.

Stack & conventions:

- **Package manager:** Always use `bun` (not npm, pnpm, or yarn)
- **Framework:** SvelteKit with Svelte 5 (runes mode: `$state`, `$derived`, `$props`). Runes are forced on for all non-`node_modules` files via `vite.config.ts`.
- **Adapter:** `@sveltejs/adapter-static`. The whole app prerenders. Adding a server route is a decision to revisit, not a default.
- **Styling:** Tailwind CSS 4 (plus `@tailwindcss/forms` and `@tailwindcss/typography`). Theme CSS lives in `src/routes/layout.css`.
- **Components:** shadcn-svelte (style: `luma`, baseColor: `taupe`, green primary) under `src/lib/components/ui/`. Domain components live under `src/lib/components/`. The theme came from a preset: re-running init means `bunx shadcn-svelte@latest init --preset b3ZhNWb9pA`, because without that code the CLI prompts and silently rewrites every token.
- **Fonts:** Geist for UI, Geist Mono for romaji input, Noto Sans JP for Japanese text (`--font-japanese`, utility `font-japanese`). All self-hosted via `@fontsource`, never fetched from a CDN at runtime.
- **Icons:** Lucide (`@lucide/svelte`)
- **i18n:** ParaglideJS (`@inlang/paraglide-js`). Base locale: `en`. Additional locale: `de`. Source messages live in `messages/{locale}.json`; every key must exist in every locale (`bun run check:messages` enforces sync). Generated runtime lives in `src/lib/paraglide/` (do not edit by hand). Never hardcode user-facing strings. Japanese sentence content is data, not UI copy, and does not go through i18n.
- **Corpus:** Sentences come from the Tatoeba Project under CC BY 2.0 FR, readings from kuromoji with IPADic, corrected against the Tatoeba Japanese indices where a human checked them. The attribution is a licence condition and stays visible on every page.
- **Scheduling:** FSRS via `ts-fsrs`, wrapped in `src/lib/srs/schedule.ts`. Nothing outside that file knows what a card is. Grades come from latency and errors, never from a self-report button.
- **Score:** one unbounded number the reader can compare with someone else, in `src/lib/stats/score.ts`. One number, no levels: a level needs boundaries and a score that climbs forever has none. It is a sum over everything they know, each item weighted by the chance they would recall it right now and by how fast they read it. So it measures what they can read today and falls when they stop. Pace is reading time, recognition latency minus the reader's own motor floor for the input they used, so typing speed and phone versus keyboard do not move it. It is snapshotted into each attempt record, because item state says what is true today and the past cannot be recomputed from it.
- **Charts and texture:** ordered (Bayer) dithering, in `src/lib/charts/`. The thresholds are ported from [dither-kit](https://tripwire.sh/dither-kit) (MIT), which ships as React components this app cannot use. One colour at varying alpha, never a second shade, so the texture survives a theme flip. A dithered falloff is how this codebase draws a gradient, which is the exception to the no-gradients rule in 8.5: it is one flat colour, scattered.
- **Storage:** IndexedDB via `idb`. Schema and migrations live in `src/lib/db/`. Treat the reader's progress as irreplaceable: migrations are forward-only and must never drop review history. Not SQLite: the data is three small stores and an append-only log with no joins, and a megabyte of wasm on first load is the wrong trade for an app whose whole promise is that keystrokes never stutter.
- **Punctuation:** Never use em dashes or double hyphens. Use commas, periods, or restructure the sentence instead. Enforced by `bun run check:dashes`.
- **Linting:** Never trust inline IDE diagnostics/squiggles. Always verify by running `bun run check`, which runs Prettier, ESLint, the guard scripts, and svelte-check.
- **Test runner:** `bun test` (built-in, no extra dependency). Co-locate `*.test.ts` files next to the source they cover.
- **Formatting:** Run `bun run format` to auto-format all files before committing.
- **Commits:** Always use [Conventional Commits](https://www.conventionalcommits.org/) (`feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`).

---

## Table of Contents

1. [Philosophy](#1-philosophy)
2. [Domain Vocabulary](#2-domain-vocabulary)
3. [Architecture](#3-architecture)
4. [Tooling & Libraries](#4-tooling--libraries)
5. [Code Quality](#5-code-quality)
6. [Spacing System](#6-spacing-system)
7. [Typography](#7-typography)
8. [Colors & Theme](#8-colors--theme)
9. [Components](#9-components)
10. [Animation & Motion](#10-animation--motion)
11. [Responsive Design](#11-responsive-design)
12. [UX Patterns](#12-ux-patterns)
13. [Interaction & States](#13-interaction--states)
14. [Accessibility](#14-accessibility)
15. [CSS Practices](#15-css-practices)
16. [Anti-Patterns](#16-anti-patterns)

---

## Severity Ratings

Each rule is rated by importance:

| Rating     | Label        | Meaning                                              |
| ---------- | ------------ | ---------------------------------------------------- |
| **\[5/5]** | Critical     | Breaking this creates serious UX problems. Must fix. |
| **\[4/5]** | Important    | Should follow unless there's a strong reason not to. |
| **\[3/5]** | Recommended  | Good practice, some flexibility allowed.             |
| **\[2/5]** | Nice-to-have | Implement when time allows.                          |
| **\[1/5]** | Optional     | Edge cases, special situations only.                 |

---

## 1. Philosophy

### 1.1 Every Element Earns Its Place \[5/5]

Every UI element must serve a clear purpose. If an element can be removed without losing functionality or clarity, remove it.

This is sharpest on the typing screen. The reader is looking at one sentence and typing. Anything else on that screen competes for the attention the exercise needs.

**Before adding any element, ask:**

- Does this help the user complete their task?
- Is this information necessary right now?
- Can this be combined with something else?
- Would the interface work without this?

**Remove:**

- Decorative dividers that don't separate meaningful sections
- Labels that repeat what's already obvious
- Icons that don't add meaning beyond the text
- "Helper" text that states the obvious
- Unnecessary borders and backgrounds
- Empty states that just say "empty"

### 1.2 Think Before You Build \[5/5]

Before writing any UI code, understand the context:

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: What feeling should the UI convey? (productive, calm, playful, serious)
- **Constraints**: Framework, performance budget, accessibility requirements.

Every design choice should be intentional. Don't produce generic, thoughtless UI. Don't default to the first thing that comes to mind. Consider the context, then make a deliberate choice.

### 1.3 Every Action Feels Natural \[5/5]

Users bring expectations from other applications they use daily. The interface should work the way users expect it to work, even if they're trying something for the first time.

**Core principle:** If a user tries an action by instinct (based on experience with other apps), it should work.

For the typing screen specifically, the reference points are monkeytype and every IME the reader already uses. Backspace corrects. Escape leaves. Tab plus Enter restarts. Typing anywhere on the page types into the exercise, with no click-to-focus step.

**Mental models to respect:**

- Ctrl/Cmd+S saves
- Ctrl/Cmd+Z undoes
- Escape closes modals/cancels
- Enter submits forms
- Tab moves between fields
- Right-click shows context menu
- Double-click edits/opens
- Clicking outside closes dropdowns/modals

### 1.4 Consistency Over Creativity \[5/5]

Internal consistency is more important than novelty. The same action should look and behave the same way everywhere.

**Maintain consistency in:**

- Button styles and sizes for same-level actions
- Spacing between similar elements
- Error message patterns
- Loading state presentation
- Modal/dialog structure
- Icon usage and sizing
- Color usage for same semantic meaning

### 1.5 Less Is More \[4/5]

Once a feature is released, it never goes away. Avoid adding features that don't offer high user value for the cost in maintenance, complexity, and payload size. When in doubt, leave it out.

This applies especially to providing two different APIs or patterns to accomplish the same thing. Prefer sticking to a single approach.

### 1.6 Prefer Small, Focused Modules \[4/5]

Keeping modules to a single responsibility makes the code easier to test, consume, and maintain. Ideally, individual files are 200-300 lines of code.

As a rule of thumb, once a file draws near 400 lines (barring long constants or comments), start considering how to refactor into smaller pieces.

### 1.7 Privacy by Default \[5/5]

There is no app server, and an account is something a reader chooses, not something they need. Keep it that way unless there is a reason strong enough to write down.

- Reading data never leaves the browser unless the reader signs in to sync. No error reporting service, no fonts fetched from a third party at runtime. The one third-party script is Plausible, which counts page views and is told nothing else; see section 0.
- Sync is opt-in, and the local store stays the source of truth. Deleting everything deletes the synced copy first, and refuses to go on if it cannot.
- Export and delete must both exist. The reader owns their history and must be able to take it or destroy it.

When privacy and another goal conflict, document the tradeoff in a comment or commit message, and default toward more private.

### 1.8 Bulk Data Is Raw State \[5/5]

`$state` deep-proxies every object it is handed and makes a signal for every
property read off it. A reader with a few months behind them has thousands of
stored objects: attempt records, item states, a year of per-item history. Handed
to `$state`, every one of them is wrapped, and then walked again by each derived
that reads the store, which turns opening the stats page into a freeze.

The reader's store, their attempts and a sentence's segments are all replaced
whole and never edited in place. That is what `$state.raw` is for, and it is the
default here for anything that holds more than a handful of objects. Reach for
plain `$state` for a flag, a count or a selection, not for a collection.

This matters most on the typing screen, where the attempt is replaced on every
keystroke. See 1.9.

### 1.9 Guard the Keystroke Path \[5/5]

Everything the reader feels happens between keydown and paint.

- No synchronous storage writes during a sentence. Buffer timings in memory, flush on sentence completion or on an idle callback.
- No work proportional to sentence length per keystroke. Advancing one character should touch one character.
- Corpus chunks load ahead of time, never in response to finishing a sentence.
- Measure with `performance.now()` at the event, not after a framework update has run.

If something has to be slow, it happens between sentences, never during one.

---

## 2. Domain Vocabulary

Use these terms consistently in code, types, and comments. Mixing them is the fastest way to make this codebase confusing.

| Term            | Meaning                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------- |
| **sentence**    | One corpus entry: Japanese text, its token alignment, its kana rendering, its difficulty metadata. |
| **token**       | One morphological unit of a sentence, with its surface form and its reading in kana.               |
| **grapheme**    | One displayed Japanese character. What the reader's eye lands on.                                  |
| **item**        | One scheduled unit of knowledge: a single kana, or a kanji paired with one specific reading.       |
| **mora**        | One kana-length unit of sound. `きゃ` is one mora, `きや` is two.                                  |
| **romaji unit** | The keystrokes that produce one mora. Has multiple valid spellings.                                |
| **attempt**     | One reader pass over one sentence, with per-token timings and errors.                              |
| **review**      | One item's appearance inside an attempt, graded and fed to FSRS.                                   |
| **band**        | A difficulty bucket of the corpus. Sentences are chunked and shipped by band.                      |

A kanji plus a different reading is a different item. 生 in 生きる and 生 in 学生 are not the same thing to learn, and must not share a schedule.

---

## 3. Architecture

### 3.1 Module Layout \[4/5]

```
src/lib/
  romaji/       kana <-> romaji conversion and the input state machine. Pure, no
                framework imports, no I/O. The most heavily tested module here.
  corpus/       the shipped format, loading and caching chunks, and deciding
                which words appear as kanji rather than as kana.
  srs/          FSRS wrapper, latency-to-grade mapping, item scheduling.
  session/      the typing session: current sentence, cursor, timing capture.
  selection/    picking the next sentence from item state and corpus.
  stats/        aggregation for the stats page.
  japanese/     script detection, kana normalisation, the gojuon chart.
  db/           IndexedDB schema, migrations, read and write helpers.
  components/   domain components (ui/ holds shadcn-svelte).
scripts/corpus/ offline corpus preprocessing. Runs under bun, never shipped.
static/corpus/  generated sentence chunks. Build output, not hand-edited.
```

Dependencies point downward. `romaji/` and `japanese/` know nothing about the rest. `session/` may use them. Nothing outside `db/` touches IndexedDB directly.

### 3.2 Keep the Core Pure \[5/5]

The romaji engine, the grading function, and the sentence selector are pure functions over plain data. They take state and input, they return new state. No Svelte imports, no storage, no timers inside them.

This is not an aesthetic preference. These three are the parts that have to be correct, and the only way to know they are correct is to test them exhaustively, which requires them to be callable from a test with no browser.

### 3.3 The Reader Types the Reading, Not the Page \[5/5]

The typed text is always the sentence's kana reading. What is on screen is a
separate decision: a word can be shown as kanji once the reader is ready for it,
and as kana until then. The two are lined up by `tokenSpans`, so the display can
change without the exercise changing underneath it.

Punctuation is shown and stepped over. Hunting for a comma key is a typing chore,
not a reading skill, and it breaks the rhythm exactly where a reader should be
flowing. The long vowel mark is the exception: it is read, so it is typed.

### 3.4 The Romaji Engine \[5/5]

Japanese romaji input is not a lookup table. Build it as an IME-style trie that accepts any valid keystroke path to a mora and resolves ambiguity as late as possible.

It must accept, at minimum:

- Hepburn, Kunrei and Nihon variants: `shi`/`si`, `chi`/`ti`, `tsu`/`tu`, `fu`/`hu`, `ji`/`zi`, `ja`/`zya`/`jya`
- `ん` as `n`, `nn`, or `n'`, including the cases where a bare `n` is ambiguous with a following な-row mora
- `っ` as consonant doubling and as `ltu`/`xtu`
- Small kana as `l`- and `x`- prefixed forms
- `ぢ`/`づ` distinct from `じ`/`ず`
- Long vowels in katakana (`ー`) and the `ou`/`oo` cases

Every one of these gets a test with the exact input and expected output pinned. When a reader reports that a spelling they know was rejected, the fix is a test first.

### 3.5 One Reading Must Not Redraw a Character \[5/5]

Recognition times are not symmetric around their middle. They pile up near a
floor and trail off to the right, because everything that goes wrong makes a read
slower and nothing makes it faster than knowing the character. A glance out of
the window, a hand off the keyboard, a thought about lunch: all of them land in
the same tail.

So a reading is trimmed against what that character already costs the reader
before it is folded into the estimate, and readings past five seconds are dropped
entirely as breaks rather than reads. The estimate itself is a rolling one, not
an average, because the reader is getting faster and a number that weights a read
from March as heavily as one from today cannot say so.

A median would be more robust and is the wrong tool here: it lags a real
improvement by half its window, and it needs every raw read kept.

The grade is always worked out from the untrimmed reading. The scheduler should
see what happened. Only the number the reader is shown, and scored on, is
trimmed.

### 3.6 Generated Data Is Not Source \[4/5]

`static/corpus/` and `src/lib/paraglide/` are build output. Never hand-edit them. If something in the corpus is wrong, fix the preprocessing script in `scripts/` and regenerate, so the fix survives the next run.

The preprocessing scripts are the place where reading ambiguity gets resolved. Record the choices they make, and make the output deterministic so a regeneration produces a reviewable diff.

---

## 4. Tooling & Libraries

### 4.1 Universal Flow \[5/5]

For every tool or library category, follow this decision flow:

1. **Check** if the project already uses something for this purpose
2. **If yes**, follow its existing conventions exactly
3. **If no**, recommend a specific default (listed below) and ask before adding it
4. **Never** reinvent what already exists in the project's dependencies

### 4.2 Component Library (shadcn-svelte) \[5/5]

Before building ANY custom component, check whether shadcn-svelte already provides it. Only build custom if it genuinely doesn't exist.

**Flow:**

1. Need a dialog? Check shadcn-svelte first.
2. It exists? Use it. Follow its patterns. Don't wrap it unnecessarily.
3. It doesn't exist? Build a reusable component following the same patterns the library uses.

Add components with `bunx shadcn-svelte@latest add <name>`, never by copying files in by hand.

### 4.3 Styling (Tailwind CSS 4) \[4/5]

- Use the spacing scale (multiples of the base unit), don't use arbitrary values like `m-[17px]`
- Use theme tokens (`bg-primary`, `text-muted-foreground`) instead of raw colors (`bg-blue-500`)
- Specify transition properties (`transition-colors`) instead of `transition-all`

### 4.4 Icons (Lucide) \[4/5]

Use `@lucide/svelte`. Never write SVG markup directly. If an icon doesn't exist in the library, create a reusable component rather than inlining SVG.

### 4.5 Internationalization (ParaglideJS) \[4/5]

Never hardcode user-facing strings.

**Key Naming Convention:**

Structure: `{scope}_{feature}_{element}_{modifier}`

| Part         | Description              | Examples                                                                        |
| ------------ | ------------------------ | ------------------------------------------------------------------------------- |
| **scope**    | Top-level section        | `session`, `stats`, `settings`, `onboarding`, `common`                          |
| **feature**  | Specific feature/page    | `typing`, `summary`, `progress`, `scripts`, `sidebar`                           |
| **element**  | UI element type          | `button`, `input`, `label`, `title`, `description`, `error`, `success`, `toast` |
| **modifier** | Variant/state (optional) | `primary`, `secondary`, `loading`, `empty`, `incorrect`, `placeholder`          |

**Examples:**

```
session_typing_title                 - "Type what you read"
session_typing_button_skip           - "Skip sentence"
session_summary_label_accuracy       - "Accuracy"
stats_progress_empty_description     - "Finish a few sentences to see your progress."
common_button_save                   - "Save"
common_button_cancel                 - "Cancel"
```

**Rules:**

- For reusable text (Save, Cancel, Delete), use `common_*` prefix
- Keys are deterministic: following the pattern, you know exactly what the key should be
- Related keys group alphabetically for easy scanning
- Japanese sentence data, kana, and romaji are content, not UI strings. They never go through Paraglide.

### 4.6 SvelteKit Conventions \[3/5]

- Use `$lib` for imports from the lib directory
- Prefer `$derived` over manual reactive bookkeeping
- Use Svelte transitions (`slide`, `fade`) for enter/exit animations, never on the typing area
- Everything prerenders. If you reach for a `+page.server.ts`, stop and reconsider.

### 4.7 Testing (`bun test`) \[3/5]

Co-locate `*.test.ts` next to the source it covers.

**What to test:**

- The romaji engine, exhaustively. Every accepted spelling variant, every rejection.
- The latency-to-grade mapping and the selection scorer: given item state, which sentence comes out.
- Corpus preprocessing output shape, so a bad regeneration fails loudly.
- Non-obvious edge cases (off-by-one, boundary conditions, error paths).

**What NOT to test:**

- Trivial getters/setters and pass-through wrappers.
- Framework or library code.
- Implementation details that would change with normal refactors.
- The same thing in five places.

Each test exists for a specific reason. Quality over quantity: a few sharp tests beat a hundred shallow ones. Coverage is not the goal; confidence in the parts that need it is.

---

## 5. Code Quality

### 5.1 Write Useful Comments \[4/5]

Comments that explain **why** are invaluable. Comments that explain **what** are nice but secondary.

**Not very useful:**

```ts
// Set default tabindex.
if (!this.getAttribute("tabindex")) {
  this.setAttribute("tabindex", "-1");
}
```

**Much more useful:**

```ts
// Unless the user specifies so, the element should not be a tab stop.
// This is necessary because the framework might add a tabindex to anything
// with a model binding.
if (!this.getAttribute("tabindex")) {
  this.setAttribute("tabindex", "-1");
}
```

Japanese-specific logic needs this more than anything else in the codebase. A line that special-cases `ん` before a な-row mora is incomprehensible without a sentence explaining the ambiguity it resolves.

### 5.2 Naming \[4/5]

- Prefer full words over abbreviations
- Prefer exact names over short names (`labelPosition` > `align`)
- Use `is` and `has` prefixes for boolean properties/methods
- Method names should describe the action performed, not when it's called (`openDialog()` > `handleClick()`)
- Class names should capture what the code does, not how it is used

### 5.3 TypeScript Practices \[4/5]

- Avoid `any` where possible. Consider generics when tempted to use `any`.
- All public API types must be explicitly specified.
- Use JsDoc-style comments for descriptions on classes, members, etc.
- Use `//` comments for explanations and background info.
- Boolean properties: use "Whether..." phrasing in docs (`/** Whether the button is disabled. */`)
- Distinguish string kinds with branded types where confusion would be silent. A romaji string, a kana string and a surface form are not interchangeable.

### 5.4 Boolean Arguments \[3/5]

Avoid boolean arguments that mean "do something extra." Prefer separate functions.

```ts
// Avoid
function getTargetElement(createIfNotFound = false) { ... }

// Prefer
function getExistingTargetElement() { ... }
function createTargetElement() { ... }
```

### 5.5 Prefer Modern Syntax \[3/5]

- Use `for...of` instead of `forEach` for multi-line operations
- Use nullish coalescing (`??`) and optional chaining (`?.`) to shorten code
- Use `const` by default, `let` when reassignment is needed, never `var`

### 5.6 Try-Catch \[3/5]

Avoid `try-catch` blocks. Prefer preventing errors from being thrown in the first place. When unavoidable, include a comment explaining the specific error being caught and why it cannot be prevented.

IndexedDB is the honest exception: private windows and blocked site data make it fail in ways no amount of care prevents. Wrap those, and make the app still work read-only when storage is unavailable.

### 5.7 Don't Use Regex \[4/5]

Avoid regular expressions outside of ad-hoc command-line use. Regex is hard to read, hard to maintain, almost always subtly wrong, and brittle in ways that bite in production months later.

This matters doubly here. Japanese text is full of surrogate pairs, combining marks and script ranges that a hand-written character class gets wrong. Use `Intl.Segmenter` for grapheme segmentation and explicit code point comparisons for script detection.

**Prefer instead:**

- String operations: `startsWith`, `endsWith`, `includes`, `split`, code point iteration.
- Proper parsers: `URL` for URLs, `Intl.Segmenter` for text segmentation.
- Typed schemas: Zod or similar for validating corpus data at load.

The romaji trie is the one place a tokenizer is genuinely warranted, and it is a trie precisely so it does not need regex.

---

## 6. Spacing System

### 6.1 Base Grid \[5/5]

All spacing uses multiples of a base unit (8px recommended). This creates visual rhythm and consistency.

**Scale (with Tailwind equivalents):**

```
4px   (space-1)   - Tight spacing, rare use
8px   (space-2)   - Minimal gaps, icon+text
12px  (space-3)   - Compact spacing
16px  (space-4)   - Standard spacing (DEFAULT)
20px  (space-5)   - Form field spacing
24px  (space-6)   - Section spacing, card padding
32px  (space-8)   - Major section separation (DEFAULT for sections)
40px  (space-10)  - Large gaps
48px  (space-12)  - Hero spacing
```

### 6.2 Spacing Defaults \[5/5]

**Gap (between items):**

- 8px - Icon + text, tightly related items
- 16px - Standard spacing (DEFAULT)
- 24px - Loose spacing
- 32px - Section separation

**Padding (inside elements):**

- 8px - Dense UI, badges, small buttons
- 16px - Standard padding
- 24px - Cards, modals, panels (DEFAULT for cards)
- 32px - Large containers, page content

**Vertical spacing:**

- 8px - Label + input pairs
- 16px - Component groups
- 20px - Form field groups (DEFAULT for forms)
- 24px - Card sections
- 32px - Major page sections (DEFAULT for sections)

### 6.3 Internal <= External Rule \[4/5]

Spacing inside an element should be less than or equal to spacing outside it. This creates clear visual grouping.

**Correct:** Card has 24px internal padding, 24px gap between cards. Internal content has 16px spacing (16px < 24px).

**Incorrect:** 8px between cards but 32px inside them. Elements feel disconnected from their containers.

---

## 7. Typography

### 7.1 Size Hierarchy \[4/5]

```
12px (text-xs)   - Captions, timestamps, metadata
14px (text-sm)   - UI labels, secondary content (DEFAULT for UI)
16px (text-base) - Body text, paragraphs (DEFAULT for body)
18px (text-lg)   - Emphasized text, lead paragraphs
20px (text-xl)   - Small headings (H4)
24px (text-2xl)  - Section headings (H3)
30px (text-3xl)  - Page headings (H2) (DEFAULT for headings)
36px (text-4xl)  - Hero headings (H1)
```

### 7.2 Japanese Text Sizing \[5/5]

The sentence under test is not body text and does not follow the scale above.

- Japanese glyphs are denser than Latin ones. Set the sentence at least one step larger than Latin text at the same intended reading difficulty, around 32px to 40px on desktop.
- Line height for Japanese needs more room, 1.7 to 1.8. Kana with dakuten and small kana lose legibility when lines crowd.
- Never letter-space Japanese text. Tracking a kana string makes it harder to read, not easier.
- The reader must be able to enlarge the sentence. Recognition speed is the measurement, and a reader squinting is a reader whose timings are wrong.

### 7.3 Font Choice \[4/5]

Three roles, chosen separately:

- **Japanese sentence.** A neutral, high-legibility gothic (Noto Sans JP or similar). Self-hosted and subset, never fetched from a third party. It must render kana, the kanji ranges the corpus uses, and `ー` correctly at large sizes.
- **Romaji input.** Must make `l` / `I` / `1` and `0` / `O` unmistakable, because a mistyped character is a scored error. A mono or a mono-adjacent face is the right call here.
- **UI.** Whatever the shadcn preset ships. It should recede.

Do not let the Japanese font fall back silently. A missing glyph rendered as tofu invalidates the measurement for that sentence.

### 7.4 Font Weights \[4/5]

Limit to 3 weights for visual clarity:

```
400 (normal)     - Body text, descriptions
500 (medium)     - Emphasized text, UI labels
600 (semibold)   - Headings, important actions (DEFAULT for headings)
```

Avoid 300 (light) and 700 (bold) unless absolutely necessary. Japanese text at light weights is unreadable at small sizes; if the sentence needs emphasis, change color or size, not weight.

### 7.5 Line Height \[3/5]

```
1.25  (tight)    - Headings, large text (DEFAULT for headings)
1.375 (snug)     - Subheadings
1.5   (normal)   - Body text (DEFAULT for body)
1.625 (relaxed)  - Long-form content
1.75  (loose)    - Japanese sentence text
```

### 7.6 Standard Patterns \[4/5]

```
Page heading:      text-3xl, font-semibold, tracking-tight, leading-tight
Section heading:   text-2xl, font-semibold, tracking-tight, leading-tight
Card title:        text-lg, font-medium, leading-snug
UI label:          text-sm, font-medium
Body text:         text-base, leading-normal
Secondary text:    text-sm, muted color
Caption/metadata:  text-xs, muted color
Sentence:          large, normal weight, no tracking, loose leading
```

---

## 8. Colors & Theme

### 8.1 Never Hardcode Colors \[5/5]

Always use theme tokens. Never use color utilities or hex values directly.

**Correct:** `bg-card`, `text-foreground`, `border-destructive`

**Incorrect:** `bg-gray-100`, `text-gray-700`, `bg-[#f5f5f5]`

Theme tokens automatically adapt to light/dark mode.

### 8.2 Semantic Color Usage \[5/5]

**Backgrounds:**

```
background       - Main app background
card             - Elevated surfaces (cards, modals, panels)
muted            - Subtle backgrounds, disabled states
accent           - Hover states, highlighted areas
primary          - Primary action buttons
destructive      - Destructive actions, error states
```

**Text:**

```
foreground           - Primary text (DEFAULT)
muted-foreground     - Secondary text, hints, placeholders
primary              - Accent text, links
destructive          - Error messages
primary-foreground   - Text on primary background
```

**Borders:**

```
border           - Default borders
input            - Form inputs
primary          - Focused/active elements
destructive      - Error states
```

### 8.3 Typing Area Colors \[5/5]

The sentence has exactly three states and they are the whole visual language of the exercise:

- **Typed correctly:** `muted-foreground`. Done, still visible for context, no longer demanding attention.
- **Current position:** `foreground` with a cursor. The only thing the eye should be pulled to.
- **Untyped:** `muted-foreground` at a lighter step, or `foreground` at reduced opacity.
- **Error:** `destructive`, applied to the character that was wrong, and it must not shift anything.

Do not add a fourth state. Do not color characters by how well the reader knows them during the exercise; that turns the measurement into a hint. Mastery coloring belongs on the summary and stats screens, after the timing is recorded.

### 8.4 Status Colors \[4/5]

For status indicators, always provide both light and dark mode variants:

- **Success**: Green tones
- **Warning**: Yellow/amber tones
- **Error**: Use the destructive token
- **Info**: Use the primary token

Do not build a heat scale out of red-to-green alone. Roughly one in twelve men cannot read it. Pair hue with lightness or a shape.

### 8.5 No Gradients \[4/5]

Use flat, solid colors only. Gradients add visual noise without functional benefit.

### 8.6 Shadows \[3/5]

Use shadows sparingly and only for elevation hierarchy:

- **Dropdowns/popovers**: Medium shadow
- **Modals**: Large shadow
- **Floating elements** (FABs, toasts): Medium shadow
- **Cards**: No shadow, use borders instead
- **Buttons**: No shadow

---

## 9. Components

### 9.1 Check Before You Build \[5/5]

Before creating any component:

1. Check if shadcn-svelte already provides it
2. If yes, use it. Follow its patterns.
3. If no, build a reusable component following the same patterns the library uses

Never wrap a library component unnecessarily. Never duplicate functionality that already exists.

### 9.2 Button & Input Heights \[4/5]

```
32px (h-8)  - Small/compact (table actions, inline buttons)
40px (h-10) - Default (most buttons and inputs)
44px (h-11) - Large/prominent (primary CTAs)
```

### 9.3 Icon Sizes \[4/5]

```
12px (h-3 w-3) - Inline with small text
16px (h-4 w-4) - Standard UI icons (DEFAULT)
20px (h-5 w-5) - Larger UI elements, sidebar icons
24px (h-6 w-6) - Hero icons, emphasis
```

**Icon + text pattern:** Always use a flex container with a small gap (8px).

### 9.4 Cards & Panels \[4/5]

**Standard card:** Rounded corners (8px), border, card background, 24px padding.

**Border radius scale:**

```
2px  - Small elements, tags
6px  - Buttons, inputs (DEFAULT for small elements)
8px  - Cards, panels (DEFAULT for cards)
12px - Large modals, hero sections
```

### 9.5 Container Widths \[4/5]

```
384px  - Narrow dialogs
448px  - Standard forms
512px  - Wide forms
672px  - Reading content
896px  - Wide content areas, the typing area
```

### 9.6 Prefer Composition Over Wrapping \[3/5]

Instead of wrapping other elements or forwarding props down, prefer slots/children for content projection. Let consumers provide content directly rather than passing it through layers of props.

### 9.7 Separate Variants Into Separate Components \[3/5]

If a component has fundamentally different variants, prefer separate components over a single component with mode switches. Extension/composition is cheap and improves readability.

---

## 10. Animation & Motion

### 10.1 Never Animate the Typing Surface \[5/5]

While a sentence is in progress, nothing on it moves, fades, or eases. Character state changes are instant. The cursor may blink; that is all.

Animation on the typing area corrupts the measurement, because the reader waits for the animation before trusting that their keystroke landed. It also costs frames on exactly the path that cannot afford them.

Between sentences is a different screen state, and may animate.

### 10.2 Organic Easing \[4/5]

Use easing curves with slight overshoot for spatial animations. This creates a natural, "alive" feel.

**For position/transform changes:**

```css
transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
```

The overshoot (1.56 exceeds 1.0) makes the element go slightly past its target and settle back, mimicking real-world physics.

**For color/opacity changes:** Standard ease is fine, no overshoot needed.

### 10.3 Duration Hierarchy \[4/5]

```
75ms   - Instant feedback (button press)
150ms  - Quick transitions (color, opacity) (DEFAULT for colors)
200ms  - Standard transitions (transforms, scale) (DEFAULT for transforms)
300ms  - Layout changes, spatial movement (DEFAULT for position)
400ms+ - Large/complex animations (use sparingly)
```

### 10.4 What to Animate \[3/5]

**Always animate:**

- Hover state changes (color, background)
- Focus indicators
- Modal/dropdown open/close
- State transitions (expanded/collapsed)

**Consider animating:**

- The transition between one sentence and the next
- Stats charts on first paint
- Loading skeleton shimmer

**Never animate:**

- Initial page load (content should appear ready)
- Anything on the typing area
- Error states (should appear instantly)
- Critical information

### 10.5 Subtle Delight \[3/5]

Playful design works when it enhances without distracting. Delight is the icing on the cake, it comes after functional, reliable, and usable.

**Where it works:** Session summaries, milestones, empty states, loading states.

**Where to avoid it:** The typing area, error states, destructive confirmations, anything the reader sees dozens of times per session.

**Rules:**

- Under 500ms, anything longer interrupts
- Every animation has a reason to exist
- Power users shouldn't be slowed down
- Match the emotional moment (don't celebrate errors)

---

## 11. Responsive Design

### 11.1 Desktop-First, Mobile-Aware \[3/5]

The exercise needs a physical keyboard, so desktop is the target. Mobile should show stats, settings and progress correctly, and should say plainly that typing practice wants a keyboard rather than presenting a broken exercise.

**Breakpoints:**

```
640px  (sm)  - Small tablets
768px  (md)  - Tablets
1024px (lg)  - Small desktops
1280px (xl)  - Standard desktops
1536px (2xl) - Large screens
```

### 11.2 Touch Targets \[4/5]

Interactive elements must be at least 44x44px on touch devices.

### 11.3 Responsive Patterns \[3/5]

- Stack on mobile, row on desktop
- Full width on mobile, constrained on desktop
- Adjust padding for screen size

---

## 12. UX Patterns

### 12.1 Feedback States \[5/5]

Every action must have immediate, visible feedback.

**Loading:** Disable the trigger, show a spinner or loading text, indicate progress.

**Success:** Brief, non-blocking confirmation (toast or inline message).

**Error:** Appear instantly (no animation delay), specific and actionable message, placed near the source.

### 12.2 Never Punish Without Explaining \[5/5]

If input is rejected, the reader must be able to tell why within a second. A rejected romaji spelling that the reader believes is correct is the single most likely reason someone quits.

- On a persistent mismatch, show the accepted spellings for the current mora.
- Distinguish "wrong character" from "not a valid spelling of this mora" in the code, even if the display is the same.
- Every rejection the reader disputes is a bug report against `romaji/`. Treat it that way.

### 12.3 Empty States \[4/5]

Empty states should guide users toward action, not just state "nothing here."

**Structure:**

1. An icon (muted, not prominent)
2. Brief title explaining the state
3. Short description with next step
4. Primary action button when applicable

A new reader with no history is the most important empty state in the app. It should start them typing, not explain the SRS. The one exception is a single short welcome on the very first visit, saying what the page is and what to type: three lines, one button that starts the typing, shown once and never again. Keys go to it, not to the exercise, while it is open.

### 12.4 User Control \[4/5]

Users must always be able to escape, undo, or go back.

**Escape hatches:**

- Escape key leaves the exercise
- Skipping a sentence is always available and must not be scored as failure
- Click outside closes popups
- Back navigation works

**Destructive actions:**

- Reversible: Provide undo (toast with undo button)
- Irreversible: Require confirmation dialog with clear consequences

Clearing progress is irreversible and unrecoverable: it deletes the synced copy too. Confirm it by name, and offer an export first.

### 12.5 Progressive Disclosure \[4/5]

Show only what's needed. Hide complexity until the user asks for it.

The reader does not need to know what FSRS is, what a band is, or why this sentence was chosen. Those explanations belong behind a "why this sentence?" affordance, not on the screen.

### 12.6 Micro-copy \[4/5]

**Button labels:** Use verbs. Be specific when context is unclear. Match the severity ("Delete" for destructive, "Remove" for reversible).

**Error messages:** Explain what happened and how to fix it. Don't blame the user.

**Placeholder text:** Show format examples. Don't repeat the label. Don't use as the only label.

**Confirmation dialogs:** Title states what will happen. Description states consequences. Actions use clear verb labels.

**Progress language:** Describe what the reader can do, not what the algorithm thinks. "You read katakana about as fast as hiragana now" beats "katakana stability: 4.2".

### 12.7 Reduce Cognitive Load \[3/5]

- Limit ungrouped options to 3-5 items (Hick's Law)
- Break long lists into groups
- Don't show more than 7 ungrouped items at once (Miller's Law)
- Provide sensible defaults
- Use progressive disclosure for advanced options

---

## 13. Interaction & States

### 13.1 Hover \[4/5]

All interactive elements need hover feedback. Use color/background transitions (150ms).

For accessibility, the visual highlight must not be reduced to color alone. Include cursor change, translation, or other effects that are understandable for visually impaired users.

### 13.2 Focus \[5/5]

Focus indicators must be visible for keyboard navigation. Use a visible ring on `:focus-visible`. Never remove focus outlines.

The typing area is the exception worth designing carefully rather than ignoring: it captures keystrokes at the page level, so it needs a clear "this is live" indication that is not a focus ring on an invisible input.

### 13.3 Active/Pressed \[3/5]

Provide visual feedback on press (scale down slightly or darken).

### 13.4 Disabled \[4/5]

- Reduce opacity
- Change cursor to not-allowed
- Prevent keyboard and mouse interaction
- Consider keeping pointer events to allow tooltips explaining why it's disabled

### 13.5 Checked \[3/5]

For form elements (radio, checkbox), visually indicate the checked state clearly. Indeterminate is a sub-state of this.

### 13.6 Readonly \[3/5]

Must be accessible via keyboard and mouse, but content/selection cannot be changed. Visually distinguish from editable and disabled states.

### 13.7 Error \[4/5]

Visually and textually indicate the error state. Use the destructive color token. Place error messages near the source.

---

## 14. Accessibility

### 14.1 ARIA Labels \[4/5]

Icon-only buttons must have labels (`aria-label`). Provide context for screen readers on any element where the visual meaning isn't conveyed through text.

### 14.2 Language Attributes \[4/5]

Japanese text must carry `lang="ja"`. Without it, browsers pick the wrong font for shared CJK code points and screen readers read kana as Chinese. Romaji stays in the page language.

### 14.3 Form Labels \[4/5]

All inputs must have associated labels. Use `aria-describedby` for supplementary help text.

### 14.4 Semantic HTML \[4/5]

Use semantic elements: `nav`, `main`, `article`, `aside`, `header`, `footer`, `button`, `a`.

Never use `div` or `span` with click handlers as interactive elements.

### 14.5 Color Contrast \[4/5]

Minimum contrast ratios (WCAG AA):

- Normal text: 4.5:1
- Large text (18px+): 3:1
- UI components: 3:1

Untyped sentence text still has to clear this. It is the text the reader is actually reading.

### 14.6 Keyboard Support \[3/5]

All functionality should be accessible via keyboard:

- Tab / Shift+Tab navigates between elements
- Enter / Space activates buttons and links
- Escape closes modals and cancels actions
- Arrow keys navigate within components (menus, tabs)

For custom interactive elements, add `role`, `tabindex`, and keyboard event handlers.

### 14.7 Reduced Motion \[3/5]

Respect `prefers-reduced-motion`. Between-sentence transitions and chart animations must degrade to instant.

---

## 15. CSS Practices

### 15.1 Use CSS Variables \[4/5]

Use CSS variables wherever possible. Define rules once with CSS variables and change them conditionally rather than rewriting rules.

Define component-level CSS variables in the component's root, and change them via modifiers or media queries.

### 15.2 Use Existing Design Tokens \[4/5]

Use the tokens in `src/routes/layout.css`. Don't define new variables for things that already exist. If a token is missing, flag it.

### 15.3 Lowest Specificity Possible \[4/5]

Prioritize lower specificity. Most style definitions should be a single class plus necessary state modifiers. Avoid nesting for the sake of organization.

**Avoid:**

```css
.sentence .token .kana.typed {
  color: var(--muted-foreground);
}
```

**Prefer:**

```css
.sentence-kana.typed {
  color: var(--muted-foreground);
}
```

### 15.4 No Margin on Root/Host Elements \[4/5]

The consumer of a component should decide its external spacing. Never set margin on the outermost element of a component.

### 15.5 Prefer Styling Inner Elements \[3/5]

To avoid unwanted style overrides from outside, encapsulate styles on inner elements. Expose CSS variables as the public styling API.

### 15.6 Be Cautious With display: flex on Outermost Elements \[3/5]

Flex baseline calculation differs from other display values, making alignment with standard elements difficult. Component root elements should prefer block or inline-block.

---

## 16. Anti-Patterns

### Things to Never Do

**\[5/5] Animating or reflowing the typing area mid-sentence:**
It corrupts the timing data, which is the entire product.

**\[5/5] Writing to IndexedDB during a sentence:**
Buffer in memory, flush at a boundary.

**\[5/5] Morphological analysis at runtime:**
Readings are resolved offline. If you need a reading the corpus doesn't have, fix the corpus.

**\[5/5] Missing loading states:**
Never leave an async action without visible feedback.

**\[5/5] No error handling:**
Never silently swallow errors. Always provide a catch path and display errors to the user.

**\[5/5] Hardcoded colors:**
Never use raw color values. Always use theme tokens.

**\[5/5] Hardcoded user-facing strings:**
Every user-facing string goes through Paraglide.

**\[4/5] Treating a kanji as one item regardless of reading:**
Different readings are different knowledge and need different schedules.

**\[4/5] Rejecting a valid romaji spelling:**
Any Hepburn, Kunrei or Nihon spelling of a mora is correct input.

**\[4/5] Removed focus outlines:**
Never remove focus outlines. This breaks keyboard accessibility.

**\[4/5] Inline SVG instead of icon components:**
Never write SVG markup directly. Use Lucide.

**\[4/5] Gradients:**
No gradients. Flat, solid colors only.

**\[4/5] Layout shift on state change:**
Error messages and dynamic content appearing should not push other content around. Use transitions or reserve space.

**\[4/5] Inconsistent spacing:**
Don't mix spacing systems. Stick to the base grid. No arbitrary pixel values.

**\[3/5] Overusing animations:**
Not everything needs to animate. Be purposeful.

**\[3/5] Using transition-all:**
Specify which properties animate. `transition-all` has performance cost and causes unintended animations.

---

## Review Checklist

Before considering frontend work complete:

- [ ] Every element serves a purpose (no decorative extras)
- [ ] Checked shadcn-svelte before building custom
- [ ] Spacing follows the base grid
- [ ] No hardcoded colors (theme tokens only)
- [ ] No gradients (flat colors only)
- [ ] User-facing strings use Paraglide
- [ ] Japanese text carries `lang="ja"`
- [ ] Icons use Lucide (no inline SVG)
- [ ] Correct component sizes (standard button/input heights)
- [ ] Loading state implemented for async actions
- [ ] Error state implemented and visible
- [ ] Hover states on interactive elements
- [ ] Focus states visible (no outline removal)
- [ ] Keyboard accessible
- [ ] ARIA labels on icon-only buttons
- [ ] Nothing new runs on the keystroke path
- [ ] `bun run check` passes
- [ ] Matches existing patterns in the codebase
