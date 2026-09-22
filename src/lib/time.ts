// Calendar days, in the reader's own timezone.
//
// Low in the tree because both the scheduler and the stats page bucket by day,
// and they have to agree on where a day starts or a review lands on one day and
// is drawn on another.

/**
 * A local calendar day, as YYYY-MM-DD.
 *
 * Built from the local parts rather than from `toISOString`, which would put
 * anyone east of Greenwich on the wrong day for most of their evening.
 */
export function dayKey(at: Date): string {
  const month = String(at.getMonth() + 1).padStart(2, "0");
  const day = String(at.getDate()).padStart(2, "0");
  return `${String(at.getFullYear())}-${month}-${day}`;
}

/** Midnight local on a day key, which is how a bare date has to be parsed. */
export function startOfDay(date: string): Date {
  // `new Date("2026-03-10")` is read as UTC, and so lands on the 9th for anyone
  // west of Greenwich. With a time on it, it is read as local.
  return new Date(`${date}T00:00:00`);
}
