/**
 * Identity keys: every way an identifier arrives, said one way, and nothing wider.
 *
 * What is asserted is where folding stops as much as where it starts: Gmail's dots fold and another host's do not, a
 * public mail host is never an organisation's domain, and a payee's town and terminal number fall away while its name
 * stays.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isOrganisationAddress, keyFrom, keyOf, keysOf, parseFrom, registrable } from '../src/index.ts';

test('AN EMAIL IS LOWER-CASED, AND ONLY GMAIL FOLDS its dots and +tags, with googlemail as gmail', () => {
  assert.equal(keyOf('email', ' Ada@Example.COM '), 'email:ada@example.com');
  assert.equal(keyOf('email', 'Ada.Lovelace+work@gmail.com'), 'email:adalovelace@gmail.com');
  assert.equal(keyOf('email', 'ada.lovelace@googlemail.com'), 'email:adalovelace@gmail.com');
  assert.equal(keyOf('email', 'ada.lovelace+x@encore.example'), 'email:ada.lovelace+x@encore.example');
  assert.equal(keyOf('email', '"Ada" <ada@x.io>'), 'email:ada@x.io');
  assert.equal(keyOf('email', 'not an address'), null);
  assert.equal(keyOf('email', 'ada@localhost'), null);
});

test('GITHUB’S PRIVATE ADDRESS IS THE LOGIN, and a login is read from a handle, a mention or a profile address', () => {
  assert.equal(keyOf('email', '583231+Octo-Cat@users.noreply.github.com'), 'github:octo-cat');
  assert.equal(keyOf('email', 'octo-cat@users.noreply.github.com'), 'github:octo-cat');
  assert.equal(keyOf('github', '@Octo-Cat'), 'github:octo-cat');
  assert.equal(keyOf('github', 'https://github.com/octo-cat/'), 'github:octo-cat');
  assert.equal(keyOf('github', 'not a login'), null);
  assert.equal(keyFrom('GitHub:@Ada'), 'github:ada');
});

test('A PAYEE FOLDS ITS PROCESSOR, TOWN, NUMBERS, WEB SUFFIX AND SPACES, and keeps its name', () => {
  for (const said of ['GEIDEA*CHILLOUT 0423 CAIRO EG', 'Chill Out', 'CHILLOUT', 'PAYMOB-Chillout New Cairo', 'POS CHILLOUT 12', 'FAWRY*Chillout*'])
    assert.equal(keyOf('bank', said), 'bank:chillout', said);
  assert.equal(keyOf('bank', 'talabat.com'), 'bank:talabat');
  assert.equal(keyOf('bank', 'TALABAT'), 'bank:talabat');
  assert.equal(keyOf('bank', 'KASHIER*Vodafone Cash'), 'bank:vodafonecash');
  assert.notEqual(keyOf('bank', 'Chillout'), keyOf('bank', 'Chilis'));
  assert.equal(keyOf('bank', '   '), null);
});

test('A DOMAIN IS THE REGISTRABLE ONE, AND NEVER A PUBLIC MAIL HOST', () => {
  assert.equal(registrable('https://www.Encore.xyz/about'), 'encore.example');
  assert.equal(registrable('mail.brightloomit.com'), 'brightloomit.com');
  assert.equal(registrable('shop.example.co.uk'), 'example.co.uk');
  assert.equal(registrable('cib.com.eg'), 'cib.com.eg');
  assert.equal(registrable('ada@gmail.com'), null);
  assert.equal(keyOf('domain', 'proton.me'), null);
  assert.equal(keyOf('domain', 'outlook.com'), null);
  assert.equal(keyOf('domain', 'encore.example'), 'domain:encore.example');
});

test('A REMOTE IS host/owner/name, A FOLDER AN ABSOLUTE PATH, A PHONE E.164', () => {
  assert.equal(keyOf('remote', 'git@github.com:BakeGame/Bot.git'), 'remote:github.com/bakegame/bot');
  assert.equal(keyOf('remote', 'https://github.com/bakegame/bot'), 'remote:github.com/bakegame/bot');
  assert.equal(keyOf('remote', 'bot'), null);
  assert.equal(keyOf('folder', 'C:\\Repos\\roomy\\'), 'folder:c:/Repos/nook');
  assert.equal(keyOf('folder', '/Users/sam/Developer/braindog/'), 'folder:/Users/sam/Developer/braindog');
  assert.equal(keyOf('folder', 'braindog'), null);
  assert.equal(keyOf('phone', '+20 100 123 4567'), 'phone:+201001234567');
  assert.equal(keyOf('phone', '0020 100 123 4567'), 'phone:+201001234567');
  assert.equal(keyOf('phone', '0100 123 4567'), null, 'a number with no country code was guessed at');
  assert.equal(keyOf('discord', '@Ada'), 'discord:ada');
});

test('keysOf READS EVERY IDENTIFIER ONCE, in the order given', () => {
  assert.deepEqual(
    keysOf({ email: 'Ada@x.io', handles: ['github:ada', 'GitHub:@Ada'], keys: ['email:ada@x.io', 'bank:POS ADA 1'], domain: 'x.io' }),
    ['email:ada@x.io', 'github:ada', 'bank:ada', 'domain:x.io'],
  );
  assert.deepEqual(keysOf({}), []);
});

test('A From HEADER READS AS A NAME, AN ADDRESS AND A DOMAIN, and a shared inbox or a machine is an organisation', () => {
  assert.deepEqual(parseFrom('"Ada Lovelace" <Ada@Example.com>'), { name: 'Ada Lovelace', address: 'ada@example.com', domain: 'example.com' });
  assert.deepEqual(parseFrom('Ada <ada@x.io>'), { name: 'Ada', address: 'ada@x.io', domain: 'x.io' });
  assert.deepEqual(parseFrom('ada@x.io (Ada L)'), { name: 'Ada L', address: 'ada@x.io', domain: 'x.io' });
  assert.deepEqual(parseFrom('ada@x.io <ada@x.io>'), { name: null, address: 'ada@x.io', domain: 'x.io' });
  assert.equal(parseFrom('Ada'), null);
  for (const a of ['noreply@encore.example', 'no-reply@accounts.google.com', 'notifications@github.com', 'billing@hetzner.com', 'info@quartz.gg', 'noreply-1234@mail.x.io'])
    assert.equal(isOrganisationAddress(a), true, a);
  for (const a of ['ada@encore.example', '583231+octo@users.noreply.github.com', 'information.ada@x.io']) assert.equal(isOrganisationAddress(a), false, a);
});
