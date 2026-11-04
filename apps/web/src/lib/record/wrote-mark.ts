/**
 * WHEN THIS BROWSER LAST MOVED A ROW, in `localStorage`, for what Today keeps of itself. A task ticked, then a reload: the
 * kept picture (`kept-frame.ts`), the local copy (`local.ts`), what the tab kept and the record's own last drawing (`behind`)
 * all still held the row as it was, and the ticked task stood there undone until the record's answer landed, up to 8 s on
 * his record. So a drawing older than the last write here is not drawn at all, and Today is asked for drawn now.
 *
 * NOT ANSWERS, whose question is known and is taken out of a kept drawing (`answers-out.ts`), so that open stays instant. A
 * row a write moved is not named by any kept drawing the browser could find it in, so this one skips the drawing: the one open
 * right after a write draws from the record, and the next has its picture back. Any other open is as it was.
 *
 * PURE FOR NODE: every browser global is read inside a function.
 */

/** Spelt again in `app.html`, which reads it before any of this has loaded. */
export const WROTE_KEY = 'bd_wrote_at';
const TODAY_KEY = 'bd_today_at';

/** The writes that move what Today draws. A preference, a read mark or a step says nothing about its rows. */
const MOVES: ReadonlySet<string> = new Set(['create', 'update', 'log', 'report', 'attach', 'undo', 'undoOwn', 'undoRun', 'ruleApply']);

const store = (): Pick<Storage, 'getItem' | 'setItem'> | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};
const read = (key: string): number => {
  try {
    return Number(store()?.getItem(key) ?? 0) || 0;
  } catch {
    return 0;
  }
};
const write = (key: string, at: number): void => {
  try {
    store()?.setItem(key, String(at));
  } catch {
    /* A browser that keeps nothing keeps no picture to doubt. */
  }
};

/** A write going out. */
export const noteWrite = (name: string, now: number = Date.now()): void => {
  if (MOVES.has(name)) write(WROTE_KEY, now);
};

/** Today was drawn from the record's own answer, read after every write noted so far. */
export const noteToday = (asked: number): void => write(TODAY_KEY, asked);

/** Whether a row has moved here since Today was last read from the record: what is kept of Today is older than that. */
export const movedSinceToday = (): boolean => read(WROTE_KEY) > read(TODAY_KEY);
