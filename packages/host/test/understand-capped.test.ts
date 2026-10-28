/**
 * Slash's who-is-who questions held to three waiting, each with the day it lapses (HD.224 "max 3
 * waiting", HD.579 "every proposal states a deadline"): the notes pass and the offers pass file only into what is left
 * of `WHO_WAITING_MOST`, strongest first, and an offer the owner said no to is not filed again.
 *
 * A REAL RECORD and the real kernel, so what waits is what the kernel lists; the model is a fake adapter that answers
 * what the test plants. Every name is invented (`fixtures/names.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SLASH } from '@braindog/kernel';
import { createRecordApi, type CallContext } from '@braindog/record';

import { PEOPLE, PROJECTS } from '../../../fixtures/names.ts';
import { NOTES_EVERY_MS, serveNotes, serveOffers, WHO_CAUSE, WHO_WAITING_MOST, whoRoom, type MentionsInput } from '../src/understand.ts';
import { UNDERSTAND_ASKS_MONTH } from '../src/model-jobs.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 6, 2, 30);
const DAY = 86_400_000;
/** Fourteen days on from the 6th of October, in the record's zone. */
const LAPSES = '2026-10-20';
const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const PEOPLE_LIST = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into', projects: 'projects', handles: 'handles' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email' },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'note', type: 'text' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
      { id: 'projects', type: 'list', of: 'ref', to: 'projects' },
    ],
  } as never,
};

const PROJECTS_LIST = {
  id: 'register.projects',
  kind: 'register' as const,
  body: {
    id: 'projects',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos', folders: 'folders' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
      { id: 'folders', type: 'list', of: 'text' },
      { id: 'note', type: 'document' },
    ],
  } as never,
};

/** A record whose owner signs in at an invented address, with People and Projects, and its clock set by `at`. */
async function record() {
  let now = T0 - 3_600_000;
  const api = await createRecordApi({ sql: openSqlite(), clock: { now: () => now } });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'kiln', name: 'Kiln', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: PEOPLE[0]!.email, name: PEOPLE[0]!.name } }).ok);
  const installed = await api.kernel.install([PROJECTS_LIST, PEOPLE_LIST]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { api, at: (ms: number) => (now = ms) };
}

/** Slash's open who-is-who questions, as the kernel lists them, wherever on Decide they wait (the agents' shelf too). */
function whoOpen(api: Awaited<ReturnType<typeof record>>['api']) {
  const open = api.kernel.openSuggestions({ apart: 'with' });
  assert.ok(open.ok);
  return open.value.filter((s) => s.opened_by === SLASH && typeof s.cause === 'string' && s.cause.startsWith(WHO_CAUSE));
}

/** One person whose note says their own address: one offer each. */
async function withAddress(api: Awaited<ReturnType<typeof record>>['api'], p: (typeof PEOPLE)[number]) {
  const made = await api.create({ register: 'people', fields: { name: p.name, note: `Her email is ${p.email}.` } }, OWNER);
  assert.ok(made.ok, JSON.stringify(made));
  return made.value;
}

test(`AT MOST ${WHO_WAITING_MOST} WAIT: five offers give three questions, each with its day, and a night with three open files none`, async () => {
  const r = await record();
  const store = openSqlite();
  for (const p of PEOPLE.slice(1, 6)) await withAddress(r.api, p);
  r.at(T0);

  assert.deepEqual(serveOffers(r.api.kernel, { store, now: () => T0, log: () => {} }), { ran: true, asked: 3 });
  const open = whoOpen(r.api);
  assert.equal(open.length, 3);
  for (const s of open) {
    assert.equal(s.body_kind, 'rowset');
    assert.equal((s.body as { lapses?: string }).lapses, LAPSES, 'a who-is-who question says the day it lapses');
  }
  assert.equal(whoRoom(r.api.kernel, T0), 0);

  /* THE NEXT NIGHT, THREE STILL WAIT: nothing is filed and one line says why. */
  const lines: string[] = [];
  const next = T0 + NOTES_EVERY_MS + 60_000;
  r.at(next);
  assert.deepEqual(serveOffers(r.api.kernel, { store, now: () => next, log: (l) => lines.push(l) }), { ran: true, asked: 0 });
  assert.equal(whoOpen(r.api).length, 3);
  assert.deepEqual(lines, ['offers: 3 who-is-who questions wait, so none of 2 is filed tonight.']);

  /* ONE ANSWERED FREES ONE PLACE, and the night after files one into it. */
  const said = await r.api.decide({ id: open[0]!.id as string, decide: { option: 'accept', reason: 'Yes.' } } as never, OWNER);
  assert.ok(said.ok, JSON.stringify(said));
  assert.equal(whoRoom(r.api.kernel, next), 1);
  const third = T0 + 2 * NOTES_EVERY_MS + 120_000;
  r.at(third);
  assert.deepEqual(serveOffers(r.api.kernel, { store, now: () => third, log: () => {} }), { ran: true, asked: 1 });
  assert.equal(whoOpen(r.api).length, 3);
  assert.equal(whoRoom(r.api.kernel, third), 0);

  /* PAST ITS DAY ONE IS NOT COUNTED: fifteen days on, the three filed on the 6th wait on nobody. */
  assert.equal(whoRoom(r.api.kernel, T0 + 15 * DAY), 2);
});

test('AN OFFER THE OWNER SAID NO TO IS NOT FILED AGAIN, even by a host that lost its marks', async () => {
  const r = await record();
  await withAddress(r.api, PEOPLE[3]!);
  r.at(T0);
  assert.deepEqual(serveOffers(r.api.kernel, { store: openSqlite(), now: () => T0, log: () => {} }), { ran: true, asked: 1 });
  const [asked] = whoOpen(r.api);
  assert.ok(asked);
  const no = await r.api.decide({ id: asked.id as string, decide: { option: 'reject', reason: 'Not her address.' } } as never, OWNER);
  assert.ok(no.ok, JSON.stringify(no));
  assert.equal(whoOpen(r.api).length, 0);

  /* A FRESH STORE OFFERS IT AGAIN, AND THE KERNEL ANSWERS FROM MEMORY BY ITS CAUSE: nothing is filed, nothing counted. */
  const lines: string[] = [];
  assert.deepEqual(serveOffers(r.api.kernel, { store: openSqlite(), now: () => T0 + 60_000, log: (l) => lines.push(l) }), { ran: true, asked: 0 });
  assert.equal(whoOpen(r.api).length, 0);
  assert.deepEqual(lines, []);
  assert.equal(whoRoom(r.api.kernel, T0), WHO_WAITING_MOST);
});

test('THE NOTES PASS FILES INTO THE ROOM WITH A DAY, and with none left it reads nothing and spends no ask', async () => {
  const r = await record();
  const project = PROJECTS[0]!;
  const someone = PEOPLE[4]!.name;
  assert.ok((await r.api.create({ register: 'projects', fields: { name: project, note: `${someone} prints the posters for us every month.` } }, OWNER)).ok);
  r.at(T0);
  const asks: MentionsInput[] = [];
  const mentions = async (input: MentionsInput) => {
    asks.push(input);
    const note = input.notes.find((n) => n.about === project);
    return { ok: true as const, value: { mentions: note ? [{ note: note.id, name: someone, type: 'person', sentence: `${someone} prints the posters for us every month.`, relation: true }] : [] } };
  };
  const meter = { cap: UNDERSTAND_ASKS_MONTH, spent: () => 0 };

  /* TWO WAIT ALREADY, so there is room for one. */
  for (const p of PEOPLE.slice(1, 3)) await withAddress(r.api, p);
  assert.deepEqual(serveOffers(r.api.kernel, { store: openSqlite(), now: () => T0, log: () => {} }), { ran: true, asked: 2 });
  const store = openSqlite();
  /* THE PROJECT'S NOTE AND THE TWO PEOPLE'S ARE READ; ONE NAME IS ASKED, into the one place left. */
  assert.deepEqual(await serveNotes(r.api.kernel, { mentions, meter, store, now: () => T0, log: () => {} }), { ran: true, read: 3, asked: 1 });
  const added = whoOpen(r.api).find((s) => (s.cause as string).startsWith(`${WHO_CAUSE}add:`));
  assert.ok(added, 'the notes pass filed a who-is-who question');
  assert.equal((added.body as { lapses?: string }).lapses, LAPSES);

  /* THREE WAIT NOW: the next night reads no note and asks the model nothing. */
  assert.ok((await r.api.create({ register: 'projects', fields: { name: PROJECTS[1]!, note: `${PEOPLE[5]!.name} keeps our books in order.` } }, OWNER)).ok);
  const next = T0 + NOTES_EVERY_MS + 60_000;
  r.at(next);
  const lines: string[] = [];
  assert.deepEqual(await serveNotes(r.api.kernel, { mentions, meter, store, now: () => next, log: (l) => lines.push(l) }), { ran: true, read: 0, asked: 0, why: 'full' });
  assert.equal(asks.length, 1);
  assert.deepEqual(lines, ['notes: 3 who-is-who questions wait, so none is filed tonight.']);
});

test('A QUESTION NOT FILED FOR WANT OF ROOM KEEPS ITS NOTE UNREAD, and is asked once a place frees', async () => {
  const r = await record();
  const project = PROJECTS[2]!;
  const someone = PEOPLE[6]!.name;
  const said = `${someone} is building ${PROJECTS[3]} with us.`;
  assert.ok((await r.api.create({ register: 'projects', fields: { name: project, note: said } }, OWNER)).ok);
  for (const p of PEOPLE.slice(1, 3)) await withAddress(r.api, p);
  r.at(T0);
  assert.deepEqual(serveOffers(r.api.kernel, { store: openSqlite(), now: () => T0, log: () => {} }), { ran: true, asked: 2 });

  /* ONE NOTE NAMES A PERSON AND A PROJECT: two questions, and room for one. */
  const mentions = async (input: MentionsInput) => {
    const note = input.notes.find((n) => n.about === project);
    const found = note
      ? [
          { note: note.id, name: someone, type: 'person', sentence: said, relation: true },
          { note: note.id, name: PROJECTS[3], type: 'project', sentence: said, relation: true },
        ]
      : [];
    return { ok: true as const, value: { mentions: found } };
  };
  const meter = { cap: UNDERSTAND_ASKS_MONTH, spent: () => 0 };
  const store = openSqlite();
  assert.equal((await serveNotes(r.api.kernel, { mentions, meter, store, now: () => T0, log: () => {} })).asked, 1);
  const adds = () => whoOpen(r.api).filter((s) => (s.cause as string).startsWith(`${WHO_CAUSE}add:`));
  assert.equal(adds().length, 1);

  /* ONE ANSWERED: the next night reads the note again and asks the other, never the first twice. */
  const first = adds()[0]!;
  assert.ok((await r.api.decide({ id: first.id as string, decide: { option: 'accept', reason: 'Yes.' } } as never, OWNER)).ok);
  const next = T0 + NOTES_EVERY_MS + 60_000;
  r.at(next);
  assert.equal((await serveNotes(r.api.kernel, { mentions, meter, store, now: () => next, log: () => {} })).asked, 1);
  const now = adds();
  assert.equal(now.length, 1);
  assert.notEqual((now[0]!.body as { register: string }).register, (first.body as { register: string }).register);
});
