/**
 * `boot` carries what was new with each line's long words cut (scope 2026-10-24, boot under 30 KB): on his record six
 * notes' whole text were 26 KB of the 49 KB of news sent on every `boot`. `whatsNew` still says them whole. A line that
 * says a row was added carries no field of it at all: it is drawn as "Added" and the row's title.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { bootFilled, type Boot as ClientBoot } from '../../client/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const LONG = 'A long note about the kiln '.repeat(120);

type Line = { kind: string; field?: string | null; title?: string | null; to?: unknown };

test("BOOT'S NEWS CUTS A LINE'S LONG TEXT, and whatsNew says it whole", async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 24, 9)) });
  api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAV', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
  assert.ok((await installSeed(api.kernel)).ok);
  const made = (await api.create({ register: 'tasks', fields: { what: 'Fire the kiln', why: LONG } }, owner)) as { ok: boolean; value: { seq: number } };
  assert.ok(made.ok, JSON.stringify(made).slice(0, 300));
  const noted = (await api.update({ register: 'tasks', seq: made.value.seq, patch: { why: `${LONG} again`, state: 'doing' }, version: 1 } as never, owner)) as { ok: boolean };
  assert.ok(noted.ok, JSON.stringify(noted).slice(0, 300));

  const boot = (await api.boot(owner as never)) as { ok: boolean; value: { whatsNew: { events: Line[] } } };
  assert.ok(boot.ok);
  const edit = boot.value.whatsNew.events.find((e) => e.kind === 'edit' && e.field === 'why');
  assert.equal(typeof edit?.to, 'string', JSON.stringify(boot.value.whatsNew.events).slice(0, 400));
  const why = edit!.to as string;
  assert.ok(why.length <= 81, `boot carried ${why.length} characters of the note`);
  assert.ok(why.endsWith('…'));
  assert.ok(LONG.startsWith(why.slice(0, -1)));
  const added = boot.value.whatsNew.events.find((e) => e.kind === 'create');
  assert.equal('to' in added!, false, 'the added row went with its fields');
  /* ITS TITLE IS SAID ONCE, on the newest line about the row, and the client puts it back on each (`bootFilled`). */
  const filled = bootFilled(boot.value as unknown as ClientBoot).whatsNew!.events;
  assert.equal(filled.find((e) => e.kind === 'create')?.title, 'Fire the kiln');
  assert.equal(filled.find((e) => e.kind === 'create')?.to, null);

  const whole = (await api.whatsNew({} as never, owner)) as { ok: boolean; value: { events: Line[] } };
  assert.ok(whole.ok);
  assert.equal((whole.value.events.find((e) => e.kind === 'create')?.to as { why?: string } | undefined)?.why, LONG);
  assert.equal(whole.value.events.find((e) => e.kind === 'edit' && e.field === 'why')?.to, `${LONG} again`);
  sql.close();
});
