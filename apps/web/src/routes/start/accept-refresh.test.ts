/**
 * People goes in before the lists it links to, so the first run plans it again once they are all in, and installs that
 * plan only when it changes something (`accept.ts` `refreshModule`).
 *
 * THAT IS THE SCRIPT THE PRESS USED TO BE (`oldScript`), which a host a release behind this page still gets: the fake
 * client here has no `setup`, which is how `accept` is told to run it. Those tests go when the script does.
 *
 * UNDER THEM, THE PRESS AS IT IS NOW (USE-B04): one `setup` call the record owns, so a tab closed after the press leaves
 * a record that holds every part; a call cut off is pressed once more with `again`; a host with no such call gets the
 * script; and a file goes in through the same call, two hundred entries at a time.
 *
 * A FAKE RECORD, NOT A SOCKET, as `accept-self.test.ts` has it: an empty record that takes People and Money in turn.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { propose } from '../../lib/start/propose.ts';
import { NoSuchCall } from '@braindog/client';

import { byRules, exportLists, readExport } from '../../lib/start/export.ts';
import { accept, fileFor, importFile, type Accepting, type SetupRow } from './accept.ts';

type Call = { name: string; args: unknown };

/** What a plan of a module the record holds adds and retires, beside its changes. */
type Again = { adds?: readonly { id: string; summary: string; handed?: true }[]; retires?: readonly { id: string; rows: number; to?: string }[] };

/**
 * A record that holds each module once it is installed; a plan of an installed one changes `changes` things, asks for
 * `approve` to be approved, and adds and retires what `again` says. `before` is what it held before the press.
 */
function record(changes: number, before: readonly string[] = [], approve: readonly string[] = [], again: Again = {}) {
  const calls: Call[] = [];
  const held: { id: string; version: string; disabled_at: null; registers: string[] }[] = before.map((id) => ({ id, version: '1.0.0', disabled_at: null, registers: [id] }));
  const ok = (value: unknown) => ({ ok: true, value });
  const client = {
    packs: async () => ok([...held]),
    planPack: async (args: { doc: { pack?: string } }) => {
      calls.push({ name: 'planPack', args });
      const id = args.doc.pack ?? '';
      const was = held.some((p) => p.id === id);
      return ok({
        diff: {
          planHash: `${id}-${held.length}`,
          adds: was ? [...(again.adds ?? [])] : [{ id: `register.${id}`, summary: '' }],
          changes: was ? Array.from({ length: changes }, () => ({ id: 'page.relation' })) : [],
          retires: was ? [...(again.retires ?? [])] : [],
          approve: was ? [...approve] : [],
        },
      });
    },
    installPack: async (args: { doc: { pack?: string } }) => {
      calls.push({ name: 'installPack', args });
      const id = args.doc.pack ?? '';
      if (!held.some((p) => p.id === id)) held.push({ id, version: '1.0.0', disabled_at: null, registers: [id] });
      return ok({});
    },
    meet: async () => ok({ row: null, created: false }),
    create: async () => ok({ register: 'people', seq: 1 }),
    update: async () => ok({}),
    packConfig: async () => ok({ config: {} }),
  };
  return { client: client as unknown as Parameters<typeof accept>[0], calls };
}

const asked = (): Accepting => {
  const sentence = "I'm a student";
  const proposal = propose(sentence, { zone: 'Europe/London', locale: 'en-GB' });
  return { sentence, proposal, usecase: null, also: [], modules: ['people', 'money-core'], currency: null, today: '2026-10-06', email: null, nav: [] };
};

const installs = (calls: Call[], id: string) => calls.filter((c) => c.name === 'installPack' && (c.args as { doc: { pack?: string } }).doc.pack === id).length;

test('PEOPLE IS PLANNED AGAIN ONCE MONEY IS IN, and that plan installed when it changes something', async () => {
  const { client, calls } = record(1);
  const out = await accept(client, asked());
  assert.deepEqual(out.failed, []);
  assert.equal(installs(calls, 'money-core'), 1);
  assert.equal(installs(calls, 'people'), 2, 'People was not put in again with the lists after it');
  const last = calls.filter((c) => c.name === 'installPack').at(-1);
  assert.equal((last?.args as { doc: { pack?: string } }).doc.pack, 'people');
});

test('A PLAN THAT CHANGES NOTHING IS NOT INSTALLED', async () => {
  const { client, calls } = record(0);
  await accept(client, asked());
  assert.equal(installs(calls, 'people'), 1);
});

test('A PEOPLE LIST HELD BEFORE IS PLANNED AGAIN ONCE MONEY GOES IN, and goes in only when it asks nothing to approve', async () => {
  const quiet = record(1, ['people']);
  assert.deepEqual((await accept(quiet.client, asked())).failed, []);
  assert.equal(installs(quiet.calls, 'money-core'), 1);
  assert.equal(installs(quiet.calls, 'people'), 1, 'the held People list did not gain what Money brings');
  /* ONE THAT ASKS FOR APPROVAL IS THE PERSON'S TO SEE, at People's own update, and not approved for them here. */
  const asks = record(1, ['people'], ['page.relation']);
  await accept(asks.client, asked());
  assert.equal(installs(asks.calls, 'people'), 0);
  /* NOTHING ADDED, NOTHING PLANNED: a press on a record that holds every list already leaves People as it is. */
  const full = record(1, ['people', 'money-core']);
  await accept(full.client, asked());
  assert.equal(full.calls.filter((c) => c.name === 'planPack').length, 0);
});

test('A PEOPLE LIST HELD BEFORE IS NOT CHANGED UNDER THE PERSON: the same losses BrainDog\'s own updates check', async () => {
  /* SOMETHING THE PERSON TOOK OFF: a figure People's copy held before Money came, which the record no longer holds. */
  const back = record(1, ['people'], [], { adds: [{ id: 'metric.people-in-touch-30d', summary: '' }] });
  await accept(back.client, asked());
  assert.equal(installs(back.calls, 'people'), 0, 'a figure the person took off came back');
  /* SOMETHING TAKEN AWAY, which was never asked about. */
  const gone = record(1, ['people'], [], { retires: [{ id: 'page.relation', rows: 0 }] });
  await accept(gone.client, asked());
  assert.equal(installs(gone.calls, 'people'), 0, 'a page the person had was taken away');
  /* WHAT THIS PRESS MADE ROOM FOR is new to People's copy, and goes in; so does a declaration handed to another pack. */
  const room = record(1, ['people'], [], { adds: [{ id: 'block.organisation-money', summary: '' }], retires: [{ id: 'page.relation', rows: 0, to: 'money-core' }] });
  await accept(room.client, asked());
  assert.equal(installs(room.calls, 'people'), 1, 'what Money made room for did not go in');
});

/* ── the one answer, and a shop's lists (use case 6, steps 2 and 3) ──────── */

/** A page's cookie jar, for `pref.ts`: what the press writes is what the next read finds. */
function jar(): () => void {
  const was = (globalThis as { document?: unknown }).document;
  let kept = '';
  (globalThis as { document?: unknown }).document = {
    get cookie() {
      return kept;
    },
    set cookie(line: string) {
      kept = line.split(';')[0] ?? '';
    },
  };
  return () => void ((globalThis as { document?: unknown }).document = was);
}

test('THE ONE ANSWER IS KEPT AS PREF arrivesBy, which orders Today’s next steps; none is kept unasked', async () => {
  const done = jar();
  try {
    const { read } = await import('../../lib/pref.ts');
    const a = asked();
    await accept(record(0).client, { ...a, proposal: { ...a.proposal, answers: { arrivesBy: 'messages' } } });
    assert.equal(read().arrivesBy, 'messages', 'the answer to the one question was not kept');
    done();
    const fresh = jar();
    try {
      await accept(record(0).client, asked());
      assert.equal(read().arrivesBy, undefined, 'an answer nobody gave was kept');
    } finally {
      fresh();
    }
  } finally {
    done();
  }
});

test('A SHOP IS MADE WITH ITS ORDERS AND PRODUCTS, and nothing in them that she did not say', async () => {
  const { useCase } = await import('@braindog/seed/usecases');
  const shop = useCase('shop');
  assert.ok(shop, 'there is no shop use case to make');
  const file = await fileFor(shop, ['people', 'money-core'], '2026-10-09', 'I run a small candle shop in Alexandria');
  const pack = (file?.pack ?? {}) as { declarations?: { register?: string }[]; seeds?: unknown[] };
  const lists = (pack.declarations ?? []).flatMap((d) => (typeof d.register === 'string' ? [d.register] : []));
  assert.ok(lists.includes('orders') && lists.includes('products'), `a shop is made without Orders and Products: ${lists.join(', ')}`);
  assert.equal(pack.seeds, undefined, 'a shop is made with entries she did not type');
});

/* ── one call, owned by the record ─────────────────────────────────────── */

type Sent = { usecase?: string; alongside?: string[]; packs?: { install?: string[] }; me?: { name: string }; rows?: SetupRow[]; again?: boolean; key?: string };

/**
 * A RECORD THAT MAKES WHAT ONE `setup` ASKS FOR, as the record does: the lists in order (one named in `refuse` is said
 * back as `install:<id>` and the rest stay), then the person, then the entries all or none, once for a press that says
 * its `key`. A record that holds lists refuses a call without `again`. `answers` is what the page gets back: the
 * answer, nothing ever (`never`, a closed tab), or a call cut off before or after the record did the work.
 */
function owned(answers: 'answer' | 'never' | 'cut-after' | 'cut-before' | 'lost' = 'answer', refuse: readonly string[] = []) {
  /* `lost`: every call goes in and its answer is cut off, until `hear()`. */
  let deaf = answers === 'lost';
  const held = { parts: [] as string[], me: null as string | null, rows: [] as SetupRow[], keys: [] as string[] };
  const sent: Sent[] = [];
  const ok = (value: unknown) => ({ ok: true, value });
  const apply = (body: Sent) => {
    const failed: { part: string; why: string }[] = [];
    for (const id of [...(body.usecase ? [`usecase-${body.usecase}`] : []), ...(body.alongside ?? []).map((a) => `usecase-${a}`), ...(body.packs?.install ?? [])]) {
      if (refuse.includes(id)) failed.push({ part: `install:${id}`, why: 'It needs a list this BrainDog does not hold.' });
      else if (!held.parts.includes(id)) held.parts.push(id);
    }
    if (body.me) held.me = body.me.name;
    /* A LIST THAT IS NOT HERE LOSES ITS ENTRIES AND SAYS SO; the rest go in all or none, once for a key. */
    const here = (r: SetupRow) => held.parts.includes(r.register === 'obligations' ? 'money-core' : r.register === 'things' ? 'portfolio' : r.register === 'tasks' ? 'work' : r.register);
    const rows = (body.rows ?? []).filter(here);
    for (const register of new Set((body.rows ?? []).filter((r) => !here(r)).map((r) => r.register))) failed.push({ part: `rows:${register}`, why: `${register} is not here, so its entries were not written.` });
    if (body.key !== undefined && held.keys.includes(body.key)) return { done: { installed: [...held.parts] }, failed };
    if (rows.some((r) => r.fields.what === 'refuse me')) failed.push({ part: 'rows', why: 'Not today.' });
    else if (rows.length > 0) {
      held.rows.push(...rows);
      if (body.key !== undefined) held.keys.push(body.key);
    }
    return { done: { installed: [...held.parts] }, failed };
  };
  const client = {
    setup: async (body: Sent) => {
      sent.push(body);
      const first = sent.length === 1;
      if (first && answers === 'cut-before') throw new TypeError('fetch failed');
      if (held.parts.length > 0 && body.again !== true) return { ok: false, refusal: { code: 'TRANSITION_ILLEGAL', fix: 'This BrainDog is set up already.', at: 'again' } };
      const out = apply(body);
      if ((first && answers === 'cut-after') || deaf) throw new TypeError('fetch failed');
      if (answers === 'never') return new Promise(() => {});
      return ok(out);
    },
    list: async (args: { register: string }) => ok({ rows: held.rows.filter((r) => r.register === args.register).map((r) => ({ fields: r.fields })) }),
    packs: async () => ok(held.parts.map((id) => ({ id, version: '1.0.0', disabled_at: null, registers: id === 'work' ? ['tasks'] : [id] }))),
  };
  return { client: client as unknown as Parameters<typeof accept>[0], held, sent, hear: () => void (deaf = false) };
}

const sam = (): Accepting => {
  const sentence = "I'm Sam, I run Kiln and we bill Fenwick £2,000 a month on the 1st";
  const proposal = propose(sentence, { zone: 'Europe/London', locale: 'en-GB' });
  return { sentence, proposal, usecase: null, also: [], modules: ['portfolio', 'people', 'money-core'], currency: 'GBP', today: '2026-10-13', email: 'sam@example.com', nav: [] };
};

test('A TAB CLOSED AFTER THE PRESS LEAVES A RECORD THAT, OPENED AGAIN, HOLDS EVERY PART', async () => {
  const { client, held, sent } = owned('never');
  const a = sam();
  /* THE PAGE NEVER HEARS BACK: the tab is gone. Nothing after the one call is the page's to do. */
  void accept(client, a);
  for (let i = 0; i < 200 && sent.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(sent.length, 1, 'the press is more than one call, so a closed tab leaves the rest undone');
  assert.deepEqual(held.parts, ['portfolio', 'people', 'money-core']);
  assert.equal(held.me, 'Sam');
  assert.equal(held.rows.length, a.proposal.rows.length, 'an entry the sentence filled is not in the record');
  assert.ok(held.rows.some((r) => r.fields.name === 'Fenwick'));
});

test('A BUILD CARRIES ONE KEY THROUGH EVERY PRESS, so Try again after a call that landed unheard writes no entry twice', async () => {
  /* THE CALL GOES IN AND NOTHING COMES BACK, on the first sending and on `accept`'s own second. */
  const lost = owned('lost');
  const asked = { ...sam(), key: 'first-run-one-build' };
  const first = await accept(lost.client, asked);
  assert.equal(first.unheard, true, 'a press nobody answered did not say so');
  assert.ok(lost.sent.every((s) => s.key === 'first-run-one-build'), 'the press was sent under another handle than the build\'s');
  const wrote = lost.held.rows.length;
  assert.equal(wrote, sam().proposal.rows.length);

  /* TRY AGAIN, as the sign-up page presses it: the same build, the same key, with `again`. */
  lost.hear();
  const second = await accept(lost.client, { ...asked, again: true });
  assert.deepEqual(second.failed, []);
  assert.equal(lost.held.rows.length, wrote, 'Try again wrote the entries a second time');

  /* AND WITH NO KEY OF ITS OWN A PRESS STILL HAS ONE, as before. */
  const bare = owned();
  await accept(bare.client, sam());
  assert.match(bare.sent[0]?.key ?? '', /^first-run-/u);
});

test('A CALL CUT OFF IS PRESSED ONCE MORE WITH again, and no entry is written twice', async () => {
  const after = owned('cut-after');
  const out = await accept(after.client, sam());
  assert.deepEqual(out.failed, []);
  assert.equal(after.sent.length, 2);
  assert.equal(after.sent[1]?.again, true);
  assert.ok(after.sent[0]?.key, 'the press has no handle of its own, so the record cannot tell its second sending');
  assert.equal(after.sent[1]?.key, after.sent[0]?.key);
  assert.equal(after.held.rows.length, sam().proposal.rows.length, 'the entries were written twice, or not at all');

  const before = owned('cut-before');
  await accept(before.client, sam());
  assert.equal(before.sent[1]?.again, true);
  assert.equal(before.held.rows.length, sam().proposal.rows.length, 'the entries never went in');
});

test('WHAT THE RECORD REFUSED IS SAID BY NAME WITH ITS OWN SENTENCE, the rest stays, and the entries are handed back whole', async () => {
  const { client, held } = owned('answer', ['money-core']);
  const a = sam();
  const out = await accept(client, a);
  assert.deepEqual(out.failed[0], { said: 'Money was not added.', why: 'It needs a list this BrainDog does not hold.' });
  assert.deepEqual(held.parts, ['portfolio', 'people'], 'the two before the refusal were not kept');
  assert.deepEqual(out.refused, [{ part: 'money-core', why: 'It needs a list this BrainDog does not hold.' }], 'the tile for Money has no sentence to say');
  /* THE ENTRIES FOR THE LIST THAT IS NOT THERE ARE STILL TO MAKE, and only those: the rest went in. */
  const owed = a.proposal.rows.filter((r) => r.register === 'obligations');
  assert.ok(owed.length > 0);
  assert.deepEqual(out.left.map((r) => r.register), owed.map((r) => r.register));
  assert.equal(held.rows.length, a.proposal.rows.length - owed.length);
});

test('A RECORD THAT IS SET UP ALREADY IS ASKED ONLY FOR WHAT IS MISSING, by the page and not by the person', async () => {
  const { client, held, sent } = owned();
  held.parts.push('people');
  const out = await accept(client, sam());
  assert.deepEqual(out.failed, []);
  assert.deepEqual(sent.map((s) => s.again), [undefined, true]);
  assert.deepEqual(held.parts, ['people', 'portfolio', 'money-core']);
});

test('A HOST WITH NO SUCH CALL GETS THE SCRIPT, for this one release', async () => {
  const old = record(0);
  const calls: string[] = [];
  const client = {
    ...(old.client as unknown as Record<string, unknown>),
    setup: async () => {
      calls.push('setup');
      throw new NoSuchCall('setup', { code: 'ROUTE_UNKNOWN', fix: 'There is no call named setup.' } as never);
    },
  };
  const out = await accept(client as unknown as Parameters<typeof accept>[0], asked());
  assert.deepEqual(calls, ['setup']);
  assert.deepEqual(out.failed, []);
  assert.equal(installs(old.calls, 'people') >= 1 && installs(old.calls, 'money-core') === 1, true, 'the script did not install the lists');
});

test('A FILE GOES IN THROUGH setup WITH again, two hundred entries to a call, and one refused is found by halving', async () => {
  const lines = Array.from({ length: 450 }, (_, i) => (i === 300 ? 'refuse me,' : `Job ${i},${i === 0 ? '2026-10-15' : ''}`));
  const file = readExport('todoist.csv', `CONTENT,DATE\n${lines.join('\n')}\n`);
  assert.ok(!('why' in file));
  const mapping = byRules(file, exportLists(), 'en-GB');
  const { client, held, sent } = owned();
  held.parts.push('work');
  const failed = await importFile(client, { file, mapping }, null, 'en-GB', [{ id: 'work', disabled_at: null, registers: ['tracks', 'updates', 'tasks'] }] as never);
  assert.deepEqual(sent.slice(0, 2).map((s) => [s.again, s.rows?.length]), [[true, 200], [true, 200]]);
  assert.ok(sent.every((s) => s.again === true && (s.rows?.length ?? 0) <= 200 && s.rows?.every((r) => r.register === 'tasks')));
  assert.equal(held.rows.length, 449, 'an entry beside the refused one did not go in');
  assert.deepEqual(failed, [{ said: '1 of 450 from your file did not go into Tasks.', why: 'Not today.' }]);
});
