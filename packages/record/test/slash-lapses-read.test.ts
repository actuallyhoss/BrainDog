/**
 * The Slash page's read hands the day a suggestion waits until (offer-lapse-words-93): `waiting[].lapses` from the body
 * Slash filed, and nothing where the body names no day. It writes nothing: a day passing closes nothing here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { PROJECTS } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Reading = { waiting: { id: string; question: string; by: string | null; lapses?: string }[] };

test('A SUGGESTION SLASH FILED WITH A DAY SAYS IT ON THE READ, and one with none says nothing', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([{ id: 'register.projects', kind: 'register', body: { id: 'projects', name: 'Projects', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never }]));
  const arrange = (n: number, extra: Record<string, unknown>) => ({
    question: `Add ${PROJECTS[n]}?`,
    body_kind: 'arrange' as const,
    cause: `offer.lapses-${n}`,
    body: { why: ['It came up three times this week.'], rows: [{ register: 'projects', fields: { what: PROJECTS[n] } }], ...extra },
  });
  const dated = value<{ id: string }>(api.kernel.propose(arrange(0, { lapses: '2026-10-27' }), 'slash')).id;
  const undated = value<{ id: string }>(api.kernel.propose(arrange(1, {}), 'slash')).id;

  const seen = value<Reading>(await api.slash({}, owner));
  const by = new Map(seen.waiting.map((w) => [w.id, w]));
  assert.equal(by.get(dated)?.lapses, '2026-10-27');
  assert.ok(by.has(undated));
  assert.equal('lapses' in by.get(undated)!, false, 'no day is no key, never a guessed one');

  /* AND THE READ CLOSES NOTHING, even read on a day past the one it waits until. */
  const later = await createRecordApi({ sql, clock: fixedClock(NOW + 30 * 86_400_000) });
  assert.equal(value<Reading>(await later.slash({}, owner)).waiting.length, 2);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'")!.n, 2);
  sql.close();
});
