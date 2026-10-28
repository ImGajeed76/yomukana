// A pretend class, for looking at the classroom screen without a real one.
//
// Only for `/display?debug` on localhost: the display page loads this in place
// of the API, so the rows moving, the highlights, the scrolling and the
// offline note can all be watched with numbers that change every few seconds.
// Loaded on demand, so it never reaches a real visitor.

import type { Badge } from "./badge-rules";
import { CARD_COLORS, type CardColor } from "./profile-rules";
import type { DisplayBoard, GroupMember, GroupProblem } from "./groups";
import type { MarathonDisplay, Runner } from "./marathons";

const ADJECTIVES = ["quiet", "brave", "sleepy", "swift", "gentle", "clever", "bright", "calm"];
const ANIMALS = ["tanuki", "kitsune", "neko", "tori", "kame", "usagi", "kuma", "saru", "koi"];
const DISPLAY_NAMES = [
  "Aiko",
  "Kenji",
  "Mia",
  "Lukas",
  "Hana",
  "さくら",
  "Yuto",
  "Lea 🌸",
  "たけし",
];
const COLORS: readonly CardColor[] = CARD_COLORS;

// Badges a pretend class might wear. Most readers wear one, some none.
const BADGES: readonly Badge[] = [
  { emoji: "🦊", tag: "KITS", color: "orange" },
  { emoji: null, tag: "N5", color: "teal" },
  { emoji: "🐱", tag: "ネコ", color: "pink" },
  { emoji: "🔰", tag: "1A", color: "blue" },
];

/** The class it starts with, and the most it grows to as people join. */
const STARTING_SIZE = 28;
const LARGEST_SIZE = 40;

interface Reader {
  member: GroupMember;
  /** Points an active reader gains in one round, on average. */
  pace: number;
  /** The chance they are studying in any one round. */
  activity: number;
}

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) throw new Error("picked from an empty list");
  return item;
}

function newReader(index: number): Reader {
  const hasDisplayName = Math.random() < 0.5;
  return {
    member: {
      username: `${pick(ADJECTIVES)}-${pick(ANIMALS)}-${String(10 + index)}`,
      displayName: hasDisplayName ? pick(DISPLAY_NAMES) : null,
      cardColor: pick(COLORS),
      // Spread out, a few far ahead and a long tail, the way a real class is.
      score: Math.round(900 * Math.pow(0.92, index) * (0.8 + Math.random() * 0.4)),
      scoredAt: Date.now(),
      role: index === 0 ? "admin" : "member",
      badges: Math.random() < 0.7 ? [pick(BADGES)] : [],
      isYou: false,
    },
    pace: 2 + Math.random() * 10,
    activity: 0.2 + Math.random() * 0.5,
  };
}

/**
 * One round of the class studying: most of it a little, now and then someone
 * a lot, and sometimes a newcomer. Now and then the connection "drops", so the
 * offline note can be seen too.
 */
export function createDisplaySimulator(): () => Promise<
  { value: DisplayBoard } | { problem: GroupProblem }
> {
  const readers = Array.from({ length: STARTING_SIZE }, (_, index) => newReader(index));
  let isFirst = true;

  return async () => {
    // As slow as the real thing, so the spinner shows as it would.
    await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 900));

    if (!isFirst) {
      if (Math.random() < 0.08) return { problem: "offline" };
      for (const reader of readers) {
        if (Math.random() > reader.activity) continue;
        // A long evening of practice, once in a while, moves someone a long way.
        const gain =
          Math.random() < 0.04
            ? 80 + Math.random() * 120
            : reader.pace * (0.5 + Math.random() * 1.5);
        reader.member = {
          ...reader.member,
          score: Math.round(reader.member.score + gain),
          scoredAt: Date.now(),
        };
      }
      if (readers.length < LARGEST_SIZE && Math.random() < 0.1) {
        const newcomer = newReader(readers.length);
        readers.push({ ...newcomer, member: { ...newcomer.member, score: 0 } });
      }
    }
    isFirst = false;

    return {
      value: { name: "Simulated class", members: readers.map((reader) => reader.member) },
    };
  };
}

/** How many in the pretend race fight over the podium, and how often one of them spurts. */
const LEADERS = 6;
const SPURT_CHANCE = 0.4;

/**
 * One refresh of a pretend race, changing `runners` in place: those reading
 * gain a little now and then, `wakeChance` of the others start reading, now
 * and then a reader puts it down, and now and then one of those near the top
 * puts on a spurt and climbs past the leader, so the podium changes while you
 * watch.
 */
function advanceRace(runners: Runner[], now: number, wakeChance: number): void {
  for (const [index, runner] of runners.entries()) {
    const isReading = runner.scoredAt !== null && now - runner.scoredAt < 300_000;
    const startsReading = !isReading && Math.random() < wakeChance;
    if (!(isReading || startsReading) || (isReading && Math.random() < 0.04)) continue;
    // A reader syncs every few minutes, not every refresh.
    if (!startsReading && Math.random() > 0.12) continue;
    const score = runner.score + 3 + Math.random() * 22;
    runners[index] = { ...runner, score, endScore: score * 0.95, scoredAt: now };
  }
  if (Math.random() >= SPURT_CHANCE) return;
  const contenders = [...runners].sort((one, other) => other.score - one.score).slice(0, LEADERS);
  const runner = contenders[1 + Math.floor(Math.random() * (contenders.length - 1))];
  const index = runner === undefined ? -1 : runners.indexOf(runner);
  if (runner === undefined || index < 0) return;
  const ahead = contenders[0]?.score ?? runner.score;
  const score = Math.max(runner.score, ahead) + 4 + Math.random() * 20;
  runners[index] = { ...runner, score, endScore: score * 0.95, scoredAt: now };
}

/**
 * A marathon a day into its race, for `/display?debug=race`: `people`
 * runners (`&people=60`, 30 if not given), some reading right now, some
 * earlier today, some not since yesterday, the readers gaining points with
 * each refresh and now and then one waking up or putting it down. It ends in
 * three days, or after `endsIn` seconds (`&end=70`), and then its results
 * come half a minute later, to watch the count to the end and the podium.
 */
export function createRaceSimulator(
  hasInvite: boolean,
  endsIn: number | null,
  people: number,
): () => Promise<MarathonDisplay> {
  const opened = Date.now();
  const startsAt = opened - 86_400_000;
  const endsAt = opened + (endsIn ?? 3 * 86_400) * 1000;
  const today = new Date(opened).setHours(0, 0, 0, 0);
  const runners: Runner[] = Array.from({ length: people > 0 ? people : 30 }, (_, index) => {
    const { member } = newReader(index);
    const roll = Math.random();
    // Reading now, earlier today, or not since yesterday. The leaders are
    // all reading now, so the podium is fought over.
    const earlierToday = today + Math.random() * Math.max(0, opened - 600_000 - today);
    const scoredAt =
      index < LEADERS || roll < 0.35 || earlierToday <= today
        ? opened - Math.random() * 180_000
        : roll < 0.7
          ? earlierToday
          : opened - 30 * 3_600_000;
    // The leaders a few points apart, so one spurt changes the podium.
    const score = index < LEADERS ? 900 - index * 12 - Math.random() * 8 : member.score * 0.85;
    return {
      username: member.username,
      displayName: member.displayName,
      cardColor: member.cardColor,
      badges: member.badges,
      score,
      endScore: score * 0.95,
      scoredAt,
      enteredAt: startsAt,
      isAdmin: index === 0,
      isYou: false,
    };
  });

  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 400));
    const now = Date.now();
    if (now < endsAt) advanceRace(runners, now, 0.03);
    return {
      id: "simulated-race",
      name: "Simulated marathon",
      startsAt,
      endsAt,
      allowsLateEntry: true,
      resultsDelay: endsIn === null ? 60 : 0.5,
      showsInvite: hasInvite,
      runners: [...runners],
      watchers: 0,
      inviteCode: hasInvite ? "pretend1" : null,
    };
  };
}

/** The most runners the pretend lobby grows to: as many as a marathon takes. */
const LOBBY_LARGEST = 1000;

/**
 * A marathon that has not started, for `/display?debug=lobby`: the room
 * starts empty and fills as people join, one every few seconds, and now and
 * then someone leaves again. With `hasInvite` (`&invite` on the address) it
 * shows its invite on the screen too. It starts in an hour and a half, or
 * after `startsIn` seconds (`&start=70`), to watch the countdown and the start.
 * With `people` (`&people=250`) that many are already there when it opens,
 * to see the room crowded.
 *
 * At the start it carries on into the race with the same people, everyone
 * from zero, most of them reading straight away, as createRaceSimulator's
 * race does. It ends two weeks later, or `endsIn` seconds after the start
 * (`&end=60`), its results half a minute after that.
 */
export function createLobbySimulator(
  hasInvite: boolean,
  startsIn: number | null,
  people: number,
  endsIn: number | null,
): () => Promise<MarathonDisplay> {
  const startsAt = Date.now() + (startsIn ?? 90 * 60) * 1000;
  const endsAt = startsAt + (endsIn ?? 14 * 86_400) * 1000;
  const runners: Runner[] = [];
  let joined = 0;
  let isFirst = true;
  let hasStarted = false;

  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 400));
    const now = Date.now();
    if (now >= startsAt && now < endsAt) {
      // Off: most start reading at once, the rest wander in over the next minutes.
      advanceRace(runners, now, hasStarted ? 0.05 : 0.7);
      hasStarted = true;
    }
    // Before the start, now and then someone changes their mind.
    if (!hasStarted && runners.length > 3 && Math.random() < 0.05) {
      runners.splice(Math.floor(Math.random() * runners.length), 1);
    }
    // Empty at first, or as full as asked, so everyone after falls in. Late
    // joiners keep coming during the race, more slowly.
    const arriving = isFirst
      ? people
      : hasStarted
        ? Math.random() < 0.15
          ? 1
          : 0
        : Math.random() < 0.15
          ? 2
          : Math.random() < 0.6
            ? 1
            : 0;
    isFirst = false;
    for (let count = 0; count < arriving && runners.length < LOBBY_LARGEST; count++) {
      const { member } = newReader(joined);
      joined += 1;
      runners.push({
        username: member.username,
        displayName: member.displayName,
        cardColor: member.cardColor,
        badges: member.badges,
        score: 0,
        endScore: 0,
        scoredAt: null,
        enteredAt: Date.now(),
        isAdmin: joined === 1,
        isYou: false,
      });
    }
    return {
      id: "simulated-lobby",
      name: "Simulated marathon",
      startsAt,
      endsAt,
      allowsLateEntry: true,
      resultsDelay: endsIn === null ? 60 : 0.5,
      showsInvite: hasInvite,
      runners: [...runners],
      watchers: 0,
      inviteCode: hasInvite ? "pretend1" : null,
    };
  };
}
