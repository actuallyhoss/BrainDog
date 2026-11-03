/**
 * EVERYTHING THE APP PUBLISHES CARRIES ITS PUBLISHER'S SIGNATURE. A use case from Share and a page shared as a template
 * each go to the Kennel with a signature and its public key, in the body the Kennel reads (`readSubmission`), over the
 * kind, id, version and checksum it verifies. A browser that cannot keep a key publishes unsigned and says so in one
 * line; an id whose earlier versions went unsigned is sent once more unsigned. A stand-in fetch plays the Kennel.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { exportUseCase } from '@braindog/declare';
import { fileChecksum, verifySignature } from '@braindog/declare/catalogue';
import { emptyCatalogue, type CatalogueIndex } from '@braindog/declare/catalogue';
import { acceptSubmission, emptyPublishers, emptyReview, publisherKey, readSubmission, reviewVerdict, type Change, type Identity, type Review } from '@braindog/declare/kennel';

import { memoryStore, signatureFor } from './author-key.ts';
import { publishedSaid, publishWords, submitToKennel, type Signer } from './publish.ts';
import { signedAs, templateOf } from './template.ts';

type Sent = { url: string; body: Record<string, unknown> };

/** A Kennel in a function: it keeps every body it is sent and answers each in turn from `answers`, the last one after. */
function kennel(answers: unknown[]): { fetcher: (input: string, init?: RequestInit) => Promise<Response>; sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    fetcher: async (input, init) => {
      sent.push({ url: input, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(JSON.stringify(answers[Math.min(sent.length, answers.length) - 1]), { headers: { 'content-type': 'application/json' } });
    },
  };
}

const listed = (kind: string, id: string, version: string) => ({ ok: true, value: { state: 'listed', kind, id, version } });
const refused = (code: string, at: string, fix: string) => ({ ok: false, refusal: { code, fix, at } });

const signer = (): Signer => {
  const store = memoryStore();
  return (text) => signatureFor(text, store);
};

const garden = (version: string): string => {
  const built = exportUseCase({
    usecase: 'allotment',
    version,
    title: 'Allotment',
    summary: 'Beds, sowings and what came up.',
    author: 'Wren Calloway',
    license: 'MIT',
    audience: 'individual',
    tone: 'plain',
    modules: [],
    voice: { home: 'Plot' },
    labels: {},
    declarations: [{ register: 'beds', name: 'Beds', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
    examples: [],
  });
  assert.ok(built.ok, JSON.stringify(built));
  return JSON.stringify(built.value, null, 2);
};

const shelfPage = { page: 'seed-shelf', title: 'Seed shelf', requires: ['register.seeds'], blocks: [{ kind: 'table', source: 'register.seeds', heading: 'Packets', span: 12 }] };

test('a use case goes out with a signature and its public key, over what the Kennel verifies', async () => {
  const text = garden('1.0.0');
  const k = kennel([listed('usecase', 'allotment', '1.0.0')]);
  const out = await submitToKennel(k.fetcher, text, signer());
  assert.ok(out.ok);
  assert.equal(out.value.unsigned, undefined);
  assert.equal(k.sent.length, 1);
  assert.match(k.sent[0]?.url ?? '', /submit$/u);
  const read = readSubmission(k.sent[0]?.body);
  assert.ok(read.ok);
  const sig = read.value.signature;
  assert.ok(sig);
  assert.match(sig.public_key, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal((await verifySignature(sig, 'usecase', 'allotment', '1.0.0', await fileChecksum(text))).ok, true);
  assert.doesNotMatch(publishedSaid({ ...out.value, title: 'Allotment' }), /unsigned/u);
});

test('a page shared as a template goes out signed on the same path', async () => {
  const t = templateOf({ body: shelfPage, states: [], format: 1, primitives: 1, version: '1.2.0' });
  const k = kennel([listed('pack', t.id, t.version)]);
  const sign = signer();
  const out = await submitToKennel(k.fetcher, t.text, sign);
  assert.ok(out.ok);
  const read = readSubmission(k.sent[0]?.body);
  assert.ok(read.ok && read.value.signature);
  const as = signedAs(t);
  assert.equal((await verifySignature(read.value.signature, as.kind, as.id, as.version, await fileChecksum(t.text))).ok, true);
  /* One browser, one key: the next version is signed by the same key. */
  const next = templateOf({ body: shelfPage, states: [], format: 1, primitives: 1, version: '1.2.1' });
  await submitToKennel(kennel([listed('pack', next.id, next.version)]).fetcher, next.text, sign);
  const again = await sign(next.text);
  assert.equal(again?.key_id, read.value.signature.key_id);
});

test('a browser that cannot keep a key publishes unsigned, and says so in one line', async () => {
  const text = garden('1.0.1');
  const k = kennel([{ ok: true, value: { state: 'review', kind: 'usecase', id: 'allotment', version: '1.0.1' } }]);
  /* The default signer: Node has no IndexedDB, as a browser that keeps nothing. */
  const out = await submitToKennel(k.fetcher, text);
  assert.ok(out.ok);
  assert.equal(out.value.unsigned, 'browser');
  assert.deepEqual(Object.keys(k.sent[0]?.body ?? {}), ['text']);
  const said = publishedSaid({ ...out.value, title: 'Allotment' });
  assert.ok(said.startsWith(publishWords.unsignedBrowser));
  assert.ok(said.endsWith(publishWords.review('Allotment', '1.0.1')));
  assert.doesNotMatch(said, /—/u);
});

test('an id that went out unsigned before is sent once more unsigned, and says so', async () => {
  const text = garden('1.1.0');
  const k = kennel([refused('PROVIDES_CONFLICT', 'id', 'allotment belongs to another publisher in the Kennel. Give this one another id.'), listed('usecase', 'allotment', '1.1.0')]);
  const out = await submitToKennel(k.fetcher, text, signer());
  assert.ok(out.ok);
  assert.equal(out.value.unsigned, 'earlier');
  assert.equal(k.sent.length, 2);
  assert.ok(k.sent[0]?.body.signature);
  assert.deepEqual(Object.keys(k.sent[1]?.body ?? {}), ['text']);
  assert.ok(publishedSaid({ ...out.value, title: 'Allotment' }).startsWith(publishWords.unsignedEarlier));
});

test("another publisher's id is refused in the Kennel's words, and a changed key is never sent again unsigned", async () => {
  const fix = 'allotment belongs to another publisher in the Kennel. Give this one another id.';
  const theirs = kennel([refused('PROVIDES_CONFLICT', 'id', fix)]);
  assert.deepEqual(await submitToKennel(theirs.fetcher, garden('1.0.0'), signer()), { ok: false, fix });
  assert.equal(theirs.sent.length, 2);

  const changed = 'Earlier versions of allotment are signed by key 0123456789abcdef, and this one by key fedcba9876543210. Sign it with that key.';
  const k = kennel([refused('SIGNATURE_INVALID', 'signature', changed)]);
  assert.deepEqual(await submitToKennel(k.fetcher, garden('1.2.0'), signer()), { ok: false, fix: changed });
  assert.equal(k.sent.length, 1);
});

test('a Kennel out of reach is said, signed or not', async () => {
  const down = async (): Promise<Response> => {
    throw new Error('offline');
  };
  assert.deepEqual(await submitToKennel(down, garden('1.0.0'), signer()), { ok: false, fix: publishWords.unreached });
  assert.deepEqual(await submitToKennel(down, garden('1.0.0'), async () => null), { ok: false, fix: publishWords.unreached });
});

/**
 * The Kennel itself behind the stand-in fetch, as the Worker runs it: a body with a signature is the key's, one without
 * is the signed-in person's (here an invented person id), and each accepted change is applied to the index.
 */
function realKennel(person: string, trustPerson = false) {
  const publishers = emptyPublishers();
  if (trustPerson) publishers.trusted[publisherKey({ kind: 'person', id: person })] = { trusted: true, at: '2026-10-01T09:00:00Z' };
  let index: CatalogueIndex = emptyCatalogue('Kennel');
  let review: Review = emptyReview();
  const files = new Map<string, string>();
  const bodies: Record<string, unknown>[] = [];
  const fetcher = async (_input: string, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    const asked = readSubmission(body);
    if (!asked.ok) return Response.json(asked);
    const identity: Identity = asked.value.signature ? { kind: 'key', signature: asked.value.signature } : { kind: 'person', id: person };
    const state = { bundled: emptyCatalogue('BrainDog'), reserved: [], index, review, publishers, read: (path: string) => files.get(path) ?? null };
    const out = await acceptSubmission(state, asked.value.text, identity, new Date('2026-10-15T09:00:00Z'));
    if (!out.ok) return Response.json(out);
    const change: Change = out.value;
    for (const f of change.files) files.set(f.path, f.text);
    if (change.index) index = change.index;
    if (change.review) review = change.review(review);
    if (change.move) files.set(change.move.to, files.get(change.move.from) ?? '');
    return Response.json({ ok: true, value: out.value.answer });
  };
  /* THE OPERATOR LISTS A WAITING VERSION (`reviewVerdict`), as `braindog kennel review` does. */
  const list = (kind: 'usecase' | 'pack', id: string, version: string): void => {
    const out = reviewVerdict({ index, review }, { kind, id, version, verdict: 'list', reason: '' }, new Date('2026-10-15T10:00:00Z'));
    assert.ok(out.ok, JSON.stringify(out));
    if (out.value.index) index = out.value.index;
    if (out.value.review) review = out.value.review(review);
    if (out.value.move) files.set(out.value.move.to, files.get(out.value.move.from) ?? '');
  };
  return { fetcher, bodies, index: () => index, review: () => review, list };
}

test('the Kennel itself takes both, signed, as the key that signed them', async () => {
  const k = realKennel('p_person_juniper');
  const sign = signer();
  const usecase = await submitToKennel(k.fetcher, garden('1.0.0'), sign);
  assert.ok(usecase.ok, JSON.stringify(usecase));
  assert.equal(usecase.value.unsigned, undefined);
  const t = templateOf({ body: shelfPage, states: [], format: 1, primitives: 1 });
  const template = await submitToKennel(k.fetcher, t.text, sign);
  assert.ok(template.ok, JSON.stringify(template));
  assert.equal(template.value.unsigned, undefined);
  assert.ok(k.bodies.every((b) => b.signature));
});

test('an id this person published unsigned is published unsigned again, and the Kennel still holds it as theirs', async () => {
  /* Trusted by the operator. A first version still waits for review (lane H: it reaches everything new), so the operator
     lists it, and the next is not held behind its review. */
  const k = realKennel('p_person_juniper', true);
  const first = await submitToKennel(k.fetcher, garden('1.0.0'), async () => null);
  assert.ok(first.ok && first.value.unsigned === 'browser', JSON.stringify(first));
  k.list(first.value.kind, first.value.id, first.value.version);
  const next = await submitToKennel(k.fetcher, garden('1.0.1'), signer());
  assert.ok(next.ok, JSON.stringify(next));
  assert.equal(next.value.unsigned, 'earlier');
  assert.equal(k.bodies.length, 3);
});
