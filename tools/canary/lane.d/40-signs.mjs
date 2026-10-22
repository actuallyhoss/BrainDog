/**
 * The lane's fourth step: the canary's vital signs, red on a reading older than 26 hours (PRF-A09, PRF-A01).
 *
 * WHY. The record files one reading a sign at 00:05 each night, by itself (`packages/kernel/src/signs.ts`). A deploy
 * that stopped the night's work (an alarm not re-armed, a handler that throws) leaves every screen drawing and every
 * smoke green, and the only sign of it is that the newest reading grows old. A day and two hours is one missed night
 * with room for a lane that runs just after midnight.
 *
 * HOW OLD, FROM THE ANSWER ALONE. `signs` answers each sign with its last fourteen days in the record's own zone,
 * ending yesterday, so "today" there is the day after the last. The newest day that holds a reading was filed at 00:05
 * the day after it. The answer does not name the zone, so the record's midnight is taken as late as any zone could put
 * it (twelve hours behind UTC, and never after now): a reading this calls old is old in every zone. `CANARY_TZ`, when
 * set, makes it exact.
 *
 * ASKED WITH THE SMOKE'S KEY, `GET /app/<canary>/api/signs`, a read that files nothing. Until the owner's sitting, a fresh
 * self-host is asked with its server key: the route answers and every sign is there, and a record made a minute ago
 * has had no night, so the age is asked only of the canary, and the line says "self-host only".
 *
 * A RED HERE OPENS A FINDING; it does not roll back.
 */

import { SELF_HOST_ONLY, selfHost, where } from '../lib.mjs';

export const onRed = 'finding';

/** How old the newest reading may be. */
export const MOST_HOURS = 26;

const DAY = 86_400_000;
const dayMs = (day) => Date.parse(`${day}T00:00:00Z`);

/** Midnight starting `day` in `tz`, as an instant: the UTC midnight moved by the zone's offset at that moment. */
function midnightIn(day, tz) {
  const utc = dayMs(day);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(utc)).map((p) => [p.type, p.value]));
  const shown = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
  return utc - (shown - utc);
}

/**
 * The newest reading of any sign and its age in hours, or `null` when no sign holds a reading in the fourteen days.
 * `{ day, hours }`. `tz` the record's zone when known; without it, the youngest age any zone allows.
 */
export function newestReading(signs, nowMs, tz) {
  const days = signs.flatMap((s) => (Array.isArray(s?.days) ? s.days : []));
  if (days.length === 0) return null;
  const last = days.map((d) => d.day).sort().at(-1);
  const read = days.filter((d) => d.state === 'green' || d.state === 'red').map((d) => d.day).sort();
  if (read.length === 0) return null;
  const newest = read.at(-1);
  const today = new Date(dayMs(last) + DAY).toISOString().slice(0, 10);
  const midnightToday = tz ? midnightIn(today, tz) : Math.min(nowMs, dayMs(today) + 12 * 3_600_000);
  const filed = midnightToday - (dayMs(today) - dayMs(newest) - DAY) + 5 * 60_000;
  return { day: newest, hours: Math.max(0, (nowMs - filed) / 3_600_000) };
}

/** The verdict on one `signs` answer: `{ red, line }`. `live` false is the self-host's, which judges no age. */
export function judge(value, { nowMs = Date.now(), tz, live = true } = {}) {
  const signs = Array.isArray(value?.signs) ? value.signs : null;
  if (signs === null || signs.length === 0) return { red: true, line: 'the signs route answered no sign at all.' };
  if (!live) return { red: false, line: `${signs.length} signs answered; a record made a minute ago has had no night, so the 26-hour rule waits for the canary.` };
  const newest = newestReading(signs, nowMs, tz);
  if (newest === null) return { red: true, line: `no sign holds a reading in fourteen days, so the nightly reading is not being made.` };
  const hours = Math.floor(newest.hours);
  if (newest.hours > MOST_HOURS) return { red: true, line: `the newest reading is of ${newest.day}, ${hours} hours old, past ${MOST_HOURS}: the nightly reading stopped.` };
  return { red: false, line: `${signs.length} signs, the newest reading of ${newest.day}, ${hours} hours old.` };
}

/** `signs` asked of `base` (the record's API root) with `bearer`. The answer's value, or a throw in one sentence. */
export async function askSigns(base, bearer, send = fetch) {
  const res = await send(`${base}/api/signs`, { headers: { authorization: `Bearer ${bearer}`, accept: 'application/json' }, redirect: 'error' }).catch(() => null);
  const said = res ? await res.json().catch(() => null) : null;
  if (res?.status !== 200 || said?.ok !== true) throw new Error(`the signs route answered ${res?.status ?? 'nothing'}${said?.refusal?.fix ? `: ${said.refusal.fix}` : ''}`);
  return said.value;
}

async function main(env = process.env) {
  const place = where({ ...env, CANARY_ORIGIN: env.CANARY_ORIGIN || (env.DEPLOY_HOST ? `https://${env.DEPLOY_HOST}` : '') });
  if (place.live) {
    if (!String(env.SMOKE_TOKEN ?? '').trim()) throw new Error(`SMOKE_SLUG names the canary ${place.slug} and SMOKE_TOKEN is not set, so its signs cannot be read.`);
    const verdict = judge(await askSigns(`${place.origin}/app/${place.slug}`, env.SMOKE_TOKEN.trim()), { tz: env.CANARY_TZ || undefined });
    (verdict.red ? console.error : console.log)(`  signs, on the canary ${place.slug}: ${verdict.line}`);
    return verdict.red ? 1 : 0;
  }
  const host = await selfHost();
  try {
    const verdict = judge(await askSigns(host.base, host.key), { live: false });
    (verdict.red ? console.error : console.log)(`  signs, ${SELF_HOST_ONLY}: ${verdict.line}`);
    return verdict.red ? 1 : 0;
  } finally {
    await host.close();
  }
}

if (import.meta.main)
  main().then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(`  signs stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
    },
  );
