/**
 * What was said fits the link by the bytes the link writes, not by its characters (letter-link-51, use case 6 step 4).
 *
 * MEASURED BEFORE THIS FILE: the one rule was 1,000 characters. An Arabic letter is six bytes in a link, so 400
 * characters of Arabic went out as a link of some 4,000 bytes and 1,000 as one of 9,000, which a mail client or a
 * gateway cuts, and a cut link is a proof that does not open.
 *
 * A LONG SENTENCE KEEPS ITS START, at a word, and the pack says `cut: true` so the page can say the rest was left for
 * later. It is never refused for its alphabet, and it is still in no table and no log.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthResult } from '@braindog/ports';

import { createDirectory } from '../src/directory.ts';
import { SAID_IN_LINK, SAID_LINK_BYTES, saidFitted, saidRefused } from '../src/identity.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 9);
/** Arabic words of her own, joined until there are `chars` characters of them. */
const WORDS = ['أنا', 'مريم', 'وأدير', 'متجرا', 'صغيرا', 'للشموع', 'في', 'الإسكندرية', 'وأعمل', 'مصممة', 'حرة', 'وأنسى', 'الفواتير'];
const arabic = (chars: number): string => {
  let out = '';
  for (let i = 0; out.length < chars; i++) out += (i === 0 ? '' : ' ') + WORDS[i % WORDS.length]!;
  return out.slice(0, chars).trimEnd();
};
const packOf = (said: string): string => JSON.stringify({ said, currency: 'EGP' });

function setup() {
  const sql = openSqlite();
  const logged: unknown[] = [];
  const d = createDirectory(sql, fixedClock(NOW), { mac: new Uint8Array(32).fill(5), magic: true, log: (line: unknown) => logged.push(line) } as never);
  return { sql, d, logged };
}

let seq = 0;
const start = (d: ReturnType<typeof setup>['d'], said: string) =>
  d.auth({ flow: 'signup.start', email: `mariam${++seq}@example.com`, slug: `shumou-${seq}`, ip: `203.0.113.${seq}`, checked: true, said } as never) as Promise<AuthResult>;

/** The mailed link's two halves: the proof, and what follows `&said=` exactly as the link writes it. */
const linkOf = (out: AuthResult): { token: string; written: string } => {
  assert.equal(out.status, 200, JSON.stringify(out));
  const link = out.status === 200 ? ((out.mail as { link?: string } | undefined)?.link ?? '') : '';
  const at = link.indexOf('&said=');
  return at === -1 ? { token: link, written: '' } : { token: link.slice(0, at), written: link.slice(at + '&said='.length) };
};

test('400 CHARACTERS OF ARABIC ARE NEVER REFUSED, and the link they ride in stays inside its bytes', async () => {
  const { d } = setup();
  const said = arabic(400);
  assert.equal(said.length <= 400 && said.length > 380, true);
  assert.equal(saidRefused(packOf(said)), null);
  assert.ok(encodeURIComponent(packOf(said)).length > SAID_LINK_BYTES, 'whole, it would write longer than a link carries');
  const { token, written } = linkOf(await start(d, packOf(said)));
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(written.length > 0 && written.length <= SAID_LINK_BYTES, `the link wrote ${String(written.length)} bytes of it`);
  /* THE PAGE'S READING: a pack still, her sentence's start to a whole word, its answer kept, and the word that says so. */
  const read = JSON.parse(decodeURIComponent(written)) as { said: string; currency: string; cut?: boolean };
  assert.equal(read.currency, 'EGP');
  assert.equal(read.cut, true);
  assert.ok(read.said.length > 100, 'most of a link is hers');
  assert.ok(said.startsWith(read.said) && /\s/u.test(said[read.said.length] ?? ''), 'cut between words, not inside one');
});

test('THE MOST ANYBODY MAY SEND, 1,000 CHARACTERS OF ARABIC, IS CUT BY BYTES AND MAILED', async () => {
  const { d } = setup();
  const said = arabic(SAID_IN_LINK);
  assert.equal(said.length <= SAID_IN_LINK, true);
  const { written } = linkOf(await start(d, said));
  assert.ok(written.length > SAID_LINK_BYTES / 2 && written.length <= SAID_LINK_BYTES);
  assert.ok(said.startsWith(decodeURIComponent(written)), 'plain words keep their start');
});

test('A SENTENCE THAT FITS IS CARRIED WHOLE, with no word about a cut', async () => {
  const { d } = setup();
  const said = arabic(120);
  const { written } = linkOf(await start(d, packOf(said)));
  assert.deepEqual(JSON.parse(decodeURIComponent(written)), { said, currency: 'EGP' });
  assert.deepEqual(saidFitted('a'.repeat(SAID_IN_LINK)), { said: 'a'.repeat(SAID_IN_LINK), cut: false }, 'a Latin letter is one byte');
});

test('NEVER HALF A CHARACTER, and a pack too long with no sentence carries nothing', () => {
  /* Each of these is two halves in a string and twelve bytes in a link, with no space to cut at. */
  const faces = '😀'.repeat(400);
  const fitted = saidFitted(faces);
  assert.equal(fitted.cut, true);
  assert.ok(encodeURIComponent(fitted.said).length <= SAID_LINK_BYTES);
  assert.equal(faces.startsWith(fitted.said) && fitted.said.length % 2 === 0, true);
  /* WRITING WITH ONE SPACE IN IT keeps its start to the character, not the two characters before that space. */
  const chinese = `我是 ${'蜡烛店的设计师'.repeat(60)}`;
  const kept = saidFitted(chinese);
  assert.ok(chinese.startsWith(kept.said) && encodeURIComponent(kept.said).length > SAID_LINK_BYTES * 0.9, `kept ${String(kept.said.length)} characters`);
  const heavy = JSON.stringify({ said: 'candles', usecase: arabic(600) });
  assert.deepEqual(saidFitted(heavy), { said: '', cut: true });
});

test('A CUT SENTENCE IS STILL IN NO TABLE AND NO LOG LINE', async () => {
  const { sql, d, logged } = setup();
  linkOf(await start(d, packOf(arabic(400))));
  const tables = sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
  const all = tables.map((t) => JSON.stringify(sql.all(`SELECT * FROM "${t.name}"`))).join('\n');
  for (const where of [all, JSON.stringify(logged)]) assert.equal(where.includes('الإسكندرية') || where.includes(encodeURIComponent('الإسكندرية')), false);
});
