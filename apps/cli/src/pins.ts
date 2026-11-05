/**
 * `~/.braindog/pins.json`, and `braindog env pins [--forget <name>] [--json]`: every program entry a person approved
 * on this machine, pinned by the SHA-256 of the entry whole, so the same entry is not asked about again and a changed
 * one is (`docs/48-SPEC-CLI.md` §5.19). A record that holds what every machine runs could otherwise hand each of them
 * a program nobody at that machine has seen.
 *
 * A PROGRAM ENTRY is anything BrainDog places that runs a program: a hook command, a status line, an `apiKeyHelper`, an
 * MCP server's stdio command or an HTTP server's `headersHelper`, the `claude` that `env check` runs, and a file of a
 * thing setup sync carries that runs a program, such as a script for `~/.local/bin` (`sync pull`). Each is
 * printed whole and asked y/N at a terminal before it is first placed, as a runner job kind is pinned before its first
 * run (`runner.ts`, `48 §5.13` step 4). A skill whose text runs something by itself is one too (`skillRuns` in `skills.ts`).
 * Plain data (a skill's other text, a URL server, a rules block) is never pinned.
 *
 * BY KIND, NAME AND ENTRY. The hash covers the three, so one entry approved is the same entry wherever it goes:
 * BrainDog's server is asked about once for every profile it goes into, not once a profile. A pin keeps the profiles it
 * was placed in, for `env pins` to say; that list never decides anything.
 *
 * A NEW VERSION REPLACES THE OLD. Approving a changed entry drops the pin of the one it replaces (the same kind and
 * name), so the file holds what is approved now. `--forget <name>` drops a name's pins, and the next placement asks.
 *
 * NO VALUE IS IN IT: a name, a kind, profile names, a hash and a time. The entry itself is never written here.
 */

import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { oneLine } from './clip.ts';
import { shown } from './doctor.ts';
import { dayHere } from './keys-list.ts';
import { isObject, readLock, sha256, writeLock } from './skills.ts';
import { canonical } from './tools.ts';

/**
 * What a pin is for: BrainDog's hooks, its MCP server, one of the record's tools, the `claude` `env check` runs, the status line, or a
 * program setup sync carried here (`sync-pull.ts`), pinned by where it goes and the SHA-256 of its bytes and mode.
 */
export type PinKind = 'hooks' | 'server' | 'tool' | 'check' | 'carry' | 'statusline' | 'skill';
const KINDS: readonly PinKind[] = ['hooks', 'server', 'tool', 'check', 'carry', 'statusline', 'skill'];

/** One approved entry: its name, its kind, the profiles it was placed in, and when it was approved. */
export type Pin = { name: string; kind: PinKind; profiles: string[]; at: string };

/** The pins, by the hash each was approved under. */
export type Pins = Record<string, Pin>;

/** Where the pins are kept, under the home the command is given, so a test's home holds its own. */
export const pinsFile = (home: string): string => join(home, '.braindog', 'pins.json');

/** The SHA-256 an entry is pinned by: its kind, its name and the entry whole, in one canonical order. */
export const pinOf = (kind: PinKind, name: string, entry: unknown): string => sha256(canonical([kind, name, entry]));

const SHA = /^[0-9a-f]{64}$/u;

/** The pins kept: none when there is no file, and `null` for a file that is there and does not read. */
export function readPins(file: string): Pins | null {
  const held = readLock(file);
  if (held === null) return null;
  const pins: Pins = {};
  for (const [sha, p] of Object.entries(isObject(held.pins) ? held.pins : {})) {
    if (!SHA.test(sha) || !isObject(p) || typeof p.name !== 'string' || !KINDS.includes(p.kind as PinKind) || typeof p.at !== 'string') continue;
    const profiles = Array.isArray(p.profiles) ? p.profiles.filter((x): x is string => typeof x === 'string') : [];
    pins[sha] = { name: p.name, kind: p.kind as PinKind, profiles, at: p.at };
  }
  return pins;
}

/**
 * An entry pinned, the file read again just before the write as `runner allow` reads its own, so two runs never lose
 * each other's pin: a new pin, or this profile added to the one already there. A pin of the same kind and name under
 * another hash goes, since the entry it was for is no longer the one placed. The pins as now kept.
 */
export function keepPin(file: string, sha: string, o: { name: string; kind: PinKind; profile: string; now: number }): Pins {
  const pins = readPins(file) ?? {};
  for (const [other, p] of Object.entries(pins)) if (other !== sha && p.kind === o.kind && p.name === o.name) delete pins[other];
  const had = pins[sha];
  pins[sha] = had
    ? { ...had, profiles: had.profiles.includes(o.profile) ? had.profiles : [...had.profiles, o.profile] }
    : { name: o.name, kind: o.kind, profiles: [o.profile], at: new Date(o.now).toISOString() };
  writeLock(file, { pins });
  return pins;
}

/** Every pin of a name dropped, and how many there were. Each is asked about again the next time it is placed. */
export function forgetPins(file: string, name: string): number {
  const pins = readPins(file);
  if (pins === null) throw new Error(`${file} is not valid JSON, so nothing was forgotten. Delete it, and every program entry is asked about again.`);
  const gone = Object.keys(pins).filter((sha) => pins[sha]?.name === name);
  for (const sha of gone) delete pins[sha];
  if (gone.length > 0) writeLock(file, { pins });
  return gone.length;
}

/** What each kind is, after its name in a line. */
const KIND_SAID: Record<PinKind, string> = { skill: 'a skill that runs commands', hooks: "BrainDog's hooks", server: 'the MCP server', tool: 'an MCP tool', check: 'what env check runs', carry: 'a program setup sync placed', statusline: 'the status line' };

/** Names joined as a sentence says them: `a`, `a and b`, `a, b and c`. */
const and = (names: string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`);

/** The day a pin was approved, on this machine's calendar. */
const approved = (at: string): string => (Number.isNaN(Date.parse(at)) ? oneLine(at.slice(0, 10)) : dayHere(Date.parse(at)));

/**
 * One pin as `env pins` says it, by name, kind, profiles, the first twelve of its hash and the day it was approved. A
 * carried program's "profiles" are the things in Carry that brought it.
 */
export const pinLine = (sha: string, p: Pin): string =>
  `  ${oneLine(p.name)}, ${KIND_SAID[p.kind]}: ${p.profiles.length === 0 ? 'placed in no profile yet' : `${p.kind === 'carry' ? 'carried by' : 'placed in'} ${and(p.profiles.map(oneLine))}`}; ${sha.slice(0, 12)}; approved ${approved(p.at)}.`;

/** What `env pins` answers under `--json`: the file, and each pin with its whole hash. */
export type PinsReport = { file: string; pins: (Pin & { sha256: string })[]; forgot?: { name: string; count: number } };

/** What the verb reads beyond its arguments, a test's to hand in. */
export type PinsIo = { home: string };

/**
 * `braindog env pins [--forget <name>] [--json]`: the program entries approved on this machine, one line each, oldest
 * first; or, with `--forget`, a name's pins dropped. THROWS ONE SENTENCE for an argument it does not take, or a pins
 * file that does not read, before anything is changed. `code` is 1 when `--forget` named no pin.
 */
export function envPins(args: string[], io: PinsIo): { lines: string[]; report: PinsReport; json: boolean; code: 0 | 1 } {
  let values: { forget?: string | undefined; json?: boolean | undefined };
  try {
    ({ values } = parseArgs({ args, options: { forget: { type: 'string' }, json: { type: 'boolean' } }, strict: true }));
  } catch {
    throw new Error('braindog env pins takes --forget <name> and --json, and nothing else.');
  }
  const file = pinsFile(io.home);
  const where = shown(file, io.home);
  let forgot: PinsReport['forgot'];
  const lines: string[] = [];
  if (values.forget !== undefined) {
    const count = forgetPins(file, values.forget);
    forgot = { name: values.forget, count };
    lines.push(
      count === 0
        ? `No pin is named ${oneLine(values.forget)}, so nothing was forgotten.`
        : `Forgot ${count === 1 ? 'the pin' : `the ${String(count)} pins`} named ${oneLine(values.forget)}. It is asked about again the next time it is placed.`,
    );
  }
  const pins = readPins(file);
  if (pins === null) throw new Error(`${file} is not valid JSON, so no pin could be read. Delete it, and every program entry is asked about again.`);
  const held = Object.entries(pins).sort(([, a], [, b]) => a.at.localeCompare(b.at));
  if (values.forget === undefined)
    lines.push(
      held.length === 0
        ? 'No program entry is approved on this machine yet. braindog env apply asks before it places one.'
        : `braindog env pins: ${held.length === 1 ? 'one program entry is' : `${String(held.length)} program entries are`} approved on this machine, in ${where}.`,
      ...held.map(([sha, p]) => pinLine(sha, p)),
      ...(held.length === 0 ? [] : ['Forget one with braindog env pins --forget <name>, and it is asked about again the next time it is placed.']),
    );
  const report: PinsReport = { file: where, pins: held.map(([sha, p]) => ({ ...p, sha256: sha })), ...(forgot ? { forgot } : {}) };
  return { lines, report, json: values.json === true, code: forgot !== undefined && forgot.count === 0 ? 1 : 0 };
}
