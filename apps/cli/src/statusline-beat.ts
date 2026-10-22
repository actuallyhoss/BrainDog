/**
 * The detached child of `braindog statusline` (`statusline.ts`): one beat read from its standard input and sent as this
 * profile's meters. Its own file, so the print path never loads the network, the record's door or the profile code.
 */

import { apiCall } from './bridge.ts';
import { budgetOf, hostsPath, target } from './http.ts';
import { keepMeters } from './profile-place.ts';
import { PROFILE_NAME } from './position.ts';
import { isObject, percent, type Env, type StatusBeat } from './statusline.ts';

/** The whole of one beat's time on the network. */
export const STATUS_BEAT_MS = 3_000;

const MACHINE = /^[A-Za-z0-9._-]{1,128}$/;

/** A beat read back from the child's standard input, held to the grammar it is sent under, or null. */
export function readBeat(raw: string): StatusBeat | null {
  let x: unknown = null;
  try {
    x = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(x) || typeof x.profile !== 'string' || !PROFILE_NAME.test(x.profile) || typeof x.machine !== 'string' || !MACHINE.test(x.machine)) return null;
  const five = percent(x.five_hour_pct);
  const seven = percent(x.seven_day_pct);
  const at = typeof x.resets_at === 'string' && !Number.isNaN(Date.parse(x.resets_at)) ? new Date(x.resets_at).toISOString() : null;
  return { profile: x.profile, machine: x.machine, five_hour_pct: five, seven_day_pct: seven, resets_at: at };
}

/** Send one beat as the session of this profile on this machine, by name alone. Never throws; the outcome is for tests. */
export async function sendBeat(beat: StatusBeat, env: Env, go: typeof globalThis.fetch = globalThis.fetch): Promise<string> {
  try {
    const to = target(undefined, env, hostsPath(env));
    if (!to.token) return 'signed out';
    /* THE TWO HEADERS A PLACE IS KEPT UNDER, and no position: no folder leaves with a beat. */
    const session = { 'x-braindog-host': beat.machine, 'x-braindog-profile': beat.profile };
    const ms = Math.min(STATUS_BEAT_MS, budgetOf(env));
    return await keepMeters({
      ask: (method, body) => apiCall(to, method, body, session, go, ms),
      profile: beat.profile,
      meters: { five_hour_pct: beat.five_hour_pct, seven_day_pct: beat.seven_day_pct, resets_at: beat.resets_at },
    });
  } catch {
    return 'away';
  }
}
