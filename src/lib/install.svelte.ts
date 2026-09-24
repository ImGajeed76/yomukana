// Whether yomukana can be installed as an app here, and how.
//
// Browsers differ completely on this. Chrome and Edge, on Android and on
// desktop, announce that a site can be installed with a `beforeinstallprompt`
// event, and the page may keep that event and open the browser's own install
// dialog from a button later. Safari on iPhone and iPad has no such event and
// nothing a page can call: the only way is Share, then Add to Home Screen,
// which the reader has to do themselves. Firefox and desktop Safari offer
// nothing worth pointing at.

/** Chrome's install event. Not in the DOM types, because only Chromium has it. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
}

/** How this browser installs an app, if it can. */
export type InstallRoute =
  /** The browser's own install dialog, opened from a button. */
  | "prompt"
  /** Share, then Add to Home Screen, done by hand on iPhone and iPad. */
  | "home-screen"
  /** Already running as an installed app, or a browser that cannot install. */
  | "none";

function isAppleMobile(): boolean {
  const agent = navigator.userAgent;
  // iPadOS reports itself as a Mac. A Mac with a touch screen is an iPad.
  return (
    agent.includes("iPhone") ||
    agent.includes("iPad") ||
    (agent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

function isRunningInstalled(): boolean {
  // Safari on iOS says so with its own flag rather than the media query.
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  return standalone === true || matchMedia("(display-mode: standalone)").matches;
}

class Install {
  #deferred: BeforeInstallPromptEvent | null = null;
  #isListening = false;

  route = $state<InstallRoute>("none");

  /**
   * Starts watching for the browser's install event. Called once, from the
   * root layout, because the event fires shortly after the page loads and not
   * when the reader gets round to opening settings.
   */
  listen(): void {
    if (this.#isListening) return;
    this.#isListening = true;

    if (isRunningInstalled()) return;
    if (isAppleMobile()) this.route = "home-screen";

    // Kept, not cancelled: the browser still offers to install in its own way
    // too, and the button in settings is one more way in, not a replacement.
    window.addEventListener("beforeinstallprompt", (event) => {
      this.#deferred = event as BeforeInstallPromptEvent;
      this.route = "prompt";
    });
    window.addEventListener("appinstalled", () => {
      this.#deferred = null;
      this.route = "none";
    });
  }

  /** Opens the browser's install dialog. Returns whether the reader installed. */
  async prompt(): Promise<boolean> {
    const deferred = this.#deferred;
    if (deferred === null) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The event can only be used once, whatever the answer was.
    this.#deferred = null;
    this.route = outcome === "accepted" ? "none" : this.route;
    return outcome === "accepted";
  }
}

export const install = new Install();
