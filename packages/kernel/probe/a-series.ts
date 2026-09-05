/* Probe A: a rule firing on a SERIES register row (seq === null). */
import { openRecord, type Declaration, type Entry } from '../src/index.ts';
import { fixedClock, openSqlite } from '../test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const READINGS: Declaration = {
  id: 'register.readings',
  kind: 'register',
  body: {
    id: 'readings',
    name: 'Readings',
    title: 'what',
    series: true,
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'level', type: 'int' },
      { id: 'tags', type: 'list', of: 'text' },
    ],
  } as never,
};

const RULE: Declaration = {
  id: 'rule.hot',
  kind: 'rule',
  body: { rule: 'hot', register: 'readings', when: { field: 'level', gte: 10 }, then: [{ tag: 'hot' }] } as never,
};

const sql = openSqlite();
const k = await openRecord(sql, fixedClock(NOW));
const inst = await k.install([READINGS, RULE]);
console.log('install ok?', inst.ok, inst.ok ? '' : JSON.stringify((inst as any).refusal));

const made = k.create('readings', { what: 'temp', level: 42 }, { actor: 'p_1' });
console.log('create ok?', made.ok, made.ok ? JSON.stringify((made as any).value.fields) : JSON.stringify((made as any).refusal));

const rows = sql.all<{ id: string; seq: number | null; fields: string }>(
  'SELECT id, seq, fields FROM entry WHERE register = ? ORDER BY rowid', 'readings');
console.log('rows in readings:', rows.length);
for (const r of rows) console.log('  ', r.id, 'seq=', r.seq, r.fields);
console.log('events:', sql.all<{actor:string;kind:string}>('SELECT actor, kind FROM event ORDER BY rowid').map(e => `${e.actor}/${e.kind}`).join(', '));
sql.close();
