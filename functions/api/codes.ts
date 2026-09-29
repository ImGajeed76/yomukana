// Codes for invite and display links. The alphabet and the invite's length
// are in group-rules.ts, where the app reads them too.

import { CODE_ALPHABET as ALPHABET, INVITE_CODE_LENGTH } from "../../src/lib/sync/group-rules";

export { INVITE_CODE_LENGTH };

/**
 * Bytes at or above this are thrown away and drawn again. Taking the rest
 * modulo the alphabet's length would otherwise make its first few letters
 * a little likelier than the others.
 */
const FAIR_LIMIT = 256 - (256 % ALPHABET.length);

export function randomCode(length: number): string {
  let code = "";
  while (code.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte < FAIR_LIMIT && code.length < length)
        code += ALPHABET.charAt(byte % ALPHABET.length);
    }
  }
  return code;
}

/**
 * A display link shows a board without signing in and lasts until the admin
 * turns it off, so it is long enough that nobody finds one by guessing.
 */
export const DISPLAY_CODE_LENGTH = 20;

/** Whether a value could be one of these codes, checked before it reaches a query. */
export function isCode(value: string, length: number): boolean {
  if (value.length !== length) return false;
  for (const character of value) if (!ALPHABET.includes(character)) return false;
  return true;
}

const HEX = "0123456789abcdef";

/** Whether a value is a UUID as Postgres writes one, so a bad id is a 404 and not a crash. */
export function isUuid(value: string): boolean {
  if (value.length !== 36) return false;
  for (let index = 0; index < value.length; index++) {
    const character = value.charAt(index);
    const isDash = index === 8 || index === 13 || index === 18 || index === 23;
    if (isDash ? character !== "-" : !HEX.includes(character)) return false;
  }
  return true;
}
