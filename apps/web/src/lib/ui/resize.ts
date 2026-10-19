/*
 * A ResizeObserver whose answer comes the next frame. A callback that changes layout resizes what is watched, and
 * WebKit throws that second round in the same frame as an uncaught "ResizeObserver loop" error; a frame later it is
 * a new frame's first round, and the loop ends where the sizes stop changing.
 */
export function frameResizeObserver(answer: ResizeObserverCallback): ResizeObserver {
  let frame = 0;
  let last: ResizeObserverEntry[] = [];
  const watch = new ResizeObserver((seen) => {
    last = seen;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => answer(last, watch));
  });
  const disconnect = watch.disconnect.bind(watch);
  watch.disconnect = () => {
    cancelAnimationFrame(frame);
    disconnect();
  };
  return watch;
}
