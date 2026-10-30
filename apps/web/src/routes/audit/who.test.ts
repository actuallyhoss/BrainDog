/**
 * `/audit` on a record with several people on it: who each line is by, and who it is about.
 *
 * Every id below was written by a real record, not invented for this file. A scratch script opened
 * a record with `createRecord`, put seven colleagues on it with the record's own `invite`, minted an
 * invitation and spent it with `acceptInvite`, then read `recentHistory` as the screen reads it.
 * That record answered `members()` with `name: null` eight times out of eight and `boot.names` with
 * `{}`, so the "no name anywhere" tests here are the state of every record that exists today, and
 * the named ones are the state of the first record where somebody sets one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../../lib/copy.ts';
import { actorOf } from '../../lib/record/api.ts';
import type { AuditEvent } from '../../lib/record/schema.ts';
import { actorSaid, byMatches, didSaid, offeredActors, personIn, runsIn, targetSaid } from './who.ts';

/** The decider on the driven record, the id the screen printed raw. */
const DECIDER = 'p_01M1KJ7RG0TYYA0AX15QPGJJ4';
/** The founding owner, whose own grant `createRecord` writes with the other spelling. */
const OWNER = 'p_01M1KJ7RG0OWNER0000000000';

const NO_NAMES: ReadonlyMap<string, string> = new Map();

test('AN ID IS NOT A NAME, and the composition this screen shipped turned one into a worse id', () => {
  /* What the actor column ran: `named(actorOf(e.by))`, when `actorOf` handed a person's id back and
     capitalising its first letter mangled it. `actorOf` words through `names.ts`'s `actor` now, so
     reaching for it again says Someone on this record rather than the id. */
  assert.equal(actorOf(DECIDER), copy.feedSomeone);

  const said = actorSaid(DECIDER, null, NO_NAMES);
  assert.equal(said.name, copy.feedSomeone);
  assert.equal(said.person, true);
  assert.equal(said.you, false);
});

test('A PERSON THE RECORD HAS A NAME FOR IS SAID BY IT, on the line and in the filter', () => {
  const names = new Map([[DECIDER, 'Ada Fenwick']]);
  assert.equal(actorSaid(DECIDER, null, names).name, 'Ada Fenwick');
  assert.equal(targetSaid(DECIDER, null, names)?.name, 'Ada Fenwick');
  assert.equal(targetSaid(`person:${DECIDER}`, null, names)?.name, 'Ada Fenwick');
  /* AND IT IS SAID AS THE RECORD HOLDS IT, NOT TITLE-CASED. `lead` exists for the sentences this
     file builds about nobody in particular; a name a person typed is theirs. Every name in this
     suite was already capitalised, so the branch that spares a person's name could be deleted whole
     and nothing went red. `invite` takes free text, so `de Vries` and `iPad kiosk` are names a
     record really holds, and Home's feed prints them as given through the same `whoDid`: two
     renderings of one question disagreeing is what this file exists to stop. */
  assert.equal(actorSaid(DECIDER, null, new Map([[DECIDER, 'de Vries']])).name, 'de Vries');
  assert.equal(actorSaid(DECIDER, null, new Map([[DECIDER, 'iPad kiosk']])).name, 'iPad kiosk');
});

test('THE READER IS YOU, whichever spelling the ledger wrote them in', () => {
  assert.equal(actorSaid('you', null, NO_NAMES).name, copy.feedYou);
  assert.equal(actorSaid('you', null, NO_NAMES).you, true);
  assert.equal(targetSaid(OWNER, OWNER, NO_NAMES)?.name, copy.feedYou);
  assert.equal(targetSaid(`person:${OWNER}`, OWNER, NO_NAMES)?.name, copy.feedYou);
});

test('AN ACTOR THAT IS NOT A PERSON IS SAID BY ITS NAME, and still leads with a capital', () => {
  assert.equal(actorSaid('system', null, NO_NAMES).name, 'BrainDog');
  assert.equal(actorSaid('slash', null, NO_NAMES).name, 'Slash');
  /* A RULE SAYS IT IS ONE, so its name is never read as a person's. */
  assert.equal(actorSaid('rule.renewal', null, NO_NAMES).name, 'A rule: Renewal');
  assert.equal(actorSaid('rule.renewal', null, NO_NAMES).kind, 'rule');
  assert.equal(actorSaid('agent:claude', null, NO_NAMES).name, 'Claude');
  for (const by of ['system', 'slash', 'rule.renewal', 'agent:claude'])
    assert.equal(actorSaid(by, null, NO_NAMES).person, false, `${by} was read as a person`);
});

test('ONLY A PERSON IS A PERSON: a row, a page, a key and a question keep their spoken ids', () => {
  for (const target of ['services#6', 'page.money', 'suggestion:SG31', 'decision:D41', 'pack:usecase-team', 'obligations#1'])
    assert.equal(personIn(target), null, `${target} was read as a person`);
  assert.equal(targetSaid('services#6', null, NO_NAMES), null);
});

test('BOTH SPELLINGS OF A PERSON TARGET ARE ONE PERSON', () => {
  /* `invite` writes the bare id (`members.ts`); `createRecord` writes `person:<id>` for the founding
     owner (`provision.ts:132`). The driven record held seven of the first and one of the second. */
  assert.equal(personIn(DECIDER), DECIDER);
  assert.equal(personIn(`person:${OWNER}`), OWNER);
});

test('A CHIP THAT CANNOT SAY WHICH PERSON IT MEANS IS NOT OFFERED', () => {
  /* Seven colleagues the record has no name for are seven chips reading the same four words, and
     each one would filter to one of them. The record itself and the assistant keep theirs, because
     their words pick out exactly one actor. */
  const nameless = ['you', 'system', 'slash', DECIDER, OWNER, 'p_01M1KJ7RG0WRITE000000000W'];
  assert.deepEqual(offeredActors(nameless, null, NO_NAMES), ['you', 'system', 'slash']);
});

test('AND IT COMES BACK THE DAY SOMEBODY SETS A NAME, with nothing else changing', () => {
  const some = new Map([[DECIDER, 'Dara Quint']]);
  /* Dara is now the only actor those words pick out, so her chip is offered; the two the record
     still cannot name are not. */
  assert.deepEqual(offeredActors([DECIDER, OWNER, 'p_01M1KJ7RG0WRITE000000000W', 'system'], null, some), [DECIDER, 'system']);
  const all = new Map([
    [DECIDER, 'Dara Quint'],
    [OWNER, 'Hal Porter'],
  ]);
  assert.deepEqual(offeredActors([DECIDER, OWNER, 'system'], null, all), [DECIDER, OWNER, 'system']);
});

test('ONE PERSON ON THE RECORD IS STILL OFFERED, because the words pick them out', () => {
  assert.deepEqual(offeredActors([DECIDER, 'system'], null, NO_NAMES), [DECIDER, 'system']);
});

test('NOBODY IS LINKED TO A PAGE THAT DOES NOT EXIST, which is what the screen asks this for', () => {
  /* The old `href` sent a person target to `/${encodeURIComponent(target)}`, so an access line
     pointed at `/p_01M1KJ7RG0TYYA0AX15QPGJJ4`. There is no person route in this build: the resolver
     at `/[id]` takes spoken row ids and governance ids and answers nothing for a `p_` id. The screen
     draws a link only where `targetSaid` says the target is not a person, so this is the assertion
     that keeps that true. */
  assert.notEqual(targetSaid(DECIDER, null, NO_NAMES), null);
  assert.notEqual(targetSaid(`person:${OWNER}`, null, NO_NAMES), null);
});

/* WHO A RUN IS (history-run-by-web-68): a line a run signed carries run_by, and the screen says the app it ran in. */
const RUN_NOW = new Date(2026, 8, 29, 9, 40).getTime();
const runAgo = (min: number): string => new Date(RUN_NOW - min * 60_000).toISOString();
const CODE = { run: 'S42', agent: 'claude', client: 'claude-code 2.1.4', parent: null };
const CODEX = { run: 'S43', agent: 'codex', client: 'codex-mcp-client', parent: null };
let runSeq = 100;
const runEv = (at: string, by: string, run_by?: AuditEvent['run_by']): AuditEvent => ({
  seq: runSeq--, at, by, kind: 'edit', note: '', version: runSeq + 1, ...(run_by === undefined ? {} : { run_by }),
});

test('A RUN IS SAID BY THE APP IT RAN IN, and one the record sent nothing for is still An agent', () => {
  assert.equal(actorSaid('S42', null, NO_NAMES, CODE).name, 'Claude Code');
  assert.equal(actorSaid('S42', null, NO_NAMES, CODE).kind, 'agent');
  assert.equal(actorSaid('S42', null, NO_NAMES, CODE).person, false);
  assert.equal(actorSaid('S42', null, NO_NAMES).name, 'An agent');
  assert.equal(actorSaid('S42', null, NO_NAMES, null).name, 'An agent');
  /* ANOTHER RUN'S run_by NAMES NOBODY HERE. */
  assert.equal(actorSaid('S42', null, NO_NAMES, CODEX).name, 'An agent');
});

test('A PERSON AND A RULE READ AS THEY DID, whatever run_by is handed over beside them', () => {
  const names = new Map([['p_01M1KJ7RG0TYYA0AX15QPGJJ4', 'Mona']]);
  assert.equal(actorSaid('p_01M1KJ7RG0TYYA0AX15QPGJJ4', null, names, CODE).name, 'Mona');
  assert.equal(actorSaid('you', null, NO_NAMES, CODE).you, true);
  assert.equal(actorSaid('rule.renewal', null, NO_NAMES, CODE).name, 'A rule: Renewal');
  assert.equal(actorSaid('agent:claude', null, NO_NAMES, CODE).name, 'Claude');
});

test('THE FILTER OFFERS A RUN IT CAN NAME, and says it as the line does', () => {
  const log = [runEv(runAgo(2), 'S43', CODEX), runEv(runAgo(20), 'S42', CODE), runEv(runAgo(30), 'S7')];
  const runs = runsIn(log);
  assert.deepEqual([...runs.keys()].sort(), ['S42', 'S43']);
  assert.deepEqual(offeredActors(['S42', 'S43', 'system'], null, NO_NAMES, runs), ['S42', 'S43', 'system']);
  assert.deepEqual(offeredActors(['S42', 'S43', 'system'], null, NO_NAMES), ['system'], 'with no run_by both are An agent');
  assert.equal(actorSaid('S42', null, NO_NAMES, runs.get('S42') ?? null).name, 'Claude Code');
});

test('A LINE WHOSE TITLE SAYS WHAT WAS DONE SAYS WHO DID IT AS A SENTENCE, and BrainDog\'s own rule is BrainDog', () => {
  /* The recheck of 30 October read "A rule: Handled · closed" under "Filed 2 Ledger Post payments under Software". */
  assert.equal(actorSaid('rule:handled', null, NO_NAMES).name, 'BrainDog');
  assert.equal(didSaid('rule:handled', null, NO_NAMES, null, 'closed'), 'BrainDog closed it');
  assert.equal(didSaid('you', null, NO_NAMES, null, 'decided'), 'You decided it');
  assert.equal(didSaid('rule:invoice-late', null, NO_NAMES, null, 'closed'), 'The rule “Chase late payments” closed it');
  assert.equal(didSaid('rule:ladder', null, NO_NAMES, null, 'closed'), 'The trust rule closed it');
  assert.equal(didSaid('system', null, NO_NAMES, null, 'gave access'), 'BrainDog gave access');
});

test('BRAINDOG UNDER ANY OF ITS NAMES IS ONE CHIP, and that chip keeps all of its lines', () => {
  assert.deepEqual(offeredActors(['rule:handled', 'system', 'p_seed', 'slash'], null, NO_NAMES), ['system', 'slash']);
  assert.deepEqual(offeredActors(['rule:handled', 'rule:additive', 'slash'], null, NO_NAMES), ['rule:handled', 'slash']);
  assert.equal(byMatches('rule:handled', 'system'), true);
  assert.equal(byMatches('slash', 'system'), false);
});

test('A QUESTION IS ASKED ABOUT WHAT IT NAMES', () => {
  assert.equal(didSaid('rule:txn-categorise', null, NO_NAMES, null, 'asked'), 'The rule “Categorise what cleared” asked about it');
});
