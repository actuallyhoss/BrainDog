/**
 * This machine's row in the Profiles add-on's Places list (`packs/profiles`, `profile_places`), kept by the bridge at
 * most once a day for each profile on each machine: which profile, the machine, this command's build, whether
 * BrainDog's hooks are in the profile, and when it was last heard from.
 *
 * FOUND BY WHAT THE LISTS DECLARE, NEVER BY THEIR IDS. The profiles are the first list that plays `role: profiles`, as
 * the record's `listFor` reads it (`agent-lists.ts`), and the places are the list of the same add-on whose rows each
 * point at one profile: `packs` says which add-on holds the profiles, and `schemas` which of its other lists has a
 * required link to them and a machine. A record without the add-on, a profile no row is named for, and a place he
 * retired are left alone, and nothing is said.
 *
 * THROUGH THE NORMAL WRITE PATH, AS THE SESSION'S RUN: a `create` or an `update`, so his settings and the ladder decide
 * it as they decide any agent's write. Where they ask, it is a question on Decide, and the place then waits `QUIET_DAYS`
 * before it is kept again, so a ladder that asks files one question a month, not one a day.
 *
 * ONCE A DAY, CLAIMED BEFORE IT IS ASKED (`~/.braindog/places.json`), so ten sessions starting together in one profile
 * write once. A host that did not answer gives the day back, and the next session tries again.
 *
 * NAMES ONLY. The row says the profile and the machine by name, never a folder.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ApiOutcome } from './bridge.ts';
import { dayOf } from './session-start.ts';

/** One record method, as the session the bridge works for: `apiCall` with the session headers. */
export type Ask = (method: string, body: Record<string, unknown>) => Promise<ApiOutcome>;

/** What the place is kept with: who asks, where the day is kept, and what the row says. */
export type PlaceIo = {
  ask: Ask;
  /** The folder `.braindog` is under. */
  home: string;
  /** The record, by the hosts file's key, so two records keep a day each. */
  host: string;
  profile: string;
  machine: string;
  build: string;
  hooks: boolean;
  now?: number | undefined;
  /** True once the session is closing: nothing is written after that, so no write brings an ended run back. */
  stopped?: (() => boolean) | undefined;
};

/** What came of it: a row written, a question asked, done today already, nothing to keep, no answer, or a refusal. */
export type PlaceOutcome = 'written' | 'asked' | 'already' | 'none' | 'away' | 'refused';

/** The fields this command writes on a place, each only where the list declares it. */
const SAID = ['build', 'hooks', 'heard'] as const;

/** The most pages of one list read for a profile or a place: a few profiles on a few machines fill one. */
const PAGES = 10;

type Decl = { id: string; title: string; role?: unknown; done?: unknown; fields: { id: string; type?: unknown; to?: unknown; required?: unknown; retired?: unknown }[] };
type Row = { id: string; seq: number; version: number; state: string | null; fields: Record<string, unknown> };
type Kept = { host: string; profile: string; machine: string; day: string; until?: string };

/** How long a place that became a question waits before it is kept again. */
export const QUIET_DAYS = 30;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isDecl = (x: unknown): x is Decl => isObject(x) && typeof x.id === 'string' && typeof x.title === 'string' && Array.isArray(x.fields);
const isRow = (x: unknown): x is Row => isObject(x) && typeof x.id === 'string' && typeof x.seq === 'number' && typeof x.version === 'number' && isObject(x.fields);
const live = (d: Decl, id: string) => d.fields.find((f) => f.id === id && f.retired !== true);
const doneIn = (d: Decl, row: Row): boolean => Array.isArray(d.done) && row.state !== null && d.done.includes(row.state);
const same = (a: unknown, b: string): boolean => typeof a === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

/** The field of `d` that links each row to one row of `to`, required, or `null`. */
const linkOf = (d: Decl, to: string): string | null => d.fields.find((f) => f.type === 'ref' && f.to === to && f.required === true && f.retired !== true)?.id ?? null;

/* ── the day, kept on this machine ─────────────────────────────────────── */

export const placesPath = (home: string): string => join(home, '.braindog', 'places.json');

const isKept = (x: unknown): x is Kept =>
  isObject(x) && typeof x.host === 'string' && typeof x.profile === 'string' && typeof x.machine === 'string' && typeof x.day === 'string';

function readKept(home: string): Kept[] {
  const file = placesPath(home);
  if (!existsSync(file)) return [];
  try {
    const x: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return isObject(x) && Array.isArray(x.placed) ? x.placed.filter(isKept) : [];
  } catch {
    return [];
  }
}

const sameKept = (k: Kept, p: Pick<PlaceIo, 'host' | 'profile' | 'machine'>) => k.host === p.host && k.profile === p.profile && k.machine === p.machine;

/** Whether this profile's place on this machine was kept today, for this record. */
export function placedToday(home: string, p: Pick<PlaceIo, 'host' | 'profile' | 'machine'>, now: number = Date.now()): boolean {
  const day = dayOf(now);
  return readKept(home).some((k) => sameKept(k, p) && (k.day === day || (k.until !== undefined && k.until >= day)));
}

/* Written whole beside the file and renamed over it, keeping today's alone, as `started.json` is. */
function writeKept(home: string, p: Pick<PlaceIo, 'host' | 'profile' | 'machine'>, now: number, keep: boolean, until?: string): void {
  const day = dayOf(now);
  const kept = readKept(home).filter((k) => (k.day === day || (k.until !== undefined && k.until >= day)) && !sameKept(k, p));
  mkdirSync(join(home, '.braindog'), { recursive: true, mode: 0o700 });
  const file = placesPath(home);
  const tmp = `${file}.${String(process.pid)}.tmp`;
  const placed = keep ? [...kept, { host: p.host, profile: p.profile, machine: p.machine, day, ...(until === undefined ? {} : { until }) }] : kept;
  writeFileSync(tmp, `${JSON.stringify({ placed }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

/* ── the place ─────────────────────────────────────────────────────────── */

/**
 * Keep this profile's place on this machine, once today. Never throws: a home that cannot be written keeps the place
 * at every session instead, and a failure is an outcome.
 */
export async function keepPlace(p: PlaceIo): Promise<PlaceOutcome> {
  const now = p.now ?? Date.now();
  if (placedToday(p.home, p, now)) return 'already';
  const claim = (keep: boolean, until?: string) => {
    try {
      writeKept(p.home, p, now, keep, until);
    } catch {
      /* A home folder that cannot be written keeps the place again at the next session, and costs nothing else. */
    }
  };
  claim(true);
  const out = await placeOnce(p, now).catch((): PlaceOutcome => 'away');
  if (out === 'away') claim(false);
  if (out === 'asked') claim(true, dayOf(now + QUIET_DAYS * 86_400_000));
  return out;
}

/** What the status line sends: how much of each limit a profile has used, and when the limit resets. Numbers and a time. */
export type Meters = { five_hour_pct: number | null; seven_day_pct: number | null; resets_at: string | null };

/**
 * Write a profile's limit meters on its row of the Profiles list, found as `keepPlace` finds it (the list that plays
 * `role: profiles`, the row named for this profile). SHOWN, NEVER ACTED ON. A record without the add-on, one whose
 * version has no meter fields yet, a profile no row is named for and a profile he retired are left alone, and nothing
 * is said. Through the normal write path, so his settings and the ladder decide it.
 */
export async function keepMeters(p: { ask: Ask; profile: string; meters: Meters; now?: number | undefined }): Promise<PlaceOutcome> {
  try {
    const schemas = await p.ask('schemas', { every: true });
    if (schemas.kind !== 'ok') return schemas.kind === 'gone' ? 'away' : 'refused';
    const lists = isObject(schemas.value) && isObject(schemas.value.lists) ? schemas.value.lists : {};
    const profiles = Object.values(lists).find((d): d is Decl => isDecl(d) && d.role === 'profiles');
    if (profiles === undefined) return 'none';
    /* THE FIELDS ARE THE BEAT'S OWN KEYS, each written only where the list declares it: a list that declares none of the meters is not the one that keeps them. */
    const values: Record<string, unknown> = { ...p.meters, beat_at: new Date(p.now ?? Date.now()).toISOString() };
    const metered = Object.keys(values).filter((f) => live(profiles, f) !== undefined);
    if (!Object.keys(p.meters).some((f) => metered.includes(f))) return 'none';
    const named = await rowsOf(p.ask, profiles.id);
    if (!Array.isArray(named)) return named;
    const profile = named.find((r) => same(r.fields[profiles.title], p.profile) && !doneIn(profiles, r));
    if (profile === undefined) return 'none';
    const patch = Object.fromEntries(metered.filter((f) => values[f] !== null && values[f] !== undefined).map((f) => [f, values[f]]));
    return written(await p.ask('update', { register: profiles.id, seq: profile.seq, patch, version: profile.version }));
  } catch {
    return 'away';
  }
}

/** Every row of one list, a page at a time, or why not. */
async function rowsOf(ask: Ask, register: string): Promise<Row[] | 'away' | 'refused'> {
  const rows: Row[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < PAGES; page++) {
    const got = await ask('list', { register, limit: 200, ...(cursor === null ? {} : { cursor }) });
    if (got.kind === 'gone') return 'away';
    if (got.kind === 'refused' || !isObject(got.value) || !Array.isArray(got.value.rows)) return 'refused';
    rows.push(...got.value.rows.filter(isRow));
    cursor = typeof got.value.cursor === 'string' && got.value.cursor !== '' ? got.value.cursor : null;
    if (cursor === null) break;
  }
  return rows;
}

const written = (got: ApiOutcome): PlaceOutcome =>
  got.kind === 'gone' ? 'away' : got.kind === 'refused' ? 'refused' : isObject(got.value) && isObject(got.value.asked) ? 'asked' : 'written';

async function placeOnce(p: PlaceIo, now: number): Promise<PlaceOutcome> {
  const schemas = await p.ask('schemas', { every: true });
  if (schemas.kind !== 'ok') return schemas.kind === 'gone' ? 'away' : 'refused';
  const lists = isObject(schemas.value) && isObject(schemas.value.lists) ? schemas.value.lists : {};
  const profiles = Object.values(lists).find((d): d is Decl => isDecl(d) && d.role === 'profiles');
  if (profiles === undefined) return 'none';

  const packs = await p.ask('packs', {});
  if (packs.kind !== 'ok') return packs.kind === 'gone' ? 'away' : 'refused';
  const pack = (Array.isArray(packs.value) ? packs.value : []).find(
    (k): k is { registers: string[] } => isObject(k) && k.disabled_at === null && Array.isArray(k.registers) && k.registers.includes(profiles.id),
  );
  const places = pack?.registers
    .map((id) => lists[id])
    .find((d): d is Decl => isDecl(d) && d.id !== profiles.id && linkOf(d, profiles.id) !== null && live(d, 'host') !== undefined);
  if (places === undefined) return 'none';
  const link = linkOf(places, profiles.id)!;

  const named = await rowsOf(p.ask, profiles.id);
  if (!Array.isArray(named)) return named;
  const profile = named.find((r) => same(r.fields[profiles.title], p.profile) && !doneIn(profiles, r));
  if (profile === undefined) return 'none';
  const all = await rowsOf(p.ask, places.id);
  if (!Array.isArray(all)) return all;
  const here = all.find((r) => r.fields[link] === profile.id && same(r.fields.host, p.machine));
  if (here !== undefined && doneIn(places, here)) return 'none';

  /* NOTHING IS WRITTEN ONCE THE SESSION CLOSES: the day goes back, and the next session keeps the place. */
  if (p.stopped?.() === true) return 'away';
  const values: Record<string, unknown> = { build: p.build, hooks: p.hooks, heard: new Date(now).toISOString() };
  const said = Object.fromEntries(SAID.filter((f) => live(places, f) !== undefined).map((f) => [f, values[f]]));
  if (here !== undefined) {
    /* HEARD AGAIN IS NOT QUIET: a place the record marked stale is live once its machine says so. */
    const back = here.state === 'stale' && live(places, 'state') !== undefined ? { state: 'live' } : {};
    return written(await p.ask('update', { register: places.id, seq: here.seq, patch: { ...said, ...back }, version: here.version }));
  }
  return written(await p.ask('create', { register: places.id, fields: { [link]: profile.id, host: p.machine, ...said } }));
}
