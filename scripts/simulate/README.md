# How the score was chosen

The score is the number people compare each other by, so it has to put people
in the order their reading puts them. This folder is how that was tested
rather than argued. It is the evidence behind `src/lib/stats/score.ts`, and the
tools to test the next change the same way.

## The formula

The share of real Japanese text a reader can read, on a scale with no top:

- Every item they have studied counts by how often it turns up in the corpus
  (`static/corpus/text-share.json`): a word on every page counts for far more
  than a word seen once.
- Each counts by the chance they recall it, averaged over now and the next
  three days, from the app's own memory model (FSRS).
- The share is put on a scale where 1,000 points is one halving of the words
  they would get stuck on. The score never stops growing, and every point
  takes more learning than the one before.

## What "right" means

A score is right when it agrees with what people can really read. That can't
be checked on real readers yet, so it is checked on simulated ones whose truth
is known:

- **A hidden brain** (`brain.ts`). Every simulated reader has their own memory:
  per item, forgetting over time, strengthened by recalling, more when recall
  was hard, and set back by a lapse. It is deliberately not FSRS. A formula
  built on FSRS graded against FSRS would only be graded against itself.
- **The real app** (`engine.ts`). The reader types through the app's own
  practice loop: its sentence choice, kanji reveal, keystroke timing, grading,
  scheduling and bands. The app sees keystrokes and nothing else.
- **The truth** (`truth.ts`). 400 corpus sentences, drawn once, written as real
  text with every kanji word in kanji. For each reader and day: the share of
  sentences they could read without getting stuck, the share of the text they
  read, and how long it takes them per mora.

## The readers

Twelve kinds of reader, each run with five different seeds for 90 days
(`readers.ts`):

| Reader                                         | What it checks                         |
| ---------------------------------------------- | -------------------------------------- |
| steady, 20 min a day                           | the baseline                           |
| diligent, 60 min a day                         | more practice is more score            |
| casual, 10 min, 4 days a week                  | little practice                        |
| twin: slow typist                              | hands must not change the score        |
| twin: phone                                    | the device must not change the score   |
| twin: fast reader, twin: slow reader           | same memory, faster or slower eyes     |
| fast hands, weak memory                        | typing speed must not pass for reading |
| crammer: 3 hours a day for a week, a month off | cramming must not pay                  |
| break: 30 days on, 30 off, 30 on               | the score must fall with reading       |
| fluent: already reads Japanese                 | must end up on top                     |
| rusty returner: knew it months ago             | must climb back                        |

And the whole cast is run again in four worlds with different brains
(`BRAIN_VARIANTS`): the default, people who forget faster, people who forget
slower, and people who gain little from spacing. The hidden brain is a guess.
A formula that only wins in the guessed world has not won.

## The tests

Each requirement is a number (`metrics.ts`):

- **Clear pairs.** Of every two readers on the same day whose reading differs
  by at least 10%, the share the score puts the right way round. This is the
  leaderboard's question.
- **Ranking.** Rank agreement with each truth over the whole cast.
- **Twins.** How much further apart the typing and phone twins score than
  their reading is. 0% is fair.
- **Cramming.** How far the crammer is overrated after its week.
- **Breaks.** How far the score's fall over 30 days away differs from reading's.
- **Wobble.** How much the fluent reader's score moves in a day. Their reading
  does not move.
- **Growth.** The diligent reader's third month next to their first.

## Results

The final round, worst case over the four worlds:

|                             | old formula | recall now | **avg 3 days (chosen)** | avg 7 days | avg 30 days |
| --------------------------- | ----------- | ---------- | ----------------------- | ---------- | ----------- |
| Clear pairs ordered right   | 94.9%       | 87.8%      | **98.8%**               | 97.7%      | 93.3%       |
| Ranking                     | 0.845       | 0.738      | **0.896**               | 0.864      | 0.768       |
| Twins unfairness            | 50.8%       | 7.5%       | **6.1%**                | 6.1%       | 7.1%        |
| Crammer overrated           | 207%        | 24%        | 18%                     | 15%        | 11%         |
| Break fall error            | 10%         | 47%        | 32%                     | 23%        | 7%          |
| Daily wobble, fluent reader | 3.4%        | 0.9%       | 1.0%                    | 1.1%       | 1.2%        |

Averaging over 2, 3, 4 or 5 days gives nearly the same numbers (clear pairs
98.3% to 98.9%). The choice sits on a flat plateau, not a lucky spike, and
three days is its middle. Shorter orders people very slightly better; longer
resists cramming and breaks very slightly better.

## What was tried and dropped

- **The old formula** (weight × recall now × reading pace, capped). Twins up to
  51% apart for their hands alone, a crammer rated three times what they could
  read, and a ceiling the corpus reached in a day.
- **Any reading-speed term.** Every one tried made slow typists and phone
  readers look like worse readers, by 11% to 50%. This is not a tuning
  problem: a keystroke is hand plus eye, and two people whose hands and eyes
  add up to the same time on every character type identically. Nothing can
  tell them apart from typing alone. So speed across people is not in the
  score. It still counts where it is fair: a reader's own quick reads grade
  Easy, which makes FSRS keep them longer.
- **Recall "now".** Best in the default world, worst in the forgets-fast one:
  FSRS assumes one forgetting curve for everybody, and "now" trusts it most.
- **Recall a week or a month ahead.** Resists cramming, but ranks people worse
  and nearly stops growing.
- **Correcting FSRS per reader** from their own right and wrong answers. One
  correction per reader is too crude: FSRS is off by different amounts on
  different items, and on breaks the correction made things far worse.
- **The share of whole sentences readable**, the truth's own shape. Too noisy:
  one wrong guess about one word zeroes a sentence.
- **Weighting by morae instead of uses.** Slightly worse on every test.

## Limits of this

- No real reader has been measured. Once there are real attempts, the same
  tests should be run against them: whether the people ranked higher really do
  read more.
- The corpus is the measure of "real text". Tatoeba sentences are short and
  conversational, and a different corpus would weigh words differently.
- The score falls faster during a break than the default simulated brain
  forgets, because FSRS's default forgetting curve is steeper. FSRS's defaults
  come from millions of real reviews and the simulated brain is a guess, so
  this may well be FSRS being right. Tuning FSRS to each reader's own history
  would settle it.
- Scores changed scale with this formula, so synced scores started over
  (`drizzle/migrations/0014_score_scale_changed.sql`) and the score chart
  starts from the change.

## Running it

- `bun scripts/simulate/run-all-brains.ts <dir> 90 5` runs every reader in
  every world. About 17 minutes on 32 cores.
- `bun scripts/simulate/summarize.ts <dir>` prints the tables above.
- `bun scripts/simulate/analyze.ts <dir>/<world>/all.jsonl` explains one world.
- `bun scripts/simulate/fastest-reader.ts 4` measures the fastest plausible
  reader, which the leaderboard's limits come from
  (`src/lib/sync/score-limits.ts`). Rerun it whenever the score changes.

Candidates live in `formulas.ts`. To test a change to the score, add it there,
run all the worlds, and compare.
