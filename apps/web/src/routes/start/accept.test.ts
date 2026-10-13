/**
 * TRY AGAIN AFTER A PRESS THE RECORD ANSWERED (audit 55, claim 8). The record keeps a press's key once its entries are
 * in, and passes entries over only for a key it holds, so the next press goes under a new key and must carry only what
 * is still to make. A use case's plan (`formedRows`) is formed from the sentence on every press: sent again under the
 * new key, it was written a second time.
 *
 * A FAKE RECORD, NOT A SOCKET, as `accept-refresh.test.ts` has it, with the record's own rule for a key
 * (`packages/record/src/arrange.ts` `setupRows`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { propose } from '../../lib/start/propose.ts';
import { accept, pressAgain, type Accepting, type SetupRow } from './accept.ts';

type Sent = { usecase?: string; packs?: { install?: string[] }; rows?: SetupRow[]; again?: boolean; key?: string };

/**
 * A record that takes one `setup`: an add-on named in `refuse` is said back and the rest stay, an entry for a list in
 * `missing` is left out and said, and the others go in all or none (`refuseRows` refuses them), once for a key.
 */
function record(o: { refuse: string[]; missing: string[]; refuseRows: boolean }) {
  const held = { parts: [] as string[], rows: [] as SetupRow[], keys: [] as string[] };
  const sent: Sent[] = [];
  const client = {
    setup: async (body: Sent) => {
      sent.push(body);
      const failed: { part: string; why: string }[] = [];
      for (const id of [...(body.usecase ? [`usecase-${body.usecase}`] : []), ...(body.packs?.install ?? [])]) {
        if (o.refuse.includes(id)) failed.push({ part: `install:${id}`, why: 'It needs a list this BrainDog does not hold.' });
        else if (!held.parts.includes(id)) held.parts.push(id);
      }
      const all = body.rows ?? [];
      const rows = all.filter((r) => !o.missing.includes(r.register));
      for (const register of new Set(all.filter((r) => o.missing.includes(r.register)).map((r) => r.register))) failed.push({ part: `rows:${register}`, why: `${register} is not here.` });
      const passed = body.again === true && body.key !== undefined && held.keys.includes(body.key);
      if (!passed && rows.length > 0) {
        if (o.refuseRows) failed.push({ part: 'rows', why: 'Not today.' });
        else {
          held.rows.push(...rows);
          if (body.key !== undefined) held.keys.push(body.key);
        }
      }
      return { ok: true, value: { done: { installed: [...held.parts] }, failed } };
    },
    packs: async () => ({ ok: true, value: [] }),
  };
  return { client: client as unknown as Parameters<typeof accept>[0], held, sent };
}

/** A podcast, which the New project guide forms a plan around, with Money kept beside it. */
const podcast = (): Accepting => {
  const sentence = 'I want to start a podcast';
  const proposal = propose(sentence, { zone: 'Europe/London', locale: 'en-GB' });
  return { sentence, proposal, usecase: 'guide', also: [], modules: ['money-core'], currency: null, today: '2026-10-13', email: null, nav: [], key: 'first-run-one-build' };
};

const titles = (rows: readonly SetupRow[]) => rows.map((r) => `${r.register}:${String(r.fields.what ?? r.fields.name ?? r.fields.title ?? '')}`).sort();

test('SOMETHING NOT MADE AND NO ENTRY LEFT: Try again asks for what is missing and sends no entry a second time', async () => {
  const o = { refuse: ['money-core'], missing: [] as string[], refuseRows: false };
  const { client, held, sent } = record(o);
  const asked = podcast();
  const first = await accept(client, asked);
  assert.equal(first.failed.length, 1);
  assert.deepEqual(first.left, []);
  const wrote = held.rows.length;
  assert.ok(wrote > 0, 'the plan formed from the sentence was not written');

  o.refuse = [];
  const second = await accept(client, pressAgain(asked, first));
  assert.deepEqual(second.failed, []);
  assert.deepEqual(held.parts, ['usecase-guide', 'money-core'], 'what was missing was not asked for again');
  assert.equal(sent.at(-1)?.again, true);
  assert.equal(sent.at(-1)?.rows, undefined, 'the plan was sent again though every entry of it is in');
  assert.equal(held.rows.length, wrote, 'Try again wrote the plan a second time');
});

test('THE PLAN\'S ENTRIES FOR A LIST THAT IS NOT THERE ARE HANDED BACK, and only those are sent again, each still pointing at its own', async () => {
  const o = { refuse: [] as string[], missing: ['steps'], refuseRows: false };
  const { client, held, sent } = record(o);
  const asked = podcast();
  const first = await accept(client, asked);
  const all = sent[0]?.rows ?? [];
  const owed = all.filter((r) => r.register === 'steps');
  assert.ok(owed.length > 0 && owed.length < all.length);
  assert.equal(held.rows.length, all.length - owed.length);

  o.missing = [];
  const second = await accept(client, pressAgain(asked, first));
  assert.deepEqual(second.failed, []);
  const again = sent.at(-1)?.rows ?? [];
  assert.deepEqual(titles(again), titles(owed), 'more than the entries still missing was sent again');
  assert.ok(again.every((r, at) => Object.values(r.links ?? {}).every((to) => to < at)), 'an entry points at one that is not before it');
  assert.deepEqual(titles(held.rows), titles(all), 'an entry is missing, or written twice');
});

test('EVERY ENTRY REFUSED: none is in, so Try again sends the whole plan', async () => {
  const o = { refuse: [] as string[], missing: [] as string[], refuseRows: true };
  const { client, held, sent } = record(o);
  const asked = podcast();
  const first = await accept(client, asked);
  assert.equal(held.rows.length, 0);

  o.refuseRows = false;
  const second = await accept(client, pressAgain(asked, first));
  assert.deepEqual(second.failed, []);
  assert.deepEqual(sent.at(-1)?.rows, sent[0]?.rows);
  assert.equal(held.rows.length, sent[0]?.rows?.length);
});

test('A PRESS NOBODY ANSWERED IS SENT AGAIN WHOLE under its own key, which is how the record passes it over', () => {
  const asked = podcast();
  const next = pressAgain(asked, null);
  assert.equal(next.key, asked.key);
  assert.equal(next.plan, undefined);
  const unheard = pressAgain(asked, { failed: [], left: asked.proposal.rows, nav: null, filed: false, unheard: true });
  assert.equal(unheard.key, asked.key);
  assert.equal(unheard.plan, undefined);
});
