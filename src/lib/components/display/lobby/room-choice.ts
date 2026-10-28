// Whether this screen shows a marathon as the 3D room or as the plain board.
// A choice about the machine, not the reader: an old classroom PC may
// struggle with the room, so whoever sets it up switches it off once, there.

const KEY = "yomukana-display-room";

/**
 * Whether the room shows: as this machine was last switched, or else
 * `isDefault`. The page's default is the room, unless the machine asks for
 * reduced motion; the room is all motion, so then the plain board, which
 * the switch can still change.
 */
export function readRoomChoice(isDefault: boolean): boolean {
  // Storage throws in a private window or with site data blocked. Then
  // there is no choice kept, and it is the default.
  try {
    const kept = localStorage.getItem(KEY);
    return kept === "on" ? true : kept === "off" ? false : isDefault;
  } catch {
    return isDefault;
  }
}

export function saveRoomChoice(isOn: boolean): void {
  // As above: without storage the choice lasts until the page closes.
  try {
    localStorage.setItem(KEY, isOn ? "on" : "off");
  } catch {
    // Nothing to keep it in.
  }
}
