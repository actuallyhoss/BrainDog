/**
 * ONE REAL CHANGE, READ THREE WAYS THAT HAVE TO AGREE: the question the record asks (`askedOf`), the line the kernel
 * says under it (`doesOf`, read against what the entry holds), and the card Decide draws from the two (`cardOf`).
 * Nothing here is written by hand: an agent's change to an entry is filed by a real record, read back as Decide's
 * queue reads it, and handed to the card.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { QueueQuestion } from '@braindog/kernel';

import { cardOf, saysChanges } from './card.ts';

/* LOADED BY A RUNTIME URL so the web's typecheck does not walk the record's sources, which other packages own. */
const at = (p: string) => new URL(`../../../../../packages/${p}`, import.meta.url).href;
const { createRecordApi } = await import(at('record/src/index.ts'));
const { openSqlite } = await import(at('kernel/test/sqlite.ts'));

const NOW = Date.UTC(2026, 9, 13, 9);
const owner = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const agent = {
  principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'c1', client: 'claude-code', host: 'mac', repo: 'studio' },
};
const ok = <T>(r: { ok: boolean; value?: T; refusal?: { code: string; fix: string } }): T => {
  assert.ok(r.ok, `${r.refusal?.code}: ${r.refusal?.fix}`);
  return r.value as T;
};

const MAKERS = { id: 'register.makers', kind: 'register', body: { id: 'makers', name: 'Makers', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } };
const PROJECTS = {
  id: 'register.projects',
  kind: 'register',
  body: {
    id: 'projects',
    name: 'Projects',
    title: 'name',
    state: 'stage',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'stage', label: 'Stage', type: 'enum', values: ['building', 'live'], labels: { building: 'Building', live: 'Live' }, default: 'building' },
      { id: 'due', label: 'Due on', type: 'day' },
      { id: 'cost', label: 'Cost', type: 'money' },
      { id: 'lead', label: 'Led by', type: 'ref', to: 'makers' },
      { id: 'notes', label: 'Notes', type: 'text' },
    ],
  },
};

type Made = { id: string; seq: number };
type Asked = { asked: { id: string; question: string } };

/** Two projects, and an agent's change to each: money is on the floor, so each is filed as a question. */
async function asked() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => NOW } });
  ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  ok(await api.kernel.install([MAKERS, PROJECTS]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  const nour = ok<Made>(await api.create({ register: 'makers', fields: { name: 'Nour' } }, owner));
  const sam = ok<Made>(await api.create({ register: 'makers', fields: { name: 'Sam' } }, owner));
  const kiln = ok<Made>(await api.create({ register: 'projects', fields: { name: 'Kiln', due: '2026-10-20', lead: nour.id } }, owner));
  const portage = ok<Made>(await api.create({ register: 'projects', fields: { name: 'Portage' } }, owner));
  const first = ok<Asked>(await api.update({ register: 'projects', seq: kiln.seq, patch: { cost: { amount: 125_000, currency: 'GBP' }, stage: 'live', due: '2026-11-03', lead: sam.id } }, agent));
  const second = ok<Asked>(await api.update({ register: 'projects', seq: portage.seq, patch: { cost: { amount: 900, currency: 'EUR' }, notes: 'Read docs/plan.md first.' } }, agent));
  /* AS DECIDE READS IT: a queue that leads with its first question. */
  const queue = (api.kernel.block({ kind: 'queue', source: 'governance.open', lead: true }).queue ?? []) as QueueQuestion[];
  return { sql, first, second, queue, ids: [nour.id, sam.id, kiln.id, portage.id] };
}

test('THE QUESTION, THE RECORD’S LINE AND THE CARD SAY THE SAME CHANGE, in the same order and the same names', async () => {
  const { sql, first, queue, ids } = await asked();
  const q = queue[0]!;
  assert.equal(q.id, first.asked.id);

  /* THE RECORD'S TITLE names what changes, by label, in the order sent. */
  assert.equal(first.asked.question, 'Change the cost, stage and 2 more of Kiln?');
  assert.equal(q.question, first.asked.question);

  /* THE KERNEL'S LINE says each change against what the entry holds: a choice by its label, a day as a day, and the
     fourth field by its name alone. It never says the entry, which the question above it already names. */
  assert.equal(q.does, 'Sets Cost to GBP 1,250.00, changes Stage from Building to Live, changes Due on from 20 October 2026 to 3 November 2026, changes Led by in Projects.');
  assert.doesNotMatch(q.does ?? '', /Kiln/u);

  /* THE CARD says both as they are, money in the reader's form. */
  const card = cardOf(q, { now: NOW, lead: true });
  assert.equal(card.question, 'Change the cost, stage and 2 more of Kiln?');
  assert.equal(card.does, 'Sets Cost to £1,250, changes Stage from Building to Live, changes Due on from 20 October 2026 to 3 November 2026, changes Led by in Projects.');
  assert.equal(card.money, 'Moves £1,250');

  /* THE THREE AGREE. Every field the card draws from and to is one the line names, in the line's order, and the
     first two are the two the question names. */
  const drawn = card.lines.map((l) => l.what);
  assert.deepEqual(drawn, ['Cost', 'Stage', 'Due on']);
  const where = drawn.map((what) => card.does.indexOf(what));
  assert.ok(where.every((i) => i >= 0), 'a field on the card that the line does not name');
  assert.deepEqual(where, [...where].sort((a, b) => a - b));
  assert.match(card.question, new RegExp(`the ${drawn[0]!.toLowerCase()}, ${drawn[1]!.toLowerCase()} and 2 more of`, 'u'));
  /* The same values, where both say one: the money and the choice. */
  assert.deepEqual([card.lines[0]?.after, card.lines[1]?.before, card.lines[1]?.after], ['£1,250', 'Building', 'Live']);
  for (const said of [card.lines[0]!.after, card.lines[1]!.before, card.lines[1]!.after]) assert.ok(card.does.includes(said), said);

  /* AND NONE OF THEM SAYS AN ID: the link's old and new holder are ids in the patch. */
  for (const text of [card.question, card.does, JSON.stringify(card.lines)]) {
    assert.doesNotMatch(text, /[0-9A-HJKMNP-TV-Z]{26}|#\d/u);
    for (const id of ids) assert.ok(!text.includes(id));
  }
  sql.close();
});

test('A CHANGE BELOW THE LEAD IS HANDED ITS LINE, and the line says the change the card cannot draw', async () => {
  const { sql, second, queue } = await asked();
  const q = queue[1]!;
  assert.equal(q.id, second.asked.id);
  assert.equal(q.question, 'Change the cost and notes of Portage?');
  assert.equal(q.does, 'Sets Cost to EUR 9.00, changes Notes in Projects.');

  const card = cardOf(q, { now: NOW });
  assert.equal(card.does, 'Sets Cost to €9, changes Notes in Projects.');
  /* The note names a file, so the card draws no line of it; the record's line is where it is said, by its field. */
  assert.deepEqual(
    card.lines.map((l) => l.what),
    ['Cost'],
  );
  assert.match(card.does, /Notes/u);
  assert.doesNotMatch(`${card.does} ${JSON.stringify(card.lines)}`, /docs\/plan/u);
  assert.equal(saysChanges(card), true);
  sql.close();
});
