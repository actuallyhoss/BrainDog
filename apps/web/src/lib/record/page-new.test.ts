/**
 * A person makes a new page (PGS-C30: people can create very dynamic project pages).
 *
 * AGAINST A REAL KERNEL over `node:sqlite`, as `field-retire.test.ts` runs it and for its reason: `@braindog/record` is
 * not a dependency of this app, so the envelope is written here and `install`, `retire`, `propose` and `decide` are the
 * kernel's. A body the kernel would refuse is a red test here, and the suggestion is read back by accepting it.
 *
 * THE LINE THAT MATTERS IS `asked`. Somebody who does not own the record must never reach `setDeclaration`, and an
 * owner's new page must never be put to him as a question: every test reads the methods the module called, in order.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';

import { dropPage, newPage, pageBody, pageWords, slugFor, type PageClient } from './page-new.ts';

const CLOCK = Date.UTC(2026, 9, 13, 9);

function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return sql as unknown as Parameters<typeof openRecord>[0];
}

const record = (): Promise<Kernel> => openRecord(openSqlite(), { now: () => CLOCK });

type Call = { method: string; args: Record<string, unknown> };

/** The four methods a new page can reach, over the real kernel, and every one asked, in order. */
function served(k: Kernel): { client: PageClient; asked: Call[] } {
  const asked: Call[] = [];
  const client: PageClient = {
    async call(method, args = {}) {
      asked.push({ method, args });
      if (method === 'setDeclaration') {
        const body = args.body as { page: string };
        return (await k.install([{ id: `page.${body.page}`, kind: 'page', body } as never], undefined, { actor: 'p_owner' })) as never;
      }
      if (method === 'retireDeclaration') return k.retire([String(args.id)], { actor: 'p_owner' }) as never;
      if (method === 'propose') return k.propose(args as never, 'p_member') as never;
      return { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } };
    },
  };
  return { client, asked };
}

/** The slugs `boot` lists, as the shell keeps them. */
const slugsOf = (k: Kernel): string[] => (k.pages() as unknown as { slug: string }[]).map((p) => p.slug);

test('A SLUG IS THE TITLE IN LOWER CASE, and a second page of that name takes the next number', () => {
  assert.equal(slugFor('Wedding', []), 'wedding');
  assert.equal(slugFor('Wedding', ['wedding']), 'wedding-2');
  assert.equal(slugFor('Wedding', ['wedding', 'wedding-2']), 'wedding-3');
  assert.equal(slugFor('  Our  Wedding, 2027! ', []), 'our-wedding-2027');
  assert.equal(slugFor('Café Menü', []), 'cafe-menu');
  /* A TITLE WITH NO LATIN LETTER OR DIGIT IN IT is still a page somebody may make: it is addressed as `page`. */
  assert.equal(slugFor('婚礼', []), 'page');
  assert.equal(slugFor('婚礼', ['page']), 'page-2');
  /* AND A SLUG IS NEVER LONGER THAN AN ADDRESS SHOULD BE, nor left ending in a dash by the cut. */
  const long = slugFor(`${'a'.repeat(47)} bcd`, []);
  assert.equal(long, 'a'.repeat(47));
});

test('THE BODY IS THE TITLE, A PLACE UNDER Pages, AND ONE NOTE SAYING THE PAGE IS EMPTY', () => {
  assert.deepEqual(pageBody('wedding', 'Wedding', true), {
    page: 'wedding',
    title: 'Wedding',
    nav: { section: pageWords.section, order: 900 },
    blocks: [{ kind: 'note', span: 12, body: pageWords.empty }],
  });
  assert.equal(pageWords.section, 'Pages');
});

/* THE NOTE IS STORED IN THE PAGE, so it is written once, for the person who made it. An owner has Change this page on
   the page's menu. A member has no such entry (`ChangePage.svelte`), so a page he suggested must not send him to it. */
test('THE EMPTY NOTE NAMES THE WAY IN ONLY FOR A MAKER WHO HAS IT, and otherwise says who can fill the page', () => {
  const noteOf = (owner: boolean) => (pageBody('wedding', 'Wedding', owner).blocks as { kind: string; body: string }[])[0]!.body;
  const [mine, theirs] = [noteOf(true), noteOf(false)];

  assert.equal(mine, pageWords.empty);
  assert.match(mine, /^This page is empty\. To fill it, open the menu/u);
  assert.match(mine, /choose Change this page/u);

  assert.equal(theirs, pageWords.emptySuggested);
  assert.notEqual(theirs, mine);
  assert.match(theirs, /^This page is empty\./u, 'a member is not told the page is empty');
  assert.match(theirs, /The owner of this BrainDog can fill it/u, 'a member is not told who can fill the page');
  assert.doesNotMatch(theirs, /To fill it, open|\byou\b/iu, 'a member is sent to an entry he does not have');
});

test('EACH WAY IN STORES ITS OWN NOTE: the made page tells its owner the way, the suggested one names the owner', async () => {
  const k = await record();
  const { client, asked } = served(k);
  await newPage('Wedding', { client, pages: [], owner: true });
  await newPage('Garden', { client, pages: ['wedding'], owner: false });
  const noteIn = (body: unknown) => (body as { blocks: { body: string }[] }).blocks[0]!.body;
  assert.equal(noteIn(asked[0]!.args.body), pageWords.empty);
  assert.equal(noteIn((asked[1]!.args.body as { to: { body: unknown } }).to.body), pageWords.emptySuggested);
});

test('AN OWNER MAKES THE PAGE THROUGH setDeclaration, and the record then lists it', async () => {
  const k = await record();
  const { client, asked } = served(k);
  const out = await newPage('Wedding', { client, pages: slugsOf(k), owner: true });
  assert.deepEqual(out, { ok: true, slug: 'wedding', id: 'page.wedding', as: 'made', said: pageWords.made('Wedding') });
  assert.deepEqual(asked, [{ method: 'setDeclaration', args: { body: pageBody('wedding', 'Wedding', true) } }]);
  assert.deepEqual(slugsOf(k), ['wedding']);

  /* A SECOND Wedding LANDS BESIDE THE FIRST, against the pages the record now lists, and never over it. */
  const again = await newPage('Wedding', { client, pages: slugsOf(k), owner: true });
  assert.equal(again.ok && again.slug, 'wedding-2');
  assert.equal(again.ok && again.id, 'page.wedding-2');
  assert.deepEqual(slugsOf(k).sort(), ['wedding', 'wedding-2']);
});

test('UNDO RETIRES THE PAGE, and its name is free again', async () => {
  const k = await record();
  const { client, asked } = served(k);
  const made = await newPage('Wedding', { client, pages: [], owner: true });
  assert.ok(made.ok);
  const gone = await dropPage(made.id, { client });
  assert.deepEqual(gone, { ok: true });
  assert.deepEqual(asked.at(-1), { method: 'retireDeclaration', args: { id: 'page.wedding' } });
  assert.deepEqual(slugsOf(k), []);
});

test('A MEMBER SUGGESTS THE SAME BODY AND WRITES NOTHING: it waits in Needs you until the owner accepts it', async () => {
  const k = await record();
  const { client, asked } = served(k);
  const out = await newPage('Wedding', { client, pages: slugsOf(k), owner: false });
  assert.deepEqual(out, { ok: true, slug: 'wedding', id: 'page.wedding', as: 'suggested', said: pageWords.suggested('Wedding') });
  assert.deepEqual(asked, [
    {
      method: 'propose',
      args: {
        question: pageWords.question('Wedding'),
        body_kind: 'change',
        body: { declaration_id: 'page.wedding', to: { id: 'page.wedding', kind: 'page', body: pageBody('wedding', 'Wedding', false) } },
      },
    },
  ]);
  assert.deepEqual(slugsOf(k), [], 'a suggestion made the page with no press in Needs you');

  /* AND THE QUESTION IT LEFT IS ONE DECIDE CAN ANSWER: accepted there, the page exists as an owner's would. */
  const pressed = k.decide('SG1', { decide: { option: 'accept', reason: 'yes' } } as never, 'p_owner');
  assert.ok(pressed.ok, JSON.stringify(pressed));
  assert.ok((await k.install([pressed.value.install as never], pressed.value.expect, { actor: 'p_owner' })).ok);
  assert.deepEqual(slugsOf(k), ['wedding']);
});

test('A BLANK TITLE IS REFUSED WITH A SENTENCE, and nothing is asked of the record', async () => {
  const k = await record();
  for (const owner of [true, false]) {
    const { client, asked } = served(k);
    for (const title of ['', '   ', '\n\t']) {
      assert.deepEqual(await newPage(title, { client, pages: [], owner }), { ok: false, why: 'refused', fix: pageWords.blank });
    }
    assert.deepEqual(asked, []);
  }
});

test('THE TITLE IS KEPT AS TYPED, less the space around it and any run of space inside it', async () => {
  const k = await record();
  const { client, asked } = served(k);
  const out = await newPage('  Our   wedding ', { client, pages: [], owner: true });
  assert.equal(out.ok && out.slug, 'our-wedding');
  assert.equal((asked[0]!.args.body as { title: string }).title, 'Our wedding');
});

test('A TITLE TOO LONG TO SIT ON THE RAIL IS REFUSED HERE, before the record is asked', async () => {
  const { client, asked } = served(await record());
  const out = await newPage('w'.repeat(81), { client, pages: [], owner: true });
  assert.deepEqual(out, { ok: false, why: 'refused', fix: pageWords.long });
  assert.deepEqual(asked, []);
});

test("THE RECORD'S REFUSAL IS SAID IN ITS OWN SENTENCE, and a record that did not answer in the calm one", async () => {
  const refusing = (refusal: { code: string; fix: string }): PageClient => ({ call: async () => ({ ok: false, refusal }) });
  const no = await newPage('Wedding', { client: refusing({ code: 'LEVEL_REQUIRED', fix: 'This needs owner access.' }), pages: [], owner: true });
  assert.deepEqual(no, { ok: false, why: 'refused', fix: 'This needs owner access.' });
  for (const owner of [true, false]) {
    const down = await newPage('Wedding', { client: refusing({ code: 'UNREACHABLE', fix: 'fetch failed' }), pages: [], owner });
    assert.deepEqual(down, { ok: false, why: 'unreachable', fix: pageWords.notReached });
  }
  assert.deepEqual(await dropPage('page.wedding', { client: refusing({ code: 'UNREACHABLE', fix: 'fetch failed' }) }), {
    ok: false,
    why: 'unreachable',
    fix: pageWords.notReached,
  });
  /* A CONFLICT CARRIES NO SENTENCE OF ITS OWN, so it is said as the page having been made meanwhile. */
  const raced: PageClient = { call: async () => ({ ok: false, conflict: { current: null } }) };
  assert.deepEqual(await newPage('Wedding', { client: raced, pages: [], owner: true }), { ok: false, why: 'refused', fix: pageWords.raced });
});

test('NO SENTENCE A PERSON READS CARRIES AN EM DASH OR AN ID', () => {
  const said = [pageWords.blank, pageWords.long, pageWords.empty, pageWords.emptySuggested, pageWords.raced, pageWords.notReached, pageWords.made('Wedding'), pageWords.suggested('Wedding'), pageWords.question('Wedding'), pageWords.undone('Wedding')];
  for (const s of said) {
    assert.ok(!s.includes('\u2014'), s);
    assert.ok(!/page\.[a-z]|slug|declaration/iu.test(s), s);
  }
});
