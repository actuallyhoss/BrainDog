import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { hostOf, readReads, readsSaid, setReads, words, type Host } from './slash-reads.ts';
import type { SlashClient } from './slash.ts';

const HOSTS: Host[] = ['included', 'key', 'own', 'unknown'];

/* THE CONSENT RULE AS A PERSON READS IT: what is sent, to whom, and what never is, in both states of the
   switch, because a person who turned it off still asks Slash things himself. */
test('the paragraph names what is sent, to whom, and what never is, on and off', () => {
  for (const on of [true, false]) {
    for (const host of HOSTS) {
      const said = readsSaid({ on }, host);
      assert.match(said, /only the fields (a|that) job needs/u, said);
      assert.match(said, /sealed field/u, said);
      assert.match(said, /\bkey\b/u, said);
      assert.match(said, /contents of a file/u, said);
      assert.ok(said.includes(words.to[host]), said);
    }
  }
  assert.match(readsSaid({ on: true }, 'included'), /the model BrainDog runs/u);
  assert.match(readsSaid({ on: true }, 'key'), /your own provider, on your key/u);
  assert.match(readsSaid({ on: true }, 'own'), /the endpoint you set up/u);
});

test('on and off are said differently, and off says the rules do the work and his own ask still goes', () => {
  const on = readsSaid({ on: true }, 'included');
  const off = readsSaid({ on: false }, 'included');
  assert.notEqual(on, off);
  assert.ok(on.startsWith(words.on), on);
  assert.ok(off.startsWith(words.off), off);
  assert.match(off, /rules/u);
  assert.match(off, /ask(s)? it yourself|you ask/u);
});

test('a host with no model says nothing is sent, and never names a model it does not have', () => {
  for (const on of [true, false]) {
    const said = readsSaid({ on }, 'none');
    assert.match(said, /no model/iu, said);
    assert.match(said, /nothing is sent/u, said);
    assert.doesNotMatch(said, /the model BrainDog runs|your own provider/u, said);
  }
});

test('whom it goes to is read from what the host says of itself', () => {
  assert.equal(hostOf(false), 'none');
  assert.equal(hostOf(false, 'a'), 'none');
  assert.equal(hostOf(true), 'unknown');
  assert.equal(hostOf(true, 'a'), 'included');
  assert.equal(hostOf(true, 'b'), 'key');
  assert.equal(hostOf(true, 'byo'), 'own');
  assert.equal(hostOf(true, 'z'), 'unknown');
});

test('every line is plain: no dash as punctuation, no id, and none of the words a person never says', () => {
  const lines: string[] = [];
  for (const w of Object.values(words)) {
    if (typeof w === 'string') lines.push(w);
    else lines.push(...Object.values(w));
  }
  for (const on of [true, false]) for (const host of [...HOSTS, 'none' as const]) lines.push(readsSaid({ on }, host));
  for (const line of lines) {
    assert.doesNotMatch(line, /—|–| - /u, line);
    assert.doesNotMatch(line, /\b(row|rows|list item|entity|entities|pref|slashReads|slash\.reads)\b/u, line);
    assert.doesNotMatch(line, /\b[0-9A-HJKMNP-TV-Z]{26}\b/u, line);
  }
});

test('the read and the switch both call slashReads, and the switch sends only the choice', async () => {
  const sent: unknown[] = [];
  const c: SlashClient = { call: async (name, args) => (sent.push([name, args]), { ok: true, value: { on: false } }) as never };
  assert.deepEqual(await readReads(c), { ok: true, reads: { on: false } });
  assert.deepEqual(await setReads(c, false), { ok: true, reads: { on: false }, said: words.saidOff });
  assert.deepEqual(sent, [['slashReads', {}], ['slashReads', { on: false }]]);

  const on: SlashClient = { call: async () => ({ ok: true, value: { on: true } }) as never };
  assert.deepEqual(await setReads(on, true), { ok: true, reads: { on: true }, said: words.saidOn });
});

test('a refusal is said in the record’s own words, and a host with no such call is nothing drawn rather than a throw', async () => {
  const refused: SlashClient = { call: async () => ({ ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this in the app.' } }) as never };
  assert.deepEqual(await setReads(refused, true), { ok: false, fix: 'Open this in the app.' });
  assert.deepEqual(await readReads(refused), { ok: false, fix: 'Open this in the app.' });

  const none: SlashClient = { call: async () => Promise.reject(new Error('ROUTE_UNKNOWN')) };
  assert.deepEqual(await readReads(none), { ok: false, fix: words.unreached });
  assert.deepEqual(await setReads(none, false), { ok: false, fix: words.unreached });

  /* A VALUE THAT IS NOT THE SWITCH, as an older host might answer, is not drawn as "on". */
  const odd: SlashClient = { call: async () => ({ ok: true, value: null }) as never };
  assert.deepEqual(await readReads(odd), { ok: false, fix: words.unreached });
});

/* THE DRAWING, READ AS TEXT (no browser): one switch with its name and its paragraph, beside the daily look. */
test('the tile draws the one shared switch named and described, and Settings draws it under the daily look', () => {
  const tile = readFileSync(new URL('../ui/SlashReads.svelte', import.meta.url), 'utf8');
  assert.match(tile, /role="switch"/u);
  assert.match(tile, /aria-checked=\{on\}/u);
  assert.match(tile, /@render toggle\(shown\.on\)/u);
  assert.match(tile, /aria-label=\{words\.switch\}/u);
  assert.match(tile, /aria-describedby="slash-reads-said"/u);
  assert.match(tile, /id="slash-reads-said"/u);
  assert.match(tile, /setReads\(client, !shown\.on\)/u);
  assert.match(tile, /readsSaid\(shown, host\)/u);
  assert.equal((tile.match(/role="switch"/gu) ?? []).length, 1);
  /* ONE SWITCH SHAPE IN THE APP (UI pass 20 Oct, agents F19): the rectangle override is gone, so `controls.css` draws it. */
  assert.doesNotMatch(tile, /\.switch-track\s*\{/u);
  assert.doesNotMatch(tile, /r-round|999|border-radius:\s*50%/u);
  assert.doesNotMatch(tile, /gradient|box-shadow|backdrop-filter|—/u);
  /* The body text is the body size, never below 15px. */
  assert.match(tile, /font-size:\s*var\(--fs-body\)/u);

  const area = readFileSync(new URL('../../routes/settings/[area]/areas/Agents.svelte', import.meta.url), 'utf8');
  assert.match(area, /import SlashReads from '\$lib\/ui\/SlashReads\.svelte'/u);
  assert.match(area, /<SlashDaily link row \/>\s*(<!--[\s\S]*?-->\s*)?<SlashReads row \/>/u);
});
