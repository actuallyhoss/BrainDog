/**
 * Taking your own add-on out of the store: which listings are yours, and a yank that is signed only for a key's own.
 * The store's index and its yank door are a function standing in for the network; the add-ons are invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { minesOf, personOf, unpublish, unpublishWords } from './unpublish.ts';

const entry = (id: string, publisher: { kind: string; id: string; name: string }, versions: { version: string; yanked?: object }[]) => ({
  kind: 'pack',
  id,
  title: id.toUpperCase(),
  summary: `${id} summary`,
  publisher,
  versions,
});

const INDEX = {
  entries: [
    entry('tide-table', { kind: 'key', id: 'key-mine', name: 'Me' }, [{ version: '1.1.0' }, { version: '1.0.0', yanked: { reason: 'old', at: 'x' } }]),
    entry('rota', { kind: 'person', id: 'p_me', name: 'Me' }, [{ version: '1.0.0' }]),
    entry('someone-elses', { kind: 'key', id: 'key-other', name: 'Other' }, [{ version: '1.0.0' }]),
    entry('gone', { kind: 'key', id: 'key-mine', name: 'Me' }, [{ version: '1.0.0', yanked: { reason: 'old', at: 'x' } }]),
    { ...entry('use', { kind: 'key', id: 'key-mine', name: 'Me' }, [{ version: '1.0.0' }]), kind: 'usecase' },
  ],
};

test('only add-ons your key or you published are yours, with the versions still offered', () => {
  const mine = minesOf(INDEX, { keyId: 'key-mine', personId: 'p_me' });
  assert.deepEqual(
    mine.map((m) => [m.id, m.versions, m.by]),
    [
      ['tide-table', ['1.1.0'], 'key'],
      ['rota', ['1.0.0'], 'person'],
    ],
  );
  assert.deepEqual(minesOf(INDEX, { keyId: null, personId: null }), []);
  assert.deepEqual(minesOf({ entries: 'no' }, { keyId: 'key-mine', personId: null }), []);
});

test('whoami is read for a person under the usual names and nothing else', () => {
  assert.equal(personOf({ person: 'p_me' }), 'p_me');
  assert.equal(personOf({ principal: { id: 'p_you' } }), 'p_you');
  assert.equal(personOf({ person: '' }), null);
  assert.equal(personOf('p_me'), null);
});

test('every offered version is taken back, signed for a key listing and plain for a person one', async () => {
  const sent: { version: string; signature?: unknown; reason: string }[] = [];
  const fetcher = async (_url: string, init?: RequestInit): Promise<Response> => {
    sent.push(JSON.parse(String(init?.body)) as never);
    return new Response(JSON.stringify({ ok: true, value: {} }));
  };
  const sign = async () => ({ alg: 'ed25519', key_id: 'key-mine', public_key: 'p', sig: 's', signed_at: 't' });
  const [tide, rota] = minesOf(INDEX, { keyId: 'key-mine', personId: 'p_me' });
  assert.deepEqual(await unpublish(fetcher, { ...tide!, versions: ['1.1.0', '1.2.0'] }, sign), { ok: true });
  assert.deepEqual(
    sent.map((s) => [s.version, s.signature !== undefined, s.reason]),
    [
      ['1.1.0', true, unpublishWords.reason],
      ['1.2.0', true, unpublishWords.reason],
    ],
  );
  sent.length = 0;
  assert.deepEqual(await unpublish(fetcher, rota!, sign), { ok: true });
  assert.equal(sent[0]!.signature, undefined, 'a person listing is held to the person');
});

test('a refusal stops it and is said as the store wrote it, and an unreachable store says so', async () => {
  let calls = 0;
  const refusing = async (): Promise<Response> => {
    calls += 1;
    return new Response(JSON.stringify({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'That version belongs to another publisher.' } }), { status: 403 });
  };
  const one = { id: 'rota', title: 'ROTA', summary: '', versions: ['1.0.0', '1.0.1'], by: 'person' as const };
  assert.deepEqual(await unpublish(refusing, one, async () => null), { ok: false, fix: 'That version belongs to another publisher.' });
  assert.equal(calls, 1);
  const down = async (): Promise<Response> => {
    throw new Error('offline');
  };
  assert.deepEqual(await unpublish(down, one, async () => null), { ok: false, fix: unpublishWords.unreached });
});
