/**
 * Calls `refresh` every `everyMs` while the page is in view, and once when it
 * comes back. Each call wakes the database for five minutes, so a tab left
 * open in the background must not keep calling. Returns what stops it.
 */
export function pollWhileVisible(refresh: () => void, everyMs: number): () => void {
  const refreshIfVisible = (): void => {
    if (!document.hidden) refresh();
  };
  const timer = setInterval(refreshIfVisible, everyMs);
  document.addEventListener("visibilitychange", refreshIfVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", refreshIfVisible);
  };
}
