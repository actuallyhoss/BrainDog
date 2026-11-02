/**
 * The question typing itself into the bar, then the "Reading your record" or "Drafting" line, then the answer: the
 * prototype's `typeInto`, shared by the home card's scene, the desk's
 * bar and anything else that draws Slash answering.
 *
 * IT PAINTS FRAMES AND DRAWS NOTHING. A caller keeps `typed` and `phase` in its own state and draws them; this only
 * says what they are and when. So it runs under node with a fake clock, and the test holds the order.
 *
 * UNDER REDUCED MOTION NOTHING MOVES: the whole question and the answer are painted at once, in the same call, and no
 * timer is set. The same holds when the caller says `reduced: true`, which is how a test asks for it.
 */

export type Phase = 'idle' | 'typing' | 'thinking' | 'answer';

/** What the bar shows: the letters typed so far, and which part of the answer is up. */
export type Frame = { typed: string; phase: Phase };

/** One letter every 22 ms, a short breath, then the thinking line for 700 ms when the mode has one. */
export const LETTER_MS = 22;
export const PAUSE_MS = 120;
export const THINK_MS = 700;

export type Clock = { later: (fn: () => void, ms: number) => unknown; cancel: (handle: unknown) => void };

const CLOCK: Clock = {
  later: (fn, ms) => setTimeout(fn, ms),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** True when the reader asked for less motion. False where there is no `matchMedia`, as in the prerender. */
export function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Types `question` into the bar by painting frames, and answers. `think` is the line shown between the typing and
 * the answer ("Reading your record", "Drafting"), or nothing for a mode that answers at once (Find). Returns a stop
 * that cancels every frame still to come, for a new pick, a closed bar or a component going away.
 */
export function typeInto(
  question: string,
  paint: (frame: Frame) => void,
  opts: { think?: string | null; reduced?: boolean; clock?: Clock } = {},
): () => void {
  if (opts.reduced ?? reducedMotion()) {
    paint({ typed: question, phase: 'answer' });
    return () => {};
  }
  const clock = opts.clock ?? CLOCK;
  const handles: unknown[] = [];
  const at = (ms: number, frame: Frame) => handles.push(clock.later(() => paint(frame), ms));

  paint({ typed: '', phase: 'typing' });
  for (let k = 0; k < question.length; k++) at(LETTER_MS * k, { typed: question.slice(0, k + 1), phase: 'typing' });
  let t = LETTER_MS * question.length + PAUSE_MS;
  if (opts.think) {
    at(t, { typed: question, phase: 'thinking' });
    t += THINK_MS;
  }
  at(t, { typed: question, phase: 'answer' });
  return () => {
    for (const h of handles) clock.cancel(h);
    handles.length = 0;
  };
}
