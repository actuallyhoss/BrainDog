/* Probe A: a rule on a SERIES register (seq === null). runRules passes `null` as the spoken id,
   and the write path treats a null ref as a CREATE. */
import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from '../test/sqlite.ts';
const NOW = Date.UTC(2026, 8, 5, 12);
const READINGS: Declaration = { id: 'register.readings', kind: 'register', body: { id: 'readings', name: 'Readings', title: 'what', series: true, fields: [ { id: 'what', type: 'text' }, { id: 'level', type: 'int' }, { id: 'tags', type: 'list', of: 'text' } ] } as never };
const RULE: Declaration = { id: 'rule.hot', kind: 'rule', body: { rule: 'hot', register: 'readings', when: { field: 'level', gte: 10 }, then: [{ tag: 'hot' }] } as never };
const sql = openSqlite();
const k = await openRecord(sql, fixedClock(NOW));
await k.install([READINGS, RULE]);
const made = k.create('readings', { what: 'temp', level: 42 }, { actor: 'p_1' });
console.log('caller was handed:', JSON.stringify((made as any).value.fields));
console.log('rows now in `readings`:');
for (const r of sql.all<any>('SELECT id, seq, fields FROM entry ORDER BY rowid')) console.log('   ', r.id, 'seq=', r.seq, r.fields);
console.log('events:', sql.all<any>('SELECT actor, kind FROM event ORDER BY rowid').map((e:any)=>`${e.actor}/${e.kind}`).join(' | '));
sql.close();
