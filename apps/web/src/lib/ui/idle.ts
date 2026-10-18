/**
 * When the tab has nothing else to do: `requestIdleCallback`, at most a second late, or a frame from now where the
 * browser cannot say. What is read after it is never in front of what a person is waiting for.
 */
export const idle = (): Promise<void> =>
  new Promise((done) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => done(), { timeout: 1_000 }) : setTimeout(done, 16)));
