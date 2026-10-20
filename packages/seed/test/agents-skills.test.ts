/**
 * The skills the agents add-on ships (`packs/agents-skills.ts`, REC-A13 step 3, REC-A07 step 4), held to what makes them
 * safe to hand every record: they name nobody (DIRECTION §27), every verb they tell a session to call is one it can call,
 * each carries a version, and the catalogue offers them with the agents add-on.
 *
 * THE VERBS ARE READ FROM THE SOURCE, NOT IMPORTED: the tools an agent client lists (`packages/mcp/src/index.ts` `TOOLS`),
 * the routes a host answers (`packages/host/src/index.ts` and `routes/`), and the resources. The seed sits under both in
 * the stack, so it reads their text rather than reaching up into them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { AGENTS_SKILLS } from '../src/packs/agents-skills.ts';
import { ROWS } from '../src/index.ts';
import { seedCatalogue } from '../src/usecases/catalogue.ts';

const at = (path: string) => new URL(`../../${path}`, import.meta.url);
const text = (path: string) => readFileSync(at(path), 'utf8');

const MCP = text('mcp/src/index.ts');
const ROUTE_FILES = ['host/src/index.ts', 'host/src/table.ts', ...readdirSync(at('host/src/routes')).filter((f) => f.endsWith('.ts')).map((f) => `host/src/routes/${f}`)];

/** Every verb a session may call: a tool its client lists, or a route its host answers. */
const VERBS = new Set([
  ...[...MCP.slice(MCP.indexOf('export const TOOLS')).matchAll(/^ {4}name: '([A-Za-z_]+)'/gmu)].map((m) => m[1]!),
  ...ROUTE_FILES.flatMap((f) => [...text(f).matchAll(/\{ name: '([A-Za-z_]+)', group: '/gu)].map((m) => m[1]!)),
]);

/** Every resource a session may read: a fixed one by its path, or a template by its head. */
const RESOURCES = new Set([...MCP.matchAll(/resource\(\s*'([a-z/_-]+)'/gu)].map((m) => m[1]!).concat([...MCP.matchAll(/uriTemplate: 'braindog:([a-z_-]+)/gu)].map((m) => m[1]!)));

const calls = (body: string) => [...body.matchAll(/[Cc]all `([A-Za-z_]+)`/gu)].map((m) => m[1]!);
const reads = (body: string) => [...body.matchAll(/`braindog:([a-z/_<>-]+)`/gu)].map((m) => m[1]!);

test('the verbs read from the source are the ones a session reaches, so a check against them is not empty', () => {
  for (const verb of ['context', 'list', 'propose', 'governance', 'record_index', 'checkPaths', 'pagesCensus']) assert.ok(VERBS.has(verb), verb);
  for (const r of ['arrangement', 'grammar/proposals']) assert.ok(RESOURCES.has(r), r);
});

test('every verb a skill tells a session to call is one it can call, and every resource one it can read', () => {
  for (const s of AGENTS_SKILLS) {
    const named = calls(s.body);
    assert.ok(named.length >= 3, `${s.name} names ${named.length} verbs`);
    assert.ok(named.includes('propose') && named.includes('context'), `${s.name} starts from context and files with propose`);
    for (const verb of named) assert.ok(VERBS.has(verb), `${s.name} calls ${verb}, which nothing answers`);
    for (const path of reads(s.body)) {
      const whole = path.replace(/\/<[a-z]+>$/u, '');
      assert.ok(RESOURCES.has(whole) || RESOURCES.has(whole.split('/')[0]!), `${s.name} reads braindog:${path}, which is no resource`);
    }
  }
});

test('each skill files one question under its own cause, as its step says', () => {
  const [after, keep] = ['after-an-import', 'keep-a-record-current'].map((n) => AGENTS_SKILLS.find((s) => s.name === n));
  assert.ok(after && keep);
  assert.match(after.body, /the cause `tidy`, and the question "Tidy what the import left\?"/u);
  assert.match(keep.body, /the cause `setup`/u);
  assert.match(keep.body, /Never file a second while one waits/u);
});

/** The product's own words, which a skill may capitalise mid-sentence: lists, lanes, fields and itself. */
const OWN = new Set(['BrainDog', 'Projects', 'Project', 'About', 'Stage', 'In', 'Earning', 'Building', 'Parked', 'Finished', 'On', 'At', 'Off', 'Skills', 'Tidy', 'Keep']);

test('no skill names a person or a project, so what one record gets every record gets (DIRECTION 27)', () => {
  const sample = ['things', 'people', 'organisations']
    .flatMap((register) => ROWS[register] ?? [])
    .flatMap((r) => [r.name, r.who, r.display_name].filter((v): v is string => typeof v === 'string' && v.length > 2));
  assert.ok(sample.length > 0, 'the sample names were read');
  for (const s of AGENTS_SKILLS) {
    const said = [s.name, s.trigger, s.what, s.body, ...(s.was ?? [])].join('\n');
    for (const name of sample) assert.ok(!said.includes(name), `${s.name} names ${name}`);
    /* A CAPITAL INSIDE A SENTENCE IS A NAME, unless it is the product's own word. Code spans are the record's keys. */
    const prose = said.replace(/`[^`]*`/gu, '').replace(/"[^"]*"/gu, '');
    for (const m of prose.matchAll(/(?<=[a-z,(] )([A-Z][A-Za-z]+)/gu))
      assert.ok(OWN.has(m[1]!), `${s.name} says ${m[1]} inside a sentence, which reads as a name`);
    assert.ok(!/—/u.test(said), `${s.name} carries an em dash`);
    assert.ok(!/\brows?\b/iu.test(prose), `${s.name} says row`);
  }
});

test('each skill is at version 1 or later, its name a folder name, and every text it replaced kept', () => {
  assert.deepEqual(AGENTS_SKILLS.map((s) => s.name), ['after-an-import', 'keep-a-record-current']);
  for (const s of AGENTS_SKILLS) {
    assert.ok(Number.isInteger(s.rev) && s.rev >= 1, `${s.name} is at ${s.rev}`);
    assert.match(s.name, /^[a-z][a-z-]{0,63}$/u);
    assert.equal((s.was ?? []).length, s.rev - 1, `${s.name} is at ${s.rev} and keeps ${(s.was ?? []).length} older texts`);
    assert.ok(s.trigger.length <= 400 && s.what.length <= 400, `${s.name} fits Skills`);
    assert.ok(!(s.was ?? []).includes(s.body), `${s.name} ships a text it already shipped`);
  }
});

test('the catalogue offers them with the agents add-on, text and version', () => {
  const agents = seedCatalogue().find((e) => e.id === 'agents');
  assert.equal(agents?.skills, AGENTS_SKILLS);
  for (const s of agents!.skills!) assert.ok(typeof s.body === 'string' && s.body.length > 0 && typeof s.rev === 'number');
});
