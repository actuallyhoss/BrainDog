/**
 * WHO MAY SIGN UP, ASKED BESIDE THE PAGE AND NOT AFTER IT (speed-c FL3).
 *
 * Sign-up's first step waits for two answers: `/auth/methods` (does this host serve sign-up, and who is signed in) and
 * then the name door with no name (open, by invitation or closed, and the check's site key). `Signup.svelte` asked them
 * once it had arrived and mounted, so on a slow phone network the page drew, loaded, and only then spent two more round
 * trips before the sentence field showed. `+page.svelte` now asks them as it draws, while the page loads, and the page
 * takes the answers instead of asking again; once taken they are gone, so "Ask again" and a later visit ask afresh.
 *
 * THE SAME TWO, IN THE SAME ORDER: the name door is asked only of a host whose methods say it serves sign-up, as the page
 * always did (a self-host has no such door, and asking it printed a 404).
 */
import { methods, type Methods, type Said } from '../../lib/auth.ts';
import { checkName, type Asked, type NameSeen } from '../../lib/signup-door.ts';

/** What the first step reads: who may sign up, and the name door's answer where it was asked. */
export type FirstAnswers = { who: Said<Methods>; named: Asked<NameSeen> | null };

/** The two asks, in order. */
export const askFirst = async (): Promise<FirstAnswers> => {
  const who = await methods();
  return { who, named: who.ok && who.value.signup !== true ? null : await checkName('') };
};

let early: Promise<FirstAnswers> | null = null;

/**
 * Whether an address opens on the step that asks: a mailed link to spend and a way back from paying open on their own
 * steps (`arrivalOf` in `lib/signup.ts`), and are not asked for.
 */
export const asksFirst = (hash: string): boolean => !/^#(?:verify|paid|cancelled)(?:[=&]|$)/u.test(hash);

/** Ask now, from the page's first paint. */
export function askEarly(): void {
  early = askFirst();
}

/** The answers asked early, once, or `null` when there are none to take. */
export function takeEarly(): Promise<FirstAnswers> | null {
  const taken = early;
  early = null;
  return taken;
}
