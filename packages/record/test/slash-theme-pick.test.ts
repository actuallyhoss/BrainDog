/**
 * A THEME IS PICKED, NEVER DESIGNED (`src/slash.ts` `lookDraft`, `lookLanding`).
 *
 * What was true before: `BUILDS` left a theme out, so the looks an add-on carried were never offered, and a model's look
 * was a settings body `prepare` filed as it was, picking anything. These pin the pick: only a look `looksOf` answers for
 * this record is offered, in its name and one press; one naming no installed look is dropped; nothing is offered while
 * Slash is braked or young; and his yes sets his own `look.theme`, checked by `lookThemeFault` again. Every name is
 * invented (`fixtures/names.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fromModel, lookDraft, lookLanding, readUsage, stableKey, type ModelReading } from '../src/slash.ts';
import { looksOf, type ThemeRow } from '../src/theme-pick.ts';
import { brakeOf, mayPropose, type MayPropose } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { PROJECTS } from '../../../fixtures/names.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);
const COPPER = PROJECTS[1];

const row = (id: string, pack_id: string | null, body: Record<string, unknown> = {}): ThemeRow => ({ id, pack_id, body: JSON.stringify(body), checksum: `sum-${id}` });
/** An add-on's look named in its own body, and one whose add-on gives it its name. */
const LOOKS = looksOf([row('theme.copperleaf', 'copperleaf', { name: COPPER }), row('theme.oxbow', 'oxbow-night')]);
const IDS = LOOKS.map((l) => l.id);

const pick = (look: unknown, extra: Record<string, unknown> = {}) => ({ drafts: [{ question: 'Try a calmer look?', body_kind: 'settings', body: { look, ...extra } }] });

/** A record `age` days old; with `used`, its owner wrote on five days of the first twelve, so Slash may advise it. */
async function record(age: number, used = true) {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const api = await createRecordApi({ sql, clock });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'kiln-books', name: 'Kiln Books', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  assert.ok((await api.kernel.install([{ id: 'register.tasks', kind: 'register', body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never }])).ok);
  for (const day of used ? [0, 3, 6, 9, 12] : [0]) {
    clock.set(T0 + Math.min(day, age) * DAY);
    assert.ok((await api.create({ register: 'tasks', fields: { what: `${PROJECTS[0]} batch ${day}` } }, OWNER)).ok);
  }
  const now = T0 + age * DAY;
  clock.set(now);
  const reading: ModelReading = { usage: readUsage(sql, api.kernel, now), looks: LOOKS, may: mayPropose(sql, now) };
  return { sql, api, reading };
}

test('AN INSTALLED LOOK IS OFFERED IN ITS NAME AND ONE PRESS, as the settings draft Slash files', async () => {
  const { sql, reading } = await record(20);
  assert.deepEqual(reading.may, { may: true });
  const out = fromModel(pick({ theme: 'theme.copperleaf' }), 'test model', 3, undefined, false, reading);
  assert.deepEqual(out.dropped, []);
  const [draft] = out.drafts;
  assert.equal(draft?.question, `Try the ${COPPER} look you installed? It changes how BrainDog looks for you, and Settings, Appearance changes it back.`);
  assert.deepEqual(draft?.body, { look: { theme: 'theme.copperleaf' } });
  assert.equal(draft?.body_kind, 'settings');
  assert.equal(draft?.key, 'look:theme.copperleaf');
  /* NAMES, NEVER IDS: the question never spells the theme's id, and a look an add-on names is said in words. */
  assert.doesNotMatch(draft?.question ?? '', /theme\./u);
  assert.equal(fromModel(pick('theme.oxbow'), 'test model', 3, undefined, false, reading).drafts[0]?.question.startsWith('Try the Oxbow night look you installed?'), true);

  /* WHAT SLASH FILES IS THIS DRAFT, through `slashFiling` (`prepare` passes a body naming no pack as it is). The kernel's
     settings shape takes a look pick once `govern.ts` `checkArranging` does (this job's blocked line), so the press is
     not driven here: `api.propose` asks the same shape of it. */
  sql.close();
});

test('HIS YES SETS HIS OWN look.theme, held again to what is installed now; any other settings answer is not a look', () => {
  assert.deepEqual(lookLanding({ look: { theme: 'theme.copperleaf' } }, IDS), { ok: true, value: { key: 'look.theme', value: 'theme.copperleaf' } });
  const gone = lookLanding({ look: { theme: 'theme.copperleaf' } }, ['theme.oxbow']);
  assert.equal(gone?.ok, false);
  assert.ok(gone && !gone.ok && 'refusal' in gone);
  assert.equal(gone.refusal.code, 'VALUE_MALFORMED');
  assert.doesNotMatch(gone.refusal.fix, /theme\./u);
  /* THE HOUSE LOOK IS NOT SLASH'S TO PICK either: `lookThemeFault` takes it from a person, never from a draft. */
  assert.equal(lookLanding({ look: { theme: 'house' } }, IDS)?.ok, false);
  assert.equal(lookLanding({ pack: 'usecase-team', values: { voice_home: 'Hello' } }, IDS), null);
  assert.equal(stableKey({ look: { theme: 'theme.oxbow' } }), 'look:theme.oxbow');
});

test('A PICK NAMING NO INSTALLED LOOK IS DROPPED, and so is the house look, a look mixed with other changes, and any look on a record with none', async () => {
  const { sql, reading } = await record(20);
  const gone = fromModel(pick({ theme: 'theme.harbour-new' }), 'test model', 3, undefined, false, reading);
  assert.deepEqual(gone.drafts, []);
  assert.deepEqual(gone.dropped, [`Proposal 1 picked a look that is not installed here. Slash offers only one you installed: ${COPPER}, Oxbow night.`]);
  assert.deepEqual(fromModel(pick('house'), 'test model', 3, undefined, false, reading).drafts, []);
  /* A NEW THEME DESIGNED IN THE BODY is not a pick: there is no id to pick, so nothing is offered. */
  assert.deepEqual(fromModel(pick({ seed: { accent: '#CF413A' } }), 'test model', 3, undefined, false, reading).drafts, []);
  const mixed = fromModel(pick({ theme: 'theme.copperleaf' }, { pack: 'usecase-team', values: { voice_home: 'Hi' } }), 'test model', 3, undefined, false, reading);
  assert.deepEqual(mixed.dropped, ['Proposal 1 picked a look and changed something else with it, and a look is asked on its own.']);
  const none = lookDraft({ look: { theme: 'theme.copperleaf' } }, 1, 'test model', { ...reading, looks: [] });
  assert.ok('why' in none && /none is installed here/u.test(none.why));
  sql.close();
});

test('NOTHING IS OFFERED WHILE SLASH IS YOUNG OR BRAKED, nor when the reading was not handed over', async () => {
  /* YOUNG: a record started today, by the kernel's own governor and by the reading's age. */
  const young = await record(1, false);
  assert.equal(young.reading.may?.may, false);
  const held = fromModel(pick({ theme: 'theme.copperleaf' }), 'test model', 3, undefined, false, young.reading);
  assert.deepEqual(held.drafts, []);
  assert.match(held.dropped[0] ?? '', /^Proposal 1, a look to try, waits\. Slash waits/u);
  /* AND THE AGE ALONE HOLDS IT, where no governor's answer was handed over. */
  const { may: _governor, ...ageOnly } = young.reading;
  assert.deepEqual(fromModel(pick({ theme: 'theme.copperleaf' }), 'test model', 3, undefined, false, ageOnly).drafts, []);
  young.sql.close();

  /* BRAKED: he turned down the last twenty, so the brake is on and its sentence is the one said. */
  const brake = brakeOf(Array.from({ length: 20 }, () => false));
  assert.equal(brake.on, true);
  const braked: MayPropose = { may: false, why: 'You turned down 20 of the last 20, so Slash waits.', share: brake.share, of: brake.of };
  const aged = await record(20);
  const out = fromModel(pick({ theme: 'theme.copperleaf' }), 'test model', 3, undefined, false, { ...aged.reading, may: braked });
  assert.deepEqual(out.drafts, []);
  assert.deepEqual(out.dropped, ['Proposal 1, a look to try, waits. You turned down 20 of the last 20, so Slash waits.']);
  aged.sql.close();

  /* NO READING: the record's age is unknown, so nothing is offered. */
  assert.deepEqual(fromModel(pick({ theme: 'theme.copperleaf' }), 'test model').drafts, []);
});
