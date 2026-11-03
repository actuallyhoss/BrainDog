/**
 * People's pages on a real record, since People 2.4.0: one line said from People's own figures, the days people were
 * last in touch as a chart, everyone with the one you spoke to last first, and a glyph on every tile's heading.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel, type PageResult } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';
import { evaluate, type Predicate, type Schema } from '@braindog/where';

import { AUTOMATIONS, METRICS, NOW, ORGANISATIONS, PAGES, PEOPLE, REGISTERS, firstPartyDocument, firstPartyManifest, installSeed } from '../src/index.ts';

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
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
}

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

const opened = (k: Kernel, slug: string): PageResult => {
  const out = k.page(slug);
  assert.ok(out.ok, `${slug}: ${sayOf(out)}`);
  return out.value;
};

const on = (offset: number): string => new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10);
const after = (offset: number) => (p: (typeof PEOPLE)[number]) => typeof p.in_touch === 'string' && p.in_touch > on(offset);

test('PEOPLE OPENS ON NO LINE SINCE 4.7.0, and its figures still count the sample’s people', async () => {
  const k = await seeded();
  const page = opened(k, 'people');
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], String(b.heading));

  /* NO LINE OF COUNTS AND NO "QUIET SINCE" LINE (3 Nov, "i dont like those briefs at all, remove them"): the cards say
     how many and when each spoke last. The figures the lines read stay declared and still count. */
  assert.deepEqual(page.blocks.filter((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true), []);

  const read = (id: string) => {
    const out = k.metric(METRICS[id] as never);
    assert.ok(out.ok, sayOf(out));
    return out.value.value;
  };
  assert.equal(read('people-count'), PEOPLE.length);
  assert.equal(read('people-in-touch-30d'), PEOPLE.filter(after(-31)).length);
  assert.equal(read('people-in-touch-12w'), PEOPLE.filter(after(-84)).length);
  assert.equal(read('people-quiet'), PEOPLE.filter((p) => typeof p.in_touch === 'string' && p.in_touch < on(-90)).length);
  assert.ok(Number(read('people-quiet')) > 0 && Number(read('people-in-touch-30d')) > 0, 'the sample has somebody quiet and somebody in touch, so the line says both');
});

/**
 * EACH PERSON ONCE, SINCE People 3.2.0. Gone quiet and Last in touch listed, over Everyone, the people whose cards say the
 * same day under them, so every person with a day was on the page twice. The cards carry the day, so they are what stays.
 */
test('PEOPLE SHOWS EACH PERSON ONCE, as a line with the day they last spoke, the latest first', async () => {
  const k = await seeded();
  const page = opened(k, 'people');
  /* NO CHART OF DOTS, SINCE People 3.1.0: twelve weeks a person said when, once each, and nothing else. */
  assert.ok(!page.blocks.some((b) => b.kind === 'heat'), 'People draws its twelve weeks of dots again');
  /* AND NEITHER LIST OVER THE CARDS: one block reads the people, and it is Everyone. */
  for (const heading of ['Gone quiet', 'Last in touch']) assert.ok(!page.blocks.some((b) => b.heading === heading), `People lists its people under ${heading} as well as on their cards`);
  const over = page.blocks.filter((b) => (b as { source?: unknown }).source === 'register.people');
  assert.deepEqual(over.map((b) => [b.kind, b.heading]), [['cards', 'Everyone']]);

  const cards = over[0]!;
  /* THE CARD CARRIES THE DAY, which is why it is the one that stays, and a face since People 3.6.0. */
  assert.deepEqual(cards.columns?.find((c) => c.field === 'in_touch'), { field: 'in_touch', label: 'Last spoke', as: 'when' });
  assert.deepEqual(cards.columns?.find((c) => c.field === 'name'), { field: 'name', label: 'Name', as: 'who' });
  const names = cards.rows.map((r) => r.fields.name);
  assert.equal(new Set(names).size, names.length, 'somebody is on Everyone twice');
  const latest = cards.rows.map((r) => r.fields.in_touch).filter((d): d is string => typeof d === 'string');
  assert.deepEqual(latest, [...latest].sort().reverse(), 'Everyone is not in the order people were last in touch');
  assert.equal(cards.rows[0]?.fields.name, 'S. Marchetti');
  assert.equal(cards.rows.length, PEOPLE.length, 'somebody nobody has been in touch with is left off Everyone');

  /* NO LINE OVER THE PAGE, SINCE People 4.7.0 ("i dont like those briefs at all, remove them"): who has gone quiet is
     each card's Last spoke, and the figure the second list drew on is kept. */
  assert.ok(!page.blocks.some((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true), 'People opens on a line again');
  const within = k.metric(METRICS['people-in-touch-90d'] as never);
  assert.ok(within.ok, sayOf(within));
  assert.equal(within.value.value, PEOPLE.filter((p) => typeof p.in_touch === 'string' && String(p.in_touch) >= on(-90)).length);

  /* EVERY TILE WITH A HEADING WEARS A GLYPH, on the person's own page too. */
  /* A PERSON'S OWN PAGE IS AT THEIR NAME. */
  for (const p of [page, opened(k, 's-marchetti')]) {
    const bare = p.blocks.filter((b) => typeof b.heading === 'string' && typeof (b as { icon?: unknown }).icon !== 'string').map((b) => b.heading);
    assert.deepEqual(bare, [], `${p.slug ?? 'a page'}: a heading with no glyph`);
  }
});

test('A RECORD WHERE NOBODY WAS IN TOUCH STILL SHOWS EVERYONE, and no line counts them', async () => {
  const k = await seeded();
  const listed = k.list({ register: 'people', limit: 50 });
  assert.ok(listed.ok, sayOf(listed));
  /* NOT DELETED, which a person other rows name refuses: every day taken off, so nobody was ever in touch. */
  for (const r of listed.value.rows) assert.ok(k.update('people', `people#${r.seq}`, { in_touch: null }, { actor: 'p_1' }).ok);
  const page = opened(k, 'people');
  assert.equal(page.blocks.find((b) => b.heading === 'Everyone')?.rows.length, PEOPLE.length);
  /* AND NO LINE COUNTS THEM, SINCE People 4.7.0: the cards are the count. */
  assert.ok(!page.blocks.some((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true && b.drawn !== false), 'People opens on a line of counts again');
});

test('PEOPLE STILL NEEDS NO OTHER LIST: its figures read People alone', () => {
  assert.deepEqual(firstPartyManifest('people').requires, []);
  for (const id of ['people-count', 'people-in-touch-30d', 'people-in-touch-12w', 'people-in-touch-90d', 'people-quiet'])
    assert.equal((METRICS[id] as { source: string }).source, 'register.people', id);
});

test('MEETING SOMEONE MOVES THEIR LAST IN TOUCH TO TODAY, so the page stays current without anyone typing a day', async () => {
  const k = await seeded();
  const quiet = PEOPLE.find((p) => p.name === 'Ada Vine')!;
  const met = k.meet({ email: String(quiet.email), where: 'a note about the year-end pack' }, { actor: 'agent:claude' });
  assert.ok(met.ok, sayOf(met));
  const listed = k.list({ register: 'people', limit: 50 });
  assert.ok(listed.ok, sayOf(listed));
  assert.equal(listed.value.rows.find((r) => r.fields.name === quiet.name)?.fields.in_touch, on(0));
});

/* ── People 3.0.0: organisations, keys and evidence ─────────────────────────────────────── */

test('ORGANISATIONS ARE PEOPLE\'S LIST, declared as the one `meet` writes a company into, and a person names theirs', () => {
  const orgs = REGISTERS.organisations as unknown as Record<string, unknown> & { fields: { id: string; values?: string[]; to?: string }[] };
  assert.equal(orgs.pack, 'people');
  assert.deepEqual(orgs.org, { name: 'name', keys: 'keys', kind: 'kind', domain: 'domain', merged_into: 'merged_into', met: 'met', projects: 'projects', retired: 'retired_on' });
  assert.deepEqual(orgs.fields.find((f) => f.id === 'kind')?.values, ['company', 'employer', 'client', 'vendor', 'merchant', 'bank', 'other']);
  const people = REGISTERS.people as unknown as Record<string, unknown> & { meets: Record<string, string>; fields: { id: string; type: string; of?: string; to?: string }[] };
  for (const part of ['keys', 'org', 'self', 'aliases', 'email']) assert.equal(people.meets[part], part, `meets: names no ${part}`);
  assert.equal(people.fields.find((f) => f.id === 'org')?.to, 'organisations');
  assert.equal(people.fields.find((f) => f.id === 'self')?.type, 'bool');
  /* A COMPANY IS NEVER FILED AS A PERSON AGAIN: every sample person has a first name, and every company is an organisation. */
  for (const company of ['Halden Type Co', 'Ravensworth Ltd', 'Pell & Vine', 'Nordhaven Registry'])
    assert.ok(ORGANISATIONS.some((o) => o.name === company) && !PEOPLE.some((p) => p.name === company), company);
  /* STILL NO OTHER MODULE'S LIST: an organisation's projects are a link, as a person's are. */
  assert.deepEqual(firstPartyManifest('people').requires, []);
  assert.ok(firstPartyManifest('people').provides.includes('register.organisations'));
  const bare = firstPartyDocument('people', { holds: ['people', 'organisations'] }) as { declarations: Record<string, unknown>[] };
  const list = bare.declarations.find((d) => d.register === 'organisations') as { org: Record<string, string>; fields: { id: string }[] };
  assert.ok(!list.fields.some((f) => f.id === 'projects'), 'a record with no Projects is handed an organisation pointing at them');
  assert.equal(list.org.projects, undefined, 'the role still names the field that went');
});

test('MAIL NOBODY CLAIMED MAKES NOBODY: its sender is kept as a name and where, and a claimed one meets its organisation', () => {
  const senders = AUTOMATIONS.find((a) => a.rule === 'meet-senders') as { on: { arrival: { state?: string[] } }; steps: Record<string, unknown>[] };
  assert.deepEqual(senders.on.arrival.state, ['untriaged'], 'mail a pattern claimed is met as a person');
  const said = JSON.stringify(senders.steps);
  assert.ok(said.includes('{{trigger.body.from_name}}'));
  assert.ok(!said.includes('{{trigger.body.from}}'), 'the raw header is passed as an email again');
  /* THE ADDRESS REACHES `meet` ONLY UNDER `only: 'known'`, so nothing a stranger writes makes a person or joins one:
    the kernel writes a person only for an address it already knows. */
  const branch = senders.steps.find((s) => 'if' in s) as { if: { none: { field: string; contains?: string; empty?: boolean }[] }; then: { meet: Record<string, string> }[]; else?: unknown };
  assert.ok(branch.if.none.some((c) => c.contains === 'noreply'), 'a no-reply sender is noted');
  assert.ok(branch.if.none.some((c) => c.empty === true), 'a mail with no address is noted');
  assert.equal(branch.else, undefined, 'a no-reply sender nobody claimed is met as something');
  const noted = branch.then[0]!.meet;
  assert.deepEqual(Object.keys(noted).sort(), ['email', 'name', 'only', 'source', 'where']);
  assert.equal(noted.only, 'known', 'a stranger\'s address is met as a person');
  assert.equal(noted.email, '{{trigger.body.from_address}}');
  /* WHERE IS THE DOMAIN, NEVER THE SUBJECT. */
  for (const rule of AUTOMATIONS.filter((a) => String(a.rule).startsWith('meet-sender')))
    assert.ok(!JSON.stringify(rule).includes('subject'), `${String(rule.rule)} writes a mail's subject into the record`);
  assert.equal(noted.where, 'mail from {{trigger.body.from_domain}}');

  const claimed = AUTOMATIONS.find((a) => a.rule === 'meet-sender-organisations') as { on: { arrival: { state: string[] } }; steps: Record<string, unknown>[] };
  assert.ok(claimed.on.arrival.state.includes('matched'));
  const guard = claimed.steps.find((s) => 'if' in s) as { if: Predicate; then: { meet: Record<string, string> }[] };
  assert.equal(guard.then[0]!.meet.kind, 'organisation');
  assert.equal(guard.then[0]!.meet.domain, '{{trigger.body.from_domain}}');
  /* NEVER AN ORGANISATION NAMED AFTER A DISPLAY NAME ON A PUBLIC HOST, read with the grammar the rule is. */
  const named = (domain: string) => evaluate(guard.if, { domain }, { register: 'vars', fields: { domain: { type: 'text' } } } as Schema);
  for (const host of ['gmail.com', 'yahoo.com.eg', 'hotmail.fr', 'outlook.co.uk', 'btinternet.com', 'mail.ru', 'icloud.com', ''])
    assert.equal(named(host), false, `${host || 'a mail with no address'} names an organisation after its sender`);
  for (const host of ['halden.example', 'hsbc.com.eg', 'mail.halden.example', 'outlookcapital.example'])
    assert.equal(named(host), true, `${host} is passed over as a public host`);
  /* A PAYEE IS AN ORGANISATION MET BY ITS bank: KEY, read off the arrival, so a held charge meets it too. */
  const payees = AUTOMATIONS.find((a) => a.rule === 'meet-payees') as { on: { arrival: { state: string[]; channel?: string } }; steps: Record<string, unknown>[] };
  assert.deepEqual(payees.on.arrival.state, ['matched', 'review', 'proposed']);
  assert.equal(payees.on.arrival.channel, undefined, 'a bank text comes by SMS, mail or a webhook');
  /* AN ADDRESS IS NOT MET: an InstaPay sender printed as `name@instapay` is no organisation's name. */
  const unless = payees.steps.find((s) => 'if' in s) as { if: { none: { contains: string }[] }; then: { meet: Record<string, unknown> }[] };
  assert.deepEqual(unless.if.none.map((c) => c.contains), ['@']);
  const meet = unless.then[0]!.meet;
  assert.equal(meet.kind, 'organisation');
  assert.deepEqual(meet.keys, ['bank:{{trigger.counterparty}}']);
  assert.equal(meet.role, undefined, 'a payee paying in is not a shop');
});

test('A FORGED SENDER MAKES NOBODY AND JOINS NOBODY: a stranger writing under a known name is a mention', async () => {
  const k = await seeded();
  const before = k.count('people');
  const mara = () => {
    const out = k.list({ register: 'people', where: 'name is "Mara Lindqvist"' });
    assert.ok(out.ok, sayOf(out));
    return out.value.rows[0]!.fields;
  };
  const was = mara();
  for (const [n, from] of ['"Mara Lindqvist" <mara.lindqvist@evil.test>', 'Someone New <someone@new-client.test>'].entries())
    assert.ok(k.arrive({ channel: 'email', headers: { from, subject: 'Invoice 2026-041 is overdue' }, body: 'Pay here.', sha256: `forged-${n}`, verified: true }).ok);
  await k.drain();
  /* THE MAIL'S OWN READING MEETS WHO SENT IT, so a sender like nobody known is a person of their own (Someone New); the one
     under Mara's name made nobody. */
  assert.equal(k.count('people'), before + 1, 'a mail made a person under a known name, or a stranger like nobody known was not met');
  const named = k.list({ register: 'people', where: 'name is "Mara Lindqvist"', limit: 5 });
  assert.ok(named.ok);
  assert.equal(named.value.rows.length, 1, 'a second Mara was made');
  const now = mara();
  assert.deepEqual(now.keys, was.keys, 'the stranger\'s address joined the real Mara');
  assert.deepEqual(now.met, was.met);
  /* AND NO SUBJECT ANYWHERE A PERSON OR A MODEL READS IT. */
  const people = k.list({ register: 'people', limit: 100 });
  assert.ok(people.ok);
  assert.doesNotMatch(JSON.stringify(people.value.rows.map((r) => r.fields)), /Invoice 2026-041/u);
});

test('A KNOWN SENDER IS MET: an address somebody holds is them, and one at an organisation the record holds is a person', async () => {
  const k = await seeded();
  const before = k.count('people');
  const named = (name: string) => {
    const out = k.list({ register: 'people', where: `name is "${name}"` });
    assert.ok(out.ok, sayOf(out));
    return out.value.rows;
  };
  const mara = named('Mara Lindqvist')[0]!.fields;
  /* MARA'S OWN ADDRESS UNDER ANOTHER NAME IS STILL MARA, and a colleague at Ravensworth, whose domain the record holds,
     is somebody. */
  for (const [n, from] of ['"M. Lindqvist" <mara@halden.example>', 'Jonas Berg <jonas@ravensworth.example>'].entries())
    assert.ok(k.arrive({ channel: 'email', headers: { from, subject: 'Re: the March invoice' }, body: 'Thanks.', sha256: `known-${n}`, verified: true }).ok);
  await k.drain();
  assert.equal(k.count('people'), before + 1, 'a known sender was not met, or a known person was met twice');
  assert.deepEqual(named('Mara Lindqvist')[0]!.fields.keys, mara.keys, 'Mara gained a key from her own address');
  assert.equal(named('Jonas Berg').length, 1, 'a sender at an organisation the record holds is nobody');
});

test('A PERSON\'S PAGE SAYS THEIR ORGANISATION AND WHERE THEY WERE SEEN, NEVER A KEY, and an organisation\'s lists its people', async () => {
  const k = await seeded();
  const ada = opened(k, 'ada-vine');
  for (const b of ada.blocks) assert.deepEqual(b.refusals, [], String(b.heading));
  const card = ada.blocks[0]!;
  assert.equal(card.rows[0]?.fields.name, 'Ada Vine');
  assert.ok((card.columns ?? []).some((c) => c.field === 'org'), 'the card does not say the organisation');
  assert.deepEqual(
    ada.blocks.filter((b) => b.kind === 'note').map((b) => b.heading),
    ['Seen in', 'Notes'],
  );
  /* NO KEY ON THE PAGE: `email:ada@…` is the record's handle, and a note filled from `keys` printed them joined by commas. */
  for (const b of ada.blocks) assert.doesNotMatch(String((b as { body?: unknown }).body ?? ''), /\b(email|github|bank|domain):/, String(b.heading));
  assert.ok(!(PAGES.someone!.blocks as { heading?: string }[]).some((b) => b.heading === 'Met'), 'the evidence is still headed Met');

  const pell = opened(k, 'pell-vine');
  for (const b of pell.blocks) assert.deepEqual(b.refusals, [], String(b.heading));
  const people = pell.blocks.find((b) => b.heading === 'People');
  assert.ok(people, 'an organisation\'s page lists nobody');
  assert.deepEqual(people.rows.map((r) => r.fields.name), ['Ada Vine']);
  const bare = pell.blocks.filter((b) => typeof b.heading === 'string' && typeof (b as { icon?: unknown }).icon !== 'string').map((b) => b.heading);
  assert.deepEqual(bare, [], 'a heading with no glyph');

  /* AN ORGANISATION'S PROJECTS AND ITS MONEY, by name, each opening its own page, where the record holds them. */
  const fenwick = opened(k, 'fenwick-cloud');
  for (const b of fenwick.blocks) assert.deepEqual(b.refusals, [], String(b.heading));
  const headings = fenwick.blocks.map((b) => b.heading).filter(Boolean);
  assert.deepEqual(headings, ['People', 'Projects', 'Money', 'Seen in', 'Notes']);
  assert.ok(fenwick.blocks.find((b) => b.heading === 'Projects')!.rows.length > 0, 'Fenwick Cloud lists none of its projects');
  assert.ok(fenwick.blocks.find((b) => b.heading === 'Money')!.rows.length > 0, 'nothing moved with Fenwick Cloud');
  /* AND ON A RECORD THAT HOLDS NEITHER LIST, NEITHER IS WRITTEN, so People still installs first and alone. */
  const relation = (holds?: string[]) =>
    ((firstPartyDocument('people', holds === undefined ? {} : { holds }) as { declarations: Record<string, unknown>[] }).declarations.find((d) => d.page === 'relation') as { blocks: { source?: string }[]; requires: string[] });
  for (const alone of [relation(), relation(['people', 'organisations'])]) {
    assert.deepEqual(alone.requires, ['register.organisations', 'register.people']);
    assert.ok(!alone.blocks.some((b) => b.source === 'register.things' || b.source === 'register.transactions'), 'People asks for a list the record does not hold');
  }
  const held = relation(['people', 'organisations', 'things', 'transactions']);
  assert.deepEqual(held.blocks.map((b) => b.source).filter((s) => s === 'register.things' || s === 'register.transactions'), ['register.things', 'register.transactions']);

  /* THE PEOPLE PAGE DRAWS EVERYONE AS FACES, SINCE People 3.6.0: the name with its initial, what they are, who they are
     with and the day they last spoke, one card each and never grouped; the owner is not among them. SINCE 3.9.0 what
     they are is the note's own words and who they are with is the projects they are on. */
  const everyone = (PAGES.people!.blocks as { kind?: string; heading?: string; group?: string; where?: string; columns?: { field: string }[] }[]).find((b) => b.heading === 'Everyone');
  assert.equal(everyone?.kind, 'cards');
  assert.equal(everyone?.group, undefined);
  assert.match(String(everyone?.where), /self is not true/u);
  assert.deepEqual(everyone?.columns?.map((c) => c.field), ['name', 'note', 'projects', 'in_touch']);

  /* THE PEOPLE PAGE OPENS THE ORGANISATIONS' LIST, SINCE People 4.1.0, and no longer counts them (4.4.1, and no line
     of counts at all since 4.7.0): the way to them is one link, drawn while there are any. */
  const line = opened(k, 'people').blocks.find((b) => b.kind === 'note' && String((b as { body?: unknown }).body ?? '').includes('(/r/organisations)')) as
    | (PageResult['blocks'][number] & { body?: string })
    | undefined;
  assert.ok(line && line.drawn !== false, 'People has no way to the organisations');
  assert.doesNotMatch(String(line.body), /\{\{organisations-count\}\}/u);
  assert.equal(opened(k, 'people').blocks.find((b) => b.heading === 'Organisations'), undefined, 'People still lists the organisations');
});

/* ── Somebody held twice: the kernel's built-in `held-twice`, said on the page ─────────────────────── */

type Drawn = PageResult['blocks'][number] & { body?: string; lead?: boolean; tone?: string; span?: number; when?: unknown };
const twice = (k: Kernel): unknown => {
  const decl = k.metricDecl('held-twice');
  assert.ok(decl, 'held-twice is not a figure of this record');
  const read = k.metric(decl);
  assert.ok(read.ok, sayOf(read));
  return read.value.value;
};
const twiceOn = (page: PageResult): Drawn | undefined => (page.blocks as Drawn[]).find((b) => b.kind === 'note' && String(b.body).includes('{{held-twice}}'));
/** A page's blocks as they were drawn, less the one note, so two readings of a page can be held side by side. */
const others = (page: PageResult) => (page.blocks as Drawn[]).filter((b) => b !== twiceOn(page)).map((b) => [b.kind, b.heading ?? null, b.drawn !== false, b.body ?? null]);

test('SOMEBODY HELD TWICE IS SAID OVER THE CARDS, by how many and never by a number of theirs', async () => {
  const k = await seeded();
  /* TWO OF ONE NAME, NEITHER WITH AN ADDRESS: the plain rule's pair, which the figure counts as one too many. */
  for (const more of [{ role: 'contractor' }, {}]) {
    const made = k.create('people', { name: 'Odile Farrow', ...more }, { actor: 'p_1' });
    assert.ok(made.ok, sayOf(made));
  }
  assert.equal(twice(k), 1);

  const page = opened(k, 'people');
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], String(b.heading));
  const note = twiceOn(page);
  assert.ok(note, 'People says nothing of somebody held twice');
  assert.notEqual(note.drawn, false);
  assert.equal(note.body, '{{held-twice-shown}} people may be listed twice, {{held-twice}} too many. [See them](/r/people?twice=1).');
  /* NO QUESTION IS PROMISED: nothing asks about a plain pair by night yet, so the note says the number and stops. */
  assert.doesNotMatch(String(note.body), /Decide/u);
  assert.equal((note as { values?: Record<string, unknown> }).values?.['held-twice'], 1);
  assert.equal((note as { values?: Record<string, unknown> }).values?.['held-twice-shown'], 2);
  /* BEFORE THE CARDS, after Waiting on you, and never a headline: People opens on no line since 4.7.0. */
  const at = page.blocks.indexOf(note);
  assert.equal(at, 1);
  assert.ok((page.blocks.slice(0, at) as Drawn[]).every((b) => (b.kind === 'note' && b.lead === true) || b.heading === 'Waiting on you'));
  assert.equal(page.blocks[at + 1]?.heading, 'Everyone');
  assert.notEqual(note.lead, true);
  /* NO ID, NO LIST'S NUMBER: the count and plain words. */
  assert.doesNotMatch(String(note.body).replace('{{held-twice-shown}}', '2').replace('{{held-twice}}', '1'), /people#|#\d|\b[0-9A-HJKMNP-TV-Z]{26}\b|—/u);
});

test('NOBODY HELD TWICE SAYS NOTHING, and the rest of the page is as it was', async () => {
  const k = await seeded();
  assert.equal(twice(k), 0);
  const quietPage = opened(k, 'people');
  assert.equal(twiceOn(quietPage)?.drawn, false, 'the note is drawn at nought');

  /* AS DECLARED: whole width, no intent of its own, drawn only above nought. */
  const declared = (PAGES.people!.blocks as unknown as Drawn[]).filter((b) => b.kind === 'note' && String(b.body).includes('{{held-twice}}'));
  assert.equal(declared.length, 1);
  assert.deepEqual(declared[0]!.when, { metric: 'held-twice', gt: 0 });
  assert.equal(declared[0]!.span, 12);
  assert.equal(declared[0]!.tone, undefined);

  /* THE SAME PAGE WITH SOMEBODY HELD TWICE differs by that note and the two new cards, and by nothing else. */
  const before = others(quietPage);
  for (let i = 0; i < 2; i++) assert.ok(k.create('people', { name: 'Odile Farrow' }, { actor: 'p_1' }).ok);
  assert.deepEqual(others(opened(k, 'people')), before);
});
