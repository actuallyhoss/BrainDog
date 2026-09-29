/**
 * A member invited to Jobs alone, filtering Jobs by a ref into Clients, learns nothing about Clients.
 *
 * `5fde092b` taught `list` to filter by a ref, and the kernel answered `ok 0` for a client that exists and
 * `REF_UNKNOWN` for one that does not, so a member who could not read Clients confirmed the hidden title *Harrow
 * Divorce Case* and counted the list by halving on `clients#N`. `723905b5` gave `kernel.list` a `reads` option; this
 * holds the record to passing it, because the kernel cannot know who asks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const CLIENTS = {
  id: 'register.clients',
  kind: 'register' as const,
  body: { id: 'clients', name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const JOBS = {
  id: 'register.jobs',
  kind: 'register' as const,
  body: {
    id: 'jobs',
    name: 'Jobs',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'client', type: 'ref', to: 'clients' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: { rows: unknown[] }; refusal?: { code: string } };

/** What a caller can tell from one answer: its refusal code, or how many rows came back. */
const said = (r: unknown): string => {
  const x = r as Out;
  return x.ok ? `ok ${x.value?.rows.length}` : String(x.refusal?.code);
};

test('A REF INTO A LIST SHE CANNOT READ ANSWERS ALIKE WHETHER THE ROW EXISTS OR NOT, and the owner is answered as before', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 8, 22, 12)) });
  assert.ok((await api.kernel.install([CLIENTS, JOBS])).ok);
  const harrow = (await api.create({ register: 'clients', fields: { name: 'Harrow Divorce Case' } } as never, owner)) as {
    ok: boolean;
    value?: { id: string };
  };
  assert.ok(harrow.ok);
  assert.ok((await api.create({ register: 'jobs', fields: { what: 'Draft the petition', client: harrow.value!.id } } as never, owner)).ok);

  assert.ok((await api.invite({ person: 'p_2', name: 'Wren', registers: { jobs: 'read' } } as never, owner)).ok);
  const held = api.kernel.access('p_2')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_2', level: held.level }, registers: held.registers ?? '*', levels: held.levels };

  const answers = new Set<string>();
  for (const is of ['Harrow Divorce Case', 'Nobody At All', 'clients#1', 'clients#9'])
    answers.add(said(await api.list({ register: 'jobs', where: { field: 'client', is } } as never, wren)));
  assert.equal(answers.size, 1, `her answers told the hidden rows apart: ${[...answers].join(', ')}`);

  assert.equal(said(await api.list({ register: 'jobs', where: { field: 'client', is: 'Harrow Divorce Case' } } as never, owner)), 'ok 1');
});
