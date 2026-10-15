/**
 * The line above the passkeys in Settings: how many, on which kinds of device, and whether losing one would lock the
 * person out. Labels are the words `platformLabel` writes, and a few a person might rename one to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindOf, passkeysSaid } from './signing-in.ts';

test('the labels platformLabel writes each read as their kind of device, and "Passkey" as none', () => {
  assert.equal(kindOf('Mac'), 'computer');
  assert.equal(kindOf('Windows Hello'), 'computer');
  assert.equal(kindOf('Chromebook'), 'computer');
  assert.equal(kindOf('iPhone'), 'phone');
  assert.equal(kindOf('Android'), 'phone');
  assert.equal(kindOf('iPad'), 'tablet');
  assert.equal(kindOf('Passkey'), null);
  assert.equal(kindOf(null), null);
});

test('a renamed passkey is read by the words a person types', () => {
  assert.equal(kindOf('Work laptop'), 'computer');
  assert.equal(kindOf('MacBook Pro'), 'computer');
  assert.equal(kindOf("Wren's phone"), 'phone');
  assert.equal(kindOf('Kitchen tablet'), 'tablet');
  assert.equal(kindOf('Yubi'), null);
});

test('two on a computer and a phone: sign in if one is lost, and not short', () => {
  const said = passkeysSaid([{ label: 'Mac', created_at: '2026-09-01T10:00:00Z' }, { label: 'iPhone' }]);
  assert.deepEqual(said, { line: '2 passkeys: on a computer and on a phone. You can sign in if you lose one.', short: false });
});

test('one passkey is short and asks for a second on the other kind of device', () => {
  assert.deepEqual(passkeysSaid([{ label: 'Mac' }]), {
    line: 'One passkey, on a computer. Add a second, on your phone, so losing that device does not lock you out.',
    short: true,
  });
  assert.equal(passkeysSaid([{ label: 'Android' }]).line, 'One passkey, on a phone. Add a second, on a computer, so losing that device does not lock you out.');
  assert.equal(passkeysSaid([{ label: null }]).line, 'One passkey. Add a second, on your phone, so losing one device does not lock you out.');
});

test('none is short and says what to add', () => {
  const said = passkeysSaid([]);
  assert.equal(said.short, true);
  assert.match(said.line, /^No passkey yet\./u);
});

test('all on one kind says both or all, and labels naming nothing give only the count', () => {
  assert.equal(passkeysSaid([{ label: 'Mac' }, { label: 'Windows Hello' }]).line, '2 passkeys, both on computers. You can sign in if you lose one.');
  assert.equal(passkeysSaid([{ label: 'iPhone' }, { label: 'Android' }, { label: 'Pixel' }]).line, '3 passkeys, all on phones. You can sign in if you lose one.');
  assert.equal(passkeysSaid([{ label: 'Passkey' }, { label: null }]).line, '2 passkeys. You can sign in if you lose one.');
});

test('one kind named beside one that names nothing never places the unnamed one on that kind', () => {
  assert.equal(passkeysSaid([{ label: 'Mac' }, { label: 'Passkey' }]).line, '2 passkeys, one on a computer. You can sign in if you lose one.');
  assert.equal(passkeysSaid([{ label: 'iPhone' }, { label: 'Pixel' }, { label: null }]).line, '3 passkeys, 2 on phones. You can sign in if you lose one.');
});

test('three kinds are listed in order, and one that names nothing still counts', () => {
  const said = passkeysSaid([{ label: 'iPad' }, { label: 'Passkey' }, { label: 'iPhone' }, { label: 'Mac' }]);
  assert.equal(said.line, '4 passkeys: on a computer, on a phone and on a tablet. You can sign in if you lose one.');
  assert.equal(said.short, false);
});

test('no line has an em dash', () => {
  for (const keys of [[], [{ label: 'Mac' }], [{ label: 'Mac' }, { label: 'iPhone' }]]) assert.doesNotMatch(passkeysSaid(keys).line, /—/u);
});
