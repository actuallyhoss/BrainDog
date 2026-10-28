/**
 * Identity keys: every way an identifier arrives, said one way, and nothing wider.
 *
 * What is asserted is where folding stops as much as where it starts: Gmail's dots fold and another host's do not, a
 * public mail host is never an organisation's domain, and a payee's town and terminal number fall away while its name
 * stays.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isOrganisationAddress, isPublicMail, keyFrom, keyOf, keysOf, parseFrom, registrable } from '../src/index.ts';
import { isMachineIdentity, keyOfAny } from '../src/identity-keys.ts';

test('AN EMAIL IS LOWER-CASED, AND ONLY GMAIL FOLDS its dots and +tags, with googlemail as gmail', () => {
  assert.equal(keyOf('email', ' Ada@Example.COM '), 'email:ada@example.com');
  assert.equal(keyOf('email', 'Ada.Lovelace+work@gmail.com'), 'email:adalovelace@gmail.com');
  assert.equal(keyOf('email', 'ada.lovelace@googlemail.com'), 'email:adalovelace@gmail.com');
  assert.equal(keyOf('email', 'ada.lovelace+x@lanternfish.example'), 'email:ada.lovelace+x@lanternfish.example');
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
  for (const said of ['GEIDEA*CHILLOUT 0418 CAIRO EG', 'Chill Out', 'CHILLOUT', 'PAYMOB-Chillout New Cairo', 'POS CHILLOUT 12', 'FAWRY*Chillout*'])
    assert.equal(keyOf('bank', said), 'bank:chillout', said);
  assert.equal(keyOf('bank', 'talabat.com'), 'bank:talabat');
  assert.equal(keyOf('bank', 'TALABAT'), 'bank:talabat');
  assert.equal(keyOf('bank', 'KASHIER*Vodafone Cash'), 'bank:vodafonecash');
  assert.notEqual(keyOf('bank', 'Chillout'), keyOf('bank', 'Chilis'));
  assert.equal(keyOf('bank', '   '), null);
});

test('A DOMAIN IS THE REGISTRABLE ONE, AND NEVER A PUBLIC MAIL HOST', () => {
  assert.equal(registrable('https://www.Lanternfish.example/about'), 'lanternfish.example');
  assert.equal(registrable('mail.example.com'), 'example.com');
  assert.equal(registrable('shop.example.co.uk'), 'example.co.uk');
  assert.equal(registrable('cib.com.eg'), 'cib.com.eg');
  assert.equal(registrable('ada@gmail.com'), null);
  assert.equal(keyOf('domain', 'proton.me'), null);
  assert.equal(keyOf('domain', 'outlook.com'), null);
  assert.equal(keyOf('domain', 'lanternfish.example'), 'domain:lanternfish.example');
});

test('A REMOTE IS host/owner/name, A FOLDER AN ABSOLUTE PATH, A PHONE E.164', () => {
  assert.equal(keyOf('remote', 'git@github.com:OxbowGame/Bot.git'), 'remote:github.com/oxbowgame/bot');
  assert.equal(keyOf('remote', 'https://github.com/oxbowgame/bot'), 'remote:github.com/oxbowgame/bot');
  assert.equal(keyOf('remote', 'bot'), null);
  assert.equal(keyOf('folder', 'C:\\Repos\\nook\\'), 'folder:c:/Repos/nook');
  assert.equal(keyOf('folder', '/Users/mara/Developer/braindog/'), 'folder:/Users/mara/Developer/braindog');
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
  for (const a of ['noreply@lanternfish.example', 'no-reply@accounts.google.com', 'notifications@github.com', 'billing@hetzner.com', 'info@harbour.example', 'noreply-1234@mail.x.io'])
    assert.equal(isOrganisationAddress(a), true, a);
  for (const a of ['ada@lanternfish.example', '583231+octo@users.noreply.github.com', 'information.ada@x.io']) assert.equal(isOrganisationAddress(a), false, a);
});

test('A PAYEE KEEPS A WORD THAT NAMES IT: two cafés or two pharmacies are never one key', () => {
  assert.notEqual(keyOf('bank', 'Pharmacy Cairo'), keyOf('bank', 'Pharmacy Giza'));
  assert.equal(keyOf('bank', 'PHARMACY CAIRO EG'), 'bank:pharmacycairo');
  assert.equal(keyOf('bank', 'Pharmacy Giza'), 'bank:pharmacygiza');
  assert.notEqual(keyOf('bank', 'CAFE 22'), keyOf('bank', 'CAFE 7'));
  assert.equal(keyOf('bank', 'CAFE 22'), 'bank:cafe22');
  assert.equal(keyOf('bank', 'SUPERMARKET 0423 NEW CAIRO EG'), 'bank:supermarket0423');
  assert.equal(keyOf('bank', 'The Coffee Shop 4'), 'bank:thecoffeeshop4');
  /* A NAMED SHOP STILL LOSES ITS TOWN AND TERMINAL, however the processor spelled it. */
  for (const said of ['GEIDEA*EL EZABY PHARMACY 0423 CAIRO EG', 'El Ezaby Pharmacy', 'PAYMOB-El Ezaby Pharmacy New Cairo', 'POS EL EZABY PHARMACY 12'])
    assert.equal(keyOf('bank', said), 'bank:elezabypharmacy', said);
  for (const said of ['GEIDEA*PHARMACY CAIRO', 'Pharmacy Cairo', 'FAWRY*Pharmacy Cairo EG', 'TST* PHARMACY CAIRO'])
    assert.equal(keyOf('bank', said), 'bank:pharmacycairo', said);
  assert.equal(keyOf('bank', 'SQ *BRIDGE STREET COFFEE LONDON GB'), 'bank:bridgestreetcoffee');
  assert.equal(keyOf('bank', 'SP * Cedar Lane Bakery'), 'bank:cedarlanebakery');
  assert.equal(keyOf('bank', 'CAFE'), 'bank:cafe');
});

test('A PUBLIC MAIL HOST IN ANY COUNTRY, A BROADBAND PROVIDER’S MAIL OR A BARE PLATFORM IS NOBODY’S DOMAIN', () => {
  for (const host of ['yahoo.com.eg', 'btinternet.com', 'mail.ru', 'hotmail.fr', 'outlook.sa', 'live.co.uk', 'web.de', 'orange.fr', 'naver.com', 'icloud.com', 'privaterelay.appleid.com', 'link.net'])
    assert.equal(registrable(host), null, host);
  assert.equal(registrable('ahmed.saleh@yahoo.com.eg'), null);
  for (const host of ['github.io', 'vercel.app', 'pages.dev', 'co.uk', 'com.eg', 'com.au', '192.168.1.10', 'nas.local', 'printer.lan'])
    assert.equal(registrable(host), null, host);
  assert.equal(registrable('ada.github.io'), 'ada.github.io');
  assert.equal(registrable('https://lanternfish-git-main-mara.vercel.app/login'), 'lanternfish-git-main-mara.vercel.app');
  assert.equal(registrable('api.svc.up.railway.app'), 'svc.up.railway.app');
  assert.equal(registrable('mail.cibeg.com.eg'), 'cibeg.com.eg');
  assert.equal(registrable('portal.unsw.edu.au'), 'unsw.edu.au');
  assert.equal(registrable('www.tesco.com.au'), 'tesco.com.au');
  assert.equal(registrable('shop.noon.co.ae'), 'noon.co.ae');
  assert.equal(registrable('stc.com.sa'), 'stc.com.sa');
  assert.equal(registrable('vercel.com'), 'vercel.com');
  assert.equal(isPublicMail('Yahoo.com.eg'), true);
  assert.equal(isPublicMail('vercel.app'), true);
  assert.equal(isPublicMail('lanternfish.example'), false);
  assert.equal(keyOf('domain', 'btinternet.com'), null);
});

test('A SHARED INBOX OR A MACHINE IS AN ORGANISATION SPEAKING, and its address is the organisation’s key', () => {
  for (const a of [
    'support@vodafone.com.eg', 'Support+EG@talabat.com', 'customer.service@cibeg.com', 'sales-team@lanternfish.example', 'info2@hetzner.com',
    'enquiries@bridgestreetcoffee.co.uk', 'no_reply@instapay.eg', 'do.not.reply@hsbc.com.eg', 'MAILER-DAEMON@googlemail.com',
    'bounce-mc.us5_123.456-ada=x.io@mail189.suw121.mcdlv.net', 'bounces+12345-abcd@em.stripe.com', 'renovate-bot@whitesourcesoftware.com',
    'notifications+abc123@github.com', 'alerts@hsbc.example', 'postmaster@lanternfish.example', '49699333+dependabot[bot]@users.noreply.github.com',
  ])
    assert.equal(isOrganisationAddress(a), true, a);
  for (const a of ['ada@lanternfish.example', 'abbot@x.io', 'botond.nagy@x.hu', 'ada.support@x.io', 'information.ada@x.io', '583231+octo@users.noreply.github.com', 'ada_acme@users.noreply.github.com'])
    assert.equal(isOrganisationAddress(a), false, a);
  assert.equal(keyOf('email', 'Support@Vodafone.com.eg'), 'email:support@vodafone.com.eg');
});

test('A MACHINE IS NOBODY: bots, no-reply senders, CI and a laptop’s own host name, but never a shared inbox or a person', () => {
  const machines: Parameters<typeof isMachineIdentity>[0][] = [
    { name: 'dependabot[bot]', email: '49699333+dependabot[bot]@users.noreply.github.com' },
    { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' },
    { name: 'Renovate Bot', email: 'bot@renovateapp.com' },
    { name: 'semantic-release-bot', email: 'semantic-release-bot@martynus.net' },
    { name: 'GitHub', email: 'noreply@github.com' },
    { name: 'Ubuntu', email: 'ubuntu@ip-172-31-5-12.eu-west-1.compute.internal' },
    { name: 'root', email: 'root@localhost' },
    { name: 'Ada Lovelace', email: 'ada@Adas-MacBook-Pro.local' },
    { name: 'Jenkins Schema Sync', email: 'jenkins-sync@pellucid.example' },
    { name: 'Pellucid Repos', email: 'repos@pellucid.example' },
    { name: 'Mail Delivery Subsystem', email: 'mailer-daemon@googlemail.com' },
    { handle: 'github:vercel[bot]' },
    { handle: '@renovate-bot' },
    { email: 'no-reply@accounts.google.com' },
  ];
  for (const m of machines) assert.equal(isMachineIdentity(m), true, JSON.stringify(m));
  const people: Parameters<typeof isMachineIdentity>[0][] = [
    { name: 'Ada Lovelace', email: 'ada@lanternfish.example' },
    { name: 'Octo Cat', email: '583231+octo-cat@users.noreply.github.com' },
    { name: 'Abbot Kinney', email: 'abbot@kinney.io' },
    { name: 'Support', email: 'support@hetzner.com' },
    { name: 'Mara Sync', email: 'mara.sync@gmail.com' },
    { handle: 'github:ada' },
    {},
  ];
  for (const p of people) assert.equal(isMachineIdentity(p), false, JSON.stringify(p));
});

test('keyOfAny READS AN ADDRESS, A KEY OR A HANDLE the way the record does, for a door outside the kernel', () => {
  assert.equal(keyOfAny('Ada.Lovelace+cli@gmail.com'), 'email:adalovelace@gmail.com');
  assert.equal(keyOfAny('mailto:Ada@Lanternfish.example'), 'email:ada@lanternfish.example');
  assert.equal(keyOfAny('"Ada" <ada@x.io>'), 'email:ada@x.io');
  assert.equal(keyOfAny('email:Ada@X.io'), 'email:ada@x.io');
  assert.equal(keyOfAny('github:@Octo-Cat'), 'github:octo-cat');
  assert.equal(keyOfAny('583231+Octo-Cat@users.noreply.github.com'), 'github:octo-cat');
  assert.equal(keyOfAny('ada_acme@users.noreply.github.com'), 'github:ada_acme');
  assert.equal(keyOfAny('49699333+dependabot[bot]@users.noreply.github.com'), 'github:dependabot[bot]');
  assert.equal(keyOfAny('discord:Ada'), 'discord:ada');
  assert.equal(keyOfAny('bank:GEIDEA*CHILLOUT 0418 CAIRO EG'), 'bank:chillout');
  assert.equal(keyOfAny('Ada Lovelace'), null);
  assert.equal(keyOfAny(''), null);
  /* A DOTTED LOGIN IS NO LOGIN, so the address it came in stays an address and is never sent as a malformed handle. */
  assert.equal(keyOfAny('123+ada.l@users.noreply.github.com'), 'email:123+ada.l@users.noreply.github.com');
});

test('AN EXAMPLE DOMAIN STANDS FOR A REAL ONE, a +tag is the person’s own filing, and a word a business is named with is no bot', () => {
  /* `.example` and `.test` are how a real organisation's domain is written in an example, so they register as one. */
  assert.equal(registrable('sara@acme.example'), 'acme.example');
  assert.equal(keyOf('domain', 'quill.test'), 'domain:quill.test');
  assert.equal(isMachineIdentity({ name: 'Sara Okafor', email: 'sara@acme.example' }), false);
  for (const a of ['ada+alerts@gmail.com', 'mara+bot@gmail.com', 'ada+notifications@lanternfish.example']) {
    assert.equal(isOrganisationAddress(a), false, a);
    assert.equal(isMachineIdentity({ name: 'Ada', email: a }), false, a);
  }
  assert.equal(isMachineIdentity({ name: 'Renovate Homes', email: 'jo@renovatehomes.co.uk' }), false);
  assert.equal(isMachineIdentity({ name: 'renovate', email: 'renovate@whitesourcesoftware.com' }), true);
  assert.equal(keyOfAny('Ada: Founder <ada@lanternfish.example>'), 'email:ada@lanternfish.example');
});

test('isMachineIdentity KNOWS EVERY MACHINE THE CLI’S HARVEST LEAVES OUT, so the harvest can use it in place of its own', () => {
  for (const [name, email] of [
    ['renovate[bot]', '29139614+renovate[bot]@users.noreply.github.com'],
    ['Release Bot', 'release-bot@acme.example'],
    ['Acme CI', 'ci@acme.example'],
    ['GitLab Runner', 'gitlab-runner@acme.example'],
    ['Jenkins', 'jenkins@acme.example'],
    ['Jenkins Schema Sync', 'jenkins@pellucid.example'],
    ['Docs Mirror', 'mirror@acme.example'],
    ['ec2-user', 'ec2-user@ip-10-0-0-1.example'],
    ['root', 'root@build.example'],
    ['Claude', 'noreply@anthropic.com'],
    ['Deploy', 'deploy@acme.example'],
    ['Somebody', 'somebody@macbook.local'],
    ['Somebody', 'somebody@localhost'],
  ])
    assert.equal(isMachineIdentity({ name, email }), true, `${name!} <${email!}>`);
  for (const [name, email] of [
    ['Teodor Vance', 'teodor@lanternfish.example'],
    ['Ada Sync', 'ada.sync@gmail.com'],
    ['Sarah Jenkins', 'sarah.jenkins@acme.example'],
    ['Ada Talbot', 'talbot@acme.example'],
    ['Travis Okoye', 'travis@acme.example'],
    ['Ines Duarte', 'inesd@users.noreply.github.com'],
  ])
    assert.equal(isMachineIdentity({ name, email }), false, `${name!} <${email!}>`);
});

test('A TEAM’S JOB ON GITHUB’S PRIVATE ADDRESS IS A MACHINE, a coding agent is one, and the surnames Ci and Runner are people', () => {
  for (const [name, email] of [
    ['Pellucid Repos', '204816377+PellucidGit@users.noreply.github.com'],
    ['Docs Sync', 'docs-sync@users.noreply.github.com'],
    ['Claude', 'claude@acme.example'],
    ['Claude Opus 5.5 (1M context)', 'claude@acme.example'],
    ['Cursor Agent', 'cursoragent@cursor.com'],
    ['Copilot', '198982749+Copilot@users.noreply.github.com'],
    ['Codex', 'codex@openai.example'],
    ['Gemini Code Assist', 'gemini@acme.example'],
    ['Devin AI', 'devin@cognition.example'],
    ['Ada Lovelace (aider)', 'ada@lanternfish.example'],
    ['Acme CI', 'ci@acme.example'],
    ['Acme CI/CD', 'jobs@acme.example'],
    ['GitLab Runner', 'gitlab-runner@acme.example'],
    ['Self-hosted Runner', 'jobs@acme.example'],
  ])
    assert.equal(isMachineIdentity({ name, email }), true, `${name!} <${email!}>`);
  for (const [name, email] of [
    ['Li Ci', 'li.ci@acme.example'],
    ['Jane Runner', 'jane@acme.example'],
    ['Claude Monet', 'claude@giverny.example'],
    ['Devin Park', 'devin@acme.example'],
    ['Ada Sync', 'ada.sync@gmail.com'],
    ['Octo Cat', '583231+octo-cat@users.noreply.github.com'],
  ])
    assert.equal(isMachineIdentity({ name, email }), false, `${name!} <${email!}>`);
});
