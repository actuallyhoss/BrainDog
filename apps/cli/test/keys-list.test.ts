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
import { KEYS_PAGE, keyLine, keysList, type KeyRead } from '../src/keys-list.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-keys-list-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** What must never be printed: a value somebody left in a row, and the id of a grant. */
const PLANTED = 'sk_live_PLANTED0SECRET0NEVER0PRINTED';
const GRANT = '01JGRANTGRANTGRANTGRANTGR';
const BAKE = '01JTHINGBAKEBAKEBAKEBAKEBA';
const ENCORE = '01JTHINGENCOREENCOREENCORE';

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
  { id: ENCORE, seq: 2, fields: { name: 'Encore' } },
];

type Row = { id: string; seq: number; fields: Record<string, unknown> };
const row = (seq: number, fields: Record<string, unknown>): Row => ({ id: `01JKEYROW${String(seq).padStart(17, '0')}`, seq, fields: { state: 'live', ...fields } });

/** Five keys a person would know by sight, then enough plain ones to need three pages. */
const FIVE: Row[] = [
  row(1, { label: 'Stripe live', opens: 'Payments for Crumb.gg', project: BAKE, value: GRANT, expires: '2026-11-02', token: PLANTED }),
  row(2, { label: 'Cloudflare deploy', opens: 'Deploys of every site', value: { sealed: true, opened: 4, last_opened: null }, note: PLANTED }),
  row(3, { label: 'Apple developer', opens: 'The Encore app in the store', project: ENCORE, where: 'the password manager, under Apple', expires: '2026-10-01' }),
  row(4, { label: 'Old mail relay', opens: 'Mail sent by an old site' }),
  row(5, { label: 'Gone', opens: 'Nothing any more', value: GRANT, state: 'retired' }),
];
const MANY: Row[] = [...FIVE, ...Array.from({ length: 115 }, (_, i) => row(i + 6, { label: `Key ${String(i + 6).padStart(3, '0')}`, opens: 'A service', value: GRANT }))];

/** A host holding `rows` as its Keys, answering `schema` and `list` in pages of what it is asked for. */
async function host(t: { after: (fn: () => Promise<void>) => void }, rows: Row[], refusal?: { code: string; fix: string }) {
  const seen: { method: string; register: string | null; limit: string | null; cursor: string | null; headers: Record<string, unknown> }[] = [];
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      const register = url.searchParams.get('register');
      seen.push({ method, register, limit: url.searchParams.get('limit'), cursor: url.searchParams.get('cursor'), headers: req.headers });
      let value: unknown = null;
      if (method === 'schema') value = register === 'credentials' ? KEYS_LIST : { id: 'things', title: 'name', fields: [{ id: 'name', type: 'text' }] };
      if (method === 'list') {
        const all = register === 'credentials' ? rows : PROJECTS;
        const from = Number(url.searchParams.get('cursor') ?? '0');
        const limit = Number(url.searchParams.get('limit') ?? '50');
        value = { rows: all.slice(from, from + limit), matched: all.length, cursor: from + limit < all.length ? String(from + limit) : null };
      }
      const no = refusal && method === 'list' && register === 'credentials';
      res.writeHead(no ? 403 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(no ? { ok: false, refusal } : { ok: true, value }));
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
    'Apple developer · opens The Encore app in the store · Encore · kept at the password manager, under Apple · expired 1 October 2026',
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
  assert.equal(none.said[0], 'No project of yours has that name. Yours are Crumb.gg and Encore.');
  assert.ok(!none.said.join(' ').includes('Glaze'));

  /* The two flags name two different sets, so both at once is refused before anything is read. */
  const both = io(h.base);
  const before = h.seen.length;
  assert.equal(await keys(['list', '--project', 'Encore', '--everywhere'], both), 1);
  assert.match(both.said[0]!, /^braindog keys list takes/u);
  assert.equal(h.seen.length, before);
});

test('--json GIVES THE SAME KEYS: one row a key with the five facts, in the order the lines are in', async (t) => {
  const h = await host(t, FIVE);
  const one = io(h.base);
  assert.equal(await keys(['list', '--json'], one), 0, one.said.join('\n'));
  assert.equal(one.answered.length, 1);
  const { keys: rows } = one.answered[0]!.value as { keys: KeyRead[] };
  assert.deepEqual(rows[0], { name: 'Apple developer', opens: 'The Encore app in the store', applies: 'Encore', sealed: false, kept: 'the password manager, under Apple', expires: '2026-10-01' });
  assert.deepEqual(rows[1], { name: 'Cloudflare deploy', opens: 'Deploys of every site', applies: 'Everywhere', sealed: true, kept: null, expires: null });
  /* The lines are made from these rows and nothing else. */
  assert.deepEqual(rows.map((k) => keyLine(k, '2026-10-13')), one.lines);
  for (const k of rows) assert.deepEqual(Object.keys(k), ['name', 'opens', 'applies', 'sealed', 'kept', 'expires']);
});

test('READ IN PAGES OF FIFTY TO THE END, each page asked for where the last one stopped, and no run named', async (t) => {
  const h = await host(t, MANY);
  const one = io(h.base);
  assert.equal(await keysList([], one), 0, one.said.join('\n'));
  assert.equal(KEYS_PAGE, 50);
  const reads = h.seen.filter((s) => s.method === 'list' && s.register === 'credentials');
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
