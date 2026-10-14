/**
 * What each waiting arrival is: the record's hint read in one call, and the line the Inbox draws under a title from it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HINTS_MOST, hintLine, readHints, type Call, type Hint } from './hints.ts';

/* ONE OF `fixtures/names.ts`'s invented people and one of its companies, written here: a file under `src/` may not reach
   out of `apps/web` by a relative path (`graph`, 31 §3 layer 3), and the names file is no package to import. */
const PEOPLE = [{ name: 'Mara Lindqvist', email: 'mara@lindqvist.example' }, { name: 'Mara Okafor', email: 'mara.okafor@brightwell.example' }] as const;
const MARA = PEOPLE[1].name;
const SHOP = 'Orchardline';

/** A stand-in for the client's `call`, answering `answer` for every id it is asked about, and keeping what it was asked. */
function door(answer: (id: string) => Omit<Hint, 'id'> | undefined) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const call: Call = async (name, args) => {
    calls.push({ name, args });
    const ids = args.ids as string[];
    const hints = ids.flatMap((id) => {
      const h = answer(id);
      return h ? [{ id, ...h }] : [];
    });
    return { ok: true, value: { hints } };
  };
  return { call, calls };
}

const hint = (h: Partial<Hint>): Hint => ({ id: 'a1', what: null, who: null, amount: null, ...h });

test('a payment says its amount and who it was to', () => {
  assert.equal(hintLine(hint({ what: 'payment', amount: 'EGP 420', who: SHOP })), `Payment, EGP 420, ${SHOP}`);
});

test('someone writing says who', () => {
  assert.equal(hintLine(hint({ what: 'someone writing', who: MARA })), `From ${MARA}`);
});

test('an arrival the record can say nothing about draws no line', () => {
  assert.equal(hintLine(hint({ what: null, who: MARA, amount: 'EGP 420' })), null);
  assert.equal(hintLine(undefined), null);
  assert.equal(hintLine(null), null);
});

test('a part the record could not say is left out, never drawn empty', () => {
  assert.equal(hintLine(hint({ what: 'payment', amount: 'EGP 420' })), 'Payment, EGP 420');
  assert.equal(hintLine(hint({ what: 'payment', who: SHOP })), `Payment, ${SHOP}`);
  assert.equal(hintLine(hint({ what: 'payment' })), 'Payment');
  assert.equal(hintLine(hint({ what: 'someone writing' })), null);
});

test('an address or an id is never said as a name, and no line holds an em dash', () => {
  assert.equal(hintLine(hint({ what: 'someone writing', who: PEOPLE[1]!.email })), null);
  assert.equal(hintLine(hint({ what: 'someone writing', who: '01JBZ8Q4T5V6W7X8Y9Z0A1B2C3' })), null);
  assert.equal(hintLine(hint({ what: 'payment', amount: 'EGP 420', who: PEOPLE[1]!.email })), 'Payment, EGP 420');
  const line = hintLine(hint({ what: 'someone writing', who: `${MARA} — ${SHOP}` }));
  assert.equal(line, `From ${MARA}, ${SHOP}`);
  assert.ok(!line!.includes('—'));
});

test('many rows are read in one call, and an id the record leaves out has no hint', async () => {
  const { call, calls } = door((id) => (id === 'a3' ? undefined : { what: 'payment', who: SHOP, amount: 'EGP 420' }));
  const ids = ['a1', 'a2', 'a3', 'a4', 'a2'];
  const read = await readHints(call, ids);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.name, 'inboxHints');
  assert.deepEqual(calls[0]!.args, { ids: ['a1', 'a2', 'a3', 'a4'] });
  assert.deepEqual([...read!.keys()], ['a1', 'a2', 'a4']);
  assert.equal(hintLine(read!.get('a1')), `Payment, EGP 420, ${SHOP}`);
});

test('more rows than one call reads still make one call, of the newest', async () => {
  const { call, calls } = door(() => ({ what: 'someone writing', who: MARA, amount: null }));
  const ids = Array.from({ length: HINTS_MOST + 30 }, (_, i) => `a${i}`);
  const read = await readHints(call, ids);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.args.ids, ids.slice(0, HINTS_MOST));
  assert.equal(read!.size, HINTS_MOST);
});

test('no rows ask nothing', async () => {
  const { call, calls } = door(() => undefined);
  assert.equal((await readHints(call, []))!.size, 0);
  assert.equal(calls.length, 0);
});

test('an answer for an id not asked, or of another shape, is dropped', async () => {
  const call: Call = async () => ({
    ok: true,
    value: { hints: [{ id: 'zz', what: 'payment', who: SHOP, amount: 'EGP 1' }, { id: 'a1', what: 'a guess' }, { id: 'a2', what: 'someone writing', who: MARA }] },
  });
  const read = await readHints(call, ['a1', 'a2']);
  assert.deepEqual([...read!.keys()], ['a2']);
  assert.equal(await readHints(async () => ({ ok: true, value: { nope: [] } }), ['a1']), null);
});

test('a host without the method draws what it drew: null', async () => {
  const unknown: Call = async () => ({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called inboxHints.' } }) as { ok: false };
  assert.equal(await readHints(unknown, ['a1']), null);
  const unbuilt: Call = async () => ({ ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'Not in this build.' } }) as { ok: false };
  assert.equal(await readHints(unbuilt, ['a1']), null);
});

test('a refusal, or a door that throws, is null too', async () => {
  const refused: Call = async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'You cannot read the inbox.' } }) as { ok: false };
  assert.equal(await readHints(refused, ['a1']), null);
  const thrown: Call = async () => {
    throw new Error('offline');
  };
  assert.equal(await readHints(thrown, ['a1']), null);
});

/*
 * THE PAGE'S OWN PATH, THROUGH THE REAL CLIENT AND A STAND-IN HOST. The client knows a method only once the host's route
 * table holds it (inbox-hints lands that), so until then it answers ROUTE_UNKNOWN unsent and the Inbox draws no line;
 * once it does, one request carries every id and the lines come back by id.
 */
test('the Inbox reads its lines through the client in one request, or draws none on a host without the method', async () => {
  const { linesFor } = await import('./hints.ts');
  const sent: string[] = [];
  const was = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    sent.push(String(url));
    const hints = [
      { id: 'a1', what: 'payment', who: SHOP, amount: 'EGP 420' },
      { id: 'a2', what: 'someone writing', who: MARA, amount: null },
      { id: 'a3', what: null, who: null, amount: null },
    ];
    return new Response(JSON.stringify({ ok: true, value: { hints } }), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const lines = await linesFor('https://record.example', ['a1', 'a2', 'a3']);
    if (sent.length === 0) assert.equal(lines, null);
    else {
      assert.equal(sent.length, 1);
      assert.match(sent[0]!, /\/api\/inboxHints/);
      assert.deepEqual([...lines!], [['a1', `Payment, EGP 420, ${SHOP}`], ['a2', `From ${MARA}`]]);
    }
  } finally {
    globalThis.fetch = was;
  }
});
