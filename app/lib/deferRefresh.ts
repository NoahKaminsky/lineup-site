// Pages are rendered with fresh data from the server, then refresh it once in
// the browser to catch anything that changed in between. That refresh used to
// fire the instant the page mounted — re-running every query while the phone
// was still busy drawing and hydrating the page. When we already have data on
// screen, wait until the browser is idle (or ~1s at most) first. With nothing
// on screen yet, load right away. Returns a cancel function for useEffect.
export function deferRefresh(hasData: boolean, run: () => void): () => void {
  if (!hasData || typeof window === "undefined") {
    run();
    return () => {};
  }

  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(run, { timeout: 1000 });
    return () => w.cancelIdleCallback?.(id);
  }

  // Safari has no requestIdleCallback.
  const id = window.setTimeout(run, 600);
  return () => window.clearTimeout(id);
}
