import type { Fetch } from '$lib/record/boot-live.ts';

/*
 * A fetch that stops asking once the tab is being left. WebKit refuses every call begun after a navigation starts and
 * prints each as an error; `beforeunload` is the last event before that. `stop` takes the listener away.
 */
export function leavingFetch(): { io: Fetch; stop: () => void } {
  const leaving = new AbortController();
  const leave = () => leaving.abort();
  addEventListener('beforeunload', leave);
  return {
    io: (url, init) => fetch(url, { ...init, signal: leaving.signal }),
    stop: () => removeEventListener('beforeunload', leave),
  };
}
