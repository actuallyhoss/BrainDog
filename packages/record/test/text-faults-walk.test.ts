/**
 * The record's check of its own words walks every page in one walk (`kernel.pageWalk`), so the work of a call is the
 * pages' own and never a figure read again on each: the vital signs are read once for any number of pages that ask
 * them, and every page still says what it says alone. A record's walk took 11 to 16 s on the owner's record, holding
 * every other read behind it, because Health's figures read every sign once a note and each page read them again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Result } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, type TextFaultsRead } from '../src/methods/text-faults.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 3);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const decl = (kind: string, id: string, body: unknown) => ({ id: `${kind}.${id}`, kind, body }) as never;

/** A page a person wrote that asks the vital signs twice and holds one typo, as Health's own notes ask them. */
const page = (n: number) =>
  decl('page', `desk-${n}`, {
    page: `desk-${n}`,
    title: `Desk ${n}`,
    requires: ['register.projects'],
    blocks: [
      { kind: 'note', heading: 'How it is', body: 'Signs red now: {{signs-red}}, and {{signs-unread}} not read yet.' },
      { kind: 'note', heading: 'Gated', when: { metric: 'signs-red', gte: 0 }, body: 'Shown while the signs say so.' },
      { kind: 'note', heading: 'Lead', body: `We hold {{projects.cuont}} projects on desk ${n}.` },
    ],
  });

async function record(pages: number) {
  const sql = openSqlite();
  /* EVERY READ OF THE SIGNS, counted by the one statement `readSigns` opens with. */
  const reads = { signs: 0, all: 0 };
  const counted = {
    ...sql,
    all: <T>(text: string, ...params: never[]): T[] => {
      reads.all += 1;
      if (/FROM sign_reading WHERE day >= \? AND day < \?/u.test(text)) reads.signs += 1;
      return sql.all<T>(text, ...params);
    },
    one: <T>(text: string, ...params: never[]): T | undefined => {
      reads.all += 1;
      return sql.one<T>(text, ...params);
    },
  } as typeof sql;
  const api = await createRecordApi({ sql: counted, clock: fixedClock(NOW) });
  const put = await api.kernel.install([
    decl('register', 'projects', { id: 'projects', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }),
    ...Array.from({ length: pages }, (_, i) => page(i + 1)),
  ]);
  assert.ok(put.ok, JSON.stringify(put));
  const deps = {
    kernel: api.kernel,
    sql: counted,
    scoped: () => null,
    readable: () => null,
    no,
    clock: fixedClock(NOW),
  } as unknown as RecordDeps;
  return { sql, api, reads, read: methods(deps) };
}

const value = (out: Result<TextFaultsRead>): TextFaultsRead => {
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};

test('ONE WALK READS THE SIGNS ONCE however many pages ask them, and every page still finds its own fault', async () => {
  for (const pages of [3, 24]) {
    const { sql, reads, read } = await record(pages);
    const got = value(await read.textFaults({}, owner));
    /* EVERY PAGE'S TYPO, each named by its page, as a page read alone names it. */
    const typos = got.faults.filter((f) => f.kind === 'names-nothing' && /projects\.cuont/u.test(f.said));
    assert.equal(typos.length, pages, JSON.stringify(got.faults));
    assert.deepEqual(new Set(typos.map((f) => f.where.page)), new Set(Array.from({ length: pages }, (_, i) => `Desk ${i + 1}`)));
    /* THE SIGNS ARE READ ONCE FOR THE WHOLE WALK: three figures a page asked them, 3 x 24 reads before. */
    assert.equal(reads.signs, 1, `${pages} pages read the signs ${reads.signs} times`);
    sql.close();
  }
});

test('THE WORK OF A WALK IS THE PAGES\' OWN: a page more is a few statements more, never every figure again', async () => {
  const small = await record(3);
  value(await small.read.textFaults({}, owner));
  const big = await record(24);
  value(await big.read.textFaults({}, owner));
  /* EACH PAGE'S OWN READS, and nothing another page already read: 8 statements a page here, where each page asked every
     figure and every declaration again at 142. The kernel's fixed reads (the lists, the declarations) are paid once. */
  const perPage = (big.reads.all - small.reads.all) / 21;
  assert.ok(perPage < 20, `each further page cost ${perPage.toFixed(1)} reads`);
  small.sql.close();
  big.sql.close();
});

test('THE SAME ASK AT THE SAME VERSION WALKS NOTHING; a row, a page or another caller walks again', async () => {
  const { api, reads, read } = await record(6);
  const first = value(await read.textFaults({}, owner));
  let before = reads.all;
  assert.deepEqual(value(await read.textFaults({}, owner)), first);
  /* TWO STATEMENTS, the version and the declarations' stamp, and no page. */
  assert.equal(reads.all - before, 2);

  before = reads.all;
  assert.ok(api.kernel.create('projects', { name: 'Kiln' } as never, { actor: 'p_1' }).ok);
  value(await read.textFaults({}, owner));
  assert.ok(reads.all - before > 1, 'a row moved the version, and the walk ran again');

  before = reads.all;
  assert.ok((await api.kernel.install([page(7)])).ok);
  const more = value(await read.textFaults({}, owner));
  assert.ok(reads.all - before > 1, 'an install nobody is named for writes no event, and still walks again');
  assert.equal(more.faults.filter((f) => /projects\.cuont/u.test(f.said)).length, 7);

  before = reads.all;
  value(await read.textFaults({}, { principal: { kind: 'person', id: 'p_2', level: 'owner' } }));
  assert.ok(reads.all - before > 1, 'another caller is never handed the first one\'s answer');
});
