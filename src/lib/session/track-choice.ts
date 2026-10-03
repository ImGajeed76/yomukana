// Which track the practice page reads on: the reader's own, or a marathon
// they run in. Their choice, never made for them: someone in two marathons
// who also wants their own score up decides where each sentence counts.
//
// Kept in localStorage, on this device: it is a convenience, like the welcome
// having been seen, and losing it only means picking again. It throws in some
// private windows and with blocked site data, which nothing here can prevent,
// and then the answer is the reader's own track.

const KEY = "yomukana:track";

/** The marathon chosen to read in, by id, or null for the reader's own. */
export function chosenTrack(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Remembers a marathon to read in, or null for the reader's own. */
export function chooseTrack(marathonId: string | null): void {
  try {
    if (marathonId === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, marathonId);
  } catch {
    // Same failure as above. The practice page opens on the reader's own track.
  }
}
