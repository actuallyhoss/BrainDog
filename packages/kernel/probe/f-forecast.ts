/* Probes F/G/H: forecast.occurrences and runway. */
import { openRecord, type Declaration, type Leg, type Runway } from '../src/index.ts';
import { fixedClock, openSqlite } from '../test/sqlite.ts';
const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;
const day = (o: number) => new Date(NOW + o * DAY).toISOString().slice(0, 10);
const SERVICES: Declaration = { id: 'register.services', kind: 'register', body: { id: 'services', name: 'Services', title: 'name', fields: [
  { id: 'name', type: 'text', required: true },
  { id: 'cost', type: 'money' },
  { id: 'cycle', type: 'enum', values: ['fortnightly','monthly','yearly'] },
  { id: 'renews', type: 'day', index: true },
  { id: 'renews_at', type: 'instant', index: true },
  { id: 'state', type: 'enum', values: ['live','cancelled'], index: true },
] } as never };
const sql = openSqlite();
const k = await openRecord(sql, fixedClock(NOW));
await k.install([SERVICES]);

console.log('=== F: a cycle whose months table entry is fractional (a fortnightly charge, 0.5m) ===');
k.create('services', { name: 'Rota', cost: { amount: 10_000, currency: 'GBP' }, cycle: 'fortnightly', renews: day(1), state: 'live' }, { actor: 'p_1' });
const legF: Leg = { register: 'services', on: 'renews', amount: 'cost', where: 'state is not cancelled', every: { field: 'cycle', months: { fortnightly: 0.5, monthly: 1, yearly: 12 } } };
const rF = k.runway(100_000, [legF], 120) as any;
console.log('steps:', rF.value.steps.map((s: any) => `${s.day} ${s.delta} bal=${s.balance}`).join('\n       '));
console.log('total charged over 120 days:', rF.value.steps.reduce((a: number, s: any) => a + s.delta, 0), '(a fortnightly £100 over ~120 days should be about -800)');

console.log('\n=== G: a leg whose `on` field holds an INSTANT rather than a day ===');
const sql2 = openSqlite();
const k2 = await openRecord(sql2, fixedClock(NOW));
await k2.install([SERVICES]);
k2.create('services', { name: 'Kiln', cost: { amount: 50_000, currency: 'GBP' }, renews_at: new Date(NOW + 5 * DAY).toISOString(), state: 'live' }, { actor: 'p_1' });
console.log('the row:', sql2.one<any>('SELECT fields FROM entry').fields);
const rG = k2.runway(10_000, [{ register: 'services', on: 'renews_at', amount: 'cost', where: 'state is not cancelled' }], 120) as any;
console.log('ok?', rG.ok, 'steps:', JSON.stringify(rG.value.steps), 'crossed:', rG.value.crossed, 'refusals:', JSON.stringify(rG.value.refusals));

console.log('\n=== H: two legs reading the same register ===');
const rH = k2.runway(10_000, [
  { register: 'services', on: 'renews_at', amount: 'cost' },
  { register: 'services', on: 'renews_at', amount: 'cost' },
], 120) as any;
console.log('steps:', JSON.stringify(rH.value.steps.length));
sql.close(); sql2.close();
