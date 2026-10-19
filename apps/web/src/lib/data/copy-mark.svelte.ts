/**
 * Whether anything on screen was drawn from the local copy and is still being asked again (`local.ts`): the root
 * layout draws a quiet bar over the work while it is, and nothing once every screen's answer has landed.
 *
 * A COUNT, NOT A FLAG, because Today, its briefing and a panel can each be drawn from the copy at once, and the bar
 * goes only when the last of them hears from the record. Each holder lets go once; a second release is a no-op, so a
 * screen torn down mid-read cannot take another screen's hold with it.
 */

let held = $state(0);

export const copyMark = {
  /** Something drawn from the copy is waiting on the record. */
  get on(): boolean {
    return held > 0;
  },
};

/** Hold the mark up; call what comes back when the answer lands or the screen goes. */
export function holdCopyMark(): () => void {
  held += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    held = Math.max(0, held - 1);
  };
}
