/**
 * What this browser kept of what one person read goes when their session ends (`signed-out.ts`, review 3 P1): a shared
 * device drew the owner's week and counts for the member who signed in next.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { forgetSignedOut, SIGNED_OUT_KEYS, SIGNED_OUT_PREFIXES, SIGNED_OUT_SESSION_KEYS } from './signed-out.ts';

function store(entries: Record<string, string>): Pick<Storage, 'length' | 'key' | 'removeItem'> & { held: Map<string, string> } {
  const held = new Map(Object.entries(entries));
  return {
    held,
    get length() {
      return held.size;
    },
    key: (i) => [...held.keys()][i] ?? null,
    removeItem: (k) => void held.delete(k),
  };
}

test('A SIGN-OUT DROPS EVERY KEY OF WHAT THE PERSON READ, and keeps what is the device’s own', () => {
  const local = store({
    'braindog.boot-copy': '{}',
    'braindog.side-copy': '{}',
    bd_side_week: '{}',
    bd_side_counts: '{}',
    bd_side_order: '{}',
    bd_slash_threads: '[]',
    'bd_slash_threads:https://x.test/api:p_1': '[]',
    bd_send_convos: '[]',
    bd_opened: '[]',
    'braindog.find-copy': '{}',
    'braindog.find-names': '{}',
    'bd.tell:https://x.test/api:p_1': '{}',
    'braindog.seen.money': '{}',
    'braindog.seen.today': '{}',
    'braindog.welcomed:https://x.test/api': '[]',
    'bd_board_draft:https://x.test/api': '{}',
    bd_look_fix: 'x',
    bd_money_lines_view: 'ledger',
    'braindog.macNotifications': 'on',
    'bd.list-default:r:p_1:tasks': '{}',
    /* A DRAWN WIDGET'S PICTURE IS KEPT under who it was drawn for and where (`drawn-pictures.ts`, sec-follow M3), so it
       stays through a sign-out and is drawn to that person alone. */
    'bd.drawn.pics': '["w1.abc.page.light"]',
    'bd.drawn.pic.w1.abc.page.light': '{"p":"<svg/>","h":120}',
    'bd.drawn.pic.w1.abc.wide.dark': '{"p":"<svg/>","h":120}',
    /* ONE KEPT BEFORE THEY WERE KEPT PER PERSON is nobody's it can name, and is never read again (RE11). */
    'bd.drawn.pic.abc.page.light': '{"p":"<svg/>","h":120}',
    'bd.drawn.pic.abc.wide.dark': '{"p":"<svg/>","h":120}',
  });
  const session = store({ 'braindog.see-as': '{"id":"p_2","name":"Ana"}', 'braindog.first.drafts': '{"base":"","drafts":[]}', bd_look_fix: '{}' });
  forgetSignedOut(local, session);
  assert.deepEqual([...local.held.keys()].sort(), [
    'bd.drawn.pic.w1.abc.page.light',
    'bd.drawn.pic.w1.abc.wide.dark',
    'bd.drawn.pics',
    'bd.list-default:r:p_1:tasks',
    'bd_look_fix',
    'bd_money_lines_view',
    'braindog.macNotifications',
  ]);
  assert.deepEqual([...session.held.keys()], ['bd_look_fix']);
});

test('A STORE THAT THROWS, or none, is no harm', () => {
  const bad = {
    get length(): number {
      throw new Error('blocked');
    },
    key: () => null,
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  assert.doesNotThrow(() => forgetSignedOut(bad, null));
  assert.doesNotThrow(() => forgetSignedOut(null, null));
});

test('EACH KEY IS THE ONE ITS OWN MODULE KEEPS, so a renamed key is not left behind', () => {
  const src = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
  const owners: Record<string, string> = {
    'braindog.boot-copy': './boot-copy.ts',
    'braindog.side-copy': '../shell/side-copy.ts',
    'braindog.find-copy': './search-kept.ts',
    'braindog.find-names': './search-kept.ts',
    bd_side_week: '../shell/side-read.ts',
    bd_side_counts: '../shell/side.ts',
    bd_side_order: '../shell/project-order.ts',
    bd_side_facts: '../shell/side.ts',
    bd_slash_threads: '../palette/slash-chat.ts',
    bd_send_convos: '../send/convos.svelte.ts',
    bd_send_last: '../send/send.ts',
    bd_opened: '../palette/opened.ts',
    'today-late-aside': '../home/late-verb.ts',
    'braindog:slot:aside': '../page/slot.ts',
    'braindog.inbox.into': '../../routes/inbox/+page.svelte',
  };
  assert.deepEqual(Object.keys(owners).sort(), [...SIGNED_OUT_KEYS].sort());
  for (const [key, path] of Object.entries(owners)) assert.ok(src(path).includes(`'${key}'`), `${key} is not kept in ${path}`);
  assert.ok(src('../page/byline.ts').includes('`braindog.seen.${slug}`'));
  assert.ok(src('../sharing/sharing.ts').includes("'braindog.welcomed'") && src('../sharing/sharing.ts').includes('`${WELCOMED}:${base}`'));
  assert.ok(src('../home/Home.svelte').includes('`bd_board_draft:${apiBase()}`'));
  assert.ok(src('../palette/slash-chat.ts').includes('`${THREADS_KEY}:${base}:${person}`'));
  assert.ok(src('../home/tell-line.ts').includes('`bd.tell:${base || \'/\'}:${person}`'));
  assert.deepEqual([...SIGNED_OUT_PREFIXES], ['braindog.seen.', 'braindog.welcomed:', 'bd_board_draft:', 'bd_slash_threads:', 'bd.tell:']);
  assert.ok(src('../sharing/see-as.svelte.ts').includes(`'${SIGNED_OUT_SESSION_KEYS[0]}'`));
  assert.ok(src('../start/first-drafts.svelte.ts').includes(`'${SIGNED_OUT_SESSION_KEYS[1]}'`));
});

test('EVERY WAY A SESSION ENDS DROPS THEM: sign-out, signing out here too, a session the record no longer knows, access ended, an account closed', () => {
  const src = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
  const auth = src('../auth.ts');
  assert.match(auth, /const out = await done\(call\(io, '\/auth\/logout', \{\}\)\);\n  if \(out\.ok\) \{\n    forgetSignedOut\(\);/u);
  assert.match(auth, /if \(ended !== null && keep === 'none'\) \{\n    forgetSignedOut\(\);/u);
  const live = src('../data/live.svelte.ts');
  assert.equal(live.match(/forgetSignedOut\(\);/gu)?.length, 2);
  assert.match(src('../../routes/settings/[area]/areas/Identity.svelte'), /forgetSignedOut\(\);\n\s+await forgetOwn\(leaving\);\n\s+closedNow = true;/u);
});
