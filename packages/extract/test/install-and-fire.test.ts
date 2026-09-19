/**
 * WHAT `declare` REFUSES AT INSTALL AND WHAT `matches` CAN NEVER MATCH ARE THE SAME SET.
 *
 * The two used to be different code reading different schemas. `declare` hand-checked the operator and the
 * field name against a list it kept, the kernel evaluated the predicate against a copy of the arrival's
 * schema that lived in `ingest.ts`, and `matches` evaluated it against `where`'s `INBOX_RAW` — three
 * objects for one backend, two of them on the fire path. They disagreed about `channel`'s type and about
 * the record's five columns, so a declaration could install clean, fire in the kernel and match nothing
 * here. An ingest that never fires and an ingest that fires correctly look identical from the outside.
 *
 * IT CROSSES THE TWO CODE PATHS AND NOT THE TWO CONSTANTS. Asserting that two exported objects are the
 * same object is true by construction the moment one re-exports the other, which is a comment rather than
 * a guard. This asks the install check and the fire check the same questions and requires one answer:
 * anything refused at install must match nothing, and anything accepted at install must be ASKABLE — it
 * may be false for these arrivals, but never false because the grammar could not read it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateDeclaration } from '@braindog/kernel';
import { compile, INBOX_RAW, type Predicate } from '@braindog/where';

import { matches } from '../src/arrival.ts';
import type { RawArrival } from '../src/arrival.ts';

const declaration = (match: unknown) => ({
  id: 'ingest.acme',
  kind: 'ingest' as const,
  body: {
    ingest: 'acme',
    channel: 'email',
    match,
    extract: { merchant: { text: {} } },
    writes: { register: 'transactions' },
  },
});

/* Four arrivals rather than one, so "matches nothing" is a claim about the predicate and not about a
   single message that happened to miss. */
const ARRIVALS: RawArrival[] = [
  { id: 'r1', ts: '2026-01-20T09:00:00.000Z', channel: 'email', headers: { from: 'alerts@hsbc.example', subject: 'Your statement' }, body: 'EGP 250.00 at Seoudi on 20/01/26' },
  { id: 'r2', ts: '2025-06-01T00:00:00.000Z', channel: 'webhook', headers: { from: 'hooks@stripe.example' }, body: 'charge.succeeded' },
  { id: 'r3', ts: '2026-01-20T09:00:00.000Z', channel: 'paste', body: '' },
  { id: 'r4', ts: '2026-02-29T00:00:00.000Z', channel: 'api', headers: { to: 'me@brain.dog', subject: 'Re: invoice' }, body: 'USD 5.00' },
];

/**
 * Every leaf below is one somebody would plausibly write. The ones marked `refused` are refused by
 * `34 §1.9` or by the DDL's own CHECK lists; the rest are ordinary.
 */
const LEAVES: [string, unknown, boolean][] = [
  ['from contains', { field: 'from', contains: 'hsbc' }, false],
  ['subject present', { field: 'subject', present: true }, false],
  ['channel is email', { field: 'channel', is: 'email' }, false],
  ['channel in the five', { field: 'channel', in: ['email', 'webhook'] }, false],
  ['state is untriaged', { field: 'state', is: 'untriaged' }, false],
  ['ts after a day', { field: 'ts', after: '2026-01-01' }, false],
  ['body empty', { field: 'body', empty: true }, false],
  ['a group of two', { all: [{ field: 'channel', is: 'email' }, { field: 'from', contains: 'hsbc' }] }, false],

  ['channel a row cannot hold', { field: 'channel', in: ['email', 'imap'] }, true],
  ['state the CHECK forbids', { field: 'state', is: 'pending' }, true],
  ['starts, which 1.9 refuses', { field: 'subject', starts: 'Re:' }, true],
  ['ends, which 1.9 refuses', { field: 'subject', ends: 'invoice' }, true],
  ['has, which 1.9 refuses', { field: 'subject', has: 'x' }, true],
  ['lacks, which 1.9 refuses', { field: 'subject', lacks: 'x' }, true],
  ['matches, which 1.9 refuses', { field: 'body', matches: 'invoice' }, true],
  ['a field an arrival has not', { field: 'amount', gt: 0 }, true],
  ['a kernel column, which this backend has not', { field: 'created_at', present: true }, true],
  ['a refusal inside a none', { none: [{ field: 'channel', is: 'imap' }] }, true],
];

test('A PREDICATE REFUSED AT INSTALL MATCHES NO ARRIVAL, AND ONE ACCEPTED AT INSTALL IS ASKABLE', () => {
  for (const [name, leaf, shouldRefuse] of LEAVES) {
    const said = validateDeclaration(declaration(leaf) as never);
    assert.equal(said !== null, shouldRefuse, `${name}: install said ${said?.code ?? 'nothing'}`);

    /* THE FIRE SIDE, asked of every arrival. A refused predicate has to be false for all four, and an
       accepted one has to be readable — `compile` carrying no refusal is what makes `matches`' `false` a
       fact about the message rather than about the grammar. */
    const answers = ARRIVALS.map((raw) => matches({ match: leaf as Predicate }, raw));
    if (shouldRefuse) assert.deepEqual(answers, [false, false, false, false], `${name}: install refused it and it still matched`);
    else assert.deepEqual(compile(leaf as Predicate, INBOX_RAW).bad, [], `${name}: install took it and the grammar cannot read it`);
  }
});

test('AND THE FOUR ARRIVALS ARE NOT ALL ALIKE, so "matches nothing" is a claim rather than an accident', () => {
  const some = matches({ match: { field: 'channel', is: 'email' } as Predicate }, ARRIVALS[0]!);
  const none = matches({ match: { field: 'channel', is: 'email' } as Predicate }, ARRIVALS[1]!);
  assert.equal(some, true);
  assert.equal(none, false);
  assert.equal(matches({}, ARRIVALS[2]!), true, 'no match: is every arrival, 43 s5.2 step 2');
});
