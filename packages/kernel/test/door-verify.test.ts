/**
 * A door stays a door while a pattern names it: the door is not re-installed without its token or its `match:`.
 *
 * `loop/research-batch-forty-two-audit.md` FINDING 4. `doorFault` refuses a `door:` naming anything but an installed
 * webhook with `verify: { kind: path }`, and it is asked when the PATTERN is installed. Measured by the audit on 23
 * September with this file's `HOOK` shape: `a` installed as a door and `b` naming it, then `a` re-installed without
 * `verify:` answered `ok`, and `a` retired answered `ok`, each leaving `b` installed under exactly the declaration
 * `doorFault` refuses. And a door with no `match:` filed an arrival meant for `b` itself, rows one and two `1 0`,
 * because `offered` puts the door's own pattern first and a pattern with no `match:` takes everything.
 *
 * THE ORDER IS KEPT. The door's own pattern going first is deliberate (`ingest.ts`, "A PATTERN THAT NAMES THE DOOR IS NOT
 * A NEIGHBOUR"), so a door whose phrase is merely wider than a twin's still installs: whether one phrase covers another
 * is not decidable from the two declarations. A door with no `match:` at all is, and so is one whose `match:` is true
 * whatever the text (`{ all: [] }`, `{ none: [] }`, or either of them beside a phrase under `any`), and both are refused
 * on either side.
 *
 * (c), THE DOOR RETIRED, IS NOT HELD HERE. Refused in `retireDeclarations` on 23 September, it stopped money-core's own
 * update, whose plan hands a pattern naming the door to `bank-hsbc-eg` and retires the door
 * (`packages/seed/test/bank-pack.test.ts`), so it waits on which of the two that plan should hand.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const REGISTER = (id: string): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name: id, title: 'merchant', fields: [{ id: 'merchant', type: 'text', required: true }, { id: 'amount', type: 'money' }] } as never,
});

/* `word: null` IS A PATTERN WITH NO `match:`, which takes every arrival it is offered. */
const HOOK = (ingest: string, word: string | null, register: string, more: Record<string, unknown> = {}): Declaration => ({
  id: `ingest.${ingest}`,
  kind: 'ingest',
  body: {
    ingest,
    channel: 'webhook',
    verify: { kind: 'path' },
    ...(word === null ? {} : { match: { all: [{ field: 'body', contains: word }] } }),
    extract: { merchant: { text: { between: ['You ', ' EGP'] } }, amount: { money: { after: 'EGP', currency: 'EGP' } } },
    writes: { register, confidence: 'exact' },
    dedupe: ['merchant'],
    on_conflict: 'skip',
    ...more,
  } as never,
});
const without = (decl: Declaration, key: string): Declaration => {
  const body = { ...(decl.body as Record<string, unknown>) };
  delete body[key];
  return { ...decl, body: body as never };
};

type Refused = { ok: boolean; refusal?: { code: string; at?: string; fix: string } };
const said = (r: unknown): string => {
  const x = r as Refused;
  return x.ok ? 'ok' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`;
};

/** Door `a` and pattern `b` naming it, installed clean. */
async function doorAndTwin(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([REGISTER('one'), REGISTER('two'), HOOK('a', 'paid', 'one'), HOOK('b', 'withdrew', 'two', { door: 'a' })]);
  assert.ok(out.ok, said(out));
  return k;
}

test('(b) THE DOOR RE-INSTALLED WITHOUT verify: IS REFUSED WHILE A PATTERN NAMES IT, naming the pattern', async () => {
  const k = await doorAndTwin();
  const out = (await k.install([without(HOOK('a', 'paid', 'one'), 'verify')])) as Refused;
  assert.equal(out.ok, false, 'the door lost its token under ingest.b');
  assert.deepEqual([out.refusal?.code, out.refusal?.at], ['DECLARATION_INVALID', 'verify'], said(out));
  assert.equal(
    out.refusal?.fix,
    'ingest.a is the door ingest.b reads, and without verify: { kind: path } nothing arriving there is verified and no pattern is tried. Keep verify: { kind: path }, or take door: a out of ingest.b in the same batch.',
  );
  /* AND THE WAY OUT IT NAMES IS OPEN: the pattern stops naming the door in the same batch. */
  assert.ok((await k.install([without(HOOK('a', 'paid', 'one'), 'verify'), HOOK('b', 'withdrew', 'two')])).ok);
});

test('(a) A PATTERN NAMING A DOOR WITH NO match: IS REFUSED, since that door takes every arrival first', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = (await k.install([REGISTER('one'), REGISTER('two'), HOOK('a', null, 'one'), HOOK('b', 'withdrew', 'two', { door: 'a' })])) as Refused;
  assert.equal(out.ok, false, 'installed a twin the door shadows');
  assert.deepEqual([out.refusal?.code, out.refusal?.at], ['DECLARATION_INVALID', 'door'], said(out));
});

test('(a) AND THE DOOR RE-INSTALLED WITHOUT ITS match: IS REFUSED WHILE A PATTERN NAMES IT', async () => {
  const k = await doorAndTwin();
  const out = (await k.install([HOOK('a', null, 'one')])) as Refused;
  assert.equal(out.ok, false, 'the door came to take everything ahead of ingest.b');
  assert.deepEqual([out.refusal?.code, out.refusal?.at], ['DECLARATION_INVALID', 'match'], said(out));
});

test('(b) A PACK STAGING THE DOOR WITHOUT verify: IS REFUSED AT STAGE TOO, in the same words install uses', async () => {
  /* `stageInstall` HANDS `stageDeclarations` NO `known`, so its `doorsKept` is skipped there and `lintBatch` is the one
     that asks. Checked on 23 September by returning `null` in place of `lintBatch`'s `doorsKept`: every other case in
     this file and the whole kernel suite stayed green, because `install` asks again when it stages. */
  const k = await doorAndTwin();
  const staged = (await k.stageInstall([without(HOOK('a', 'paid', 'one'), 'verify')])) as Refused;
  assert.equal(staged.ok, false, 'a pack staged the door out from under ingest.b');
  assert.equal(said(staged), said(await k.install([without(HOOK('a', 'paid', 'one'), 'verify')])));
});

test('A DOOR RE-INSTALLED WITH ITS TOKEN AND A NEW PHRASE STILL INSTALLS, however wide the phrase', async () => {
  const k = await doorAndTwin();
  assert.equal(said(await k.install([HOOK('a', 'EGP', 'one')])), 'ok');
});

/* THE CHECKER'S SECOND SPELLING, measured on 23 September: a door declared with `match: { all: [] }` installed, a twin
   naming it installed, and the twin's own text went to the door, rows one and two `1 0`, which is (a)'s hole with a
   `match:` present. `evaluate` answers an empty group with `q !== 'any'`, so `none: []` is the same hole and so is any
   nesting of the two that names no field.

   AND A FIELD BESIDE SUCH A GROUP DOES NOT MAKE IT DEPEND ON THE TEXT. The checker's third spelling, measured on 23
   September: `{ any: [{ all: [] }, { field: body, contains: paid }] }` compiled clean, `evaluate` answered it true for an
   empty arrival and for the text `You withdrew 5 EGP` alike, and the door and its twin installed together, because the
   first version of `takesEvery` read any tree naming a field as the author's own phrase. */
const TAKES_ALL: readonly unknown[] = [
  { all: [] },
  { none: [] },
  { all: [{ none: [] }] },
  { any: [{ all: [] }] },
  { any: [{ all: [] }, { field: 'body', contains: 'paid' }] },
  { any: [{ field: 'body', contains: 'paid' }, { none: [] }] },
  { none: [{ any: [] }, { all: [{ any: [] }, { field: 'body', contains: 'paid' }] }] },
];

test('(a) A DOOR WHOSE match: IS TRUE WHATEVER THE TEXT TAKES EVERYTHING TOO, and a pattern naming it is refused', async () => {
  for (const match of TAKES_ALL) {
    const k = await openRecord(openSqlite(), fixedClock(NOW));
    const out = (await k.install([REGISTER('one'), REGISTER('two'), HOOK('a', null, 'one', { match }), HOOK('b', 'withdrew', 'two', { door: 'a' })])) as Refused;
    assert.equal(out.ok, false, `installed a twin behind a door matching ${JSON.stringify(match)}`);
    assert.deepEqual([out.refusal?.code, out.refusal?.at], ['DECLARATION_INVALID', 'door'], said(out));
  }
});

test('(a) AND THE DOOR RE-INSTALLED WITH SUCH A match: IS REFUSED WHILE A PATTERN NAMES IT', async () => {
  for (const match of TAKES_ALL) {
    const k = await doorAndTwin();
    const out = (await k.install([HOOK('a', null, 'one', { match })])) as Refused;
    assert.equal(out.ok, false, `the door came to take everything ahead of ingest.b with ${JSON.stringify(match)}`);
    assert.deepEqual([out.refusal?.code, out.refusal?.at], ['DECLARATION_INVALID', 'match'], said(out));
  }
});

test('A DOOR WHOSE match: NAMES NO FIELD AND IS FALSE TAKES NOTHING, so the twin behind it still installs', async () => {
  /* `any: []` IS FALSE FOR EVERY ARRIVAL, so the door files nothing and every text reaches the patterns naming it. */
  for (const match of [{ any: [] }, { all: [{ any: [] }] }, { none: [{ none: [] }, { field: 'body', contains: 'paid' }] }]) {
    const k = await openRecord(openSqlite(), fixedClock(NOW));
    const out = await k.install([REGISTER('one'), REGISTER('two'), HOOK('a', null, 'one', { match }), HOOK('b', 'withdrew', 'two', { door: 'a' })]);
    assert.equal(said(out), 'ok', JSON.stringify(match));
  }
});

test('A DOOR WHOSE match: HOLDS A CONSTANT GROUP BESIDE A PHRASE STILL INSTALLS WHEN THE PHRASE DECIDES', async () => {
  /* `all` OF TRUE AND A PHRASE IS THE PHRASE, and `any` of false and a phrase is too, so both depend on the text and
     are the wider-phrase case this file leaves to the author. */
  for (const match of [{ all: [{ all: [] }, { field: 'body', contains: 'paid' }] }, { any: [{ any: [] }, { field: 'body', contains: 'paid' }] }]) {
    const k = await openRecord(openSqlite(), fixedClock(NOW));
    const out = await k.install([REGISTER('one'), REGISTER('two'), HOOK('a', null, 'one', { match }), HOOK('b', 'withdrew', 'two', { door: 'a' })]);
    assert.equal(said(out), 'ok', JSON.stringify(match));
  }
});
