/**
 * The record's check of its own words walks every page in one walk (`kernel.pageWalk`), so the work of a walk is the
 * pages' own and never a figure read again on each: the vital signs are read once for any number of pages that ask
 * them, and every page still says what it says alone. A record's walk took 11 to 16 s on the owner's record, holding
 * every other read behind it, because Health's figures read every sign once a note and each page read them again.
 *
 * THE WALK IS THE NIGHT'S (`keepTextFaults`) AND A READ OF THE WHOLE RECORD WALKS NOTHING: it is handed what was kept,
 * through a write, a page and an install alike.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Result } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { keepTextFaults, methods, type TextFaultsRead } from '../src/methods/text-faults.ts';
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
  return { sql, api, reads, read: methods(deps), night: () => keepTextFaults(deps) };
}

const value = (out: Result<TextFaultsRead>): TextFaultsRead => {
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};

test('ONE WALK READS THE SIGNS ONCE however many pages ask them, and every page still finds its own fault', async () => {
  for (const pages of [3, 24]) {
    const { sql, reads, read, night } = await record(pages);
    night();
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
  small.night();
  const big = await record(24);
  big.night();
  /* EACH PAGE'S OWN READS, and nothing another page already read: 8 statements a page here, where each page asked every
     figure and every declaration again at 142. The kernel's fixed reads (the lists, the declarations) are paid once. */
  const perPage = (big.reads.all - small.reads.all) / 21;
  assert.ok(perPage < 20, `each further page cost ${perPage.toFixed(1)} reads`);
  small.sql.close();
  big.sql.close();
});

test('A READ WALKS NOTHING: the kept answer comes back through a row, a page and an install, and the next night finds the new page', async () => {
  const { api, reads, read, night } = await record(6);
  const kept = night();
  assert.equal(kept.pages, 6);
  const first = value(await read.textFaults({}, owner));
  assert.deepEqual(first, kept);

  /* A FEW STATEMENTS, the kept answer and the private rows' check, and no page. */
  let before = reads.all;
  assert.deepEqual(value(await read.textFaults({}, owner)), first);
  assert.ok(reads.all - before <= 4, `a read cost ${reads.all - before} statements`);

  /* A ROW, AND AN INSTALL NOBODY IS NAMED FOR (it writes no event), DO NOT THROW THE KEPT ANSWER AWAY. */
  assert.ok(api.kernel.create('projects', { name: 'Kiln' } as never, { actor: 'p_1' }).ok);
  assert.ok((await api.kernel.install([page(7)])).ok);
  before = reads.all;
  assert.deepEqual(value(await read.textFaults({}, owner)), first);
  assert.ok(reads.all - before <= 4, `a read after the writes cost ${reads.all - before} statements`);

  /* AND THE NEXT NIGHT WALKS AGAIN, and finds it. */
  const next = night();
  assert.equal(next.faults.filter((f) => /projects\.cuont/u.test(f.said)).length, 7);
  assert.deepEqual(value(await read.textFaults({}, owner)), next);
});
