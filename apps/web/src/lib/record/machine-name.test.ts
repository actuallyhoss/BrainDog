/**
 * A MACHINE AS A PERSON SAYS IT (`machine-name.ts`): the kind and its size, never the host name, a chip or a serial; and
 * the owner's words back only where two machines would read the same.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { machineSaid } from './machine-name.ts';

test('A MAC IS ITS KIND AND SIZE, without the owner, the chip or the domain', () => {
  assert.equal(machineSaid('harbour-macbook-pro-16-m4-max'), 'MacBook Pro 16');
  assert.equal(machineSaid('Maras-MacBook-Pro.local'), 'MacBook Pro');
  assert.equal(machineSaid("Harbour's MacBook Air"), 'MacBook Air');
  assert.equal(machineSaid('kiln-mbp'), 'MacBook Pro');
  assert.equal(machineSaid('studio-mac-mini'), 'Mac mini');
});

test('WINDOWS IS A WINDOWS PC OR LAPTOP, its serial never said', () => {
  assert.equal(machineSaid('DESKTOP-7KQ2M9R'), 'Windows PC');
  assert.equal(machineSaid('DESKTOP-7KQ2M9R-windows-tower'), 'Windows PC');
  assert.equal(machineSaid('LAPTOP-AB12CD3'), 'Windows laptop');
});

test('LINUX IS ITS SYSTEM AND ITS OWN WORDS, without the release', () => {
  assert.equal(machineSaid('build-box-ubuntu-24-04-lts'), 'Ubuntu build box');
  assert.equal(machineSaid('debian'), 'Debian machine');
});

test('ANY OTHER NAME IS ITS WORDS, capitalised once', () => {
  assert.equal(machineSaid('studio-desktop'), 'Studio desktop');
  assert.equal(machineSaid('raspberrypi'), 'Raspberry Pi');
});

test('TWO THAT WOULD READ THE SAME KEEP THE WORDS BEFORE THEIR KIND', () => {
  const among = ['kiln-mbp', 'harbour-macbook-pro'];
  assert.equal(machineSaid('kiln-mbp', among), 'Kiln MacBook Pro');
  assert.equal(machineSaid('harbour-macbook-pro', among), 'Harbour MacBook Pro');
  assert.equal(machineSaid('harbour-macbook-pro-16-m4-max', [...among, 'harbour-macbook-pro-16-m4-max']), 'MacBook Pro 16');
});
