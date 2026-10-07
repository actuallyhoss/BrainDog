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

test('PEOPLE OPENS ON ONE LINE SAID FROM ITS OWN FIGURES, and the figures count the sample’s people', async () => {
  const k = await seeded();
  const page = opened(k, 'people');
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], String(b.heading));

  /* TWO LINES ON ONE FIGURE, SO EXACTLY ONE IS DRAWN: who has gone quiet, by name, while anybody has, and otherwise the
     counts (People 2.7.0). */
  const leads = page.blocks.filter((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true);
  assert.equal(leads.length, 2);
  const [counts, quiet] = leads as (typeof leads[number] & { body?: string; drawn?: boolean })[];
  const body = String(counts!.body);
  for (const id of ['people-in-touch-30d', 'people-count']) assert.ok(body.includes(`{{${id}}}`), `the line does not say ${id}`);
  /* HOW MANY IS A CLAUSE OF ITS OWN, and each other clause holds one figure, so a record with no Last in touch days
     (whoever `meet` added) reads "12 contacts" and never "0 of your 12 contacts were in touch". */
  const clauses = body.split(/,\s+/u);
  assert.match(clauses[0]!, /^\{\{people-count\}\} contact\(s\)$/u);
  for (const clause of clauses.slice(1)) assert.equal(clause.match(/\{\{/gu)?.length, 1, clause);
  /* THE SAMPLE HAS SOMEBODY QUIET, so the named line is the one drawn, and it names the one quiet longest, from the rows. */
  assert.equal(counts!.drawn, false);
  assert.notEqual(quiet!.drawn, false);
  assert.match(String(quiet!.body), /^\{\{people-quiet\.first\}\} has been quiet since \{\{people-quiet\.since\}\}/u);
  const longest = [...PEOPLE].filter((p) => typeof p.in_touch === 'string' && p.in_touch < on(-90)).sort((a, b) => String(a.in_touch).localeCompare(String(b.in_touch)));
  const values = (quiet as { values?: Record<string, unknown> }).values ?? {};
  assert.equal(values['people-quiet.first'], longest[0]!.name);
  assert.equal(values['people-quiet.since'], longest[0]!.in_touch);
  assert.equal(values['people-quiet.more'], longest.length - 1);

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

test('WHO HAS GONE QUIET AND WHO WAS LAST IN TOUCH ARE TWO SHORT LISTS, the one quiet longest first, and everyone is listed the latest first', async () => {
  const k = await seeded();
  const page = opened(k, 'people');
  /* NO CHART OF DOTS, SINCE People 3.1.0: twelve weeks a person said when, once each, and nothing else. */
  assert.ok(!page.blocks.some((b) => b.kind === 'heat'), 'People draws its twelve weeks of dots again');
  const dayOfRow = (r: { fields: Record<string, unknown> }) => String(r.fields.in_touch);
  const sample = (ok: (p: (typeof PEOPLE)[number]) => boolean) =>
    PEOPLE.filter((p) => typeof p.in_touch === 'string' && ok(p))
      .sort((a, b) => String(a.in_touch).localeCompare(String(b.in_touch)))
      .map((p) => p.name);

  /* GONE QUIET IS THE PEOPLE THE LINE COUNTS, in the colour of what needs the person, the one quiet longest first. */
  const quiet = page.blocks.find((b) => b.heading === 'Gone quiet');
  assert.ok(quiet, 'People has no Gone quiet');
  assert.deepEqual([quiet.kind, quiet.drawn !== false, (quiet as { tone?: unknown }).tone], ['table', true, 'bad']);
  assert.deepEqual(quiet.rows.map((r) => r.fields.name), sample((p) => String(p.in_touch) < on(-90)));
  assert.deepEqual(quiet.rows.map((r) => r.fields.name), ['Ada Vine']);
  const counted = k.metric(METRICS['people-quiet'] as never);
  assert.ok(counted.ok, sayOf(counted));
  assert.equal(quiet.rows.length, counted.value.value, 'the list and the line count different people');

  /* LAST IN TOUCH IS EVERYBODY ELSE WITH A DAY, THE QUIETEST FIRST TOO, so it reads on from the list beside it. */
  const lately = page.blocks.find((b) => b.heading === 'Last in touch');
  assert.ok(lately, 'People has no Last in touch');
  assert.deepEqual([lately.kind, lately.drawn !== false, (lately as { tone?: unknown }).tone], ['table', true, undefined]);
  assert.deepEqual(lately.rows.map((r) => r.fields.name), sample((p) => String(p.in_touch) >= on(-90)));
  assert.deepEqual(lately.rows.map((r) => r.fields.name), ['Tom Ashby', 'Mara Lindqvist', 'J. Okonkwo', 'S. Marchetti']);
  const days = lately.rows.map(dayOfRow);
  assert.deepEqual(days, [...days].sort(), 'Last in touch is not the quietest first');
  const within = k.metric(METRICS['people-in-touch-90d'] as never);
  assert.ok(within.ok, sayOf(within));
  assert.equal(lately.rows.length, within.value.value, 'Last in touch is drawn on a figure that counts other people');

  /* NOBODY IS IN BOTH, AND NOBODY WITH A DAY IS IN NEITHER: the two sentences cut at one day. */
  const listed = [...quiet.rows, ...lately.rows].map((r) => r.fields.name);
  assert.deepEqual([...listed].sort(), PEOPLE.filter((p) => typeof p.in_touch === 'string').map((p) => p.name).sort());
  /* EACH A PERSON, WHO THEY ARE WITH AND THE DAY, half the row, side by side. */
  for (const b of [quiet, lately]) {
    assert.deepEqual(b.columns?.map((c) => c.field), ['name', 'org', 'in_touch'], String(b.heading));
    assert.equal(b.span, 6, String(b.heading));
  }

  const cards = page.blocks.find((b) => b.kind === 'cards');
  assert.ok(cards);
  const latest = cards.rows.map((r) => r.fields.in_touch).filter((d): d is string => typeof d === 'string');
  assert.deepEqual(latest, [...latest].sort().reverse(), 'Everyone is not in the order people were last in touch');
  assert.equal(cards.rows[0]?.fields.name, 'S. Marchetti');
  assert.equal(cards.rows.length, PEOPLE.length, 'somebody nobody has been in touch with is left off Everyone');

  /* EVERY TILE WITH A HEADING WEARS A GLYPH, on the person's own page too. */
  /* A PERSON'S OWN PAGE IS AT THEIR NAME. */
  for (const p of [page, opened(k, 's-marchetti')]) {
    const bare = p.blocks.filter((b) => typeof b.heading === 'string' && typeof (b as { icon?: unknown }).icon !== 'string').map((b) => b.heading);
    assert.deepEqual(bare, [], `${p.slug ?? 'a page'}: a heading with no glyph`);
  }
});

test('A RECORD WHERE NOBODY WAS IN TOUCH DRAWS NEITHER LIST, and still says how many people it keeps', async () => {
  const k = await seeded();
  const listed = k.list({ register: 'people', limit: 50 });
  assert.ok(listed.ok, sayOf(listed));
  /* NOT DELETED, which a person other rows name refuses: every day taken off, so nobody was ever in touch. */
  for (const r of listed.value.rows) assert.ok(k.update('people', `people#${r.seq}`, { in_touch: null }, { actor: 'p_1' }).ok);
  const page = opened(k, 'people');
  for (const heading of ['Gone quiet', 'Last in touch']) assert.equal(page.blocks.find((b) => b.heading === heading)?.drawn, false, `${heading} is drawn over nobody`);
  assert.notEqual(page.blocks[0]?.drawn, false, 'the line is left off while there are people to name');
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

/* ── People 3.0.0: organisations, keys and evidence (`loop/contract-17.md`) ─────────────────────────────────────── */

test('ORGANISATIONS ARE PEOPLE\'S LIST, declared as the one `meet` writes a company into, and a person names theirs', () => {
  const orgs = REGISTERS.organisations as unknown as Record<string, unknown> & { fields: { id: string; values?: string[]; to?: string }[] };
  assert.equal(orgs.pack, 'people');
  assert.deepEqual(orgs.org, { name: 'name', keys: 'keys', kind: 'kind', domain: 'domain', merged_into: 'merged_into', met: 'met', projects: 'projects' });
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
  /* THE ADDRESS REACHES `meet` ONLY UNDER `only: 'known'`, so nothing a stranger writes makes a person or joins one
     (audit 17, H1): the kernel writes a person only for an address it already knows. */
  const branch = senders.steps.find((s) => 'if' in s) as { if: { none: { field: string; contains?: string; empty?: boolean }[] }; then: { meet: Record<string, string> }[]; else?: unknown };
  assert.ok(branch.if.none.some((c) => c.contains === 'noreply'), 'a no-reply sender is noted');
  assert.ok(branch.if.none.some((c) => c.empty === true), 'a mail with no address is noted');
  assert.equal(branch.else, undefined, 'a no-reply sender nobody claimed is met as something');
  const noted = branch.then[0]!.meet;
  assert.deepEqual(Object.keys(noted).sort(), ['email', 'name', 'only', 'source', 'where']);
  assert.equal(noted.only, 'known', 'a stranger\'s address is met as a person');
  assert.equal(noted.email, '{{trigger.body.from_address}}');
  /* WHERE IS THE DOMAIN, NEVER THE SUBJECT (audit 17, M2). */
  for (const rule of AUTOMATIONS.filter((a) => String(a.rule).startsWith('meet-sender')))
    assert.ok(!JSON.stringify(rule).includes('subject'), `${String(rule.rule)} writes a mail's subject into the record`);
  assert.equal(noted.where, 'mail from {{trigger.body.from_domain}}');

  const claimed = AUTOMATIONS.find((a) => a.rule === 'meet-sender-organisations') as { on: { arrival: { state: string[] } }; steps: Record<string, unknown>[] };
  assert.ok(claimed.on.arrival.state.includes('matched'));
  const guard = claimed.steps.find((s) => 'if' in s) as { if: Predicate; then: { meet: Record<string, string> }[] };
  assert.equal(guard.then[0]!.meet.kind, 'organisation');
  assert.equal(guard.then[0]!.meet.domain, '{{trigger.body.from_domain}}');
  /* NEVER AN ORGANISATION NAMED AFTER A DISPLAY NAME ON A PUBLIC HOST (audit 17, M4), read with the grammar the rule is. */
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
  assert.equal(k.count('people'), before, 'a mail nobody claimed made a person');
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

  /* THE PEOPLE PAGE LISTS EVERYONE BY THE ORGANISATION THEY ARE WITH, three a group before the rest fold. */
  const everyone = (PAGES.people!.blocks as { heading?: string; group?: string; fold?: number }[]).find((b) => b.heading === 'Everyone');
  assert.equal(everyone?.group, 'org');
  assert.equal(everyone?.fold, 3);

  /* THE PEOPLE PAGE LISTS THE ORGANISATIONS UNDER EVERYONE. */
  const list = opened(k, 'people').blocks.find((b) => b.heading === 'Organisations');
  assert.ok(list && list.drawn !== false);
  assert.equal(list.rows.length, ORGANISATIONS.length);
});
