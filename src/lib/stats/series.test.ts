import { describe, expect, test } from "bun:test";
import type { DailyLatency } from "../srs";
import { dailyLatencies } from "./series";

const today = new Date("2026-03-10T18:00:00");

function day(date: string, latencyMs: number): DailyLatency {
  return { day: date, latencyMs, reads: 1 };
}

describe("dailyLatencies", () => {
  test("starts at the first read, not at the start of the span", () => {
    // Zero here would claim the reader recognised the character instantly
    // before they had ever seen it.
    expect(dailyLatencies([day("2026-03-10", 400)], 7, today)).toEqual([
      { date: "2026-03-10", value: 400 },
    ]);
  });

  test("holds the last reading through a quiet day", () => {
    expect(dailyLatencies([day("2026-03-08", 400)], 3, today).map((point) => point.value)).toEqual([
      400, 400, 400,
    ]);
  });

  test("holds a reading through a long gap rather than reading as instant", () => {
    // Drawn as zero, a gap said the reader had got infinitely fast while they
    // were not there.
    const series = dailyLatencies([day("2026-01-02", 400)], 60, new Date("2026-03-02T18:00:00"));
    expect(series.at(-1)?.value).toBe(400);
  });

  test("draws nothing for a character with no reads at all", () => {
    expect(dailyLatencies([], 7, today)).toEqual([]);
  });
});
