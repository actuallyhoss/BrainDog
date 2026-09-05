/* Probe I: forecast.runway hard-LIMITs each leg to 2000 rows with no refusal and no flag. */
import { openRecord, type Declaration, type Leg } from '../src/index.ts';
import { fixedClock, openSqlite } from '../test/sqlite.ts';
const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;
const OBL: Declaration = { id: 'register.obligations', kind: 'register', body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [
  { id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money' }, { id: 'due', type: 'day', index: true },
  { id: 'state', type: 'enum', values: ['open','paid'], index: true },
] } as never };
const sql = openSqlite();
const k = await openRecord(sql, fixedClock(NOW));
await k.install([OBL]);
const N = 2500;
sql.transactionSync(() => {
  for (let i = 0; i < N; i++)
    sql.exec('INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)',
      `e_${String(i).padStart(5, '0')}`, 'obligations', i + 1,
      JSON.stringify({ what: `bill ${i}`, amount: { amount: 1000, currency: 'GBP' }, due: new Date(NOW + ((i % 100) + 1) * DAY).toISOString().slice(0,10), state: 'open' }),
      'open', new Date(NOW).toISOString(), new Date(NOW).toISOString());
});
console.log('live rows:', sql.one<any>("SELECT count(*) AS n FROM entry WHERE register='obligations'").n);
const leg: Leg = { register: 'obligations', on: 'due', amount: 'amount', where: 'state is open' };
const r = k.runway(1_000_000, [leg], 180) as any;
console.log('steps counted:', r.value.steps.length, '(should be', N, ')');
console.log('total outgoing seen:', r.value.steps.reduce((a: number, s: any) => a + s.delta, 0), '(should be', -1000 * N, ')');
console.log('crossed:', r.value.crossed && `${r.value.crossed.day} bal=${r.value.crossed.balance}`, ' days:', r.value.days);
console.log('refusals:', JSON.stringify(r.value.refusals));
sql.close();
