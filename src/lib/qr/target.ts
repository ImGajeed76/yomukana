// What a scanned QR code leads to inside the app.
//
// The app's own codes are links: a reader's card, a group invite, a classroom
// screen. Scanned in the app, they are followed in the app, which is the whole
// point of scanning here rather than with the phone's camera: that one opens
// the browser, even when yomukana is installed.

/** Where the live site is. A code made on it works in any copy of the app. */
const SITE_ORIGIN = "https://yomukana.app";

/** The pages a yomukana code can point to. */
const PAGES = ["/@", "/join/", "/display/"];

/**
 * The path inside the app a scanned code points to, or null for a code that is
 * not one of this app's.
 *
 * `origin` is the app's own address, so codes made on a copy running locally
 * work there too.
 */
export function scannedPath(text: string, origin: string): string | null {
  if (!URL.canParse(text)) return null;
  const url = new URL(text);
  if (url.origin !== SITE_ORIGIN && url.origin !== origin) return null;
  if (!PAGES.some((page) => url.pathname.startsWith(page))) return null;
  return url.pathname;
}
