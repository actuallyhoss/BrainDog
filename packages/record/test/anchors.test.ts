/**
 * `43 §4.3`'s four anchor forms, read the way a real record reads them.
 *
 * THE FOUR THAT DID NOT MOVE. Six of the ten forms are read by `@braindog/extract` now, injected
 * one rank down; the anchors stayed in the kernel because `§14` calls them *slicing and not
 * reading* — they need `indexOf` and an `A`–`Z` comparison, not a currency table or a token set.
 * That is the right call and it left the slicing unmeasured against the document for as long as it
 * has existed. Measured against `extract` over 48 cases, the two agreed on 30 and differed on 18.
 *
 * THE ORACLE IS `43 §9.1`'s ANCHOR ROWS AND `§4.3`'s AND `§5.3`'s SENTENCES, copied out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const M1 = 'Card 1234 debited EGP 1,250.00 at BEANS COFFEE on 29/08/26. Ref 88213. Balance EGP 3,020.15.';

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: {
    id: 'notes',
    name: 'Notes',
    title: 'what',
    fields: [
      { id: 'what', type: 'text' },
      { id: 'got', type: 'text' },
      { id: 'n', type: 'int' },
    ],
  } as never,
};

const reader = (form: Record<string, unknown>, field = 'got') => ({
  id: 'ingest.bank-sms',
  kind: 'ingest' as const,
  body: {
    ingest: 'bank-sms',
    channel: 'email',
    match: { all: [{ field: 'from', is: 'alerts@bank.example' }] },
    extract: { [field]: form },
    writes: { register: 'notes', confidence: 'exact' },
  } as never,
});

/** One message through one declaration: how the arrival filed, and what the row holds. */
async function lands(form: Record<string, unknown>, body = M1, field = 'got') {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) } as never);
  const put = await api.kernel.install([NOTES, reader(form, field)]);
  assert.ok(put.ok, JSON.stringify(put));
  const out = api.kernel.arrive({ channel: 'email', headers: { From: 'alerts@bank.example' }, body, sha256: 'a1' });
  assert.ok(out.ok, JSON.stringify(out));
  return { state: out.value.state, fields: api.kernel.get('notes#1')?.fields ?? null };
}

/** What that form wrote, which is `null` when the row has no such key. */
async function reads(form: Record<string, unknown>, body = M1, field = 'got'): Promise<unknown> {
  return (await lands(form, body, field)).fields?.[field] ?? null;
}

test("43 §9.1'S ANCHOR ROWS, off a real record", async () => {
  assert.equal(await reads({ after: 'Ref ' }), '88213. Balance EGP 3,020.15.');
  assert.equal(await reads({ before: ' at' }), 'Card 1234 debited EGP 1,250.00');
  assert.equal(await reads({ between: ['at ', ' on'] }), 'BEANS COFFEE');
  assert.equal(await reads({ between: ['at ', ' zz'] }), null);
  assert.equal(await reads({ text: { between: ['at ', ' on'] } }, 'paid at  BEANS\tCOFFEE  on 1'), 'BEANS COFFEE');
});

test('AN ANCHOR MATCHES A CASE AWAY, because a provider changes its capitals and not its meaning', async () => {
  /* `43 §4.3`, verbatim: *Literal matching is ASCII-case-insensitive over a parallel folded string,
     so positions align (34 §1.2's `contains` rule); values are sliced from the unfolded text.*

     THE KERNEL MATCHED THE RAW TEXT, so `{ after: "REF " }` read nothing out of a message saying
     `Ref 88213`. It is the silent kind: the field is missing, the arrival files at needs-review,
     and nothing in the reason says the anchor was one capital letter away. */
  assert.equal(await reads({ after: 'REF ' }), '88213. Balance EGP 3,020.15.');
  assert.equal(await reads({ before: ' AT' }), 'Card 1234 debited EGP 1,250.00');
  assert.equal(await reads({ between: ['AT ', ' ON'] }), 'BEANS COFFEE');

  /* AND THE VALUE COMES OUT OF THE UNFOLDED TEXT, capitals as the provider wrote them. */
  assert.equal(await reads({ between: ['card ', ' debited'] }), '1234');

  /* AND IT REACHES THE FORMS THAT ALREADY MOVED, because the anchor runs before the reader does. */
  assert.equal(await reads({ int: { after: 'REF ' } }, M1, 'n'), 88213);

  /* THE FOLD IS ASCII AND STOPS THERE — `§4.3` and `§10`'s note. `É` is not `é` here, and that is a
     stated limit rather than an oversight: a fold that changes a length changes every index after
     it, and every position this returns is a position in the text the record stored. */
  assert.equal(await reads({ after: 'café ' }, 'paid CAFÉ 5'), null);
});

test('EVERY OCCURRENCE IS A SLICE, `before` included', async () => {
  /* `43 §4.3`: *the text before EACH occurrence of `L`, from the start*, and `§5.3`: *each
     occurrence of the anchor literal yields one slice; candidates concatenate in text order*.
     `after` and `between` walk their occurrences and `before` never did, so `nth` over a `before`
     could not reach candidate 2 from any message — the same defect this function's own header says
     was fixed for the other two. */
  const body = 'x at y at z';
  assert.equal(await reads({ nth: { n: 1, of: { before: ' at' } } }, body), 'x');
  assert.equal(await reads({ nth: { n: 2, of: { before: ' at' } } }, body), 'x at y');
  assert.equal(await reads({ nth: { n: 3, of: { before: ' at' } } }, body), null);
});

test('AND A BARE ANCHOR HANDS BACK THE SLICE IT CUT, untrimmed', async () => {
  /* `§4.3` gives the trim to `text` and to `text` alone — *the slice with whitespace collapsed and
     trimmed* — and the contrast is the whole reason `{ text: { after } }` exists beside
     `{ after }`. The kernel trimmed both and then read an empty slice as `null`, so an anchor at
     the very start or the very end of a message read as *the message did not say* rather than as
     the empty slice it is. */
  assert.equal(await reads({ after: 'debited' }), ' EGP 1,250.00 at BEANS COFFEE on 29/08/26. Ref 88213. Balance EGP 3,020.15.');
  assert.equal(await reads({ between: ['a', 'b'] }, 'a   b'), ' ');

  /* AN EMPTY SLICE IS A READ AND NOT A MISS, and the two layers below it disagree on purpose.
     `{ before: "Card" }` over a message that opens with `Card` cuts nothing, which the extractor
     hands back as a value read exactly — so the arrival MATCHES, and every other field in the
     declaration is written. The row then does not hold the key, because kernel invariant K2 and
     `34 §1.3` behind it make `null`, the empty string and the empty list one state, absent, and
     `isAbsent` strips it at the write.

     THAT IS THE WHOLE DIFFERENCE THIS FIXES. Read as a MISS, the empty slice put the arrival in
     `review` and wrote NO rows at all: one anchor landing at index 0 threw away every other field
     the message had. Read as a value, the record keeps what the message said and drops only the
     key that says nothing. */
  const empty = await lands({ before: 'Card' });
  assert.equal(empty.state, 'matched');
  assert.deepEqual(empty.fields, {});

  /* AND `text` STILL COLLAPSES AND TRIMS, and still reads an empty slice as nothing. */
  assert.equal(await reads({ text: { after: 'debited' } }), 'EGP 1,250.00 at BEANS COFFEE on 29/08/26. Ref 88213. Balance EGP 3,020.15.');
  assert.equal(await reads({ text: { before: 'Card' } }), null);
});

test('A `note:` ON A FORM IS DATA AND IS NOT THE FORM', async () => {
  /* `42 §4`, on the key that is legal everywhere: *a note is data, not a YAML comment. Legal on
     every declaration, field, block, section and action below.* `declare` filters it out of an
     extractor's keys in three places, and `slices` took `Object.values(form)[0]` as the
     specification — so a note written BEFORE the extractor key made the note's own text the spec,
     no anchor was found in it, and the form read the whole message. Written after the key it did
     nothing at all, which is the tell: the same declaration meant two things depending on the
     order somebody typed two keys in. */
  const before = { note: 'the SMS one', text: { between: ['at ', ' on'] } };
  assert.equal(await reads(before), 'BEANS COFFEE');

  const after = { text: { between: ['at ', ' on'] }, note: 'the SMS one' };
  assert.equal(await reads(after), 'BEANS COFFEE');

  /* AND THE SAME FOR A BARE ANCHOR, where the note is a sibling of the anchor rather than of the
     form it wraps. */
  assert.equal(await reads({ note: 'the reference', after: 'Ref ' }), '88213. Balance EGP 3,020.15.');
});
