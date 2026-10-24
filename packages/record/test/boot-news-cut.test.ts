/**
 * `boot` carries what was new with each line's long words cut (scope 2026-10-24, boot under 30 KB): on his record six
 * notes' whole text were 26 KB of the 49 KB of news sent on every `boot`. `whatsNew` still says them whole.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const LONG = 'A long note about the kiln '.repeat(120);

type Line = { kind: string; field?: string | null; to?: { name?: string; notes?: string } | null };

test("BOOT'S NEWS CUTS A LINE'S LONG TEXT, and whatsNew says it whole", async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 24, 9)) });
  api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAV', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
  const body = { id: 'things', name: 'Things', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'notes', type: 'text' }] };
  assert.ok((await api.kernel.install([{ id: 'register.things', kind: 'register', body: body as never }])).ok);
  assert.ok(((await api.create({ register: 'things', fields: { name: 'Lamp', notes: LONG } }, owner)) as { ok: boolean }).ok);

  const boot = (await api.boot(owner as never)) as { ok: boolean; value: { whatsNew: { events: Line[] } } };
  assert.ok(boot.ok);
  const notes = boot.value.whatsNew.events.find((e) => e.kind === 'create')?.to?.notes;
  assert.equal(typeof notes, 'string', JSON.stringify(boot.value.whatsNew.events).slice(0, 400));
  assert.ok(notes!.length <= 161, `boot carried ${notes!.length} characters of the note`);
  assert.ok(notes!.endsWith('…'));
  assert.ok(LONG.startsWith(notes!.slice(0, -1)));
  assert.equal(boot.value.whatsNew.events.find((e) => e.kind === 'create')?.to?.name, 'Lamp');

  const whole = (await api.whatsNew({} as never, owner)) as { ok: boolean; value: { events: Line[] } };
  assert.ok(whole.ok);
  assert.equal(whole.value.events.find((e) => e.kind === 'create')?.to?.notes, LONG);
  sql.close();
});
