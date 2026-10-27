/**
 * Money's built document holds no call out: no poll, no fetch, no key it opens.
 *
 * WHY. A first-party module is installed on every record that starts Money, by people who never read its file, and only
 * the owner may approve a call to another server (`packs/rates-poll/fill.ts`). So the call that keeps rates current lives
 * in a pack of its own, offered with its host and its clock named, and Money itself must never grow one: a poll added to
 * a figure file would reach every record on its next update with nobody asked. Nothing stopped that before this file.
 *
 * WHAT IS A CALL OUT, read the way the record reads one. Every declaration is asked `egressOf`, the kernel's own reading
 * of what a declaration sends out, which the plan and the proposal print; a `script`, a `job` or an ingest that pulls,
 * polls or calls is refused by kind; a rule step that calls, runs a call, runs a script or runs a job is refused by verb;
 * and the whole document, with its settings and its example rows, may name no address, no key and no secret.
 *
 * THE GUARD IS A FUNCTION OVER A DOCUMENT, so the last test hands it Money with a poll, a script that fetches and a step
 * that calls planted in it, and checks each is named. A guard that cannot be shown failing is not one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KINDS, egressOf } from '@braindog/kernel';

import { firstPartyDocument } from '../src/index.ts';

type Doc = { declarations: Record<string, unknown>[]; config?: unknown; seeds?: unknown };

/** An ingest that goes and gets something on a clock, rather than waiting for it to arrive. */
const FETCHES = new Set(['pull', 'poll', 'call']);
/** The kinds that run code or work of their own, either of which may reach a host. */
const RUNS = new Set(['script', 'job']);
/** The rule verbs that leave the record: a declared call, a script, or a job. */
const LEAVES = new Set(['call', 'run', 'script', 'run_job']);
/** The keys a declaration opens a key or names a host with. */
const OPENS = new Set(['grant', 'keys', 'egress', 'auth', 'fetch', 'url', 'credential', 'secret', 'token', 'vault', 'opens']);
/** A field or a setting that holds a key. */
const SECRET_TYPES = new Set(['secret', 'credential', 'key']);
/** An address, or a placeholder a host fills with a key. */
const ADDRESS = /\b(?:https?|wss?|ftp):\/\/|\{\{\s*(?:key|secret|vault|credential|grant)\s*[:.]/i;

/**
 * A declaration's kind: the first of its keys that is one of `KINDS`, as a pack file writes it. The first and not any,
 * since an ingest names the list it files into as `register:`.
 */
const kindOf = (d: Record<string, unknown>): string => Object.keys(d).find((k) => (KINDS as readonly string[]).includes(k) && typeof d[k] === 'string') ?? '?';
const nameOf = (d: Record<string, unknown>): string => `${kindOf(d)}.${String(d[kindOf(d)])}`;

/** Every string and every key under `value`, with where it is. */
function* walk(value: unknown, at: string): Generator<{ at: string; key?: string; text?: string; node?: Record<string, unknown> }> {
  if (typeof value === 'string') yield { at, text: value };
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* walk(v, `${at}[${i}]`);
  else if (value !== null && typeof value === 'object') {
    yield { at, node: value as Record<string, unknown> };
    for (const [k, v] of Object.entries(value)) {
      yield { at: `${at}.${k}`, key: k };
      yield* walk(v, `${at}.${k}`);
    }
  }
}

/** A script that may reach no host and open no key: its sandbox has no fetch without `egress` (`last_day`). */
const closedScript = (d: Record<string, unknown>): boolean =>
  kindOf(d) === 'script' && Array.isArray(d.egress) && d.egress.length === 0 && Array.isArray(d.keys) && d.keys.length === 0;

/** Every way `doc` reaches outside the record, each as a sentence naming where. Nothing, for a document that does not. */
export function callsOut(doc: Doc): string[] {
  const out: string[] = [];
  /* A STEP THAT STARTS A CLOSED SCRIPT OF THIS DOCUMENT LEAVES NOTHING (settle-rule-60): `payment-settles` starts
     `settle`, code over the record's own rows with no host and no key. A step naming any other script is still said. */
  const closed = new Set(doc.declarations.filter(closedScript).map((d) => String(d.script)));
  const staysIn = (verb: string, node: Record<string, unknown>): boolean =>
    verb === 'script' && closed.has(String((node.script as { id?: unknown } | null)?.id));
  for (const d of doc.declarations) {
    const kind = kindOf(d);
    const e = egressOf(d);
    if (e !== null) out.push(`${nameOf(d)} calls out: ${e.line}`);
    /* A SCRIPT THAT MAY REACH NO HOST AND OPEN NO KEY is code over the record's own rows (`last_day`): its sandbox has no
       fetch without `egress`, so it is not a call out. */
    if (RUNS.has(kind) && !closedScript(d)) out.push(`${nameOf(d)} is a ${kind}, which runs work that may reach a host`);
    if (kind === 'ingest' && FETCHES.has(String(d.channel))) out.push(`${nameOf(d)} fetches by ${String(d.channel)}`);
    if (kind === 'rule')
      for (const w of walk(d, nameOf(d)))
        if (w.node) for (const verb of Object.keys(w.node).filter((k) => LEAVES.has(k) && !staysIn(k, w.node as Record<string, unknown>))) out.push(`${w.at} has a step that says ${verb}`);
    if (kind === 'register')
      for (const f of Array.isArray(d.fields) ? (d.fields as { id?: string; type?: string }[]) : [])
        if (SECRET_TYPES.has(String(f.type))) out.push(`${nameOf(d)} keeps a key in ${String(f.id)}`);
  }
  for (const [k, c] of Object.entries((doc.config ?? {}) as Record<string, { type?: string }>))
    if (SECRET_TYPES.has(String(c?.type))) out.push(`the setting ${k} is a key`);
  /* ITS EMPTY `egress` AND `keys` NAME NOTHING, so they are not read as a host or a key named. */
  const closedAt = new Set(doc.declarations.filter(closedScript).flatMap((d) => [`${nameOf(d)}.egress`, `${nameOf(d)}.keys`]));
  const everything = [...doc.declarations.map((d) => walk(d, nameOf(d))), walk(doc.config ?? null, 'settings'), walk(doc.seeds ?? null, 'example rows')];
  for (const w of everything.flatMap((each) => [...each])) {
    if (w.key !== undefined && OPENS.has(w.key) && !closedAt.has(w.at)) out.push(`${w.at} names a host or a key`);
    if (w.text !== undefined && ADDRESS.test(w.text)) out.push(`${w.at} says ${JSON.stringify(w.text.slice(0, 80))}`);
  }
  return [...new Set(out)];
}

const money = (): Doc => {
  const doc = firstPartyDocument('money-core') as Doc | null;
  assert.ok(doc, 'money-core has no document');
  return doc;
};

test("MONEY'S BUILT DOCUMENT CALLS NOTHING OUT: no poll, no fetch, no script, no step that calls, no key it opens", () => {
  const doc = money();
  assert.ok(doc.declarations.length >= 50, `only ${doc.declarations.length} declarations were read, so the document was not`);
  assert.deepEqual(callsOut(doc), []);
});

test('EVERY DECLARATION IS ONE OF THE KINDS THE RECORD KNOWS, so none slips past the reading above unread', () => {
  assert.deepEqual(money().declarations.filter((d) => kindOf(d) === '?').map((d) => Object.keys(d).slice(0, 3).join(',')), []);
});

test('THE GUARD BITES: a poll, a script that fetches, a step that calls and a key setting planted in Money are each named', () => {
  const doc = money();
  const planted: Doc = {
    ...doc,
    config: { ...(doc.config as object), rates_key: { type: 'secret', label: 'Rates key' } },
    declarations: [
      ...doc.declarations,
      { ingest: 'rates-daily', channel: 'poll', url: 'https://rates.example.com/latest', every: '1d', register: 'fx', grant: 'rates' },
      { script: 'rates-fetch', runs: { every: '1d' }, egress: ['https://rates.example.com'], keys: ['rates'], source: 'await fetch(url)' },
      { rule: 'rates-after-bill', on: { written: 'obligations', op: 'create' }, steps: [{ call: 'rates-daily' }] },
    ],
  };
  const found = callsOut(planted);
  for (const expected of [
    /^ingest\.rates-daily calls out: CALLS OUT rates\.example\.com/,
    /^ingest\.rates-daily fetches by poll$/,
    /^script\.rates-fetch calls out:/,
    /^script\.rates-fetch is a script/,
    /rule\.rates-after-bill\.steps\[0\] has a step that says call$/,
    /^the setting rates_key is a key$/,
    /\.grant names a host or a key$/,
    /\.url says "https:\/\/rates\.example\.com\/latest"$/,
  ])
    assert.ok(found.some((why) => expected.test(why)), `nothing matched ${expected}; found:\n${found.join('\n')}`);
});
