/**
 * People and organisations: clients, contractors and accountants, the companies, vendors and banks they are with, and
 * where each one was seen.
 *
 * One module of the sample record, split out of `index.ts` so each first-party module's registers, rows,
 * figures and pages sit in one file. `index.ts` composes them and keeps every export it had.
 *
 * A MODULE NOTHING ELSE NEEDS. Money says who a bill or a payment is with through a link, and Work says who holds a task
 * the same way (`LINKS` in `packs/first-party.ts`), so both install and draw on a record with People off. People in turn
 * reads none of their lists: a page of People's that drew one would be refused at install on every record that lacks it,
 * which is every record People reaches before Money or Work (`PEOPLE_PAGES.someone` says why).
 */

import type { MeetsFields, OrgFields } from '@braindog/kernel';

import { day, gbp, type Fields, type SeedMetric, type SeedPage, type SeedRegister } from './base.ts';

/**
 * People's two lists, each saying which list `meet` writes for its kind (`meets:` a person, `org:` an organisation), and
 * each keeping a row other rows still name.
 *
 * `delete` IS TYPED HERE AND NOT ON `SeedRegister`, because these are the lists in this file that declare it, and the
 * kernel's own list of the values it takes (`DELETE_RULES` in `packages/kernel/src/referenced.ts`) has this one member.
 */
type PeopleRegister = SeedRegister & ({ meets: MeetsFields } | { org: OrgFields }) & { delete: 'refuse_while_referenced' };

/* ── organisations ────────────────────────────────────────────────────────── */

/**
 * THE COMPANIES THE SAMPLE'S PEOPLE ARE WITH, AND THE ONES ITS MONEY MOVES THROUGH, since People 3.0.0. Halden Type Co,
 * Ravensworth Ltd, Pell & Vine and Nordhaven Registry were rows of People until then, each a company filed as a person,
 * so the People page counted a registry among the contacts and meeting the accountant's second address could only make
 * a second accountant. Each is an organisation now, met by its domain, and the person who writes from it points at it.
 * Fenwick Cloud and Bridge Street Coffee are where the ledger's card spend goes (`TRANSACTIONS` in `money.ts`), so a
 * payment names who it went to and not only what the bank wrote.
 *
 * `keys` ARE `kind:value`, as the kernel normalises them (`packages/kernel/src/identity-keys.ts`): the domain a mail
 * comes from, and the payee a bank text writes. `met` is the evidence, one dated line a sighting with where it was.
 */
export const ORGANISATIONS: Fields[] = [
  { name: 'Halden Type Co', kind: 'client', domain: 'halden.example', keys: ['domain:halden.example'], projects: [2], note: 'Pays on 45 days, always.', met: ['2026-08-28 · mail from halden.example'] },
  { name: 'Ravensworth Ltd', kind: 'client', domain: 'ravensworth.example', keys: ['domain:ravensworth.example'], projects: [2, 3], note: '', met: ['2026-07-27 · mail from ravensworth.example'] },
  { name: 'Pell & Vine', kind: 'vendor', domain: 'pellvine.example', keys: ['domain:pellvine.example', 'bank:pellvine'], projects: [], note: 'The studio\'s accountants. Year end is 31 March.', met: ['2026-04-28 · mail from pellvine.example'] },
  { name: 'Nordhaven Registry', kind: 'vendor', domain: 'nordhaven.example', keys: ['domain:nordhaven.example'], projects: [1, 2], note: 'Where every domain the studio holds is registered.', met: [] },
  { name: 'Fenwick Cloud', kind: 'vendor', domain: 'fenwick.example', keys: ['domain:fenwick.example', 'bank:fenwickcloud'], projects: [1, 3], note: '', met: ['2026-09-02 · bank text'] },
  { name: 'Bridge Street Coffee', kind: 'merchant', keys: ['bank:bridgestreetcoffee'], note: '', met: ['2026-09-01 · bank text'] },
];

/* ── people ───────────────────────────────────────────────────────────────── */

/* `in_touch` IS THE LAST DAY EACH ONE WAS HEARD FROM OR WRITTEN TO, since People 2.4.0, and the shape of the set is
   the point: three this month, one five weeks back, one quiet since the spring, and a registry contact nobody has
   written to at all, so the page's line has a quiet person to name and its chart has days that are busy and days that
   are not.

   PEOPLE, SINCE People 3.0.0, AND THE COMPANIES MOVED TO `ORGANISATIONS` ABOVE. Each place in this list is the one it
   had, because a bill's `party` and a task's `owner` name a person by it (`OBLIGATIONS` in `money.ts`, `TASKS` in
   `work.ts`): the bill that was with Halden Type Co is with the person who sends Halden's invoices, who is with Halden.
   `keys` are every way each one is known, as `kind:value`; `org` is the place of their organisation above. */
export const PEOPLE: Fields[] = [
  { name: 'Mara Lindqvist', role: 'client', rate: null, email: 'mara@halden.example', keys: ['email:mara@halden.example'], org: 1, note: 'Runs accounts payable at Halden.', met: ['2026-08-28 · mail from halden.example'], in_touch: day(-6) },
  { name: 'Tom Ashby', role: 'client', rate: null, email: 'tom.ashby@ravensworth.example', keys: ['email:tom.ashby@ravensworth.example'], org: 2, note: '', met: ['2026-07-27 · mail from ravensworth.example'], in_touch: day(-38) },
  { name: 'J. Okonkwo', role: 'contractor', rate: gbp(45_000), email: 'jo@okonkwo.example', keys: ['email:jo@okonkwo.example', 'github:jokonkwo'], note: 'Illustration, invoices monthly', handles: ['git:jokonkwo'], met: ['2026-08-20 · commit 3f2a91c in kiln-site'], in_touch: day(-2) },
  { name: 'Ada Vine', role: 'accountant', rate: null, email: 'ada@pellvine.example', keys: ['email:ada@pellvine.example'], aliases: ['A. Vine'], org: 3, note: 'Year end is 31 March', met: ['2026-04-28 · mail from pellvine.example'], in_touch: day(-128) },
  { name: 'Lars Holm', role: 'other', rate: null, email: 'lars@nordhaven.example', keys: ['email:lars@nordhaven.example'], org: 4, note: 'Support at the registry.' },
  { name: 'S. Marchetti', role: 'contractor', rate: gbp(62_000), email: 'sm@marchetti.example', keys: ['email:sm@marchetti.example', 'github:smarchetti'], note: 'Backend, two days a week', handles: ['git:smarchetti'], met: ['2026-08-27 · commit 8b1e4d0 in portage', '2026-09-02 · commit c47d19e in portage'], in_touch: day(-1) },
];

/**
 * PEOPLE'S ONE RULE, ON BY DEFAULT SINCE People 2.3.0: an agent's `meet` already writes a dated `met` line for a
 * commit, and this is the same write for a mail sender, so a record with an inbox reads who wrote in the way it reads
 * who committed. A channel that fills nothing makes `meet` skip the step and the run goes on rather than meeting nobody
 * under a blank name (`people.ts`'s `normalise`, `07 §4`).
 *
 * THE ADDRESS AND THE NAME, READ ONCE BY THE DOOR, SINCE People 3.0.0. The rule passed `{{trigger.body.from}}` as an
 * email, and that is the raw header, `"Sara Ali" <sara@…>`, which `meet` refuses as an address, so the rule failed on
 * most real mail; and it met every sender as a person, a bank's alert address among them. The mail door now hands the
 * header over in parts (`from_address`, `from_name`, `from_domain`, `senderOf` in `packages/kernel/src/ingest.ts`), and:
 *
 * - A MAIL NO DOOR'S PATTERN CLAIMED (`untriaged`) IS FROM SOMEBODY, unless its address says nobody reads replies to it
 *   (noreply, no-reply, donotreply, mailer-daemon). It was met by address and name, and a no-reply sender as the
 *   organisation behind it; the name is kept as a mention and nobody is written (below).
 * - A MAIL A DOOR'S PATTERN CLAIMED IS FROM A SYSTEM: a bank's alert, a shop's receipt. Meeting it as a person made a
 *   person called "Alerts" one mail at a time, so it meets the organisation by its domain, the rule below.
 *
 * `source` IS THE EVIDENCE'S WORDS, `mail from halden.example`, which the person's page lists under Seen in.
 *
 * NOT AN INVOICE PARTY'S RULE, WHICH AN EARLIER UNIT ALSO ASKED FOR. No first-party ingest writes `register.obligations`
 * or `register.transactions` from a matched arrival yet, so `on: { arrival: { state: ['matched'] } }` would fire on
 * any matched arrival at all, of any pack's own ingests. A ledger row's `party` is an organisation since money-core
 * 3.10.0, and a bank door fills the ledger's `counterparty_text` with the payee as the bank wrote it, for the record to
 * resolve.
 *
 * THE PAYEE A BANK DOOR READ IS MET AS AN ORGANISATION, `rule.meet-payees`, by its `bank:` key and never by name, so
 * `GEIDEA*CHILLOUT 0423 CAIRO EG` and `Chillout` are one shop. It reads `{{trigger.counterparty}}`, which the arrival
 * keeps whatever became of the row (filed, held for a person, or near another; `Arrived.counterparty` in
 * `packages/kernel/src/ingest.ts`), and not the row's own field, which a held charge has not written yet. An arrival no
 * bank door read fills the key with nothing, and `meet` then meets nobody and the run goes on. Here and not in Money,
 * because Money installs with People off and a rule meeting an organisation needs the list that keeps them. No `role`:
 * a payee is as often a client paying in as a shop. A PAYEE WRITTEN AS AN ADDRESS IS NOBODY MET: an InstaPay transfer in
 * prints who sent it as `quill.harbour@instapay`, most often a person's, and an organisation called by that address is
 * a name nobody reads as one.
 *
 * MAIL NOBODY'S PATTERN CLAIMED MAKES NOBODY. Anybody
 * can send a mail and write any name above it: a forged `"Rohan Mehta" <rohanmehta@evil.test>` made a person, the
 * strong rules then folded it into the real Rohan on the same two words and a long enough local part, and his keys
 * took the stranger's address, so every later mail from that domain was filed as his. Spam made a person a sender. So
 * `rule.meet-senders` meets the sender `only: 'known'`: the kernel writes a person only when the address is already
 * somebody's key, when its domain is an organisation the record holds, or when the record's own person has written to
 * it, since only the kernel can read the lists while it meets (`meetPerson` in `packages/kernel/src/people.ts`).
 * Anybody else is kept as a mention, the name and where it came from: a mention holds no key, matches nobody and is
 * never merged, and it is what a person or an agent who knows them turns into somebody. NEVER A STRONG MERGE AND NO
 * KEY CARRIED under it, so a forged name above a stranger's address reaches nobody's keys.
 *
 * AND A NO-REPLY SENDER NOBODY'S PATTERN CLAIMED IS NOBODY TO MEET: a newsletter, a notification, or a forgery of
 * either. One a door's pattern reads, a bank's alert, is met by `rule.meet-sender-organisations` below.
 *
 * WHERE IS THE SENDER'S DOMAIN, NEVER THE SUBJECT. The line said `mail: <subject>`, and the subject of
 * any mail reached the person's `met` lines, the merge cards, the model's reading and the mention table, which grew a
 * row per subject.
 */
const NO_REPLY = ['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon'];

/** Where a mail was seen, in the words a `met` line and a mention keep: the domain it came from, never its subject. */
const MAIL_FROM = 'mail from {{trigger.body.from_domain}}';

/**
 * MAIL HOSTS ANYBODY CAN SIGN UP TO, WHOSE DOMAIN SAYS NOTHING ABOUT WHO A SENDER WORKS FOR: a mail from
 * one is a person's own account, and the display name above it is whatever they typed. Named in the rule itself, so a
 * person reading `rule.meet-sender-organisations` sees which hosts it passes over and can add their own country's.
 *
 * THE RULE'S OWN LIST AND NOT THE KERNEL'S `PUBLIC_MAIL` (`packages/kernel/src/identity-keys.ts`), which is what a key
 * is normalised against and grows with every host somebody meets. A declaration that copied it would change under
 * every record that holds the rule each time it grew, and reach none of them until People's next version. NOT AN
 * INTERNET PROVIDER THAT SENDS ITS OWN BILLS FROM ITS CUSTOMERS' HOST (`sky.com`, `orange.fr`), since that mail is the
 * provider speaking and a pattern that reads it should meet the provider.
 */
const PUBLIC_MAIL_HOSTS = [
  'gmail.com', 'googlemail.com', 'icloud.com', 'me.com', 'mac.com', 'msn.com', 'live.com', 'live.co.uk', 'live.fr',
  'proton.me', 'pm.me', 'mail.com', 'email.com', 'zoho.com', 'fastmail.com', 'hey.com', 'tutanota.com', 'tuta.io',
  'qq.com', '163.com', '126.com', 'sina.com', 'naver.com', 'daum.net', 'mail.ru', 'inbox.ru', 'list.ru', 'bk.ru',
  'web.de', 't-online.de', 'laposte.net', 'libero.it', 'btinternet.com', 'virginmedia.com', 'att.net', 'verizon.net',
  'sbcglobal.net', 'seznam.cz', 'wp.pl', 'o2.pl', 'users.noreply.github.com',
];

/** The free mail brands whose every country's host is one too: `yahoo.com.eg`, `hotmail.fr`, `outlook.co.uk`. */
const PUBLIC_MAIL_BRANDS = ['yahoo.', 'ymail.', 'rocketmail.', 'hotmail.', 'outlook.', 'aol.', 'gmx.', 'yandex.', 'rambler.', 'protonmail.', 'rediffmail.'];

/**
 * The organisation a mail came from, by its domain, with the name the mail went out under. Reached only for a domain
 * that is not a public host (`rule.meet-sender-organisations`), so a display name names an organisation only where
 * the domain it came from is one.
 */
const MEET_SENDER_ORG = {
  meet: {
    kind: 'organisation',
    domain: '{{trigger.body.from_domain}}',
    name: '{{trigger.body.from_name}}',
    where: MAIL_FROM,
    source: MAIL_FROM,
  },
};

export const PEOPLE_AUTOMATIONS: Record<string, unknown>[] = [
  {
    rule: 'meet-senders',
    name: 'Note whoever writes in',
    pack: 'people',
    on: { arrival: { channel: 'email', state: ['untriaged'] } },
    steps: [
      { set_var: { name: 'sender', to: '{{trigger.body.from_address}}' } },
      {
        /* THE ADDRESS, ONLY WHERE IT IS KNOWN (`only: 'known'`): somebody's key, an organisation's domain, or an address
           the record's own person wrote to is met as the person; anybody else is kept as a mention of the name, and
           writes no row. A sender with neither name nor a known address leaves nothing to keep, and the run goes on. */
        if: { none: [{ field: 'sender', empty: true }, ...NO_REPLY.map((word) => ({ field: 'sender', contains: word }))] },
        then: [{ meet: { name: '{{trigger.body.from_name}}', email: '{{trigger.body.from_address}}', only: 'known', where: MAIL_FROM, source: MAIL_FROM } }],
      },
    ],
  },
  {
    /* NEVER AN ORGANISATION NAMED AFTER WHOEVER WROTE FROM A PUBLIC HOST. A mail a pattern claimed from
       `gmail.com` or `yahoo.com.eg` named an organisation after the first sender's display name, keyed by the host, and
       filed every later mail from that host under it. A mail with no address is passed over too, since a name alone
       would be matched against the organisations by name. */
    rule: 'meet-sender-organisations',
    name: 'Know who sends the mail a pattern reads',
    pack: 'people',
    on: { arrival: { channel: 'email', state: ['matched', 'review', 'proposed', 'skipped'] } },
    steps: [
      { set_var: { name: 'domain', to: '{{trigger.body.from_domain}}' } },
      {
        if: {
          none: [
            { field: 'domain', empty: true },
            { field: 'domain', in: PUBLIC_MAIL_HOSTS },
            ...PUBLIC_MAIL_BRANDS.map((brand) => ({ field: 'domain', starts: brand })),
          ],
        },
        then: [MEET_SENDER_ORG],
      },
    ],
  },
  {
    rule: 'meet-payees',
    name: 'Know who each payment was with',
    pack: 'people',
    on: { arrival: { state: ['matched', 'review', 'proposed'] } },
    steps: [
      { set_var: { name: 'payee', to: '{{trigger.counterparty}}' } },
      {
        if: { none: [{ field: 'payee', contains: '@' }] },
        then: [
          {
            meet: {
              kind: 'organisation',
              name: '{{trigger.counterparty}}',
              keys: ['bank:{{trigger.counterparty}}'],
              where: 'bank text',
              source: 'bank text',
            },
          },
        ],
      },
    ],
  },
];

export const PEOPLE_REGISTERS: Record<string, PeopleRegister> = {
  people: {
    id: 'people',
    name: 'People',
    icon: 'people',
    one: 'person',
    holds: 'collaborators, contractors and accountants, and what each one is for',
    title: 'name',
    mobile: ['name', 'role', 'rate'],
    pack: 'people',
    /* THE LIST `meet` WRITES, SAID BY THE LIST, since People 2.1.0. Before it the kernel found this list by its id,
       `people`, and each part by a field of the same name (`LEGACY` in `packages/kernel/src/roles.ts`), which is the
       kernel knowing a pack's list by name. Declared, the kernel reads the role off this key, checks every part at
       install, and falls back on the name only for a record still on People 2.0.0 or earlier, until its next update.
       `projects` is the one part that goes when the record holds no Projects: `packs/first-party.ts` drops it with the
       `projects` field it names, so a student's People still installs and `meet` records a person and links nobody.
       `in_touch` SINCE People 2.4.0: `meet` moves Last in touch to the day of the line it writes, so an agent meeting
       someone or a mail arriving from them keeps the People page's figures current without anyone typing a day. */
    /* `keys`, `org`, `self` AND `aliases` SINCE People 3.0.0: every way a person is known as
       `kind:value` (an address, a login, a phone), the organisation they are with, whether this is the record's own
       person, and the other names they go by. `meet` matches on any key and adds the new ones it hears, so the second
       address of somebody already met finds them, where one unique `email` could only make a second row. */
    meets: {
      name: 'name',
      email: 'email',
      handles: 'handles',
      projects: 'projects',
      met: 'met',
      merged_into: 'merged_into',
      in_touch: 'in_touch',
      keys: 'keys',
      org: 'org',
      self: 'self',
      aliases: 'aliases',
    },
    /* A CLIENT WITH BILLS AGAINST THEIR NAME IS NOT DELETED OUT FROM UNDER THEM, since People 2.2.0. A payment's or a
       bill's `party` and a task's `owner` point here, and deleting the person they name left each one pointing at a row
       nobody could open, so the money and the work belonged to nobody. The write path now refuses that delete and says
       which lists still name the person and how many rows (`referencedBy`, `packages/kernel/src/referenced.ts`), so they
       can be pointed elsewhere first. A person folded into another by a merge goes as before when nothing names them;
       when something does, accepting the merge is refused with the same sentence, which is the stranding this stops. */
    delete: 'refuse_while_referenced',
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      /* Optional, because a person an agent meets in a commit has no role until somebody gives one.
         NO `registrar`, AND THERE WAS ONE until People 2.0.0: a role only a studio that holds domains has, shipped to every
         record, and the Personal use case had to relabel it Agency before a household could read it. A record whose rows
         hold it keeps it as its own word when it updates, because the plan lays back a value a row was written under
         (`test/lists-opened.test.ts` drives one), and a record that never used it is no longer offered it. */
      { id: 'role', type: 'enum', values: ['client', 'contractor', 'accountant', 'collaborator', 'other'], index: true },
      { id: 'rate', type: 'money' },
      /* Unique, because an email is how a person met twice is known to be one person. KEPT SINCE People 3.0.0 for every
         reader that already asks it; `keys` below holds it again with every other address. */
      { id: 'email', type: 'email', unique: true, index: true },
      /* THE ORGANISATION THEY ARE WITH, SINCE People 3.0.0: a client's accounts contact is with the client. */
      { id: 'org', label: 'Organisation', type: 'ref', to: 'organisations', index: true },
      { id: 'note', type: 'text' },
      /* EVERY WAY THEY ARE KNOWN, SINCE People 3.0.0, as `kind:value` (`email:`, `github:`, `phone:`): what `meet`
         matches on, kept by the kernel in one place so no two people hold one key. */
      { id: 'keys', label: 'Known by', type: 'list', of: 'text' },
      /* THE OTHER NAMES THEY GO BY, SINCE People 3.0.0, "A. Vine" beside Ada Vine: read when a name is matched, never
         enough alone to merge two people. */
      { id: 'aliases', label: 'Also called', type: 'list', of: 'text' },
      /* THE RECORD'S OWN PERSON, SINCE People 3.0.0: whoever keeps the record, so a commit or a mail of their own is never
         met as somebody new. Any record's, never one record's by name. */
      { id: 'self', label: 'This is you', type: 'bool', default: false },
      /* Not `search: true` yet: the search box asks every searchable field `matches`, and the kernel
         refuses that on a list, so People could not be searched at all. */
      { id: 'handles', label: 'Handles', type: 'list', of: 'text' },
      /* A token may add a project here and never remove one. */
      { id: 'projects', label: 'Met in', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      /* Where and when each meeting happened, one dated line each, newest last. */
      { id: 'met', label: 'Met', type: 'list', of: 'text' },
      { id: 'merged_into', label: 'Merged into', type: 'ref', to: 'people' },
      /* THE LAST DAY THEY WERE HEARD FROM OR WRITTEN TO, since People 2.4.0: what the page's line and its chart are read
         from. A day and not an instant, because "in touch on Tuesday" is what a person says. Empty is never, and a
         person with no day is in no count below but Everyone's. */
      { id: 'in_touch', label: 'Last in touch', type: 'day', index: true },
    ],
  },

  /**
   * THE ORGANISATIONS, MOVED HERE FROM THE FOUNDER USE CASE AT People 3.0.0, under the same id, so a founder's rows stay
   * where they are. Every record meets companies, not only a founder's: the client a contact is with, the vendor a bill
   * is from, the shop a card payment went to, the bank an alert came from. Founder declared the list as the companies a
   * founder runs and nothing wrote to it; it is now the list `meet` writes an organisation into (`org:`), matched by
   * its domain or by a payee as a bank writes it, so an alert from a bank is never filed as a person.
   *
   * WHAT FOUNDER'S COPY HELD AND THIS DOES NOT: `country` and `currency`, which no page but Founder's own Dashboard
   * drew, and `accounts`, a list of Money's accounts. A People list cannot point at Money's, because People installs
   * before Money on every record and would be refused for a list that is not there yet; and books already keep a
   * company's money apart (`register.books` in `money.ts`). So the step is a major one.
   */
  organisations: {
    id: 'organisations',
    name: 'Organisations',
    icon: 'grid',
    one: 'organisation',
    holds: 'the companies, clients, vendors, shops and banks you deal with, and the projects each is part of',
    title: 'name',
    mobile: ['name', 'kind', 'domain'],
    pack: 'people',
    /* THE LIST `meet` WRITES AN ORGANISATION INTO (`packages/kernel/src/roles.ts`, `org`). `projects` goes on a record
       with no Projects, as a person's does (`LINKS` in `packs/first-party.ts`). */
    org: { name: 'name', keys: 'keys', kind: 'kind', domain: 'domain', merged_into: 'merged_into', met: 'met', projects: 'projects', retired: 'retired_on' },
    /* A PERSON OR A PAYMENT NAMES ITS ORGANISATION, so it is not deleted out from under them, as a person is not. */
    delete: 'refuse_while_referenced',
    fields: [
      { id: 'name', label: 'Organisation', type: 'text', required: true, search: true },
      /* WHAT IT IS TO YOU, which is what decides how it is met: a bank's alert, a shop's receipt, a client's mail. A
         founder's row written under Founder's own words (sole trader, nonprofit, venture) keeps its word, as the plan lays
         back a value a row holds. */
      {
        id: 'kind',
        label: 'Kind',
        type: 'enum',
        values: ['company', 'employer', 'client', 'vendor', 'merchant', 'bank', 'other'],
        labels: { company: 'Company', employer: 'Employer', client: 'Client', vendor: 'Vendor', merchant: 'Shop', bank: 'Bank', other: 'Other' },
        index: true,
      },
      /* THE ADDRESS ITS MAIL COMES FROM, `halden.example`, and never a public one such as a free mail service. */
      { id: 'domain', label: 'Website', type: 'text', index: true },
      { id: 'keys', label: 'Known by', type: 'list', of: 'text' },
      { id: 'projects', label: 'Projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      /* WHERE IT WAS SEEN, one dated line each with where: the evidence a match was made on. */
      { id: 'met', label: 'Seen in', type: 'list', of: 'text' },
      { id: 'merged_into', label: 'Merged into', type: 'ref', to: 'organisations' },
      /* THE DAY IT WAS PUT AWAY, SINCE People 3.8.0: a shop met by a name a card text cut
         short is retired on his yes, kept with its payments and never deleted, and People lists it no more. */
      { id: 'retired_on', label: 'Retired on', type: 'day' },
      /* A DOCUMENT, AS FOUNDER'S WAS, so a row written under it reads the same. */
      { id: 'note', label: 'Notes', type: 'document' },
    ],
  },
};

/** A month is how the page's line counts who you are in touch with. */
const IN_TOUCH_30D = 'merged_into is empty, self is not true, in_touch after -31d';

/**
 * Three months is where somebody has gone quiet, and the two sentences cut at the same day: quiet is a last day before
 * ninety days ago, and in touch is that day or any after it. A person with no day at all is in neither.
 */
const QUIET = 'merged_into is empty, self is not true, in_touch before -90d';
const IN_TOUCH_90D = 'merged_into is empty, self is not true, in_touch after -91d';

/**
 * PEOPLE'S FIGURES, since People 2.4.0: how many people the record keeps, how many were in touch lately, and how many
 * have gone quiet. Counts of people and never a score, read from People's own list alone, so the figures install
 * wherever People does (the module note above says why People reads no other list).
 */
export const PEOPLE_METRICS: Record<string, SeedMetric> = {
  'people-count': {
    metric: 'people-count',
    name: 'People',
    source: 'register.people',
    /* THE PEOPLE EVERYONE DRAWS, SINCE People 3.6.0: never the owner and never somebody folded into another, so the
       page's "6 people" is the number of cards under it. */
    where: 'merged_into is empty, self is not true',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  'people-in-touch-30d': {
    metric: 'people-in-touch-30d',
    name: 'In touch, 30 days',
    source: 'register.people',
    where: IN_TOUCH_30D,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
    /* REMEMBERED EACH NIGHT, SINCE People 3.4.0, so the page's figure draws how many you were in touch with
       over the month as a line (`trend: 30d` on In touch). A save writes the figure and asks nothing. Until the record
       has kept three nights the cell is the figure alone. */
    snapshot: { grain: 'day', into: 'series.people-in-touch-30d' },
  },
  /* WHAT THE CHART DREW, counted, until People 3.1.0, when the chart of twelve weeks went. STILL DECLARED, because a
     record holds it and a page somebody made may draw on it: a figure taken away is something an update has to ask
     about (`losses` in `packs/quiet.ts`), and this one costs nothing to keep. */
  'people-in-touch-12w': {
    metric: 'people-in-touch-12w',
    name: 'In touch, 12 weeks',
    source: 'register.people',
    where: 'merged_into is empty, self is not true, in_touch after -84d',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* WHO IS NOT QUIET, SINCE People 3.1.0: in touch inside the three months past which `people-quiet` counts, so the two
     split everybody with a day between them and Last in touch is drawn only while it lists someone. THAT LIST WENT AT
     People 3.2.0, and the figure stays for the reason the one above does. */
  'people-in-touch-90d': {
    metric: 'people-in-touch-90d',
    name: 'In touch, 3 months',
    source: 'register.people',
    where: IN_TOUCH_90D,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* HOW MANY ORGANISATIONS, SINCE People 3.0.0, which the page's list of them is drawn on, so a record that has met no
     company draws no heading over nothing. */
  'organisations-count': {
    metric: 'organisations-count',
    name: 'Organisations',
    source: 'register.organisations',
    /* EVERY ORGANISATION THE LIST HOLDS, SHOPS FROM CARD TEXTS TOO, SINCE People 4.1.0. From 3.9.0 to 4.0.0 this left
       out the ones with no kind, so People said "Organisations 4" over a list, a sidebar and a page that said 17, and
       nobody could tell why. One meaning now: the organisations not folded into another and not retired, the rows the
       Organisations list draws. The shops are still counted apart (below), as part of it. */
    where: 'merged_into is empty, retired_on is empty',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* THE ONES YOU WORK WITH: an organisation given a kind (a client, a vendor, your employer), so People says "4
     organisations you work with, 13 shops from card texts" and the two add up to the list's count. */
  'organisations-known': {
    metric: 'organisations-known',
    name: 'Organisations you work with',
    source: 'register.organisations',
    where: 'merged_into is empty, retired_on is empty, kind is set',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* THE SHOPS A CARD TEXT NAMED, SINCE People 3.9.0: met by `rule.meet-payees` with no kind, so said as one line under
     Organisations ("9 shops from card texts") and never as nine organisations. Giving one a kind lists it again. */
  'organisations-from-card-texts': {
    metric: 'organisations-from-card-texts',
    name: 'Shops from card texts',
    source: 'register.organisations',
    where: 'merged_into is empty, retired_on is empty, kind is empty',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* THE CLIENTS, SINCE People 4.3.0 (2 Nov, the first run: "2 people besides you" stood over Fenwick and Acme, two
     companies kept as organisations, and with no person in People the line said nothing at all). Each list counts its
     own, since a figure reads one list: the organisations kept as a client, and the people whose role is client. The
     page's line names them while there are few (`.names`) and counts them past that. */
  'organisations-clients': {
    metric: 'organisations-clients',
    name: 'Client organisations',
    source: 'register.organisations',
    where: 'merged_into is empty, retired_on is empty, kind is client',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* THE ORGANISATIONS THAT ARE NOT CLIENTS, so the line counts the rest apart: "Fenwick and Acme, 2 clients, 3 other
     organisations". A shop from a card text, with no kind, is one of them. */
  'organisations-not-clients': {
    metric: 'organisations-not-clients',
    name: 'Other organisations',
    source: 'register.organisations',
    where: 'merged_into is empty, retired_on is empty, kind is not client',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  'people-clients': {
    metric: 'people-clients',
    name: 'Clients',
    source: 'register.people',
    where: 'merged_into is empty, self is not true, role is client',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* EVERYBODY BESIDES YOU WHO IS NOT A CLIENT, so a line that has named the clients counts the others once. */
  'people-not-clients': {
    metric: 'people-not-clients',
    name: 'Other people',
    source: 'register.people',
    where: 'merged_into is empty, self is not true, role is not client',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* NOT A VERDICT: an accountant you speak to once a year is quiet and fine. The line names how many, and the cards say who. */
  'people-quiet': {
    metric: 'people-quiet',
    name: 'Quiet for three months',
    source: 'register.people',
    where: QUIET,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
};

export const PEOPLE_PAGES: Record<string, SeedPage> = {
  /**
   * Placed under its own section, since People 2.2.0: it waited off the rail, in the holding pen, until somebody moved it.
   *
   * THREE TILES, SINCE People 2.4.0, AND THE FIRST IS A SENTENCE. Who you have been in touch with this month and who has
   * gone quiet, said from People's own figures; then those days as a chart; then everyone, the one you spoke to last
   * first. A block with nothing to say is left off rather than drawn empty, so a record with nobody in it opens on its
   * cards' empty line alone. Every tile's heading wears a glyph (`icon:`), as the look asks.
   *
   * WHO, AND WHEN, IN PLACE OF THE CHART, SINCE People 3.1.0 (the second design review's fix 7). In touch,
   * 12 weeks drew a row of twelve dots a person, 48 grey and 4 blue on a record of four people: it said when, once
   * each, at the cost of a grid. Now it is two short lists side by side, each a person and the day you were last in
   * touch, the one quiet longest first: Gone quiet, whoever has been quiet three months, in the colour of what needs
   * the person, and Last in touch, everybody else. Each is drawn only while it lists someone.
   *
   * EACH PERSON ONCE, SINCE People 3.2.0. Those two lists stood over Everyone, whose cards say the same day, so on a
   * record of six people every one was on the page twice. The cards stay, since they carry the day with who somebody is,
   * who they are with and where they were met; the lists go. Who has gone quiet is still said first and by name, in the
   * page's line, and `people-in-touch-90d` stays declared and draws nothing, as `people-in-touch-12w` does.
   *
   * WHAT WAITS ON YOU ABOUT THEM, SINCE People 3.4.0. The line opens on how many questions about somebody here
   * are open, and Waiting on you under it answers three. In touch says how many you were in touch with in the month,
   * with its line, and What agents did, last, what the runs changed here. Six tiles at most, and no fold: Waiting on
   * you, the note on somebody held twice, In touch, Everyone, Organisations and What agents did, each drawn only while
   * it has something.
   */
  people: {
    page: 'people',
    title: 'People',
    /* ITS PLACE ON THE RAIL, SINCE batch 101 (places-and-computed-101): the lead pages sit Work, Orders, Projects,
       Money, People, Agents, lowest first (`placesOf` in `packages/record/src/places.ts`). */
    nav: { section: 'People', order: 10, place: 50 },
    icon: 'people',
    requires: ['register.people', 'register.organisations'],
    /* ADD A PERSON ON THE PAGE'S HEAD (31 October, AG9): the page had Share and "…" only, and adding somebody was a
       button on the whole list, two presses away. It opens the list's name line ("Who?"). */
    header: { action: { verb: 'row.create', label: 'Add a person' } },
    blocks: [
      {
        /* THE PAGE'S ONE LINE, said from the figures, so the line and the chart under it cannot disagree. A clause whose
           every figure is nought is left out by the writer (`leadOf` in apps/web), so a record where nobody is quiet
           does not say "0 quiet". `person(s)` is "person" for one and "people" for more (`manyOf` in the writers), so
           the line says the list's own word one press away, "1 person besides you" (AN16), never "contacts".

           HOW MANY STANDS IN A CLAUSE OF ITS OWN, so the line never says "0 of your 12 contacts were in touch" about a
           record that simply has no Last in touch days yet (people `meet` adds, until it stamps the day): it says
           "12 contacts" and stops. BESIDES YOU (31 Oct, audit m AM17): the list shows the owner too, so "1 contact" sat
           over two names. */
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'people-quiet', is: 0 },
        /* NOT HOW MANY WERE IN TOUCH, SINCE People 3.4.0: In touch under it says that figure with its month as a line,
           and a page says a figure once. */
        /* A QUESTION THAT ADDS OR CHANGES SOMEBODY IS ABOUT THEM: "Add Priya to People?"
           names no row of its own, and the line said no question was open while it waited in Needs you. The kernel
           counts a rowset on People here now (`openOnList`), and Waiting on you lists it. */
        /* PEOPLE AND ORGANISATIONS COUNTED APART, AND THE CLIENTS NAMED WHILE THEY ARE FEW, SINCE People 4.3.0 (2 Nov,
           the first run: a freelancer with Fenwick and Acme, both organisations, read "2 people besides you", and once
           they were kept as organisations the line said nothing). Three or fewer clients, all in one list, are named
           ("Fenwick and Acme, 2 clients"); more, or clients in both lists, are counted. A clause at nought is left out,
           so a record of people alone reads as it did. */
        says: [
          {
            when: { all: [{ metric: 'organisations-clients', gt: 0 }, { metric: 'organisations-clients', lte: 3 }, { metric: 'people-clients', is: 0 }] },
            body: '{{questions-open-in:people}} question(s) for you, {{organisations-clients.names}}, {{organisations-clients}} client(s), {{people-count}} person(s) besides you, {{organisations-not-clients}} other organisation(s)',
          },
          {
            when: { all: [{ metric: 'people-clients', gt: 0 }, { metric: 'people-clients', lte: 3 }, { metric: 'organisations-clients', is: 0 }] },
            body: '{{questions-open-in:people}} question(s) for you, {{people-clients.names}}, {{people-clients}} client(s), {{people-not-clients}} other person(s) besides you, {{organisations-count}} organisation(s)',
          },
          {
            when: { any: [{ metric: 'organisations-clients', gt: 0 }, { metric: 'people-clients', gt: 0 }] },
            body: '{{questions-open-in:people}} question(s) for you, {{organisations-clients}} client organisation(s), {{people-clients}} client(s) in People, {{people-not-clients}} other person(s) besides you, {{organisations-not-clients}} other organisation(s)',
          },
          { body: '{{questions-open-in:people}} question(s) for you, {{people-count}} person(s) besides you, {{organisations-count}} organisation(s)' },
        ],
      },
      {
        /* WHO HAS GONE QUIET, BY NAME, SINCE People 2.7.0 (the visual review of October 2nd), where the line said "1 quiet
           for three months or more": the one quiet longest and since when (`.first`, `.since`), and how many more. From
           this record's people, whoever they are; a record where nobody is quiet says the counts above instead. */
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'people-quiet', gt: 0 },
        body: '{{questions-open-in:people}} question(s) for you, {{people-quiet.first}} has been quiet since {{people-quiet.since}}, and {{people-quiet.more}} other(s) have too',
      },
      {
        /* WHAT IS ASKED ABOUT SOMEBODY ON THIS RECORD, SINCE People 3.4.0, answered where they are shown, three
           at a time, and the rest are in Decide. Each line above opens on how many (`questions-open-in:people`, the open
           questions whose row is on People), a clause the writer leaves out at nought, so the line and the queue count
           the same questions. Under the line, since it is the one tile here that needs the person, and only while
           something about People is asked: a question about a task or a bill is Work's or Money's to draw. */
        kind: 'queue',
        heading: 'Waiting on you',
        icon: 'ask',
        span: 12,
        source: 'governance.open',
        where: 'list is people',
        limit: 3,
        when: { metric: 'questions-open-in:people', gt: 0 },
      },
      {
        /* SOMEBODY HELD TWICE: the record's own figure of the people it holds more than once, as far as the
           plain rules can tell (two of one name, one of them with no address or handle; a second marked as the
           record's own person). Under the page's line and never a second headline, since a page opens on one sentence,
           and left off at nought. THE FIGURE'S WORDS, THEN THE NUMBER, as the notes over a record's keys are written,
           so it reads right for one and for many. "May be", because two real people can share a name, and the answer
           is the person's. NOTHING IS SAID OF DECIDE: the pass that would ask about each pair by night (`askTwice` in
           the kernel) is called by nothing yet, so a line promising a question would promise one that never comes.
           No intent: it is a thing to look at, not a thing gone wrong.

           AND SOMETHING TO PRESS, where the line said a number and stopped: the list of people,
           opened at the ones this figure counted. THE PEOPLE HELD TWICE AND NOT THE WHOLE LIST: the
           link used to open everyone in order of name and tell the reader to look for the same person listed twice,
           since a list's address narrowed by a field's value, a search and an order, and "held twice" is a pair the
           kernel works out and no value a field holds. The list takes the word `twice` in its address now and asks
           the record for those people itself, so the note says "See them" and the looking is the record's.

           THE NUMBER IS HOW MANY TOO MANY, AND SAYS SO. The figure counts the ones that would go
           if each pair were one person, and the link shows every one of each pair, so "twice: 1" stood over a list of
           two and "twice: 2" over three of one name. The figure is the kernel's and stays as it is; the words now say
           what it counts, so a list longer than the number is what the line promised.

           AND THE PEOPLE THE LINK SHOWS ARE COUNTED TOO (batch 82): the kernel's `held-twice-shown` is every one of
           each pair, from the pass `held-twice` is counted in, so the line opens on the number the list behind
           "See them" holds and then says how many of them are too many. Never fewer than two, so "people" is always
           right. Drawn by `held-twice` as before: the two are nought together. */
        kind: 'note',
        span: 12,
        when: { metric: 'held-twice', gt: 0 },
        body: '{{held-twice-shown}} people may be listed twice, {{held-twice}} too many. [See them](/r/people?twice=1).',
      },
      /* NO IN TOUCH TILE, SINCE People 3.5.0: "In touch, 30 days: 3" filled a whole row with one figure nobody asked for.
         The figure stays declared and the night's save of it is still kept. */
      {
        /* CARDS, with a face for each person, rather than a table of four columns read
           as a directory. Each card still opens the person's row. Their role, and the projects they were
           met in, because most people here arrive from an agent's commit rather than by hand, and the one you
           were in touch with last first, because that is the one somebody is asking about. A person nobody has
           been in touch with comes after, newest first.

           NOT THE `met` LINES, which the card drew whole: "2026-08-27 · commit 8b1e4d0 in portage" is where an
           agent was when it met them, in the agent's words, and a card is read by a person. The lines stay on
           the row, where the history of a person is read. */
        kind: 'cards',
        heading: 'Everyone',
        icon: 'people',
        /* THE PAGE'S WIDTH, SINCE People 4.1.0: the organisations beside it went to their own list, so the people take
           the row and stand in columns, each a face, a name, one line of who they are and when you last spoke. */
        span: 12,
        source: 'register.people',
        /* NEVER SOMEBODY FOLDED INTO ANOTHER, as the organisations below: a merge leaves one line, not two. AND NEVER THE
           OWNER, SINCE People 3.6.0 (the look of 24 October found him in his own list): the row marked as you is who the
           record is for, not somebody you know. */
        where: 'merged_into is empty, self is not true',
        /* FACES AGAIN, SINCE People 3.6.0 (things, not rows): each person a card with their initial, what they are to you
           and when you last spoke, where a table of three columns read as a directory. The name is the card's `who`, so
           it leads with a face. Who they are with is the card's second fact.
           PEOPLE AS LINES, SINCE People 3.5.0: each person one line, their name, what they are, who they are with and
           when you last spoke, where each was a little form of labelled facts. */
        /* NAME, ROLE AND WHEN YOU LAST SPOKE, and not who they are with (money F13): a phone's line holds two values
           after the name, and "With" took the place of Last spoke there, so the one fact a person scans People for was
           dropped on a phone. Who they are with is on their own page, first line. */
        /* ONE LINE A PERSON, SINCE People 3.9.0: their name, what they are to you in
           the words written about them (the note's first line, under the name), the projects they are on as chips, and
           when you last spoke. "Role · Other" stood under most of them as a field and its value. */
        columns: [
          { field: 'name', label: 'Name', as: 'who' },
          { field: 'note', label: 'Who they are', as: 'reply' },
          { field: 'projects', label: 'Met in', as: 'fact' },
          { field: 'in_touch', label: 'Last spoke', as: 'when' },
        ],
        order: [
          { field: 'in_touch', dir: 'desc' },
          { field: 'seq', dir: 'desc' },
        ],
        limit: 50,
        empty: 'Nobody yet. Add someone, or an agent adds whoever it meets in a commit or a mail.',
      },
      {
        /* THE ORGANISATIONS ARE ONE PLACE, SINCE People 4.1.0: their own list, under People in the sidebar, grouped by
           kind with the people in each. A table of four here (kind set) beside a list of seventeen there read as two
           lists that disagreed, so People says how many and opens the list, with the same figure the sidebar says. */
        kind: 'note',
        span: 12,
        when: { metric: 'organisations-count', gt: 0 },
        /* ONE COUNT, THE LIST'S, SINCE People 4.2.1 (audit of 30 October, 23): "6 organisation(s) you work with, 0 shop(s)
           from card texts" sat over a list that grouped one shop, since a shop given a kind is one you work with. */
        body: 'Organisations and shops you deal with: {{organisations-count}}. [See them](/r/organisations).',
      },
      {
        /* WHAT AGENTS DID HERE, SINCE People 3.4.0: who an agent met, merged or wrote down, one group per run,
           from the record's own log, as the Agents page draws what runs added to the brain. `first:` folds each run's
           rest into one line with its count, so one busy run cannot push the others off the page. No `empty:`: with no
           agent's change to a person or an organisation the block is not drawn. Last, because the people come first. */
        kind: 'agents',
        heading: 'What agents did',
        icon: 'activity',
        span: 12,
        source: 'activity',
        where: 'list is people or organisations',
        first: 3,
      },
    ],
  },

  /**
   * ONE PAGE PER PERSON, since People 2.2.0: who they are, the projects they were met in, and what is written about them.
   * Only what the rows say: nothing here works out anything about a person that nobody wrote down.
   *
   * NOT THE MONEY OR THE WORK BETWEEN YOU, WHICH WAS ASKED FOR, because a block of People's over `transactions`,
   * `obligations` or `tasks` makes People lean on those lists: `@braindog/declare` counts every block's `source` a page
   * reads (`pointsAt` in `packages/declare/src/index.ts`) and refuses the install `REGISTER_UNRESOLVED` while the list is
   * not held. A record is made with People before Money and Work (`MODULE_ORDER` in `usecases/index.ts`), and a student's
   * or a team's has no Money at all, so such a block would refuse People on nearly every record, whatever `when:` it
   * carried, since the install reads no `when:`. Those blocks wait for the document to leave out a block over a list the
   * record will not hold, as it leaves out a walk's leg (`firstPartyDocument` in `packs/first-party.ts`).
   *
   * NO `nav`, because a rail with a line for every client and contractor is a rail nobody reads.
   *
   * CALLED `someone` AND NOT `person`, BECAUSE THE NAME DECIDES WHO KEEPS A SHARED ADDRESS. A template's pages claim
   * their addresses after every page somebody wrote, and among templates in the order of their ids (`resolvePages` in
   * `packages/kernel/src/pages.ts`). `person` sorts before `project`, so a client called what a project is called
   * would have taken the project's `/p/` address and moved the project's to a numbered one. `someone` sorts after
   * `project`, `organisation`, `milestone` and `skill`, so a person is the one that gives way.
   *
   * BY NAME, AS A PROJECT'S PAGE IS (`name is {{name}}`), so of two people of one name the card draws one, which `meet`
   * asks the owner to merge when it sees them.
   */
  someone: {
    page: 'someone',
    title: '{{name}}',
    for: { register: 'people' },
    icon: 'people',
    pack: 'people',
    requires: ['register.people'],
    blocks: [
      {
        /* THE PERSON, AS THE PAGE'S HEADLINE TILE since People 2.4.0: one card drawn wide (`lead`), with the day you
           were last in touch beside who they are. THE ORGANISATION THEY ARE WITH IN PLACE OF THE EMAIL, SINCE People
           3.0.0: a card takes three facts, and who somebody is with says more than one of their addresses. */
        kind: 'cards',
        lead: true,
        span: 12,
        source: 'register.people',
        where: 'name is {{name}}',
        columns: [
          { field: 'name', label: 'Name', as: 'who' },
          { field: 'role', label: 'Role', as: 'fact' },
          { field: 'org', label: 'Organisation', as: 'fact' },
          { field: 'projects', label: 'Met in', as: 'fact' },
          { field: 'in_touch', label: 'Last in touch', as: 'when' },
        ],
        limit: 1,
        empty: 'Nothing is kept about {{name}} yet.',
      },
      /* NO "Known by" NOTE OVER `keys`. A key is `kind:value`, a handle the record joins on and never shown to a person
         (`packages/kernel/src/identity-keys.ts`), and a note fills a list as its values joined by commas, so the page
         read "email:jo@okonkwo.example,github:jokonkwo". The app's own page for a person says each one in words
         ("Email", "GitHub", `knownOf` in `apps/web/src/lib/record/folk.ts`). */
      {
        /* WHERE THEY WERE SEEN, SINCE People 3.0.0, AND IT WAS "Met": the evidence, one dated line a sighting with where
           it was, "2026-08-27 · commit 8b1e4d0 in portage" or "2026-08-28 · mail from halden.example". The cards leave
           them out (`page.people` says why), and a card takes at most three facts. NOT `document: true`: that reads one
           text field as a document body, and `met` is a list, one line per sighting. */
        kind: 'note',
        heading: 'Seen in',
        icon: 'handshake',
        span: 12,
        body: '{{met}}',
        empty: 'Nothing is kept about where {{name}} was seen yet.',
      },
      {
        /* A DOCUMENT, AS A PROJECT'S NOTES ARE, because a person `meet` recorded has no `note` at all, so the body stays
           `{{note}}`, and a sample client's is empty. A document note reads a body that is empty or still its
           placeholder as nothing written and draws nothing, so the `empty:` below is what the page says
           (`drawSegments` in `apps/web/src/lib/record/blocks.ts`). */
        kind: 'note',
        document: true,
        heading: 'Notes',
        icon: 'doc',
        span: 12,
        body: '{{note}}',
        empty: 'Nothing is written about {{name}} yet.',
      },
    ],
  },

  /**
   * ONE PAGE PER ORGANISATION, SINCE People 3.0.0: what it is, the people who are with it, the projects it is part of,
   * where it was seen and what is written about it. Only what the rows say, as a person's page.
   *
   * CALLED `relation` AND NOT `organisation`, BECAUSE THE NAME DECIDES WHO KEEPS A SHARED ADDRESS (`someone` above says
   * how): a company and the project made for it are often called one thing, Brightwell and Brightwell, and the project
   * is the page somebody opens most. `relation` sorts after `project` and before `someone`, so the project keeps the
   * bare name, then the organisation, then a person. Founder's own `organisation` page went at Founder 2.0.0, and the numbers it
   * drew are added to this page by Founder (`adds` in `usecases/founder.ts`).
   *
   * ITS MONEY ONLY WHERE THE RECORD HOLDS MONEY, for the reason a person's page has none: a block over Money's lists
   * written into every record's People would refuse People's install on every record without Money. The Money block
   * below is left out of the document for such a record (`firstPartyDocument`), and its Projects with it.
   */
  relation: {
    page: 'relation',
    title: '{{name}}',
    for: { register: 'organisations' },
    icon: 'grid',
    pack: 'people',
    /* PROJECTS' AND MONEY'S LISTS ARE NAMED FOR THE BLOCKS THAT READ THEM, and both go from a record's copy with those
       blocks where it holds neither (`placed` in `packs/first-party.ts`). */
    requires: ['register.organisations', 'register.people', 'register.things', 'register.transactions'],
    blocks: [
      {
        kind: 'cards',
        lead: true,
        span: 12,
        source: 'register.organisations',
        where: 'name is {{name}}',
        columns: [
          { field: 'name', label: 'Organisation', as: 'who' },
          { field: 'kind', label: 'Kind', as: 'fact' },
          { field: 'domain', label: 'Website', as: 'fact' },
        ],
        /* NO PROJECTS ON THE CARD, SINCE People 3.0.0: they are a list of their own under it, each opening its page, and
           a card saying them again was the same names twice on one screen. */
        limit: 1,
        empty: 'Nothing is kept about {{name}} yet.',
      },
      {
        /* WHO IS WITH IT, the one last in touch first, each opening their own page. */
        kind: 'cards',
        heading: 'People',
        icon: 'people',
        span: 12,
        source: 'register.people',
        where: 'org is {{name}}, merged_into is empty',
        columns: [
          { field: 'name', label: 'Name', as: 'who' },
          { field: 'role', label: 'Role', as: 'fact' },
          { field: 'in_touch', label: 'Last in touch', as: 'when' },
        ],
        order: [
          { field: 'in_touch', dir: 'desc' },
          { field: 'seq', dir: 'desc' },
        ],
        empty: 'Nobody here is known to be with {{name}} yet.',
      },
      /* ITS PROJECTS AND ITS MONEY, SINCE People 3.0.0, each a list under its heading and each opening its own page:
         the projects it is part of (`projects`, which `meet` adds to), and what moved with it, the latest first, signed
         by its own direction as Money's own list is. Neither says it is empty, and an organisation with neither draws
         only its people.

         OVER LISTS PEOPLE DOES NOT HOLD, SO DRAWN ONLY WHERE THE RECORD HOLDS THEM. `firstPartyDocument` keeps a block
         of one pack's page over another pack's list only when the record it is written for holds that list, as it keeps
         a walk's leg (`packs/first-party.ts`), so People still installs first and alone; a record that takes Money or
         Projects later gains these when People is next updated. */
      {
        kind: 'cards',
        heading: 'Projects',
        icon: 'thing',
        span: 12,
        source: 'register.things',
        where: 'id is {{projects}}',
        columns: [
          { field: 'name', as: 'title' },
          { field: 'next', label: 'Next step', as: 'fact' },
        ],
        limit: 8,
      },
      {
        kind: 'timeline',
        heading: 'Money',
        icon: 'receipt',
        span: 12,
        source: 'register.transactions',
        where: 'state is not void, party is {{name}}',
        columns: [{ field: 'on' }, { field: 'what' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }],
        order: [{ field: 'on', dir: 'desc' }],
        limit: 8,
      },
      {
        kind: 'note',
        heading: 'Seen in',
        icon: 'handshake',
        span: 12,
        body: '{{met}}',
        empty: 'Nothing is kept about where {{name}} was seen yet.',
      },
      {
        kind: 'note',
        document: true,
        heading: 'Notes',
        icon: 'doc',
        span: 12,
        body: '{{note}}',
        empty: 'Nothing is written about {{name}} yet.',
      },
    ],
  },
};

/**
 * THE WORDS A PERSON USES FOR WHAT THIS PACK KEEPS, which the first run listens for in the sentence it is told
 * (`apps/web/src/lib/shape.ts`), carried in its manifest as `signals` (`firstPartyManifest`). Kept with the pack's own
 * declarations, as an add-on's are in its file: they are its words, and a word one of them shares with an add-on's id
 * ("subscriptions") is the pack's to say and not the code's that reads it. Lower-case words and short phrases, each
 * inflection written out, because the reader matches whole words and never stems.
 */
export const PEOPLE_SIGNALS: readonly string[] = [
  'freelance', 'freelances', 'freelanced', 'freelancing', 'freelancer', 'freelancers', 'team', 'staff', 'employee', 'employees',
  'contractor', 'contractors', 'client', 'clients', 'customer', 'customers', 'collaborator', 'collaborators', 'partner', 'partners',
  'accountant', 'accountants', 'people', 'colleague', 'colleagues', 'cofounder', 'cofounders', 'co-founder', 'co-founders',
];

/**
 * THE WIDGET PEOPLE BRINGS TO TODAY (SHL-A22, 30 October), in the shape an add-on's manifest `widgets` takes, joined to
 * the core's at read time. It was the core's own catalogue's until today, which named this module's list by id.
 */
export const PEOPLE_WIDGETS = {
  pack: 'people',
  title: 'People',
  widgets: [
    {
      id: 'people-back',
      title: 'People to get back to',
      says: 'People you have not been in touch with for three months.',
      group: 'people',
      for: 'both',
      icon: 'users',
      block: {
        kind: 'cards',
        heading: 'People to get back to',
        icon: 'users',
        source: 'register.people',
        where: 'merged_into is empty, self is not true, in_touch before -90d',
        columns: [{ field: 'name', as: 'who' }, { field: 'in_touch', as: 'fact', label: 'Last in touch' }],
        order: [{ field: 'in_touch', dir: 'asc' }],
        limit: 6,
        empty: 'You are in touch with everyone.',
      },
      sizes: ['wide', 'tall', 'large', 'full'],
      size: 'tall',
      needs: { lists: ['people'] },
      rows: { title: 'name', day: 'in_touch' },
      example: { rows: [{ title: 'Priya Shah', meta: 'Last in touch 2 Jul' }, { title: 'Omar Fathy', meta: 'Last in touch 14 Jun' }] },
      words: ['contacts', 'friends', 'clients', 'catch up', 'in touch'],
      asked: [{ match: "\\b(get back to|in touch|haven'?t (talked|spoken|heard))\\b", about: 'who to get back to' }],
      leads: ['people'],
    },
  ],
};
