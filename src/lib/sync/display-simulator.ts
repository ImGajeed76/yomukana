// A pretend class, for looking at the classroom screen without a real one.
//
// Only for `/display?debug` on localhost: the display page loads this in place
// of the API, so the rows moving, the highlights, the scrolling and the
// offline note can all be watched with numbers that change every few seconds.
// Loaded on demand, so it never reaches a real visitor.

import type { CardColor } from "./profile-rules";
import type { DisplayBoard, GroupMember, GroupProblem } from "./groups";

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
const COLORS: readonly CardColor[] = ["green", "blue", "violet", "rose", "amber", "slate"];

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
