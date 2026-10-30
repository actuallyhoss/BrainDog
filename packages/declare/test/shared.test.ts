/**
 * A use case as a file somebody shares: what `exportUseCase` writes, and what `readShared` lets in. The credentials
 * here are built when the test runs, so no file in the tree holds one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MODULES,
  MODULE_LISTS,
  SHARED_MOST_BYTES,
  exampleFields,
  exportUseCase,
  laterVersion,
  looksLikeCredential,
  useCasePack,
  nextVersion,
  normalise,
  readShared,
  sharedFileName,
  unfilled,
  type Shared,
} from '../src/index.ts';

const COURSES = {
  register: 'courses',
  name: 'Courses',
  title: 'name',
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'teacher', type: 'text' },
    { id: 'owner', type: 'ref', to: 'people' },
    { id: 'tags', type: 'list', of: 'text' },
  ],
};
const STUDIES = {
  page: 'studies',
  title: 'Studies',
  nav: { section: 'Studies', order: 10 },
  requires: ['register.courses'],
  blocks: [{ kind: 'table', source: 'register.courses', span: 12, empty: 'No courses yet.' }],
};

const PARTS = {
  usecase: 'my-studies',
  version: '1.0.1',
  title: 'My studies',
  summary: 'Courses, arranged the way I study.',
  author: 'Halden',
  license: 'MIT',
  audience: 'individual' as const,
  tone: 'plain',
  modules: [],
  voice: { home: 'Desk' },
  labels: { courses: 'Modules' },
  declarations: [COURSES, STUDIES],
  examples: [{ register: 'courses', fields: { name: 'Linear algebra' } }],
};

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};
const refused = (r: { ok: boolean }) => {
  assert.equal(r.ok, false, 'this was supposed to be refused');
  return (r as unknown as { refusal: { code: string; at?: string; fix: string } }).refusal;
};

test('AN EXPORTED ARRANGEMENT READS BACK AS THE SAME USE CASE, WITH ITS PACK READY TO PLAN', async () => {
  const doc = value<Record<string, unknown>>(exportUseCase(PARTS));
  const shared = value<Shared>(await readShared(JSON.stringify(doc)));
  assert.equal(shared.usecase.usecase, 'my-studies');
  assert.equal(shared.usecase.version, '1.0.1');
  assert.equal(shared.pack?.manifest.pack, 'usecase-my-studies');
  assert.equal(shared.pack?.manifest.version, '1.0.1');
  assert.deepEqual(Object.keys(shared.pack?.manifest.config ?? {}).sort(), ['label_courses', 'one_courses', 'shared_version', 'speaks', 'voice_home']);
  assert.equal(shared.pack?.manifest.config?.one_courses?.default, 'module', 'renamed Modules with no singular, so one of it is a module');
  assert.equal(shared.pack?.seeds.length, 1);
});

test('NOTHING OF THE RECORD GOES OUT UNLESS IT WAS PICKED: no examples means no seeds', () => {
  const doc = value<Record<string, unknown>>(exportUseCase({ ...PARTS, examples: [] }));
  assert.equal('seeds' in (doc.pack as Record<string, unknown>), false);
});

test('A USE CASE WITH NO LISTS OR PAGES OF ITS OWN CARRIES NO PACK AND NO VOICE', () => {
  const doc = value<Record<string, unknown>>(exportUseCase({ ...PARTS, modules: ['people'], declarations: [], examples: [] }));
  assert.equal(doc.pack, null);
  assert.equal('voice' in doc, false);
});

test('AT MOST EIGHT EXAMPLES A LIST', () => {
  const examples = Array.from({ length: 9 }, (_, i) => ({ register: 'courses', fields: { name: `Course ${i}` } }));
  assert.equal(refused(exportUseCase({ ...PARTS, examples })).code, 'OUT_OF_BOUNDS');
});

test('AN EXAMPLE ROW KEEPS NO LINK, NO TAGS AND NOTHING EMPTY', () => {
  assert.deepEqual(exampleFields(COURSES, { name: 'Linear algebra', teacher: '', owner: 'people#1', tags: ['example'] }), { name: 'Linear algebra' });
});

test('THE NEXT VERSION IS THE NEXT PATCH, AND A FILE IS NAMED FOR IT', () => {
  assert.equal(nextVersion('1.2.3'), '1.2.4');
  assert.equal(nextVersion(null), '1.0.0');
  assert.equal(nextVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(laterVersion('1.1.1', '1.1.2'), '1.1.2');
  assert.equal(laterVersion('1.10.0', '1.9.9'), '1.10.0');
  assert.equal(laterVersion(null, '2.0.0'), '2.0.0');
  assert.equal(laterVersion(undefined, ''), null);
  assert.equal(sharedFileName('student', '1.0.1'), 'student-1.0.1.usecase.json');
});

test('A HEADING FILLED FROM THE VOICE IS WRITTEN BACK AS ITS PLACEHOLDER, AND NOTHING ELSE IS', () => {
  const body = { page: 'home-student', title: 'Coming up', blocks: [{ kind: 'table', heading: 'Coming up', empty: 'Coming up soon, nothing yet.' }] };
  assert.deepEqual(unfilled(body, new Map([['Coming up', 'voice_needs_you']])), {
    page: 'home-student',
    title: 'Coming up',
    blocks: [{ kind: 'table', heading: '{{config:voice_needs_you}}', empty: 'Coming up soon, nothing yet.' }],
  });
});

/* ── what is refused on the way in ─────────────────────────────────────── */

const fake = {
  stripe: () => ['sk', 'live', 'Z'.repeat(24)].join('_'),
  github: () => `ghp_${'a1B2'.repeat(9)}`,
};

test('A FILE PAST THE SIZE IS REFUSED BEFORE IT IS READ', async () => {
  const text = `{"usecase":"big","pad":"${'x'.repeat(SHARED_MOST_BYTES)}"}`;
  const r = refused(await readShared(text));
  assert.equal(r.code, 'PACK_OVER_CAP');
  assert.equal(r.at, 'file');
});

test('A FILE THAT IS NOT JSON, OR NOT A USE CASE, IS SAID TO BE NOT ONE', async () => {
  assert.equal(refused(await readShared('usecase: student')).code, 'PACK_MALFORMED');
  assert.equal(refused(await readShared('{"pack":"work"}')).at, 'usecase');
});

test('A CREDENTIAL ANYWHERE IN THE FILE IS REFUSED, BY ITS KEY OR BY ITS SHAPE', async () => {
  const doc = value<Record<string, unknown>>(exportUseCase(PARTS));
  const byKey = { ...doc, summary: 'fine', api_key: 'abc' };
  assert.equal(refused(await readShared(byKey)).code, 'SECRET_IN_PACK');

  const inExample = structuredClone(doc) as { pack: { seeds: { fields: Record<string, unknown> }[] } };
  inExample.pack.seeds[0]!.fields.teacher = fake.stripe();
  const r = refused(await readShared(JSON.stringify(inExample)));
  assert.equal(r.code, 'SECRET_IN_PACK');
  assert.match(r.at ?? '', /seeds/);

  const inVoice = { ...doc, voice: { home: `Desk ${fake.github()}` } };
  assert.equal(refused(await readShared(inVoice)).code, 'SECRET_IN_PACK');
});

test('A FILE NESTED PAST ANY DECLARATION IS REFUSED AS NOT ONE, and never throws', async () => {
  /* TWO HUNDRED KILOBYTES OF BRACKETS THREW. The credential walk recursed once a level and ran out of stack, so readShared
     threw out of a function that answers a Result, and a propose token's file was a 500. */
  const text = `{"usecase":"deep","pad":${'['.repeat(100_000)}${']'.repeat(100_000)}}`;
  const r = refused(await readShared(text));
  assert.equal(r.code, 'PACK_MALFORMED');
  let doc: unknown = 1;
  for (let i = 0; i < 40_000; i++) doc = { a: doc };
  assert.equal(refused(await readShared({ usecase: 'deep', pad: doc })).code, 'PACK_MALFORMED');
  const pack = refused(await normalise({ pack: 'deep', version: '1.0.0', summary: 's', author: 'a', license: 'MIT', declarations: [{ ...STUDIES, pad: doc }] }));
  assert.equal(pack.code, 'PACK_MALFORMED');
  /* A real file is nowhere near the line. */
  value(await readShared(value<Record<string, unknown>>(exportUseCase(PARTS))));
});

test('A CREDENTIAL IS KNOWN BY THE NAMES PROVIDERS GIVE IT, AND A RANDOM KEY WITH NO PREFIX IS KNOWN AS THE RECORD KNOWS ONE', async () => {
  const doc = value<Record<string, unknown>>(exportUseCase(PARTS));
  for (const key of ['client_secret', 'access_token', 'refresh_token', 'API-Key', 'apiToken', 'secret_key', 'privateKey'])
    assert.equal(refused(await readShared({ ...doc, [key]: 'abc' })).code, 'SECRET_IN_PACK', key);
  /* A BRAINDOG KEY, which is the credential somebody arranging a BrainDog is most likely to paste: a record id, a dot, and
     forty-three random characters. The record refuses one in a row; a label, a page title or a voice line took it. */
  const bearer = ['rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', ['q7Rk2Zp9Lm4X', 'v8Bn3Hc6Tw1Y', 'd5Gs0JfAe4Ku7Nx2Qb'].join('')].join('.');
  assert.equal(refused(await readShared({ ...doc, labels: { courses: `Key ${bearer}` } })).code, 'SECRET_IN_PACK');
  assert.equal(refused(await normalise({ pack: 'leaky', version: '1.0.0', summary: 's', author: 'a', license: 'MIT', declarations: [{ ...STUDIES, title: bearer }] })).code, 'SECRET_IN_PACK');
  /* Ids, hashes and words are not keys. */
  value(await readShared({ ...doc, summary: 'Courses 01JZ8QK3F7R2M9V4XN6TCB5HAD, commit 3f9a1c2e4b5d6e7f8091a2b3c4d5e6f708192a3b, and tokens_used counted.' }));
});

test('A PACK CARRYING A CREDENTIAL-SHAPED VALUE IS REFUSED BY normalise TOO, so planPack refuses it', async () => {
  const r = refused(
    await normalise({ pack: 'leaky', version: '1.0.0', summary: 's', author: 'a', license: 'MIT', declarations: [{ ...STUDIES, title: `Studies ${fake.stripe()}` }] }),
  );
  assert.equal(r.code, 'SECRET_IN_PACK');
});

test('ORDINARY WORDS ARE NOT CREDENTIALS', () => {
  for (const said of ['Coming up', 'sk-8 park on Tuesday', 'https://example.com/a@b', 'Bearer of good news', 'AKIA is a name'])
    assert.equal(looksLikeCredential(said), false, said);
});

test('A BLOCK KIND THIS BUILD DOES NOT DRAW IS REFUSED BEFORE A PLAN', async () => {
  const doc = value<Record<string, unknown>>(
    exportUseCase({ ...PARTS, declarations: [COURSES, { ...STUDIES, blocks: [{ kind: 'hologram', source: 'register.courses', span: 12 }] }] }),
  );
  const r = refused(await readShared(doc));
  assert.equal(r.code, 'KIND_UNKNOWN');
  assert.match(r.at ?? '', /^page\.studies/);
  /* SAID TO SOMEBODY INSTALLING, not to somebody writing a pack: the kind by name, and no path or count of kinds. */
  assert.equal(r.fix.startsWith('This setup uses a block this version of BrainDog does not have: hologram.'), true, r.fix);
  assert.doesNotMatch(r.fix, /twenty|blocks\[/u);
});

test('THE RAIL ORDER GOES OUT AND COMES BACK, and an address that is not a page or a list is refused', async () => {
  const doc = value<Record<string, unknown>>(exportUseCase({ ...PARTS, nav: ['/p/studies', '/r/courses'] }));
  assert.deepEqual(doc.nav, ['/p/studies', '/r/courses']);
  const back = await readShared(JSON.stringify(doc));
  assert.ok(back.ok);
  assert.deepEqual((back as { value: Shared }).value.usecase.nav, ['/p/studies', '/r/courses']);
  assert.equal(refused(await readShared({ ...doc, nav: ['javascript:alert(1)'] })).code, 'VALUE_MALFORMED');
  assert.equal(refused(await readShared({ ...doc, nav: ['/r/courses', '/r/courses'] })).code, 'VALUE_MALFORMED');
});

test('SIGNALS AND SKILLS GO OUT WHEN GIVEN, and a skill holding a credential is refused like any other value', async () => {
  const doc = value<Record<string, unknown>>(exportUseCase({ ...PARTS, signals: ['homework', 'my courses'], skills: [{ name: 'study-planner', trigger: 'when an assignment is added' }] }));
  const back = await readShared(doc);
  assert.ok(back.ok);
  assert.deepEqual((back as { value: Shared }).value.usecase.signals, ['homework', 'my courses']);
  assert.deepEqual((back as { value: Shared }).value.usecase.skills, [{ name: 'study-planner', trigger: 'when an assignment is added' }]);
  const leaky = value<Record<string, unknown>>(exportUseCase({ ...PARTS, skills: [{ name: 'deploy', trigger: `run with ${fake.stripe()}` }] }));
  const r = refused(await readShared(leaky));
  assert.equal(r.code, 'SECRET_IN_PACK');
  assert.match(r.at ?? '', /skills/u);
});

test('THE CARRIED PACK KEEPS THE VERSION IT WAS LAST SHARED AS, as a setting beside its voice', async () => {
  const doc = value<Record<string, unknown>>(exportUseCase(PARTS));
  const back = await readShared(doc);
  assert.ok(back.ok);
  const pack = useCasePack((back as { value: Shared }).value.usecase) as { config: Record<string, { type: string; default?: unknown }> };
  assert.deepEqual(pack.config.shared_version, { type: 'text', label: 'Last shared as' });
});

test('AN UNKNOWN KEY AT THE TOP IS REFUSED BY THE FORMAT', async () => {
  const doc = value<Record<string, unknown>>(exportUseCase(PARTS));
  assert.equal(refused(await readShared({ ...doc, script: 'run()' })).code, 'FIELD_UNKNOWN');
});

test('A LIST WITH THE ID OF A FIRST-PARTY MODULE IT DOES NOT INSTALL IS REFUSED, so a use case cannot stand in for People', async () => {
  /* `boot` names members to whoever may read People, and a file declaring its own `people` on a record without the
     module would have been that list. Any module's list is refused the same way, by the module that owns it. */
  const PEOPLE_LIKE = { register: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
  const SKILLS_LIKE = { register: 'skills', name: 'Skills', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
  for (const [decl, module] of [[PEOPLE_LIKE, 'People'], [SKILLS_LIKE, 'Agents']] as const) {
    const doc = value<Record<string, unknown>>(exportUseCase({ ...PARTS, declarations: [COURSES, decl], examples: [] }));
    const r = refused(await readShared(JSON.stringify(doc)));
    assert.equal(`${r.code} at ${r.at}`, `PROVIDES_CONFLICT at register.${decl.register}`);
    assert.match(r.fix, new RegExp(`belongs to the ${module} module`));
  }
  assert.deepEqual(Object.keys(MODULE_LISTS), [...MODULES]);

  /* A USE CASE THAT INSTALLS THE MODULE IS NOT REFUSED HERE: installing it is, as a declaration another pack holds. */
  const withModule = value<Record<string, unknown>>(exportUseCase({ ...PARTS, modules: ['people'], declarations: [COURSES, PEOPLE_LIKE], examples: [] }));
  value(await readShared(JSON.stringify(withModule)));
});

test("an enum's words for its values are not a credential, and a secret-named key beside them still is", async () => {
  const { credentialKey } = await import('../src/credentials.ts');
  const kinds = { register: 'keys', fields: [{ id: 'kind', type: 'enum', values: ['api_token', 'note'], labels: { api_token: 'API token', note: 'Note' } }] };
  assert.equal(credentialKey(kinds), null);
  assert.equal(credentialKey({ fields: [{ id: 'kind', type: 'enum', values: ['note'], labels: { api_token: 'sk-live' } }] }), 'api_token');
  /* NAMING ITS OWN KEY IN `values` EXEMPTS NOTHING but an enum's words (review 3, P2). */
  assert.equal(credentialKey({ values: ['password'], labels: { password: 'hunter2' } }), 'password');
  assert.equal(credentialKey({ values: ['password'], labels: { password: 'Password' } }), 'password', 'not an enum field');
  assert.equal(credentialKey({ id: 'kind', type: 'enum', values: ['password'], labels: { password: 'hunter2' } }), 'password');
  assert.equal(credentialKey({ id: 'kind', type: 'enum', values: ['token'], labels: { token: 'Xk9f2LmQ7rT4vB8nW1zA' } }), 'token');
  assert.equal(credentialKey({ id: 'kind', type: 'enum', values: ['secret'], labels: { secret: 'a'.repeat(41) } }), 'secret');
  assert.equal(credentialKey({ id: 'kind', type: 'enum', values: ['password', 'ssh_key'], labels: { password: 'Password', ssh_key: 'SSH key' } }), null);
});
