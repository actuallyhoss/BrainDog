/* Probe E: the `once_per` key is `rule:v1:v2...`, joined on ':' with no escaping, and a missing
   field contributes the empty string. Two different rows collapse onto one key. */
import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from '../test/sqlite.ts';
const NOW = Date.UTC(2026, 8, 5, 12);
const OBL: Declaration = { id: 'register.obligations', kind: 'register', body: { id: 'obligations', name: 'Obligations', title: 'what', state: 'state', fields: [
  { id: 'what', type: 'text', required: true },
  { id: 'party', type: 'text' },
  { id: 'ref', type: 'text' },
  { id: 'state', type: 'enum', values: ['open','late','paid'], transitions: { open: { to: ['late','paid'] }, late: { to: ['paid'] }, paid: { to: [] } } },
] } as never };
const RULE: Declaration = { id: 'rule.chase', kind: 'rule', body: {
  rule: 'chase', register: 'obligations', when: { field: 'state', is: 'open' },
  once_per: ['party', 'ref'], then: [{ notify: { say: 'chase {{what}}' } }],
} as never };
const sql = openSqlite();
const k = await openRecord(sql, fixedClock(NOW));
await k.install([OBL, RULE]);

console.log('--- (i) two rows whose (party, ref) differ but whose joined key collides ---');
k.create('obligations', { what: 'A', party: 'Acme', ref: 'INV:2026', state: 'open' }, { actor: 'p_1' });
k.create('obligations', { what: 'B', party: 'Acme:INV', ref: '2026', state: 'open' }, { actor: 'p_1' });
console.log('--- (ii) two rows that simply have no party and no ref ---');
k.create('obligations', { what: 'C', state: 'open' }, { actor: 'p_1' });
k.create('obligations', { what: 'D', state: 'open' }, { actor: 'p_1' });

console.log('markers:', sql.all<any>("SELECT key FROM schedule WHERE kind='rule'").map((r:any)=>JSON.stringify(r.key)).join('  '));
console.log('notifications actually written:', sql.all<any>("SELECT note FROM event WHERE kind='note' ORDER BY rowid").map((r:any)=>r.note));
sql.close();
