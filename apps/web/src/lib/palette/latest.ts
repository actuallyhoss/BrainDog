/**
 * Only the newest question gets an answer.
 *
 * TYPING FAST SENDS SEVERAL READS, and they come back in whatever order the network likes. A result drawn for `fen`
 * after the box already says `fenwick` is a list about a question nobody is asking any more. So each ask cancels the
 * one before it: a read still waiting to start is never sent, and one already sent is aborted and its answer dropped.
 *
 * `wait` holds a read back until the typing pauses, so a burst of keys costs one request rather than one per key.
 */

export type Latest<A, T> = {
  ask(arg: A, done: (value: T) => void): void;
  cancel(): void;
};

export function latest<A, T>(run: (arg: A, signal: AbortSignal) => Promise<T>, wait = 0): Latest<A, T> {
  let current: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    current?.abort();
    current = null;
  };
  return {
    ask(arg, done) {
      cancel();
      const mine = new AbortController();
      current = mine;
      timer = setTimeout(() => {
        run(arg, mine.signal).then(
          (value) => {
            if (!mine.signal.aborted) done(value);
          },
          () => {},
        );
      }, wait);
    },
    cancel,
  };
}
