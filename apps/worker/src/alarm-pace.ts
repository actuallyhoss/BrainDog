/**
 * How the alarm shares the object with whoever is calling (`Record$`'s `#alarmPass`): it breathes with a timer between
 * steps, and stands aside while a person is here, with what is left going on soon after.
 *
 * WHAT WAS SEEN, 6 NOVEMBER. Alarm passes took 3.9 to 10.8 s of CPU and held the first request behind them for 6.6 to
 * 10.5 s; 143 of 181 requests over 2 s overlapped such a pass. On local workerd, awaiting storage lets no request in, and
 * only a timer does, so a pass that awaits nothing else runs from end to end with every request waiting. A timer between
 * steps is the door. It is also the clock: a Worker's clock stands still while code runs, so a step's time reads true only
 * after a timer has fired behind it (`#step`, `alarm-step`).
 *
 * SOMEBODY IS HERE WHEN A PERSON'S CALL IS BEING ANSWERED, OR ONE CAME SINCE THIS PASS BEGAN. Not the version poll an open
 * tab sends every 1.5 s and not an agent's pulse, of which there are about 46 a minute: either would keep the alarm aside
 * for as long as a tab or a bridge stays open. They still get in at every breath. A person's call that ended before the
 * pass began does not count, so the worst a person waits behind the alarm is one step or one slice of a step.
 *
 * ASIDE HAS AN END (`ASIDE_MOST_MS`), so somebody working all afternoon does not hold a bank's text or the day's look for
 * the afternoon. Past it a pass runs with its breaths and no standing aside, and the count starts again after a pass that
 * reached its end.
 *
 * NOTHING HERE IMPORTS `cloudflare:`, so every rule runs in a bare test.
 */

/** How far off the alarm is set when it stands aside. */
export const ASIDE_MS = 5_000;
/** How long, from the first time, a run of passes may stand aside before one runs regardless. */
export const ASIDE_MOST_MS = 60_000;
/**
 * The most of its share a page-drawing step spends between two breaths, in the units of `TickBudget`. A step that is
 * asked again goes on from where it kept, so this costs one more look at its own place and no work twice.
 */
export const ALARM_SLICE_UNITS = 2;

/** One turn of the event loop behind a timer: requests waiting get in, and the clock moves. */
export const breathe = (): Promise<void> => new Promise((done) => setTimeout(done, 1));

export type Pace = {
  /** Any call arrived. */
  called(): void;
  /** How many calls have arrived so far, whoever from: a step's line says how many it let in (`alarm-step`). */
  calls(): number;
  /** A person's call is being answered, from now until `left`. */
  arrived(): void;
  left(): void;
  /** A pass begins: a person's call from here on, or one still being answered, means somebody is here. */
  began(): void;
  /** Whether this pass should stand aside now. The first yes starts the count `ASIDE_MOST_MS` is held against. */
  aside(): boolean;
  /** The alarm stands aside until `at`: a request's wake until then is not asked for, as one is already set. */
  stoodOff(at: number): void;
  /** Whether the alarm is standing aside now. */
  standing(): boolean;
  /** A pass reached its end without standing aside. */
  finished(): void;
};

export function pace(now: () => number = Date.now): Pace {
  let calls = 0;
  let people = 0;
  let answering = 0;
  let peopleAtStart = 0;
  let first: number | null = null;
  let until = 0;
  return {
    called: () => {
      calls += 1;
    },
    calls: () => calls,
    arrived: () => {
      people += 1;
      answering += 1;
    },
    left: () => {
      answering = Math.max(0, answering - 1);
    },
    began: () => {
      peopleAtStart = people;
    },
    aside: () => {
      if (answering === 0 && people === peopleAtStart) return false;
      const at = now();
      /* A CLOCK THAT WENT BACK STARTS THE COUNT AGAIN, and never reads as past its end. */
      if (first !== null && at < first) first = at;
      if (first !== null && at - first >= ASIDE_MOST_MS) return false;
      first ??= at;
      return true;
    },
    stoodOff: (at) => {
      until = at;
    },
    standing: () => now() < until,
    finished: () => {
      first = null;
      until = 0;
    },
  };
}
