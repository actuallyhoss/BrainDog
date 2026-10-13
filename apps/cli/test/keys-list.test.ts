/**
 * `braindog keys list [--project <name>] [--everywhere] [--json]`: the Keys index read in pages of fifty and said one
 * line a key: its name, what it opens, where it applies, "sealed" or where it is kept, and the day it expires. Never a
 * value and never the id of the grant a value is sealed in (AGT-D08, RQ-AGT-434).
 *
 * THE HOST IS A STUB ON node:http, as in `signs.test.ts`, because apps never import apps. It answers `schema` and
 * `list` the way the record does: a key's row holds its grant's id under the secret field, and its project as a row id.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { keys, type KeysIo } from '../src/keys.ts';
import { KEYS_PAGE, dayHere, keyLine, keysList, withoutKeys, type KeyRead } from '../src/keys-list.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-keys-list-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** What must never be printed: a value somebody left in a row, and the id of a grant. */
const PLANTED = 'sk_live_PLANTED0SECRET0NEVER0PRINTED';
const GRANT = '01JGRANTGRANTGRANTGRANTGR';
const BAKE = '01JTHINGBAKEBAKEBAKEBAKEBA';
const LANTERN = '01JTHINGLANTERNLANTERNLANT';

const KEYS_LIST = {
  id: 'credentials',
  title: 'label',
  state: 'state',
  done: ['retired'],
  fields: [
    { id: 'label', type: 'text' },
    { id: 'opens', type: 'text' },
    { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person' } },
    { id: 'value', type: 'secret' },
    { id: 'where', type: 'text' },
    { id: 'expires', type: 'day', deadline: true },
    { id: 'state', type: 'enum' },
  ],
};
const PROJECTS = [
  { id: BAKE, seq: 1, fields: { name: 'Crumb.gg' } },
  { id: LANTERN, seq: 2, fields: { name: 'Lanternfish' } },
];

type Row = { id: string; seq: number; fields: Record<string, unknown> };
const row = (seq: number, fields: Record<string, unknown>): Row => ({ id: `01JKEYROW${String(seq).padStart(17, '0')}`, seq, fields: { state: 'live', ...fields } });

/** Five keys a person would know by sight, then enough plain ones to need three pages. */
const FIVE: Row[] = [
  row(1, { label: 'Stripe live', opens: 'Payments for Crumb.gg', project: BAKE, value: GRANT, expires: '2026-11-02', token: PLANTED }),
  row(2, { label: 'Cloudflare deploy', opens: 'Deploys of every site', value: { sealed: true, opened: 4, last_opened: null }, note: PLANTED }),
  row(3, { label: 'Apple developer', opens: 'The Lanternfish app in the store', project: LANTERN, where: 'the password manager, under Apple', expires: '2026-10-01' }),
  row(4, { label: 'Old mail relay', opens: 'Mail sent by an old site' }),
  row(5, { label: 'Gone', opens: 'Nothing any more', value: GRANT, state: 'retired' }),
];
const MANY: Row[] = [...FIVE, ...Array.from({ length: 115 }, (_, i) => row(i + 6, { label: `Key ${String(i + 6).padStart(3, '0')}`, opens: 'A service', value: GRANT }))];

/**
 * A host holding `rows` as its Keys, answering `schema` and `list` in pages of what it is asked for.
 *
 * `today` IS THE DAY ON THE RECORD'S OWN CLOCK, which `<field> before today` is read against as the record reads it, in
 * its zone. `today: null` is a host that refuses the sentence, and `deaf: true` one that answers every key whatever it
 * was asked.
 */
async function host(
  t: { after: (fn: () => Promise<void>) => void },
  rows: Row[],
  refusal?: { code: string; fix: string } | null,
  clock: { today: string | null; deaf?: boolean } = { today: '2026-10-13' },
) {
  const seen: { method: string; register: string | null; limit: string | null; cursor: string | null; where: string | null; headers: Record<string, unknown> }[] = [];
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      const register = url.searchParams.get('register');
      const where = url.searchParams.get('where');
      seen.push({ method, register, limit: url.searchParams.get('limit'), cursor: url.searchParams.get('cursor'), where, headers: req.headers });
      const asked = where === null ? null : /^(\w+) before today$/u.exec(where);
      const today = clock.today;
      const unread = where !== null && clock.deaf !== true && (asked === null || today === null);
      let value: unknown = null;
      if (method === 'schema') value = register === 'credentials' ? KEYS_LIST : { id: 'things', title: 'name', fields: [{ id: 'name', type: 'text' }] };
      if (method === 'list') {
        const held = register === 'credentials' ? rows : PROJECTS;
        const all = asked && today !== null && clock.deaf !== true ? held.filter((r) => typeof r.fields[asked[1]!] === 'string' && (r.fields[asked[1]!] as string) < today) : held;
        const from = Number(url.searchParams.get('cursor') ?? '0');
        const limit = Number(url.searchParams.get('limit') ?? '50');
        value = { rows: all.slice(from, from + limit), matched: all.length, cursor: from + limit < all.length ? String(from + limit) : null };
      }
      const no = method === 'list' && register === 'credentials' ? (refusal ?? (unread ? { code: 'VALUE_MALFORMED', fix: 'That filter could not be read.' } : null)) : null;
      res.writeHead(no ? 403 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(no ? { ok: false, refusal: no } : { ok: true, value }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  );
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

function io(base: string): KeysIo & { lines: string[]; said: string[]; answered: { value?: unknown }[] } {
  const lines: string[] = [];
  const said: string[] = [];
  const answered: { value?: unknown }[] = [];
  return {
    file: join(scratch, 'hosts.json'),
    env: { BRAINDOG_HOST: base, BRAINDOG_TOKEN: 'rec_01TESTTESTTESTTESTTESTTEST.keys' },
    stdin: () => null,
    out: (l) => void lines.push(l),
    say: (l) => void said.push(l),
    answer: (a) => void answered.push(a),
    headers: async () => ({ 'x-braindog-session': 'S7' }),
    spawn: async () => 0,
    now: () => Date.parse('2026-10-13T09:00:00Z'),
    lines,
    said,
    answered,
  };
}

/** Everything a person or a program could read of one run. */
const everything = (one: ReturnType<typeof io>): string => [...one.lines, ...one.said, JSON.stringify(one.answered)].join('\n');

test('ONE LINE A KEY: its name, what it opens, where it applies, sealed or where it is kept, and the day it expires', async (t) => {
  const h = await host(t, FIVE);
  const one = io(h.base);
  assert.equal(await keys(['list'], one), 0, one.said.join('\n'));
  /* By name, as the Vault orders them, and the retired key is not among them. */
  assert.deepEqual(one.lines, [
    'Apple developer · opens The Lanternfish app in the store · Lanternfish · kept at the password manager, under Apple · expired 1 October 2026',
    'Cloudflare deploy · opens Deploys of every site · Everywhere · sealed · no expiry day',
    'Old mail relay · opens Mail sent by an old site · Everywhere · kept nowhere named · no expiry day',
    'Stripe live · opens Payments for Crumb.gg · Crumb.gg · sealed · expires 2 November 2026',
  ]);
  assert.deepEqual(one.said, ['4 keys: 2 sealed, 2 kept elsewhere.']);
  for (const line of [...one.lines, ...one.said]) assert.doesNotMatch(line, /—/u, 'no em dash in what a person reads');
});

test('NEVER A VALUE AND NEVER A GRANT: nothing a row holds beyond the five facts is printed, in lines or in the document', async (t) => {
  const h = await host(t, FIVE);
  for (const args of [['list'], ['list', '--json'], ['list', '--project', 'crumb.gg'], ['list', '--everywhere']]) {
    const one = io(h.base);
    assert.equal(await keys(args, one), 0, one.said.join('\n'));
    const all = everything(one);
    assert.ok(!all.includes(PLANTED), `${args.join(' ')} printed a planted value`);
    assert.ok(!all.includes(GRANT), `${args.join(' ')} printed a grant's id`);
    assert.doesNotMatch(all, /01J[0-9A-Z]{10,}/u, `${args.join(' ')} printed an id`);
    assert.doesNotMatch(all, /credentials#|things#/u, `${args.join(' ')} printed a spoken id`);
  }
});

/* RED BEFORE: what a key opens and where it is kept are words a person typed, and a value typed there was said back
   whole. The planted values are made here from parts, so no file holds one. */
test('A VALUE TYPED WHERE A KEY IS KEPT OR IN WHAT IT OPENS IS NOT SAID BACK, in the line or in the document', async (t) => {
  const typed = ['sk', 'live', 'Zq7Rw2xT9bLm4KpV'].join('-');
  const long = `${'h7Gk2'.repeat(4)}x`;
  const h = await host(t, [
    row(1, { label: 'Pasted', opens: `The shop, with ${long}`, where: `kept at ${typed}. Ask the owner` }),
    row(2, { label: 'Plain', opens: 'Payments (the live account)', where: 'the password manager, under Stripe; https://vault.example.com/items' }),
  ]);
  for (const args of [['list'], ['list', '--json']]) {
    const one = io(h.base);
    assert.equal(await keys(args, one), 0, one.said.join('\n'));
    const all = everything(one);
    assert.ok(!all.includes(typed) && !all.includes(long), `${args.join(' ')} said a typed value back`);
  }
  const one = io(h.base);
  await keys(['list'], one);
  assert.deepEqual(one.lines, [
    'Pasted · opens The shop, with [hidden] · Everywhere · kept at kept at [hidden] Ask the owner · no expiry day',
    'Plain · opens Payments (the live account) · Everywhere · kept at the password manager, under Stripe; https://vault.example.com/items · no expiry day',
  ]);
  /* Plain words, a path and a version keep every piece. */
  for (const words of ['1Password, the Work vault', 'C:/Users/me/keys.txt', 'Node v24.13.0 on the Mac mini', '']) assert.equal(withoutKeys(words), words);
});

test('--project KEEPS THE KEYS OF ONE PROJECT, by its name in any case, and --everywhere the keys of no project', async (t) => {
  const h = await host(t, FIVE);
  const bake = io(h.base);
  assert.equal(await keys(['list', '--project', 'crumb.GG'], bake), 0, bake.said.join('\n'));
  assert.deepEqual(bake.lines.map((l) => l.split(' · ')[0]), ['Stripe live']);
  assert.deepEqual(bake.said, ['1 key in Crumb.gg: 1 sealed.']);

  const wide = io(h.base);
  assert.equal(await keys(['list', '--everywhere'], wide), 0, wide.said.join('\n'));
  assert.deepEqual(wide.lines.map((l) => l.split(' · ')[0]), ['Cloudflare deploy', 'Old mail relay']);

  /* A project the record does not hold is refused with the names it does, and the name typed is not said back. */
  const none = io(h.base);
  assert.equal(await keys(['list', '--project', 'Glaze'], none), 1);
  assert.deepEqual(none.lines, []);
  assert.equal(none.said[0], 'No project of yours has that name. Yours are Crumb.gg and Lanternfish.');
  assert.ok(!none.said.join(' ').includes('Glaze'));

  /* The two flags name two different sets, so both at once is refused before anything is read. */
  const both = io(h.base);
  const before = h.seen.length;
  assert.equal(await keys(['list', '--project', 'Lanternfish', '--everywhere'], both), 1);
  assert.match(both.said[0]!, /^braindog keys list takes/u);
  assert.equal(h.seen.length, before);
});

test('--json GIVES THE SAME KEYS: one row a key with the five facts, in the order the lines are in', async (t) => {
  const h = await host(t, FIVE);
  const one = io(h.base);
  assert.equal(await keys(['list', '--json'], one), 0, one.said.join('\n'));
  assert.equal(one.answered.length, 1);
  const { keys: rows } = one.answered[0]!.value as { keys: KeyRead[] };
  assert.deepEqual(rows[0], { name: 'Apple developer', opens: 'The Lanternfish app in the store', applies: 'Lanternfish', sealed: false, kept: 'the password manager, under Apple', expires: '2026-10-01', expired: true });
  assert.deepEqual(rows[1], { name: 'Cloudflare deploy', opens: 'Deploys of every site', applies: 'Everywhere', sealed: true, kept: null, expires: null, expired: false });
  /* The lines are made from these rows and nothing else. */
  assert.deepEqual(rows.map((k) => keyLine(k)), one.lines);
  for (const k of rows) assert.deepEqual(Object.keys(k), ['name', 'opens', 'applies', 'sealed', 'kept', 'expires', 'expired']);
});

test('READ IN PAGES OF FIFTY TO THE END, each page asked for where the last one stopped, and no run named', async (t) => {
  const h = await host(t, MANY);
  const one = io(h.base);
  assert.equal(await keysList([], one), 0, one.said.join('\n'));
  assert.equal(KEYS_PAGE, 50);
  const reads = h.seen.filter((s) => s.method === 'list' && s.register === 'credentials' && s.where === null);
  assert.deepEqual(reads.map((s) => [s.limit, s.cursor]), [['50', null], ['50', '50'], ['50', '100']]);
  for (const s of h.seen) {
    assert.ok(Number(s.limit ?? '0') <= 50, 'no read asks for more than fifty');
    assert.equal(s.headers.authorization, 'Bearer rec_01TESTTESTTESTTESTTESTTEST.keys');
    assert.equal(s.headers['x-braindog-session'], undefined, 'a read of the keys is nobody’s work');
  }
  /* 120 held, one retired. */
  assert.equal(one.lines.length, 119);
  assert.deepEqual(one.said, ['119 keys: 117 sealed, 2 kept elsewhere.']);
});

test('NO KEYS AND A REFUSAL ARE SAID PLAINLY, and a flag it does not take is refused before any read', async (t) => {
  const empty = await host(t, []);
  const one = io(empty.base);
  assert.equal(await keys(['list'], one), 0);
  assert.deepEqual([one.lines, one.said], [[], ['Your record holds no keys yet.']]);

  const shut = await host(t, FIVE, { code: 'FORBIDDEN', fix: 'This login cannot read Keys.' });
  const two = io(shut.base);
  assert.equal(await keys(['list'], two), 1);
  assert.deepEqual([two.lines, two.said], [[], ['This login cannot read Keys.']]);

  const three = io(shut.base);
  const before = shut.seen.length;
  assert.equal(await keys(['list', 'Stripe', '--reveal'], three), 1);
  assert.match(three.said[0]!, /^braindog keys list takes/u);
  assert.equal(shut.seen.length, before);

  /* The command's own sentence names the new verb beside the three it had. */
  const four = io(shut.base);
  assert.equal(await keys(['show'], four), 1);
  assert.match(four.said[0]!, /list/u);
});

test('--json WITH NOBODY WAITING FOR THE ANSWER prints the one document itself, and a refusal as the document too', async (t) => {
  const h = await host(t, FIVE);
  const { answer: _answer, ...bare } = io(h.base);
  assert.equal(await keys(['list', '--json'], bare), 0, bare.said.join('\n'));
  assert.equal(bare.lines.length, 1, 'standard output is the document and nothing else');
  const doc = JSON.parse(bare.lines[0]!) as { ok: boolean; value: { keys: KeyRead[] } };
  assert.equal(doc.ok, true);
  assert.deepEqual(doc.value.keys.map((k) => k.name), ['Apple developer', 'Cloudflare deploy', 'Old mail relay', 'Stripe live']);
  assert.ok(!bare.lines[0]!.includes(PLANTED) && !bare.lines[0]!.includes(GRANT));

  const shut = await host(t, FIVE, { code: 'FORBIDDEN', fix: 'This login cannot read Keys.' });
  const { answer: _other, ...two } = io(shut.base);
  assert.equal(await keys(['list', '--json'], two), 1);
  assert.deepEqual(JSON.parse(two.lines[0]!), { ok: false, refusals: [{ code: 'FORBIDDEN', fix: 'This login cannot read Keys.' }] });
});

/* RED BEFORE: today was this machine's UTC date. At 22:30 UTC on the 13th it is already the 14th in Cairo, and a key
   whose day was the 13th read "expires" for three more hours. The record is asked which keys are past their day. */
test('A KEY IS PAST ITS DAY BY THE RECORD’S OWN CLOCK, in its zone, in the line and in the document', async (t) => {
  const rows = [row(1, { label: 'Ends on the 13th', opens: 'A service', expires: '2026-10-13' }), row(2, { label: 'Ends on the 14th', opens: 'A service', expires: '2026-10-14' })];
  const late = Date.parse('2026-10-13T22:30:00Z');

  const cairo = await host(t, rows, null, { today: '2026-10-14' });
  const one = { ...io(cairo.base), now: () => late };
  assert.equal(await keys(['list', '--json'], one), 0, one.said.join('\n'));
  assert.deepEqual(one.lines.map((l) => l.split(' · ').at(-1)), ['expired 13 October 2026', 'expires 14 October 2026']);
  assert.deepEqual((one.answered[0]!.value as { keys: KeyRead[] }).keys.map((k) => k.expired), [true, false]);
  assert.deepEqual(one.said, ['2 keys: 2 kept elsewhere.'], 'nothing is said of the clock when the record answered');
  /* The record is asked in its own words, by the field its declaration marks as the deadline, and no run is named. */
  const asked = cairo.seen.filter((s) => s.where !== null);
  assert.deepEqual(asked.map((s) => [s.register, s.where, s.limit]), [['credentials', 'expires before today', '50']]);
  assert.equal(asked[0]!.headers['x-braindog-session'], undefined);

  /* The other side of the day: 01:30 UTC on the 14th is still the 13th in Los Angeles, and neither key is past. */
  const west = await host(t, rows, null, { today: '2026-10-13' });
  const two = { ...io(west.base), now: () => Date.parse('2026-10-14T01:30:00Z') };
  assert.equal(await keys(['list'], two), 0, two.said.join('\n'));
  assert.deepEqual(two.lines.map((l) => l.split(' · ').at(-1)), ['expires 13 October 2026', 'expires 14 October 2026']);
});

test('A RECORD THAT CANNOT SAY WHICH KEYS ARE PAST is said so once, and each key is judged by this machine’s own day', async (t) => {
  const zone = process.env.TZ;
  t.after(() => void (zone === undefined ? delete process.env.TZ : (process.env.TZ = zone)));
  process.env.TZ = 'Africa/Cairo';
  const late = Date.parse('2026-10-13T22:30:00Z');
  assert.equal(dayHere(late), '2026-10-14');
  process.env.TZ = 'America/Los_Angeles';
  assert.equal(dayHere(late), '2026-10-13');

  process.env.TZ = 'Africa/Cairo';
  const rows = [row(1, { label: 'Ends on the 13th', opens: 'A service', expires: '2026-10-13' }), row(2, { label: 'Ends in a year', opens: 'A service', expires: '2027-10-13' })];
  /* One host refuses the sentence, and one answers every key whatever it was asked: a key a year off is past nowhere
     on earth, so that answer is not believed either. */
  for (const clock of [{ today: null }, { today: '2026-10-14', deaf: true }]) {
    const h = await host(t, rows, null, clock);
    const one = { ...io(h.base), now: () => late };
    assert.equal(await keys(['list'], one), 0, one.said.join('\n'));
    assert.deepEqual(one.lines.map((l) => l.split(' · ').at(-1)), ['expires 13 October 2027', 'expired 13 October 2026']);
    assert.deepEqual(one.said, ['Your record did not say which keys are past their day, so each is judged by the date on this machine.', '2 keys: 2 kept elsewhere.']);
    for (const line of one.said) assert.doesNotMatch(line, /—/u);
  }
});

/* RED BEFORE (audit 69, finding 7): a host that answers every key was caught only by a key whose day is still to come.
   With every day today or earlier nothing caught it, and a key whose day is today read "expired". */
test('AN ANSWER THAT HOLDS EVERY KEY IS NOT BELIEVED when a day in it is too near to be past everywhere, or a key in it has no day', async (t) => {
  const zone = process.env.TZ;
  t.after(() => void (zone === undefined ? delete process.env.TZ : (process.env.TZ = zone)));
  process.env.TZ = 'UTC';
  const unsaid = 'Your record did not say which keys are past their day, so each is judged by the date on this machine.';
  const dated = [row(1, { label: 'Ends today', opens: 'A service', expires: '2026-10-13' }), row(2, { label: 'Ended on the 1st', opens: 'A service', expires: '2026-10-01' })];

  /* Every key has a day and none is ahead: the answer is the whole list, and today's key is not past on this machine. */
  const all = await host(t, dated, null, { today: '2026-10-14', deaf: true });
  const one = io(all.base);
  assert.equal(await keys(['list'], one), 0, one.said.join('\n'));
  assert.deepEqual(one.lines.map((l) => l.split(' · ').at(-1)), ['expired 1 October 2026', 'expires 13 October 2026']);
  assert.deepEqual(one.said, [unsaid, '2 keys: 2 kept elsewhere.']);

  /* A key with no day is past no day, so an answer that holds one was not picked by the filter. */
  const blind = await host(t, [...dated, row(3, { label: 'No day', opens: 'A service' })], null, { today: '2026-10-14', deaf: true });
  const two = io(blind.base);
  assert.equal(await keys(['list'], two), 0, two.said.join('\n'));
  assert.ok(two.lines.some((l) => l.endsWith('expires 13 October 2026')), two.lines.join('\n'));
  assert.equal(two.said[0], unsaid);

  /* A record that does read the filter is still believed: every key long past, and the whole list is the true answer. */
  const old = [row(1, { label: 'Ended on the 1st', opens: 'A service', expires: '2026-10-01' }), row(2, { label: 'Ended in June', opens: 'A service', expires: '2026-06-01' })];
  const honest = await host(t, old, null, { today: '2026-10-13' });
  const three = io(honest.base);
  assert.equal(await keys(['list'], three), 0, three.said.join('\n'));
  assert.deepEqual(three.said, ['2 keys: 2 kept elsewhere.'], 'nothing is said of the clock when the record answered');
});

/* Audit 70, finding 8: the smallest case of the one above, a record's only key, on the day it ends. A host that
   answers it whatever it was asked says nothing about its day, in the line or in the document a program reads. */
test('ONE KEY WHOSE DAY IS TODAY, ON A HOST THAT ANSWERS EVERY KEY, IS NOT CALLED EXPIRED', async (t) => {
  const zone = process.env.TZ;
  t.after(() => void (zone === undefined ? delete process.env.TZ : (process.env.TZ = zone)));
  process.env.TZ = 'UTC';
  const unsaid = 'Your record did not say which keys are past their day, so each is judged by the date on this machine.';
  const today = [row(1, { label: 'Ends today', opens: 'A service', expires: '2026-10-13' })];

  const deaf = await host(t, today, null, { today: '2026-10-14', deaf: true });
  const one = io(deaf.base);
  assert.equal(await keys(['list', '--json'], one), 0, one.said.join('\n'));
  assert.deepEqual(one.lines.map((l) => l.split(' · ').at(-1)), ['expires 13 October 2026']);
  assert.deepEqual((one.answered[0]!.value as { keys: KeyRead[] }).keys.map((k) => k.expired), [false]);
  assert.deepEqual(one.said, [unsaid, '1 key: 1 kept elsewhere.']);

  /* THE PRICE, HELD HERE SO IT IS SEEN: the same key on a record that does read the filter, in Cairo at 22:30 UTC,
     where the day is already the 14th. Its true answer is its whole list too, and a day this near is not believed
     from a whole list, so this machine's date judges the key, the 13th, and the sentence is said of a record that
     did answer. */
  const read = await host(t, today, null, { today: '2026-10-14' });
  const two = { ...io(read.base), now: () => Date.parse('2026-10-13T22:30:00Z') };
  assert.equal(await keys(['list'], two), 0, two.said.join('\n'));
  assert.deepEqual(two.lines.map((l) => l.split(' · ').at(-1)), ['expires 13 October 2026']);
  assert.equal(two.said[0], unsaid);
});

/* RED BEFORE BATCH 70 (seen red against the file as batch 69 left it): today is this machine's day, and the two above
   keep the machine on UTC, where that day and the UTC date are one. West of UTC in the evening they are not: the UTC
   date is already tomorrow, and a rule that believed every day before the UTC date would call today's key expired. */
test('A KEY WHOSE DAY IS TODAY ON THIS MACHINE IS NOT CALLED EXPIRED BY A HOST THAT IGNORES THE FILTER, after the UTC date has moved on', async (t) => {
  const zone = process.env.TZ;
  t.after(() => void (zone === undefined ? delete process.env.TZ : (process.env.TZ = zone)));
  process.env.TZ = 'America/Los_Angeles';
  const evening = Date.parse('2026-10-14T01:30:00Z');
  assert.equal(dayHere(evening), '2026-10-13');
  const unsaid = 'Your record did not say which keys are past their day, so each is judged by the date on this machine.';
  const rows = [row(1, { label: 'Ends today', opens: 'A service', expires: '2026-10-13' }), row(2, { label: 'Ended yesterday', opens: 'A service', expires: '2026-10-12' })];

  const deaf = await host(t, rows, null, { today: '2026-10-14', deaf: true });
  const one = { ...io(deaf.base), now: () => evening };
  assert.equal(await keys(['list', '--json'], one), 0, one.said.join('\n'));
  assert.deepEqual(one.lines.map((l) => l.split(' · ').at(-1)), ['expired 12 October 2026', 'expires 13 October 2026']);
  assert.deepEqual((one.answered[0]!.value as { keys: KeyRead[] }).keys.map((k) => k.expired), [true, false]);
  assert.deepEqual(one.said, [unsaid, '2 keys: 2 kept elsewhere.']);
});

/* THE ANSWER IS READ AGAINST EVERY KEY THE RECORD HOLDS, NOT THE ONES KEPT FOR PRINTING. Read against one project's
   keys, a host that ignores the filter would be believed wherever that project's days are long past, and the sentence
   would come and go with the project asked for. */
test('A HOST THAT IGNORES THE FILTER IS NOT BELIEVED FOR ONE PROJECT’S KEYS EITHER, whichever project is asked for', async (t) => {
  const zone = process.env.TZ;
  t.after(() => void (zone === undefined ? delete process.env.TZ : (process.env.TZ = zone)));
  process.env.TZ = 'UTC';
  const unsaid = 'Your record did not say which keys are past their day, so each is judged by the date on this machine.';
  const rows = [row(1, { label: 'Ends today', opens: 'A service', project: BAKE, expires: '2026-10-13' }), row(2, { label: 'Ended on the 1st', opens: 'A service', project: LANTERN, expires: '2026-10-01' })];

  const deaf = await host(t, rows, null, { today: '2026-10-14', deaf: true });
  for (const [project, last] of [['crumb.gg', 'expires 13 October 2026'], ['lanternfish', 'expired 1 October 2026']] as const) {
    const one = io(deaf.base);
    assert.equal(await keys(['list', '--project', project], one), 0, one.said.join('\n'));
    assert.deepEqual(one.lines.map((l) => l.split(' · ').at(-1)), [last]);
    assert.equal(one.said[0], unsaid, project);
    assert.equal(one.said.length, 2);
  }

  /* The same keys on a record that does read the filter: only the key of the 1st is in its answer, so it is believed. */
  const honest = await host(t, rows, null, { today: '2026-10-13' });
  const two = io(honest.base);
  assert.equal(await keys(['list', '--project', 'crumb.gg'], two), 0, two.said.join('\n'));
  assert.deepEqual(two.lines.map((l) => l.split(' · ').at(-1)), ['expires 13 October 2026']);
  assert.equal(two.said.length, 1, 'nothing is said of the clock when the record answered');
});

/* RED BEFORE: a value in code marks kept its mark, so the question was asked of "`sk-live-..." and a short one passed;
   and a character nobody sees inside a value hid its shape from the question, then was taken out for printing, which
   put the value on the line whole. */
test('A VALUE IN CODE MARKS, OR BROKEN BY A CHARACTER NOBODY SEES, IS NOT SAID BACK EITHER', async (t) => {
  const short = ['ghp', 'AbCdEfG'].join('_');
  const split = ['gh', 'p_AbCdEfGh'].join('\u200b');
  const joined = split.replace('\u200b', '');
  const h = await host(t, [row(1, { label: 'Marked', opens: `The forge, with \`${short}\` and *${short}*`, where: `the note that says ${split}` })]);
  for (const args of [['list'], ['list', '--json']]) {
    const one = io(h.base);
    assert.equal(await keys(args, one), 0, one.said.join('\n'));
    const all = everything(one);
    assert.ok(!all.includes(short) && !all.includes(joined), `${args.join(' ')} said a typed value back`);
  }
  const one = io(h.base);
  await keys(['list'], one);
  assert.deepEqual(one.lines, ['Marked · opens The forge, with `[hidden]` and *[hidden]* · Everywhere · kept at the note that says [hidden] · no expiry day']);
  assert.equal(withoutKeys('a `plain` word, *twice*, and a | bar'), 'a `plain` word, *twice*, and a | bar');
});
