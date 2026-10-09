/**
 * The card on a record lived in (AGT-B07 job 10): the proof area's default profile (`fixtures/shapes/default.json`,
 * five weeks, 750 runs and 25 open questions, an import with residue), built by `tools/gates/lived.mjs` through the
 * product's own verbs and opened at the instant it ended.
 *
 * WHY HERE AND NOT ONLY IN `card.test.ts`. Every case there draws a context by hand, and the card on the owner's record
 * was never measured: it ran past its size and named a step that was not true while every case stayed green. This reads
 * the card the record composes from a record shaped like a real one, as a fresh session reads it before it attaches and
 * after it has, and holds three things: at most 150 words, no id where a name goes, and every Next line true.
 *
 * TRUE MEANS THE RECORD SAYS IT TOO. The step a Next line quotes is the newest one left where the session stands, by
 * the run the line names; the red signs it counts are the ones the record reads red. Nothing here is anybody's: the
 * names and the step are made up (DIRECTION 27).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CARD_MOST, wordCount } from '../src/card.ts';
import type { Attached, CallContext, Context, RecordApi } from '../src/index.ts';

type Lived = { api: RecordApi; kernel: { signs(): { ok: boolean; value?: { signs: { name: string; state: string }[] } } }; close(): void };
type Builder = { buildLived(name: string): Promise<{ file: string }>; openLived(file: string): Promise<Lived> };

/** The builder is the gates' script, plain JavaScript, so it is loaded by its address and typed here by what is used. */
const BUILDER = new URL('../../../tools/gates/lived.mjs', import.meta.url).href;
const { buildLived, openLived } = (await import(BUILDER)) as Builder;

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const valueOf = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/**
 * WHAT IS AN ID IN WORDS A PERSON READS: a ULID or a prefixed row id, a register's `tools#8`, a key or a person by its
 * id, a file path or a host's address. A run's handle (`S751`) is allowed beside the app's name, and only there.
 */
const IDS: [string, RegExp][] = [
  ['a ULID', /\b[0-9A-HJKMNP-TV-Z]{26}\b/u],
  ['a prefixed id', /\b(?:rec|p|t|tok|run|sug)_[0-9A-Za-z]+/u],
  ['a register handle', /\b[a-z][a-z-]*#\d+/u],
  ['a file path', /(?:^|\s)~?\/[\w.-]+\//u],
  ['a host address', /\b[\w-]+\.(?:local|lan|internal)\b|\b\d{1,3}(?:\.\d{1,3}){3}\b/u],
];

/** The card held to the three things, whoever reads it. */
function holds(c: Context, where: string): string {
  const card = c.card ?? '';
  assert.ok(card.length > 0, `${where}: the record sent no card`);
  assert.ok(wordCount(card) <= CARD_MOST, `${where}: the card is ${wordCount(card)} words, past ${CARD_MOST}:\n${card}`);
  for (const [what, re] of IDS) assert.doesNotMatch(card, re, `${where}: the card prints ${what}:\n${card}`);
  assert.doesNotMatch(card, /—/u, `${where}: the card has an em dash`);
  /* A HANDLE ONLY BESIDE A NAME: every `S<n>` sits in the first line's "run S<n>" or after a Next line's "(", with
     the app's name after it. */
  for (const line of card.split('\n'))
    for (const m of line.matchAll(/\bS\d+\b/gu)) {
      const before = line.slice(0, m.index);
      const ok = before.endsWith('run ') || (before.endsWith('(') && line.slice(m.index + m[0].length).startsWith(', Claude Code'));
      assert.ok(ok, `${where}: a run's handle is printed without its name: ${line}`);
    }
  /* THE RED SIGNS IT COUNTS ARE THE RECORD'S. */
  const signs = card.split('\n').find((l) => l.startsWith('Signs '));
  if (signs) {
    const red = valueOf<{ signs: { state: string }[] }>(lived.kernel.signs()).signs.filter((s) => s.state === 'red').length;
    assert.match(signs, new RegExp(`\\b${red} read red\\b`, 'u'), `${where}: the card counts red signs the record does not: ${signs}`);
  }
  return card;
}

const { file } = await buildLived('default');
const lived = await openLived(file);
const api = lived.api;
test.after(() => lived.close());

/** A session of an agent's in the made-up repository, attached as the start hook attaches it. */
async function session(name: string): Promise<CallContext> {
  const key = valueOf<{ id: string }>(await api.createToken({ scope: 'write', label: name }, owner)).id;
  const ctx: CallContext = {
    principal: { kind: 'token', id: key, scope: 'write', person: 'p_owner', level: 'owner' },
    session: { client_id: `c-${name}`, agent: 'claude', host: 'harbour-mac', repo: 'harbour' },
  };
  valueOf<Attached>(await api.attach({ source: 'startup', client_id: `c-${name}` }, ctx));
  return ctx;
}

test('BEFORE A SESSION ATTACHES: the card is short, names no id, and says no step it cannot stand behind', async () => {
  const c = valueOf<Context>(await api.context({}, owner));
  const card = holds(c, 'the owner, before a run');
  /* NO PLACE, NO STEP: the record's runs left theirs nowhere in particular, so there is nothing true to put in Next. */
  assert.equal(c.handoff, null);
  assert.ok(!card.split('\n').some((l) => l.startsWith('Next ')), `a Next line with no step left here:\n${card}`);
  assert.equal(c.card_next ?? null, null);
});

test('AFTER A RUN HANDS OFF: the fresh session\'s Next line is the step that run left, by that run, and nothing else', async () => {
  const leaver = await session('leaver');
  const left = valueOf<Context>(await api.context({}, leaver)).session!.spoken;
  valueOf(await api.handoff({ next: 'Match the card ending 4817 to its account', state: 'handoff' }, leaver));

  const fresh = await session('fresh');
  const c = valueOf<Context>(await api.context({}, fresh));
  const card = holds(c, 'a fresh session');
  const next = card.split('\n').filter((l) => l.startsWith('Next '));
  assert.equal(next.length, 1, `one Next line, not ${next.length}:\n${card}`);
  const line = next[0]!;
  /* TRUE: the record's newest step here is the one left, by the run that left it, and the line says both. */
  assert.equal(c.handoff?.from, left);
  assert.equal(c.handoff?.next, 'Match the card ending 4817 to its account');
  assert.ok(line.includes('Match the card ending 4817 to its account'), line);
  assert.ok(line.includes(`(${left}, Claude Code`), line);
  /* ANOTHER RUN LEFT IT, so the line says to check it before acting on it. */
  assert.match(line, /check before acting/u);
  /* A COMPACTION PRINTS THIS LINE ALONE, so it is the same line. */
  assert.equal(c.card_next, line);
});
