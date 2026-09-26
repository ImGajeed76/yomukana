// The requirements a comparison score has to meet, each as a number worked
// out from a cohort's results. Shared by analyze.ts, which explains one run,
// and summarize.ts, which sets several runs side by side.

export interface Truth {
  readonly sentences: number;
  readonly coverage: number;
  readonly msPerMora: number;
}

export interface Row {
  readonly profile: string;
  readonly seed: number;
  readonly day: number;
  readonly sentences: number;
  readonly truth: Truth;
  readonly scores: Readonly<Record<string, number>>;
}

export async function readRows(file: string): Promise<Row[]> {
  return (await Bun.file(file).text())
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Row);
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

/** Ranks, with ties sharing the average of their places. */
function ranks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length).fill(0);
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (end + 1 < order.length && order[end + 1]?.value === order[start]?.value) end++;
    for (let position = start; position <= end; position++) {
      const entry = order[position];
      if (entry !== undefined) result[entry.index] = (start + end) / 2;
    }
    start = end + 1;
  }
  return result;
}

export function pearson(left: readonly number[], right: readonly number[]): number {
  const meanLeft = mean(left);
  const meanRight = mean(right);
  let product = 0;
  let squaresLeft = 0;
  let squaresRight = 0;
  for (let index = 0; index < left.length; index++) {
    const a = (left[index] ?? 0) - meanLeft;
    const b = (right[index] ?? 0) - meanRight;
    product += a * b;
    squaresLeft += a * a;
    squaresRight += b * b;
  }
  return squaresLeft === 0 || squaresRight === 0
    ? 0
    : product / Math.sqrt(squaresLeft * squaresRight);
}

/** Rank agreement: 1 when two lists put everyone in the same order. */
function spearman(left: readonly number[], right: readonly number[]): number {
  return pearson(ranks(left), ranks(right));
}

/** One cohort's results, indexed for the questions below. */
export class Cohort {
  readonly rows: readonly Row[];
  readonly formulas: readonly string[];
  readonly days: readonly number[];
  readonly seeds: readonly number[];
  readonly lastDay: number;
  readonly #byKey = new Map<string, Row>();

  constructor(rows: readonly Row[]) {
    this.rows = rows;
    this.formulas = Object.keys(rows[0]?.scores ?? {});
    this.days = [...new Set(rows.map((row) => row.day))].sort((a, b) => a - b);
    this.seeds = [...new Set(rows.map((row) => row.seed))];
    this.lastDay = this.days.at(-1) ?? 0;
    for (const row of rows)
      this.#byKey.set(`${row.profile}/${String(row.seed)}/${String(row.day)}`, row);
  }

  at(profile: string, seed: number, day: number): Row | undefined {
    return this.#byKey.get(`${profile}/${String(seed)}/${String(day)}`);
  }

  get checkpoints(): number[] {
    return [6, 13, 29, 59, this.lastDay].filter((day) => this.days.includes(day));
  }

  /**
   * Rank agreement with each truth, averaged over the checkpoint days: how
   * well the score orders everyone the way their reading orders them.
   */
  ranking(formula: string): { sentences: number; coverage: number; pace: number } {
    const agree = (measure: (truth: Truth) => number): number =>
      mean(
        this.checkpoints.map((day) => {
          const today = this.rows.filter((row) => row.day === day);
          return spearman(
            today.map((row) => row.scores[formula] ?? 0),
            today.map((row) => measure(row.truth)),
          );
        }),
      );
    return {
      sentences: agree((truth) => truth.sentences),
      coverage: agree((truth) => truth.coverage),
      pace: agree((truth) => 1000 / truth.msPerMora),
    };
  }

  /**
   * Of every pair of readers on the same checkpoint day whose reading
   * clearly differs, by at least `margin` in coverage (relative), the share
   * the score puts the right way round. Ties count as half. The question a
   * leaderboard has to answer: is the better reader above the worse one?
   * Near-equal pairs are left out: their order is a coin toss for any score,
   * and for the truth too.
   */
  concordance(formula: string, margin = 0.1): { share: number; pairs: number } {
    let right = 0;
    let pairs = 0;
    for (const day of this.checkpoints) {
      const today = this.rows.filter((row) => row.day === day);
      for (let first = 0; first < today.length; first++) {
        for (let second = first + 1; second < today.length; second++) {
          const a = today[first];
          const b = today[second];
          if (a === undefined || b === undefined) continue;
          const higher = Math.max(a.truth.coverage, b.truth.coverage);
          const lower = Math.min(a.truth.coverage, b.truth.coverage);
          if (lower > 0 && higher / lower < 1 + margin) continue;
          pairs++;
          const truthOrder = Math.sign(a.truth.coverage - b.truth.coverage);
          const scoreOrder = Math.sign((a.scores[formula] ?? 0) - (b.scores[formula] ?? 0));
          if (scoreOrder === 0) right += 0.5;
          else if (scoreOrder === truthOrder) right++;
        }
      }
    }
    return { share: pairs === 0 ? 0 : right / pairs, pairs };
  }

  /**
   * How much further apart a twin's score is from the steady reader's than
   * their reading is, as a share. Same brain, different hands: 0 is fair.
   */
  twinGap(formula: string, twin: string): number {
    const gaps: number[] = [];
    for (const seed of this.seeds) {
      for (const day of [29, 59, this.lastDay]) {
        const base = this.at("steady", seed, day);
        const other = this.at(twin, seed, day);
        if (base === undefined || other === undefined) continue;
        const scoreGap = Math.log((other.scores[formula] ?? 0) / (base.scores[formula] ?? 1));
        const truthGap = Math.log(other.truth.coverage / base.truth.coverage);
        if (Number.isFinite(scoreGap)) gaps.push(Math.abs(scoreGap - truthGap));
      }
    }
    return mean(gaps);
  }

  /** The share of checks where the faster-reading twin scores above steady, and steady above the slower. */
  speedOrder(formula: string): number {
    let right = 0;
    let checks = 0;
    for (const seed of this.seeds) {
      for (const day of [29, 59, this.lastDay]) {
        const fast = this.at("twin-fast-reader", seed, day)?.scores[formula];
        const steady = this.at("steady", seed, day)?.scores[formula];
        const slow = this.at("twin-slow-reader", seed, day)?.scores[formula];
        if (fast === undefined || steady === undefined || slow === undefined) continue;
        checks++;
        if (fast > steady && steady > slow) right++;
      }
    }
    return checks === 0 ? 0 : right / checks;
  }

  /**
   * The crammer after its week, against steady readers on day 14 and 30: how
   * far the score overrates it compared with its reading, and how many pairs
   * come out in the wrong order.
   */
  cramming(formula: string): { overrated: number; wrong: number; pairs: number } {
    let wrong = 0;
    let pairs = 0;
    const inflation: number[] = [];
    for (const seed of this.seeds) {
      const crammed = this.at("crammer", seed, 6);
      for (const day of [13, 29]) {
        const steady = this.at("steady", seed, day);
        if (crammed === undefined || steady === undefined) continue;
        pairs++;
        const byScore = (crammed.scores[formula] ?? 0) > (steady.scores[formula] ?? 0);
        const byTruth = crammed.truth.coverage > steady.truth.coverage;
        if (byScore !== byTruth) wrong++;
        inflation.push(
          Math.log((crammed.scores[formula] ?? 0) / (steady.scores[formula] ?? 1)) -
            Math.log(crammed.truth.coverage / steady.truth.coverage),
        );
      }
    }
    return { overrated: mean(inflation), wrong, pairs };
  }

  /**
   * The thirty days away: how closely the score follows reading, and how far
   * its fall is from reading's. Positive: it fell less than reading did.
   */
  breakTracking(formula: string): { follows: number; fallError: number } {
    const follows: number[] = [];
    const errors: number[] = [];
    for (const seed of this.seeds) {
      const away = this.days.filter((day) => day >= 29 && day <= 59);
      const score = away.map((day) => this.at("break", seed, day)?.scores[formula] ?? 0);
      const truth = away.map((day) => this.at("break", seed, day)?.truth.coverage ?? 0);
      follows.push(pearson(score, truth));
      errors.push(
        Math.log((score.at(-1) ?? 0) / (score[0] ?? 1)) -
          Math.log((truth.at(-1) ?? 0) / (truth[0] ?? 1)),
      );
    }
    return { follows: mean(follows), fallError: mean(errors) };
  }

  /** The diligent reader's gain in each month, averaged over seeds. */
  monthlyGains(formula: string): number[] {
    const edges = [0, 29, 59, this.lastDay];
    const gains: number[] = [];
    for (let block = 1; block < edges.length; block++) {
      gains.push(
        mean(
          this.seeds.map(
            (seed) =>
              (this.at("diligent", seed, edges[block] ?? 0)?.scores[formula] ?? 0) -
              (this.at("diligent", seed, edges[block - 1] ?? 0)?.scores[formula] ?? 0),
          ),
        ),
      );
    }
    return gains;
  }

  /**
   * The diligent reader's real progress in each month, on the same kind of
   * scale as the coverage scores: halvings of what they would stumble on.
   * What any score's growth should be compared with.
   */
  truthMonthlyGains(): number[] {
    const halvings = (profile: string, seed: number, day: number): number =>
      -Math.log2(1 - (this.at(profile, seed, day)?.truth.coverage ?? 0));
    const edges = [0, 29, 59, this.lastDay];
    const gains: number[] = [];
    for (let block = 1; block < edges.length; block++) {
      gains.push(
        mean(
          this.seeds.map(
            (seed) =>
              halvings("diligent", seed, edges[block] ?? 0) -
              halvings("diligent", seed, edges[block - 1] ?? 0),
          ),
        ),
      );
    }
    return gains;
  }

  /** How much the fluent reader's score moves in a day, whose reading does not move. */
  wobble(formula: string): number {
    const moves: number[] = [];
    for (const seed of this.seeds) {
      for (const day of this.days) {
        const today = this.at("fluent", seed, day)?.scores[formula] ?? 0;
        const yesterday = this.at("fluent", seed, day - 1)?.scores[formula] ?? 0;
        if (today > 0 && yesterday > 0) moves.push(Math.abs(Math.log(today / yesterday)));
      }
    }
    return mean(moves);
  }
}
