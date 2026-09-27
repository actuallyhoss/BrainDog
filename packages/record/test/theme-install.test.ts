/**
 * A pack's theme is checked where it comes in, and every door answers it the same way (`src/theme-check.ts`).
 *
 * WHAT WAS TRUE BEFORE IT: a pack whose theme set `faint` on the ground planned `ok` and installed `ok`, and so did a
 * seed `@braindog/theme` refuses, because nothing on the install path called the palette checks
 * (`loop/research-hardening.md` §2.4). The three fixtures whose codes those checks construct were skipped by name in
 * `refusals-install.test.ts` for that reason.
 *
 * SO THE THREE FIXTURES ARE DRIVEN HERE THROUGH ALL THREE DOORS a person or an agent reaches a theme by: `planPack`,
 * `installPack` and `setDeclaration`. The refusal is compared whole across the three, because "the same palette in the
 * same words" is the claim, and a door that answered the right code in other words would be a second opinion.
 *
 * AND THE VERDICT AGREES WITH `recordTheme`, which is the same package's answer for a record's own colour: a seed it
 * refuses is refused at the plan with one of its codes, and one it accepts installs. The suggested accents (`ACCENTS`)
 * are the ones a person is offered, so they are the ones that must go in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ACCENTS, recordTheme } from '@braindog/theme';

import { family } from '../../../fixtures/corpus.ts';
import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Refusal = { code: string; at?: string; fix: string };
type Answer = { ok: true; value?: unknown } | { ok: false; refusal: Refusal } | { ok: false; conflict: unknown };
type Planned = { ok: true; value: { diff: { planHash: string; approve: string[] } } };

const THEMED = ['contrast-floor.yaml', 'intent-inseparable.yaml', 'theme-ladder-order.yaml'];

/** A pack holding one theme, in the shape `normalise` reads. */
const packWith = (theme: Record<string, unknown>) => ({
  pack: 'look',
  version: '1.0.0',
  summary: 'One theme.',
  author: 'BrainDog tests',
  license: 'MIT',
  declarations: [theme],
});

async function onRecord<T>(fn: (api: Awaited<ReturnType<typeof createRecordApi>>) => Promise<T>): Promise<T> {
  const sql = openSqlite();
  try {
    return await fn(await createRecordApi({ sql, clock: fixedClock(NOW) }));
  } finally {
    sql.close();
  }
}

const refusalOf = (answer: Answer, where: string): Refusal => {
  assert.equal(answer.ok, false, `${where} was accepted`);
  assert.ok('refusal' in answer, `${where} answered with a conflict where a refusal was named`);
  return answer.refusal;
};

for (const name of THEMED) {
  test(`${name} is refused at plan, at install and from the app, in the same words`, async () => {
    const fixture = family('install').find((f) => f.name === name);
    assert.ok(fixture, `${name} is not an install fixture`);
    const doc = JSON.parse(fixture.keys.get('pack') ?? 'null') as { declarations: Record<string, unknown>[] };
    assert.ok(doc, `${name} carries no \`pack:\``);

    await onRecord(async (api) => {
      const planned = refusalOf((await api.planPack({ doc }, owner)) as Answer, `${name} at the plan`);
      assert.equal(planned.code, fixture.keys.get('code'), `${name} was refused ${planned.code}: ${planned.fix}`);
      assert.equal(planned.at, fixture.keys.get('at'), `${name} claims \`at: ${fixture.keys.get('at')}\``);
      assert.ok(/[.?!]$/.test(planned.fix.trim()), `${name} was refused with "${planned.fix}", which is not a sentence`);

      /* A PLAN HASH NOBODY READ, because the palette is refused before any plan is compared: the install reads the
         document through the same check before it asks whether the plan is current. */
      const installed = refusalOf((await api.installPack({ doc, planHash: 'unplanned' }, owner)) as Answer, `${name} at the install`);
      assert.deepEqual(installed, planned, `${name} was refused in other words at the install`);

      const app = refusalOf((await api.setDeclaration({ body: doc.declarations[0] }, owner)) as Answer, `${name} from the app`);
      assert.deepEqual(app, planned, `${name} was refused in other words from the app`);
    });
  });
}

test('A SEED THE HOUSE PROFILE REFUSES IS REFUSED AT THE PLAN, AND THE SUGGESTED ACCENTS ARE NOT', async () => {
  /* THE ONE REFUSED SEED IS PINNED, so this cannot pass by every seed being accepted: `loop/research-hardening.md`
     §2.4 measured `recordTheme` refusing it with CONTRAST_FLOOR. */
  const refusedSeed = '#1A1A6E';
  assert.equal(recordTheme(refusedSeed, { neutralHue: 110 }).ok, false, `${refusedSeed} is no longer refused by recordTheme`);

  for (const accent of [refusedSeed, ...ACCENTS.map((a) => a.hex)]) {
    const verdict = recordTheme(accent, { neutralHue: 110 });
    const doc = packWith({ theme: 'look', seed: { accent, neutral_hue: 110 } });
    await onRecord(async (api) => {
      const planned = (await api.planPack({ doc }, owner)) as Answer;
      if (!verdict.ok) {
        const refusal = refusalOf(planned, `${accent} at the plan`);
        assert.ok(verdict.codes.includes(refusal.code), `${accent} was refused ${refusal.code}, and recordTheme says ${verdict.codes.join(', ')}`);
        return;
      }
      assert.ok(planned.ok, `${accent} clears recordTheme and was refused at the plan: ${JSON.stringify(planned)}`);
      const { planHash, approve } = (planned as Planned).value.diff;
      const installed = (await api.installPack({ doc, planHash, approve }, owner)) as Answer;
      assert.ok(installed.ok, `${accent} clears recordTheme and was refused at the install: ${JSON.stringify(installed)}`);
    });
  }
});

test('A ROLE THE PALETTE DOES NOT HAVE IS REFUSED, rather than installed to paint nothing', async () => {
  const doc = packWith({ theme: 'look', seed: { accent: ACCENTS[0]!.hex, neutral_hue: 110 }, roles: { dark: { glow: '#000000' } } });
  await onRecord(async (api) => {
    const refusal = refusalOf((await api.planPack({ doc }, owner)) as Answer, 'an unknown role at the plan');
    assert.equal(refusal.code, 'THEME_VALUE_INVALID');
    assert.equal(refusal.at, 'theme.look.roles.dark.glow');
  });
});
