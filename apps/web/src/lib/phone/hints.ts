/**
 * The phone's two asks, each made once and at the moment it means something: putting BrainDog on the Home Screen, and
 * turning notifications on.
 *
 * ONCE, EVER, ON THIS PHONE. Each is marked asked the moment it is shown, whatever the answer, so neither comes back:
 * Settings > Notifications keeps the switch, and the Home Screen step is a thing a person can do whenever they like.
 *
 * THE HOME SCREEN ON THE SECOND DAY, NOT THE FIRST VISIT. Somebody who opened BrainDog once is still deciding what it is;
 * somebody who came back on another day has decided, and on an iPhone it is also the step that lets it notify them. An
 * iPhone has no install button of its own, so it is told where the step is; Android offers its own prompt, and the card
 * opens it.
 *
 * NOTIFICATIONS WHEN SOMETHING FIRST WAITS ON THEM. The question "want to be told?" means nothing until there is a
 * thing to be told about, so it is asked the first time Needs you holds something, and only where a push can arrive:
 * the Home Screen app on an iPhone, or Android.
 *
 * PER DEVICE, in `localStorage`, a convenience and never the record's state: a browser that keeps nothing never asks.
 */

const KEY = 'bd.phone';

type Kept = { days?: string[]; install?: number; push?: number };

function read(): Kept {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') as Kept | null;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function write(k: Kept): boolean {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(k));
    return true;
  } catch {
    return false;
  }
}

/** Note today as a day this phone opened BrainDog, and answer how many different days it has (at most a few kept). */
export function openedToday(now: number = Date.now()): number {
  const k = read();
  const day = new Date(now).toISOString().slice(0, 10);
  const days = [...new Set([...(k.days ?? []), day])].slice(-3);
  if (!write({ ...k, days })) return 0;
  return days.length;
}

/** Whether this ask was made on this phone already. */
export const asked = (which: 'install' | 'push'): boolean => typeof read()[which] === 'number';

/** Mark this ask made, so it is not made again. Answers false when the phone keeps nothing, and then it is not asked. */
export const markAsked = (which: 'install' | 'push', now: number = Date.now()): boolean => write({ ...read(), [which]: now });

/** The words of both asks. */
export const words = {
  installTitle: 'Put BrainDog on your Home Screen',
  installWhy: 'It opens like an app, shows what you last saw when you are offline, and can tell you when something needs you.',
  /* THE IPHONE'S STEPS, in Safari's own names, the Share glyph drawn between the two halves. Newer Safari keeps Share in
     its ••• menu, so the step says where else to look. */
  iosBefore: 'Tap',
  iosAfter: 'Share (it may be under •••), then Add to Home Screen.',
  install: 'Install',
  gotIt: 'Got it',
  notNow: 'Not now',
  pushTitle: 'Want a nudge when something needs you?',
  pushWhy: 'Your phone will only say that something is waiting, never what it is. Change it any time in Settings.',
  pushOn: 'Turn on',
  pushDone: 'Notifications are on for this phone.',
} as const;
