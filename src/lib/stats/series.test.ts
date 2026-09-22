import { describe, expect, test } from "bun:test";
import type { DailyLatency } from "../srs";
import { CARRY_FORWARD_DAYS, dailyLatencies } from "./series";

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

  test("gives up carrying a reading forward once it stops describing anyone", () => {
    // The read is the oldest day in the span, and the span runs five days past
    // the point a stale reading is allowed to stand in.
    const series = dailyLatencies(
      [day("2026-01-02", 400)],
      CARRY_FORWARD_DAYS + 6,
      new Date("2026-02-06T18:00:00"),
    );
    expect(series[0]?.value).toBe(400);
    expect(series.at(-1)?.value).toBe(0);
  });

  test("draws nothing for a character with no reads at all", () => {
    expect(dailyLatencies([], 7, today)).toEqual([]);
  });
});
