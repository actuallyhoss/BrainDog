/**
 * An add-on made from a person's own declarations carries nothing of theirs: each literal that names something of the
 * record is a setting whose default is that literal, and every key, token, secret, address, link, skill's text and
 * unticked row is dropped and said.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

import { looksLikeCredential } from '@braindog/kernel';
import { SETTINGS_MOST, scrubPack, scrubWords, type Scrubbed } from '../src/scrub.ts';
import { PEOPLE, PROJECTS, DOMAINS } from '../../../fixtures/names.ts';

/* INVENTED, and the token is built here so no file holds a key-shaped run. */
const PERSON = 'p_01HZX3K7M9Q2R4T6V8W0Y1Z3A5';
const ROW = 'tasks#12';
const PROJECT = PROJECTS[0];
const NAMED = PEOPLE[2]!.name;
const ADDRESS = PEOPLE[0]!.email;
const HOOK = `https://hooks.${DOMAINS[1]}/T0/B0/ping`;
const TOKEN = ['tok', 'Qx7Lm2Vb9Rt4', 'Np8Kd3Hs6Wz1', 'Yc5Fg0Ja'].join('');
const SECRET = 'orchard-gate-4417';
const SKILL_TEXT = `Write to ${PEOPLE[3]!.name} every Friday about ${PROJECTS[1]}.`;
const FEED = `https://${DOMAINS[3]}/orders/feed`;

const SET: unknown[] = [
  {
    register: 'leads',
    name: 'Leads',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'lead', type: 'person', default: PERSON },
      { id: 'parent', type: 'ref', to: 'tasks', default: ROW },
      { id: 'door_code', type: 'secret', default: SECRET },
    ],
  },
  {
    page: 'desk',
    title: 'Desk',
    blocks: [
      { kind: 'table', source: 'register.tasks', where: `owner is ${PERSON}, state is doing` },
      { kind: 'table', source: 'register.tasks', where: { all: [{ field: 'parent', is: ROW }, { field: 'lead', is: NAMED }, { field: 'state', is: 'open' }] } },
      { kind: 'note', text: `Ask ${ADDRESS} first.` },
      { kind: 'note', text: TOKEN },
    ],
  },
  { metric: 'open-work', name: 'Open work', source: 'register.tasks', where: `project is ${PROJECT}, state is not done`, value: { count: 'id' }, format: 'int' },
  {
    rule: 'ping-desk',
    on: { every: '1d' },
    where: `project is ${PROJECT}`,
    steps: [{ call: { action: 'notify', args: { url: HOOK, token: TOKEN, owner: PERSON } } }],
  },
  { ingest: 'orders', channel: 'webhook', fetch: { url: FEED }, verify: { kind: 'path' }, match: { field: 'body', contains: 'order placed' } },
  { skill: 'weekly-brief', trigger: 'On a Friday afternoon', text: SKILL_TEXT },
  { id: ROW, what: `Fix ${PROJECTS[4]}` },
  { id: 'tasks#7', what: 'Sweep the shelf' },
];

const scrubbed = (set: readonly unknown[] = SET, rows = { tasks: [7] }): Scrubbed => {
  const r = scrubPack(set, { rows });
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

test('NOTHING OF THE AUTHOR IS LEFT IN THE DECLARATIONS, and nothing that never leaves is anywhere in the answer', () => {
  const out = scrubbed();
  const declared = JSON.stringify(out.declarations);
  for (const literal of [PERSON, ROW, PROJECT, NAMED, ADDRESS, HOOK, TOKEN, SECRET, SKILL_TEXT, FEED, PROJECTS[4]!])
    assert.ok(!declared.includes(literal), `${literal} is still in the declarations`);
  const all = JSON.stringify(out);
  for (const never of [ADDRESS, HOOK, TOKEN, SECRET, SKILL_TEXT, FEED, PROJECTS[4]!]) assert.ok(!all.includes(never), `${never} left the record`);
  assert.equal(out.declarations.length, 5, 'the list, the page, the figure, the automation and the door');
});

test('EACH SETTING IS ONE LITERAL, its default that literal, and one literal used three times is one setting', () => {
  const out = scrubbed();
  assert.equal(out.settings.filter((s) => s.value === PERSON).length, 1);
  assert.equal(out.settings.filter((s) => s.value === ROW).length, 1);
  assert.equal(out.settings.filter((s) => s.value === PROJECT).length, 1);
  const kept = out.settings.filter((s) => s.names === 'person' || s.names === 'row' || s.names === 'project');
  assert.deepEqual(kept.map((s) => s.value).sort(), [NAMED, PERSON, PROJECT, ROW].sort());
  for (const s of kept) assert.equal((out.config[s.key] as { default: string }).default, s.value);
  const hook = out.settings.find((s) => s.names === 'link');
  assert.ok(hook, 'the webhook address is a setting');
  assert.equal(hook.value, '');
  assert.equal((out.config[hook.key] as Record<string, unknown>).default, undefined, 'and whoever installs it fills it in');
  assert.equal(Object.keys(out.config).length, out.settings.length);

  const [list, page, figure, rule] = out.declarations as Record<string, any>[];
  const person = out.settings.find((s) => s.value === PERSON)!.key;
  assert.equal(list!.fields[1].default, `{{config:${person}}}`);
  assert.equal(page!.blocks[0].where, `owner is {{config:${person}}}, state is doing`);
  assert.equal(page!.blocks[1].where.all[2].is, 'open', 'a word anybody could hold stays');
  assert.match(figure!.where, /^project is \{\{config:[a-z_0-9]+\}\}, state is not done$/u);
  assert.equal(rule!.steps[0].call.args.owner, `{{config:${person}}}`);
});

test('THE TOKEN, THE SECRET, THE DOOR, THE SKILL, THE ADDRESS AND THE UNTICKED ROW ARE DROPPED, each with its reason', () => {
  const out = scrubbed();
  const why = (at: string): string | undefined => out.dropped.find((d) => d.at === at)?.why;
  assert.equal(why('register.leads.fields.3.default'), scrubWords.secret);
  assert.equal(why('rule.ping-desk.steps.0.call.args.token'), scrubWords.token);
  assert.equal(why('page.desk.blocks.3.text'), scrubWords.key);
  assert.equal(why('page.desk.blocks.2.text'), scrubWords.address);
  assert.equal(why('ingest.orders.fetch.url'), scrubWords.door);
  assert.equal(why('declarations.5'), scrubWords.skill);
  assert.equal(why('declarations.6'), scrubWords.row);
  assert.deepEqual(out.rows, [{ id: 'tasks#7', what: 'Sweep the shelf' }], 'the ticked row goes, and no other');
  const rule = out.declarations[3] as Record<string, any>;
  assert.equal(rule.steps[0].call.args.token, undefined);
  assert.ok(looksLikeCredential(TOKEN), 'the invented token is one the kernel calls a key');
});

test('A TOKEN UNDER ANY CASE OF ITS NAME, A KEY AS A NAME, AND AN ADDRESS OR A PERSON IN A TICKED ROW ARE DROPPED too', () => {
  const KEYED = ['sk_live_', 'Qx7Lm2Vb9Rt4Np8Kd3Hs6Wz1'].join('');
  const args = { apiKey: SECRET, 'Access-Token': SECRET, headers: { Authorization: `Bearer ${SECRET}` }, [KEYED]: 1, owner: 'me' };
  const out = scrubbed([
    { rule: 'post-out', on: { every: '1d' }, steps: [{ call: { action: 'post', args } }] },
    { id: 'tasks#7', what: 'Sweep the shelf', email: ADDRESS, owner: PERSON },
  ]);
  const all = JSON.stringify(out);
  for (const never of [SECRET, KEYED, ADDRESS, PERSON]) assert.ok(!all.includes(never), `${never} left the record`);
  assert.deepEqual((out.declarations[0] as Record<string, any>).steps[0].call.args, { headers: {}, owner: 'me' });
  assert.deepEqual(out.rows, [{ id: 'tasks#7', what: 'Sweep the shelf' }]);
  assert.equal(out.dropped.find((d) => d.at.endsWith('.email'))?.why, scrubWords.address);
  assert.equal(out.dropped.find((d) => d.at.endsWith('.owner'))?.why, scrubWords.person);
});

test('AS THE RECORD HOLDS ONE, a declaration comes back in its own form, its body scrubbed', () => {
  const body = JSON.stringify({ metric: 'mine', source: 'register.tasks', where: `assignee is ${NAMED}`, value: { count: 'id' } });
  const out = scrubbed([{ id: 'metric.mine', version: 3, kind: 'metric', body, checksum: 'x' }]);
  const [one] = out.declarations as { id: string; kind: string; body: Record<string, unknown> }[];
  assert.equal(one!.id, 'metric.mine');
  assert.equal(one!.kind, 'metric');
  assert.equal(one!.body.where, `assignee is {{config:${out.settings[0]!.key}}}`);
  assert.equal(out.settings[0]!.value, NAMED);
});

test(`PAST ${SETTINGS_MOST} SETTINGS THE WHOLE PACK IS REFUSED, in one sentence`, () => {
  const figures = (n: number): unknown[] =>
    Array.from({ length: n }, (_, i) => ({ metric: `m${i}`, source: 'register.tasks', where: `project is Invented ${i}`, value: { count: 'id' } }));
  assert.equal(scrubbed(figures(SETTINGS_MOST)).settings.length, SETTINGS_MOST);
  const over = scrubPack(figures(SETTINGS_MOST + 1));
  assert.equal(over.ok, false);
  assert.ok(!over.ok && 'refusal' in over);
  assert.equal(over.refusal.code, 'OUT_OF_BOUNDS');
  assert.equal(over.refusal.fix, scrubWords.tooMany(SETTINGS_MOST + 1));
});

test('A DOOR\'S CONNECT RECIPE KEEPS ITS SCRIPT AND ITS HOSTS, a key in the script is still taken out, and its prose is held as prose', () => {
  const door = (text: string, steps: string[] = ['Open it.']): unknown[] => [
    { ingest: 'in', channel: 'webhook', connect: { title: 'Connect', names: ['https://script.google.com'], steps, files: [{ name: 'Code.gs', text }] } },
  ];
  const code = "const seen = 'mailer@example.com'; UrlFetchApp.fetch('https://www.googleapis.com/x');";
  const kept = scrubbed(door(code));
  assert.deepEqual(kept.dropped, []);
  assert.deepEqual(kept.settings, []);
  assert.deepEqual(kept.declarations, door(code));

  const key = scrubbed(door(`const k = '${'sk_live_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'}';`));
  assert.deepEqual(key.dropped.map((d) => [d.at, d.why]), [['ingest.in.connect.files.0.text', scrubWords.key]]);

  /* ONLY THE RECIPE'S CODE. A step is words a person wrote, and a `text` anywhere else is too. */
  const prose = scrubbed(door(code, ['Mail me at leo@example.com', 'See https://leo.example.com/notes']));
  assert.deepEqual(prose.dropped.map((d) => d.why), [scrubWords.address, scrubWords.link]);
  const elsewhere = scrubbed([{ ingest: 'in', channel: 'webhook', note: { files: [{ text: 'See https://leo.example.com/notes' }] } }]);
  assert.deepEqual(elsewhere.dropped.map((d) => d.why), [scrubWords.link]);
});

test('A SHIPPED ADD-ON IS LEFT AS IT IS, but for a door address and a row its page points at', () => {
  const root = new URL('../../../packs/', import.meta.url);
  for (const id of readdirSync(root)) {
    const file = new URL(`${id}/${id}.pack.json`, root);
    if (!existsSync(file)) continue;
    const declarations = (JSON.parse(readFileSync(file, 'utf8')) as { declarations?: unknown[] }).declarations ?? [];
    const out = scrubbed(declarations);
    for (const d of out.dropped) assert.equal(d.why, scrubWords.door, `${id}: ${d.at}`);
    for (const s of out.settings) assert.equal(s.names, 'row', `${id}: ${s.at}`);
    if (out.dropped.length === 0 && out.settings.length === 0) assert.deepEqual(out.declarations, declarations, id);
  }
});
