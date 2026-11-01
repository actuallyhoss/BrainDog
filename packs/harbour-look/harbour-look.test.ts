/**
 * Harbour look: one theme, a sea blue-green on a cooler grey, and nothing else.
 *
 * THE FIRST ADD-ON THAT IS ONLY A LOOK. It declares no list, no page and no rule, so what it promises is a palette, and
 * a palette is only kept when every pair a screen draws clears its floor. So the file is read through the add-on door
 * exactly as it ships, installed on a fresh record by the same plan and install a person presses, and then the record's
 * own theme check (`packages/record/src/theme-check.ts`) is asked for both schemes, under the house profile and under
 * high contrast, and must find nothing.
 *
 * AND THE CHECK IS SHOWN TO BITE ON THIS SEED. A copy of the file with the faint text painted on its own ground is
 * refused at the plan, by the role it names, so the pass above cannot be a check that passes everything.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fileChecksum, readCatalogue, readPackFile } from '../../packages/declare/src/catalogue.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { themeBuilt } from '../../packages/record/src/theme-check.ts';
import { checkElevation, checkScheme, refusals } from '../../packages/theme/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Refusal = { code: string; at?: string; fix: string };
type Answer = { ok: true; value?: unknown } | { ok: false; refusal: Refusal };
type Diff = { planHash: string; approve: string[] };
type Theme = { theme: string; scheme: string; seed: { accent: string; neutral_hue: number }; roles?: Record<string, Record<string, string>> };

const TEXT = readFileSync(new URL('./harbour-look.pack.json', import.meta.url), 'utf8');
/** The file as it ships, parsed fresh each time so no test hands the next one a copy it changed. */
const file = (): { pack: string; version: string; declarations: Theme[] } => JSON.parse(TEXT) as never;
const INDEX = new URL('../../apps/web/static/catalogue/index.json', import.meta.url);

async function onRecord<T>(fn: (api: Api) => Promise<T>): Promise<T> {
  const sql = openSqlite();
  try {
    return await fn(await createRecordApi({ sql, clock: fixedClock(NOW) }));
  } finally {
    sql.close();
  }
}

const plan = async (api: Api, doc: unknown): Promise<Answer> => (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Answer;

/** Plan, then install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<Answer> {
  const planned = await plan(api, doc);
  assert.ok(planned.ok, `the plan was refused: ${JSON.stringify(planned)}`);
  const { planHash, approve } = (planned.value as { diff: Diff }).diff;
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash, approve } as never, owner)) as Answer;
}

const drawn = async (api: Api): Promise<{ light: Record<string, string>; dark: Record<string, string> } | null> => {
  const boot = (await api.boot(owner)) as { ok: boolean; value?: { theme: { light: Record<string, string>; dark: Record<string, string> } | null } };
  assert.ok(boot.ok && boot.value, 'the record did not boot');
  return boot.value.theme;
};

test('THE FILE IS harbour-look, ONE THEME AND NOTHING ELSE, read through the add-on door as it ships', async () => {
  const doc = file();
  assert.deepEqual([doc.pack, doc.version], ['harbour-look', '1.0.1']);
  assert.deepEqual(
    doc.declarations.map((d) => Object.keys(d)[0]),
    ['theme'],
    'a look carries a theme and no list, page or rule',
  );
  const [look] = doc.declarations;
  assert.equal(look!.scheme, 'both', 'the look is drawn in light and in dark');
  assert.notEqual(look!.seed.accent.toLowerCase(), '#cf413a', 'the seed is not the house red');
  assert.doesNotMatch(TEXT, /—/u, 'an em dash in words a person reads');

  const read = await readPackFile(TEXT);
  if (!read.ok) assert.fail('refusal' in read ? `${read.refusal.code}: ${read.refusal.fix}` : 'harbour-look.pack.json did not read.');

  /* A VERSION THE CATALOGUE ALREADY LISTS NEVER CHANGES. Until the catalogue tool publishes this one it is not listed,
     and that is not a mismatch. */
  const index = readCatalogue(JSON.parse(readFileSync(INDEX, 'utf8')));
  if (!index.ok) assert.fail('the catalogue index did not read');
  const listed = index.value.entries.find((e) => e.kind === 'pack' && e.id === doc.pack)?.versions.find((v) => v.version === doc.version);
  if (listed) assert.equal(await fileChecksum(TEXT), listed.checksum, 'the file moved from what was published; a change is a later version');
});

test('INSTALLED ON A FRESH RECORD, IT CHANGES THE LOOK, and every pair passes in both schemes and both profiles', async () => {
  await onRecord(async (api) => {
    assert.equal(await drawn(api), null, 'a fresh record is drawn in the house look');

    const installed = await put(api, file());
    assert.ok(installed.ok, `the install was refused: ${JSON.stringify(installed)}`);
    assert.ok(
      api.kernel.declarations().some((d) => d.id === 'theme.harbour'),
      'the theme is on the record',
    );

    const built = await themeBuilt('theme.harbour', file().declarations[0]);
    assert.ok(built, 'the theme check could not build the palette');
    /* WHAT IS DRAWN IS WHAT WAS CHECKED: the record's boot hands the app the same build, in both schemes. */
    const look = await drawn(api);
    assert.ok(look, 'the record draws the installed look');
    assert.deepEqual([look.light.accent, look.dark.accent], [built.house.schemes.light.accent, built.house.schemes.dark.accent]);
    for (const [name, palette] of [
      ['house', built.house],
      ['high contrast', built.contrast],
    ] as const) {
      for (const scheme of ['light', 'dark'] as const) {
        const found = refusals(checkScheme(palette, scheme));
        assert.deepEqual(
          found.map((f) => f.at),
          [],
          `${name} ${scheme}: ${found.map((f) => f.fix).join(' ')}`,
        );
      }
      assert.deepEqual(refusals(checkElevation(palette)), [], `${name}: the tiles do not step apart`);
    }
  });
});

test('A COPY WITH THE FAINT TEXT ON ITS OWN GROUND IS REFUSED AT THE PLAN, by the pair it names', async () => {
  const built = await themeBuilt('theme.harbour', file().declarations[0]);
  assert.ok(built);
  const doc = file();
  doc.declarations[0]!.roles = { light: { faint: built.house.schemes.light.bg } };
  await onRecord(async (api) => {
    const planned = await plan(api, doc);
    assert.equal(planned.ok, false, 'faint text on its own ground was planned');
    assert.ok('refusal' in planned);
    assert.equal(planned.refusal.code, 'CONTRAST_FLOOR');
    assert.equal(planned.refusal.at, 'theme.harbour.roles.light.faint');
    assert.match(planned.refusal.fix, /\(faint on \w+\)/u, 'the sentence names the pair');
    assert.ok(!api.kernel.declarations().some((d) => d.id === 'theme.harbour'), 'nothing was installed');
  });
});
