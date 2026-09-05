/* Probe D: the `once_per` marker is written BEFORE the rule's write is attempted, so a rule whose
   write the record refuses is marked as having fired and never fires again for that row. */
import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from '../test/sqlite.ts';
const NOW = Date.UTC(2026, 8, 5, 12);
const OBL: Declaration = { id: 'register.obligations', kind: 'register', body: { id: 'obligations', name: 'Obligations', title: 'what', state: 'state', fields: [
  { id: 'what', type: 'text', required: true },
  { id: 'chase', type: 'text' },
  { id: 'due', type: 'day', index: true },
  { id: 'state', type: 'enum', values: ['open', 'late', 'paid'], transitions: { open: { to: ['late','paid'] }, late: { to: ['paid'] }, paid: { to: [] } } },
] } as never };
const RULE: Declaration = { id: 'rule.deadline', kind: 'rule', body: {
  rule: 'deadline', register: 'obligations', when: { field: 'state', is: 'open' },
  once_per: ['entry'], then: [{ set: { field: 'due', to: '{{chase}}' } }],
} as never };
const sql = openSqlite();
const k = await openRecord(sql, fixedClock(NOW));
await k.install([OBL, RULE]);

// `chase` holds prose the day field cannot take: the rule's write is refused.
const made: any = k.create('obligations', { what: 'Invoice 41', chase: 'next week', state: 'open' }, { actor: 'p_1' });
console.log('1) create ok?', made.ok, 'due =', JSON.stringify(made.value.fields.due));
console.log('   rule markers now:', sql.all<any>("SELECT kind, key, state FROM schedule WHERE kind = 'rule'"));

// Somebody fixes the data. The rule should now be able to do its job.
const fixed: any = k.update('obligations', 'obligations#1', { chase: '2026-10-01' }, { actor: 'p_1' });
console.log('2) after fixing chase, due =', JSON.stringify(fixed.value.fields.due));
console.log('   dryRun says it still matches:', JSON.stringify((k.dryRun(JSON.parse(sql.one<any>("SELECT body FROM declaration WHERE id='rule.deadline'").body)) as any).value.sample));
sql.close();
