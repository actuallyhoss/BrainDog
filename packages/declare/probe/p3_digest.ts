import { createRecordApi } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const clock = fixedClock(NOW);
const sql = openSqlite();
const api = await createRecordApi({ sql, clock });

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [{ id: 'what', type: 'text', required: true }],
  } as never,
};

/* TWO sections, and neither carries a row:
   - `Owed` names a metric the record does not have, so `sectionsOf` keeps it WITH A REFUSAL in it.
   - `Quiet` is a register section with no rows and no `omit_when_empty`, so it is kept EMPTY. */
const DIGEST = {
  id: 'digest.monday',
  kind: 'digest' as const,
  body: {
    digest: 'monday',
    name: 'Monday',
    schedule: { at: '09:00' },
    channels: ['in-app'],
    sections: [
      { heading: 'Owed', source: 'metric.nope' },
      { heading: 'Quiet', source: 'register.obligations' },
    ],
  } as never,
};

console.log('install:', (await api.kernel.install([OBLIGATIONS, DIGEST])).ok);

const owner = { principal: { kind: 'person' as const, id: 'p_1', level: 'owner' as const } };
const today = await api.digestToday({}, owner);
if (!today.ok) throw new Error(JSON.stringify(today.refusal));
const screen = today.value[0]!;

console.log('\n--- digestToday: the "today" screen ---');
console.log('sections :', screen.sections.map((s: any) => `${s.heading}[rows=${s.rows.length} refusals=${s.refusals.length}]`).join(' '));
console.log('carrying :', screen.carrying);
console.log('headline :', JSON.stringify(screen.headline));

/* The SCHEDULED one, through the real drain -> HANDLERS.digest -> runDigest. */
sql.exec(
  "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'digest', 'monday', ?, 'pending', 0)",
  new Date(NOW).toISOString(),
  JSON.stringify({ declaration: 'digest.monday' }),
);
clock.set(NOW + 1000);
console.log('\ndrain    :', JSON.stringify(await api.kernel.drain()));

const notes = sql.all<{ note: string }>("SELECT note FROM event WHERE actor LIKE 'digest:%' ORDER BY rowid");
console.log('\n--- runDigest: what the scheduled digest actually did ---');
console.log('sent     :', notes.length ? 'YES, one in-app note' : 'NO, skipped');
console.log('headline :', notes.length ? JSON.stringify(notes[0]!.note) : '(none)');

console.log('\n=== VERDICT ===');
console.log(`digestToday.carrying = ${screen.carrying}  -> the screen says the digest is carrying nothing`);
console.log(`runDigest sent       = ${notes.length}  -> the scheduled digest went out anyway`);
console.log(`headlines agree      = ${notes.length ? notes[0]!.note === screen.headline : 'n/a'}`);
if (notes.length) {
  console.log(`  scheduled: ${JSON.stringify(notes[0]!.note)}`);
  console.log(`  screen   : ${JSON.stringify(screen.headline)}`);
}
sql.close();
