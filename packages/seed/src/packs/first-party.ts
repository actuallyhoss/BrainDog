/**
 * The first-party packs one at a time: `portfolio`, `people`, `money-core`, `estate` and `work`, each
 * as a document `@braindog/declare` reads (docs/04-PACKS.md §6).
 *
 * SPLIT FROM THE STARTER, NOT WRITTEN BESIDE IT. Every declaration and every seed here is taken from
 * `packDocument()`, so the five documents and the combined one cannot say different things about a
 * register. A declaration goes to the pack its body names with `pack:`, and a page or metric that
 * names none goes to the one pack whose registers it reads.
 *
 * ONE DECLARATION BELONGS TO NONE OF THEM. The project template reads tasks, money and services at
 * once, so putting it in any one of those packs would make that pack require the other two, and a
 * person who asked only for Work would be handed Money as well. It stays in the starter, and
 * `crossPack()` names it.
 *
 * `requires` IS READ FROM THE BODIES, as the agents pack's is written: every register a field points
 * at, a page requires or a metric reads, less the pack's own and the kernel's `session`. The document
 * format names packs it depends on and not registers, and a record whose lists came from the seed has
 * no `pack` row for them, so the document says `packs: {}` and the installer checks the manifest.
 *
 * FUNCTIONS AND NOT CONSTANTS, because `index.ts` re-exports this file and this file reads
 * `index.ts`: a constant computed here would run before the declarations it reads exist.
 */

import { packDocument } from '../index.ts';
import { MONEY_HOME_SETTING, targetConfigOf } from '../modules/money.ts';
import { estateTargetConfig } from '../modules/estate.ts';
import type { PackManifest } from './agents.ts';

export type FirstPartyId = 'portfolio' | 'people' | 'money-core' | 'estate' | 'work';

/** Dependencies first: every other list points at a project, and Money points at People. */
export const FIRST_PARTY: readonly FirstPartyId[] = ['portfolio', 'people', 'money-core', 'estate', 'work'];

const SUMMARIES: Record<FirstPartyId, string> = {
  portfolio: 'The things you run, and the plan for each.',
  people: 'Clients, contractors and accountants, the organisations they are with, and where each one was seen.',
  'money-core': 'Cash, what comes in and what goes out, with a date and a currency.',
  estate: 'Domains, hosting, subscriptions, memberships, insurance and bills, and when each one renews.',
  work: 'Tasks, the threads of work they belong to, and how each thread is going.',
};

/**
 * THE WORDS A PERSON USES FOR WHAT EACH PACK KEEPS, which the first run listens for in the sentence it is told
 * (`apps/web/src/lib/shape.ts`). They are the manifest's, the way a use case's `signals` are its own, so
 * the first run reads a first-party pack exactly as it reads anything else in the catalogue, and a pack from the Kennel
 * that says what it is for can be offered on the same terms.
 *
 * Lower-case words and short phrases, each inflection written out, because the reader matches whole words and never
 * stems: "invoicing" is a signal of its own. A word may belong to two packs: "freelance" says there is money and there
 * are clients. "track" is in none, since "I track a few side projects" is a verb about projects and not a Work list.
 */
const SIGNALS: Record<FirstPartyId, readonly string[]> = {
  portfolio: [
    'project', 'projects', 'side project', 'side projects', 'side-project', 'side-projects', 'product', 'products', 'app', 'apps',
    'studio', 'shop', 'store', 'brand', 'brands', 'game', 'games', 'agency', 'foundry', 'website', 'websites',
  ],
  people: [
    'freelance', 'freelances', 'freelanced', 'freelancing', 'freelancer', 'freelancers', 'team', 'staff', 'employee', 'employees',
    'contractor', 'contractors', 'client', 'clients', 'customer', 'customers', 'collaborator', 'collaborators', 'partner', 'partners',
    'accountant', 'accountants', 'people', 'colleague', 'colleagues', 'cofounder', 'cofounders', 'co-founder', 'co-founders',
  ],
  'money-core': [
    'freelance', 'freelances', 'freelanced', 'freelancing', 'freelancer', 'invoice', 'invoices', 'invoiced', 'invoicing', 'bill',
    'bills', 'billed', 'billing', 'retainer', 'retainers', 'owe', 'owes', 'owed', 'owing', 'payment', 'payments', 'paid', 'vat',
    'tax', 'taxes', 'money', 'cash', 'fee', 'fees', 'charge', 'charges', 'charged', 'charging',
  ],
  estate: [
    'domain', 'domains', 'hosting', 'server', 'servers', 'subscription', 'subscriptions', 'saas', 'licence', 'licences', 'license',
    'licenses', 'certificate', 'certificates', 'renewal', 'renewals',
  ],
  work: ['task', 'tasks', 'todo', 'todos', 'to-do', 'to-dos', 'deadline', 'deadlines', 'sprint', 'sprints', 'backlog', 'roadmap', 'milestone', 'milestones'],
};

/**
 * EACH PACK'S OWN VERSION. A record is offered an update when the version here is later than the one it installed, so a
 * pack whose declarations or settings change goes up, and one that did not stays where it is: nobody is asked to update
 * Estate because Work gained a field. A new field, page, figure or setting is a minor step; a list or field taken away is
 * a major one. `test/pack-versions.test.ts` holds each version to what it declares, and fails when a pack changes and its
 * version does not.
 *
 * - portfolio 1.1.0: a project says how it is going, what is next, how far along it is and which agent holds it, with
 *   the Overview and the rule over them.
 * - portfolio 1.2.0: How they are going draws each part in its intent.
 * - portfolio 1.3.0: a project says what it earned in a year and what it earned the year before, and the Overview draws
 *   both: the twelve-month total beside the year before it, the difference, and a bar a project. One field added, so the
 *   step is a minor one and nothing is taken away.
 * - portfolio 1.4.0: the Earning figures stop being a sum over every project in play and become a sum over the
 *   projects that said what they earn, which is the same row set the bar beside them draws, and the tile says how
 *   many of them there were. A record where nobody has said anything read `Earned in a year GBP 0.00` in the tone
 *   the product uses for good news. One figure added, `projects-earning-said`, so the step is a minor one.
 * - money-core 1.1.0: the home currency is chosen from a list.
 * - money-core 1.2.0: the ledger arrives: transactions, categories, recurring items, instalments and snapshots, with
 *   the rules over them and the figures they carry. Five lists, so the step is a minor one and nothing is taken away.
 * - money-core 1.3.0: a night can be found by the name it is shown under, the Ledger page tiles, an account says its
 *   last four digits, and the whole book you owe is a figure. Snapshots gain a searchable text title, `accounts` gains
 *   `last4`, the two three-column tables at the foot of Ledger are half and half instead of 7 and a 5 the clamp widened
 *   to 6, and `owed-by-you` is the fourth of the four figures a snapshot holds. Two fields and one figure added and
 *   nothing taken away, so the step is a minor one.
 * - money-core 1.4.0: NOTHING NEW IS DECLARED AT 1.4.0, and that is the point of it. The declarations under the label
 *   1.3.0 were rewritten five times in the seven hours and forty-seven minutes after the label was set, and the last but
 *   one of those, `491e7e05`, added `recurring-ended`, the rule that moves a schedule to `ended` once its last day is
 *   past. A record that installed any earlier 1.3.0 is never offered that rule, so it goes on counting a stopped row at
 *   its full monthly share, GBP 249.00 a month on the row that commit measured. 1.3.0 therefore names five different
 *   sets of declarations and cannot be asked what a record holds, so it is retired and 1.4.0 names what the pack
 *   declares today. Minor and not major by the rule above, which asks a major step for a list or a field taken away: the
 *   two declarations 1.3.0 lost are figures, `recurring-out-month` and `recurring-in-month`, and both registers they read
 *   are still here. They were NOT a second name for `every-month-out` and `every-month-in`, and it is worth saying so
 *   because the short version of this reads as though nothing was lost. They read a different list over a different
 *   filter and gave a different answer to the same question: `62511a98` measured GBP 10,416.16 off `obligations.repeats`
 *   against GBP 9,196.33 off `recurring`, on two pages two clicks apart, and dropped the second because a reader had no
 *   way to tell which one the record meant. So a record on the 17:53 to 18:52 build of 1.3.0 does lose two figures at
 *   1.4.0, and what it loses is the half of a contradiction this pack has since decided against.
 *   `test/pack-versions.test.ts` records all five resets and refuses a sixth.
 * - money-core 1.5.0: a register for what you hold. Gold, a saving certificate and an insurance policy each have a
 *   cost, a day they were acquired and sometimes a day they mature, and until now the only list that would take them was
 *   an account with a balance, which counts a policy as cash somebody could spend. `holdings` is the list that does not.
 *   One list added and nothing taken away, so the step is a minor one.
 * - money-core 1.7.0: a bank text message files itself. Each of the eight bank patterns gains a webhook twin, the same
 *   reading under the id `<pattern>-sms`, which an iOS Shortcut posts the SMS to at an address carrying a token only an
 *   owner can make. Until the token is made every message posted there waits in the inbox, and none is written. Eight
 *   declarations added and nothing taken away, so the step is a minor one.
 * - money-core 1.8.0: one Egyptian bank's wordings leave for a pack of their own, now a file under `packs/`.
 *   Six mail patterns and their six `-sms` twins read one bank in one country, and every record set up as Personal,
 *   Founder or Small business carried them, which is a use case the shell may not carry. The two generic card wordings stay. Twelve
 *   ingests taken away and no list and no field, so by the rule above the step is a minor one, as 1.4.0's two figures
 *   were. A record on 1.7.0 that updates keeps those of the twelve it uses: the update hands them to the bank's pack
 *   (`hands`) rather than retiring them, and that pack takes them over when it installs. One it
 *   never used, no token minted and no row filed, is retired, which `declare`'s plan decides from the record's `used`
 *   (`test/bank-pack.test.ts`); handing all twelve left every updated record holding a pack it never chose. Until the
 *   record fills `used`, the plan cannot tell and still hands all twelve. The bank pack needs `^1.8.0` so that it cannot
 *   be installed first and collide with money-core's own ids. A path token minted for one of the six twins survives the
 *   move, because a handed twin is never retired and `heldDigest` in `packages/record/src/index.ts` keeps
 *   a digest while every version since the mint is live (`packages/declare/test/door-hold.test.ts`). A record already
 *   updated to 1.8.0 before the handover existed lost the twelve, and there the owner installs the pack and mints again.
 *   Both handovers were taken out of the document under 2.4.0, the last entry below.
 * - money-core 2.0.0: `holdings` leaves for a pack of its own, `packs/holdings`, and `gold` leaves with it.
 *   What one person holds is not what everybody's Money is for, and gold among the list's kinds was a use case
 *   the shell may not carry. A list taken away, so by the rule above the step is major, the first
 *   this pack has taken. The list is HANDED, not retired (`hands`), so a record holding rows in it
 *   keeps every row, its id and its history, and the holdings pack takes it over when it installs, keeping `gold` as the
 *   record's own kind where rows were written under it (`test/holdings-pack.test.ts`). An empty list on a record that
 *   says what it uses is retired instead, and the pack declares it afresh. The two packs that require money-core had
 *   caret ranges on 1.x, which no 2.0.0 satisfies and which the range grammar cannot widen with `||`,
 *   so the bank's pack and every Mercury pack widen to `<3.0.0` in the same change,
 *   each with a version step of its own (`test/money-core-major.test.ts`).
 * - money-core 2.1.0: a transaction says what the bank said was left after it moved, `available`, as a card alert prints
 *   its available limit. Two card alerts in a hundred real bank texts had the same amount, merchant and day, and the near
 *   rule skipped the second as already said although their limits differ by exactly the charge;
 *   the bank's pack at 1.2.0 reads the limit into this field and names it in its `dedupe:`,
 *   so two charges file and one alert sent twice files once. One field added and nothing taken away, so the step is a
 *   minor one, and a new version rather than a reset because 2.0.0 shipped with the deploy of 23 September at 08:02 UTC.
 *   2.1.0 SHIPPED AS THAT AND NOTHING MORE, with the deploy of `bab716a5` at 23:27 UTC on 23 September. `baf7048a` put
 *   `pairs:` under 2.1.0 eleven minutes later, reading the deploy before that one as the last; a record on the shipped
 *   2.1.0 would never have been offered it, so it moved to 2.2.0 below.
 * - money-core 2.2.0: the record finds a transfer's two legs. `register.transactions` declares `pairs:`: the same amount
 *   in the same currency, one out and one in, two accounts, within four days, both cleared, and neither naming who it
 *   was with or the obligation it paid. Both are marked `transfer` and each names the other in `_pair`
 *   (`test/money-pairs.test.ts`). A void or pending row pairs with nothing, since no figure counts it and pairing one
 *   hid the cleared payment beside it; a row with a Who or a Settles pairs with nothing, since rent and a client's
 *   payment of the same sum a day apart were paired and left both Spent and Received.
 *   Before any of it, two such rows written by the import
 *   were GBP 4,000.00 of "Spent, 30 days" until a person marked them. Nothing is added to the ids a record holds and
 *   nothing is taken away, so the step is a minor one.
 * - money-core 2.3.0: a reconciled card bill stays a move. At 2.2.0 setting `settles` on the bank leg of a card bill,
 *   which is what Reconcile does, parted a pair the record had made, and EGP 9,500.00 read as spent and as received on
 *   top of the purchases the bill paid. `pairs.where` now lets a
 *   leg that settles something stay paired while it holds the mark, and still refuses it as the start of a new pair, so
 *   rent written already reconciled is not paired with a client's payment (`test/money-card-bill.test.ts`). Nothing is
 *   added and nothing is taken away, so the step is a minor one. A version and not a reset because 2.2.0 is on
 *   `origin/master` (`814ca32c`) and deployed.
 * - money-core 2.4.0: a repeating row in Money says the last day it moves money on. `obligations` gains `ends`, a day,
 *   and the obligations leg of both walks on `page.money` names it, so a line an import says ends on 10 November stops
 *   walking on the 10th instead of every month to the horizon (`test/money-ends.test.ts`). The engines learned the end in
 *   `5d4bbf8b`, and the import writes it only where the list declares it, so until this step it wrote it nowhere. One
 *   field added and nothing taken away, so the step is a minor one. A version and not a reset because 2.3.0 is on
 *   `origin/master` (`5dc5a7c6`) and deployed.
 * - money-core 2.5.0: Cash ahead turns on the forecast's later controls, and an instalment says which plan it is in.
 *   The installments leg both walks on `page.money` read names `group: 'plan'`, so every part of the proofing press
 *   reaches the chart as one plan and the count control can take it in or out whole, where each part was its own
 *   one-off; Cash ahead's `knobs` add `grow`, `drift` and `count` to the first four (`test/money-forecast-knobs.test.ts`).
 *   No list, field or id moves, so the step is a minor one. A version
 *   and not a reset because 2.4.0 is on `origin/master` (`7fa92aa4`).
 * - estate 1.2.0: a service carries a note. An imported domain register carried the reason each name is held and what is
 *   unresolved about it, and Services had no field that holds prose, so the import left every note in the export. One
 *   field added and nothing taken away, so the step is a minor one. It moves the version rather than riding on 1.1.0
 *   because a record on 1.1.0 is told about the field only through an update, and without one the importer would be
 *   sending a field that record answers `FIELD_UNKNOWN` to.
 * - work 1.1.0: tasks gain an owner, an agent, a priority, steps, a done day and a Backlog status; the Overview and the
 *   Board pages, and the figures under them.
 * - work 1.2.0: Open, on Work and on a project, leaves out work kept for later, and Kept for later is its own figure.
 * - work 1.4.0: the Board says which cards an agent is on right now.
 * - work 1.5.0: Due soon on the Overview stops drawing what is already in the queue above it, and the queue says when
 *   each of its tickets is due. Driven against the sample at 390 and at 1440, the Overview drew three of its fourteen
 *   tickets twice on one screen. Nothing is taken away and no list or field moves, so the step is a minor one: what
 *   changed is `page.work`'s Due soon predicate, its empty line, which would otherwise say nothing is due while blocked
 *   work is, and the Waiting on you columns.
 * - work 1.6.0: the Overview leads with what to do, as lists a person ticks. Waiting on you, Due soon and With an agent
 *   were tables, so a task could be finished from the Board and from a project's page and not from Work's own Overview.
 *   They are now six `todo` lists cut so that no task falls under two: Today, This week, Waiting on you, With an agent,
 *   After this week and Later. No list or field moves and nothing is taken away but the tables' extra columns, so the
 *   step is a minor one. It is a step and not a reset because 1.5.0 has been released: the last successful deploy,
 *   on 21 September at 16:23 UTC, came after `79f17031` set it. Still under 1.6.0, because nothing has deployed since:
 *   a seventh list, No due day, holds a task of yours with no due day, which none of the six could, so every task in
 *   play is under exactly one list.
 * - people 2.0.0: `role` stops offering `registrar`, a role only a studio that holds domains has, and a use case the
 *   shell may not carry. Taking a value away is a major step. A record whose rows hold it keeps it as its own word.
 * - work 1.7.0: `updates.by` opens from a closed list of four agent vendors to text, a widening, so an update by any
 *   author lands. Nothing is taken away, so the step is a minor one.
 * - work 1.8.0: a task's follow-ups close with it and start in its project. Two rules and the two scripts they
 *   start (`WORK_AUTOMATIONS` in `modules/work.ts`): moving a task to done closes every step `Part of` it still open,
 *   doing or blocked, and a step created with a parent and no project takes the parent's project and thread. Four ids
 *   are added and nothing is taken away, so the step is a minor one. A version and not a reset because 1.7.0 is on
 *   `origin/master` (`814ca32c`), and an id gained is a declaration a record on 1.7.0 could never be told about.
 * - work 1.9.0: the Overview is called Work and leads with a capture line; the lists of yours and the Board are
 *   ordered by tier then due; it adds a queue of what agents ask about tasks, a timeline of the next two weeks and a
 *   heat of what was done in twelve weeks; tasks gain an optional `why`, and `register.tasks` declares `hand`
 *   (`person: owner, agent: agent, taken: doing`), so `ROLE_KEYS` drops only the `person` part on a record with no
 *   People and a task still hands to an agent. Blocks and a field are added and nothing is taken away, so the step is
 *   a minor one.
 * - money-core 2.4.0, NO STEP: `hands` is gone, so the core pack names no other pack
 *   (`test/money-core-names-no-pack.test.ts`). It gave the bank's twelve patterns and `holdings` to the two
 *   packs that are now files under `packs/`, which is the core knowing one person's bank and one person's list by id.
 *   No declaration and no setting changed, and those are what `test/pack-versions.test.ts` fingerprints, so the
 *   version stays. WHAT A RECORD LOSES, measured through `declare`'s plan: one still on 1.7.0 updating now retires the
 *   twelve instead of handing them, so a Shortcut token minted there stops opening its door until the owner installs
 *   the bank's pack and mints again; one on 1.5.0 to 1.8.0 holding rows in `holdings` is refused `WOULD_ORPHAN` rather
 *   than losing them. A survey found no record on a money-core before 1.8.0. The handover itself
 *   is still `declare`'s, and its tests make their own `hands` (`test/pack-files.ts`).
 * - money-core 3.0.0, THE CARD ALERTS' PART OF IT: the two card wordings, `bank-card-out` and `bank-card-in`, and their
 *   two `-sms` twins leave for `packs/card-alerts`, so a record set up with Money carries no bank's wording and no text
 *   door it did not ask for. Four ingests taken away. With no `hands` since the 2.4.0
 *   entry above, a record updating retires the four, so a Shortcut token minted for a twin stops opening its door until
 *   the owner installs `card-alerts` and mints again.
 * - money-core 3.0.0, THE REST OF IT: one page called Money in place of Overview, Ledger and the house Home, which
 *   retire (a page holds no rows). Cash now is rolled forward from each account's newest balance through what moved
 *   since, and a new list, `balances`, holds the balance checks it restarts from. What repeats lives in Repeating, which
 *   the cash walk reads at every cadence (weekly, fortnightly and twice a month join monthly, quarterly and yearly), and
 *   an obligation's `repeats` is kept on its rows and walked no more. Obligations is called Bills and invoices, stamps
 *   `settled` when a row is paid, and gains neutral categories beside the studio's, which stay for the rows that hold
 *   them. An account gains `arrives`, a transaction `balance_after`, a category `match_by`. Every money figure is
 *   `format: money`, and a money ceiling is a setting with no default. Money no longer needs People: who a row is with
 *   is a link (`LINKS` below). Two pages taken away, so the step is a major one; every list, field and figure id stays.
 * - estate 1.3.0: Services says a row holds who it is with, where it said a registrar, which is what a domain is held
 *   with and not what hosting, a subscription or a certificate is. The words of `holds` change and no id moves, so the
 *   step is a minor one. A version and not a reset because 1.2.0 is on `origin/master` (`8b8915e4`).
 * - people 2.1.0: People says it is the list `meet` writes, `meets:` naming the field for each part, so the kernel reads
 *   the role off the list instead of finding a list called `people` (`LEGACY` in `packages/kernel/src/roles.ts`). On a
 *   record with no Projects the `projects` part goes with the field it names (`without` below). A key added to a list
 *   and nothing taken away, so the step is a minor one.
 * - money-core 3.1.0: books keep money that is not one person's apart. A `books` list, an optional `book` on every list
 *   that holds money, a page per book under Money (`money-book`) with its own walk, and one Cash now per book once there
 *   are two. `chased` on obligations: a late invoice answered Chase it is stamped chased (`rule.invoice-chased`), and a
 *   repeating line answered It stopped is ended (`rule.recurring-stopped`). A stale balance is a digest line and not a
 *   question, a repeating line past its day asks, and an account or book that rows point at cannot be deleted
 *   (`delete: refuse_while_referenced`). One list, fields, figures, a page and two automations added and nothing taken
 *   away, so the step is a minor one.
 * - portfolio 1.5.0: a project page leads with the questions waiting on it, draws what changed on it, its plan on a time
 *   axis when its tasks have days and its money month by month, signs the amount on its Money table, drops the agent
 *   code block, and every money figure is in the record's own currency (`format: money`) with its target a setting,
 *   and ends with what it runs on (`runs_on`): its keys, tools and servers and skills with where each applies and who
 *   used it last, and its scheduled actions under a section that names its panel.
 * - estate 2.0.0: Services keeps subscriptions, memberships, insurance and utilities, opens with what it costs a month,
 *   asks before a renewal (`rule.renew-soon`) and marks a passed renewal lapsing (`rule.renewal-passed`), pins Renews in
 *   30 days to Home, and every target is a setting with no default. A major step because the gauge and its fixed
 *   targets are taken away.
 * - people 2.2.0: one page per person (`page.someone`), with who they are, the projects they were met in and what is
 *   written about them; People's own page is placed under a People section and its cards leave out the agent's `met`
 *   lines; and a person that other rows still name is not deleted (`delete: refuse_while_referenced`). A page and a
 *   list key are added and nothing is taken away, so the step is a minor one.
 * - people 2.3.0: `rule.meet-senders` meets whoever a mail arrives from, on by default, as an agent's own `meet`
 *   already does for a commit; `page.someone` draws the person's `met` lines, which `page.people`'s cards still leave
 *   out. A declaration is added and nothing is taken away, so the step is a minor one.
 * - people 2.3.1 and work 1.9.1: NOTHING NEW IS DECLARED, as at money-core 1.4.0. A record set up for a use case before
 *   `planShared` held the whole batch built People and Work beside Portfolio as though Projects were not coming, and
 *   left out Met in, Project and Owner for good. A record holding a pack at its offered version is offered no change,
 *   so this step is what lets such a record take the update and have the links put back, and nothing else moves.
 * - portfolio 1.6.0: the Overview is built to the new look. It opens with one
 *   sentence said from how many projects need you, draws every project's status as one track (`projects-by-lane`), draws
 *   what each earns as one track cut into parts where it was a bar a project, and In play and Earning carry twelve
 *   weeks as a line (`snapshot` on `projects-live` and `projects-earning`). A project says what it is in a line
 *   (`about`), which its card draws under its name beside its own mark and hue. A field, a figure and blocks added and
 *   nothing taken away, so the step is a minor one. The project page moves with it, though no pack holds that page
 *   (`crossPack`): the open work tallied by priority, the month's money in, out and kept, the dates as weeks, the
 *   questions as tiles and what it runs on as cards in the rail.
 * - money-core 3.2.0: Money is built to the new look. It opens with one sentence said
 *   from what there is and when the walk goes under, each of the three tiles beside Cash now carries twelve weeks as a
 *   line (`snapshot` on `runway-days`, `arriving-30d` and `leaving-30d`), Cash ahead sits beside the next thirty days,
 *   the questions are tiles, and what is paid in parts is one track a plan. Three figures a project page reads are
 *   Money's by the list they read: `project-in-month`, `project-out-month` and `project-kept-month`. Figures and blocks
 *   added and nothing taken away, so the step is a minor one.
 * - money-core 3.3.0: Money is calmer. One line of what the money is doing, Cash now cut by account (`cash-by-account`)
 *   in place of a card an account, the month ahead as a calendar (`due-items-30d`), what moved as a list, an Out of date
 *   note over `balances-stale`, and receivables and payables named as such. The line says how far cash moved on a month
 *   ago (`{{cash-now.change}}`) when the night remembered it, Waiting on you is drawn only while something is asked
 *   (`questions-open`), and a tile shares a row only with one drawn on the same figure, so no row is left half empty
 *   whatever is hidden. Figures added and no list or field taken away, so the step is a minor one.
 * - people 2.4.0: People gains Last in touch (`in_touch`), which `meet` moves to the day it writes a line (`meets:`),
 *   and four figures over it, and its page opens on one line. A field and figures added, so the step is a minor one.
 * - work 1.10.0: Work is the Work screen's bands, declared: Late, Today, This week, With an agent, Waiting on you and
 *   Done recently, each drawn only while it holds something, what is further off folded, and two figures in place of
 *   four. A figure is added (`project-done-by-week`) and blocks are taken away, no list or field, so the step is a
 *   minor one. The project page moves with it, though no pack holds that page (`crossPack`): its finished work by the
 *   week takes the place of the tally of open work by priority, which said again what its list says. Late, Today and
 *   This week are each drawn on a figure of your own tasks over the band's own clauses (`tasks-late-yours`,
 *   `tasks-today-yours`, `tasks-week-yours`), and With an agent counts only what an agent has in hand, so no band is
 *   drawn empty and the line's 'late' is the Late band's count.
 * - portfolio 1.7.0: each card in play draws a line of the work finished on it each week, over Work's
 *   `project-done-by-week`, left out on a record without Work. A column added and nothing taken away, so the step is a
 *   minor one.
 * - money-core 3.4.0, work 1.11.0, estate 2.1.0 and portfolio 1.8.0: every page is calmer (DIRECTION §35). Each opens
 *   on its line, shows at most six tiles before the rest is folded shut, wears a glyph on every heading, draws a tile
 *   only while its figure has any, and says none of the line's figures again: Money loses the What you have tile and
 *   two of its three views of the month, Work its Open figure, Services its Cost per year and chips by type, and the
 *   Overview its Need you and Parked figures and its Earning tile. Work's page filters by project (`filters:`). Figures
 *   are added to draw tiles on and blocks are taken away, no list or field, so each step is a minor one. The project
 *   page moves with them, though no pack holds it (`crossPack`): six tiles, then its history, its money and what it
 *   runs on folded shut, its dates drawn once on the plan and its month once on the chart.
 * - portfolio 1.9.0: the page is called Projects, as the top bar calls it, Right now is a third of the row beside the
 *   two splits and is drawn only while a project is in play, and a project's status reads Earning, Building, Parked and
 *   Finished. Words, a span and a `when:` on blocks that are already there, no list, field or figure added or taken
 *   away, so the step is a minor one: a record holding 1.8.0 is offered it. The project page moves with it, though no
 *   pack holds it (`crossPack`): it always opens on a line, the work handed back when there is any and otherwise the
 *   project's next step, which Where it stands no longer says a second time.
 * - portfolio 1.10.0, money-core 3.5.0 and work 1.12.0: every row of tiles ends at one height (the visual review of
 *   October 2nd). The Overview's Right now goes into its line ("3 projects in play, 2 at risk or off track") and the two
 *   splits take half the row each. Money's three one-line notes, an old balance, money late coming in and money late
 *   going out, are three lines of one boxed Heads up under Accounts. Work draws Today the whole width and Late and This
 *   week side by side under it. Each folded heading wears a glyph the app draws there. Work gains `project-held-up`,
 *   what on a project is handed back or blocked, and blocks move, no list or field is taken away, so each step is a minor
 *   one. The project page moves with them, though no pack holds it (`crossPack`): where it stands and what is handed
 *   back sit in the rail beside the chart, What is open goes since the plan draws the same tasks, and what is handed back
 *   is drawn only while it lists a task.
 * - people 2.5.0: In touch, 12 weeks is a line a person (`people: true`, columns `day | who`), the latest drawn and the
 *   rest counted, in place of a grid of days that said when anybody was in touch and never who. A key on a block that is
 *   already there, no list, field or figure added or taken away, so the step is a minor one.
 * - portfolio 1.11.0 and money-core 3.6.0: each thing said once (the visual review of October 2nd). Projects loses Needs
 *   you, whose health and next step every card in play already says, and Where they are, leaving one track of how they
 *   are going the whole width. Cash ahead leaves its own sentence off while the line over the page says when the money
 *   runs out (`headline: under`). Blocks taken away and a key added, no list, field or figure, so each step is a minor
 *   one.
 * - people 2.6.0: In touch, 12 weeks says its form as `who: true`, the word the app reads, where 2.5.0 wrote `people:
 *   true`. The record still reads the old word on a page that holds 2.5.0. A key renamed on a block that is already
 *   there, so the step is a minor one.
 * - portfolio 1.12.0, people 2.7.0, work 1.13.0 and money-core 3.7.0: first lines that name things and fewer labels
 *   (the visual review of October 2nd). Each page's line names what it is about from the record's own rows, through
 *   the figure paths `.first`, `.names`, `.more` and `.since` (`kernel/src/pages.ts` `rowsValue`): the task late longest
 *   on Work, who has gone quiet and since when on People, which projects need a push and which are on track on
 *   Projects (a figure added, `projects-on-track`). How they are going draws only past four projects in play, the cards
 *   lose their Health and How far along labels, and Cash ahead opens on three months with every longer length still on
 *   its control, now that the record walks to the longest of `horizons:`. Notes split on a `when:`, a figure and a key
 *   added, nothing taken away, so each step is a minor one. The project page moves with them, though no pack holds it
 *   (`crossPack`): its line is the next step alone, Where it stands is headed by how it is going with the agent last,
 *   and what is handed back is a to-do with no Changed by.
 * - portfolio 1.13.0, money-core 3.8.0 and work 1.14.0: each page says only what is true of the record (DIRECTION §37).
 *   Projects says an empty page in its line, with a third line for nothing in play, draws In play only while one is,
 *   lets no other block say it is empty, and reads one project for Parked and finished's count. Money draws Accounts
 *   only while there is cash to cut and a book's month only while something left it (`book-spent-month` added). Work
 *   says an empty list in one line and no band says it is empty. A figure added and empty lines taken away, no list or
 *   field, so each step is a minor one.
 * - money-core 3.9.0: Cash ahead, on Money and on a book's page, offers two years at most. The record walked the longest
 *   of `horizons:` on every load (3.7.0), so five years and `last` made each opening of Money walk at least 1,825 days
 *   for a chart that opens on 90, and as far as ten years over a long plan (research audit 11-13). The longest length
 *   is still what a walk may cost, whether a load walks it or a reader asks for it. Two lengths taken off a control, no
 *   list, field or figure, so the step is a minor one.
 * - people 3.0.0, money-core 3.10.0 and portfolio 1.14.0: the record understands who and what it meets
 *   (`loop/contract-17.md`, DIRECTION §38). People gains Organisations, moved from the Founder use case under the same
 *   id so a founder's rows stay, declared as the list `meet` writes a company into (`org:`), with a page each
 *   (`page.relation`) listing its people. A person gains every key they are known by, the organisation they are with,
 *   the other names they go by and whether they are the record's own person, all named in `meets:`, and their page
 *   lists where they were seen. `rule.meet-senders` meets a mail's sender by its parsed address and name,
 *   and a no-reply sender or one a door's pattern claims (`rule.meet-sender-organisations`) as the organisation behind
 *   the domain. Founder's list loses `country`, `currency` and `accounts` here, so People's step is a major one.
 *   Money's ledger names an organisation in `party`, where it named a person. A MINOR STEP, THOUGH A FIELD POINTS
 *   ELSEWHERE: no list or field is taken away, no row on a record we know of held a `party` (none of 217 on the
 *   owner's), the plan does not count a ref's target as a retype, and a major step would put money-core outside the
 *   `<4.0.0` every money add-on asks for, refusing their next install for a change none of them reads. The ledger
 *   gains `counterparty_text`, the payee as the bank wrote it, which every bank door writes: Money's list declares it
 *   once, where each bank add-on laying its own was a conflict between any two of them. Cash ahead, on Money and on a
 *   book's page, offers five years and `last` again (research audit 16, H1): the kernel now walks two years at most
 *   unasked (`WALK_UNASKED`) and further only when a reader picks a longer length, which the page asks for, so the cost
 *   3.9.0 took them off for is gone. Two lengths put back on a control, so it is no step of its own. Projects gain
 *   `domains`, a field added, so a minor step. STILL 3.0.0, UNRELEASED, after the audit of October 6th
 *   (`loop/research-audit-17.md`): mail nobody's pattern claimed makes nobody, its sender kept as a mention
 *   (`rule.meet-senders`) unless the kernel already knows its address (`only: 'known'`), a pattern's mail from a public
 *   host names no organisation, neither rule writes a subject, Everyone is grouped by organisation and leaves out a
 *   person folded into another, and an organisation's page draws its projects and money where the record holds them
 *   (`placed` in `firstPartyDocument`, which makes those two lists People's links and not its needs).
 * - money-core 3.11.0 and work 1.15.0: each page leads with its picture and no tile is half empty (DIRECTION §39, the
 *   design review's fixes 3 and 8). Money opens on Cash ahead with a side column beside it (`layout: { rail: 4 }`):
 *   when the money runs out, which the line no longer says, the accounts holding it and the questions; Heads up under
 *   the walk; Coming and going open as one tile, and only the months behind and what moved folded under History. Work's
 *   line says counts ("1 late, 3 waiting on you"), Late is a strip the whole width, the figures are one strip (Open, Due
 *   this week, Done this week with its last seven nights), and This week, which now starts today, sits beside With an
 *   agent and Waiting on you, a third each. Work gains `tasks-this-week-yours`, the figure This week is drawn on.
 *   Blocks moved and a figure added, no list or field, so each step is a minor one and reaches a record on its own. The
 *   project page moves with them, though no pack holds it (`crossPack`): its history, notes, money and what it runs on
 *   are one More about tile where they were three folded sections (fix 9).
 * - money-core 3.12.0: Runs out says the day. The tile beside Cash ahead draws the new `runs-out-on`, the day the walk
 *   goes under (`zero_on` in `packages/kernel/src/money-figures.ts`), with the days left as the line under it, where it
 *   drew the count alone: a count read yesterday is a day out this morning, and the day is the one the walk's flag
 *   stands on. A figure added and one cell of a tile changed, so a minor step that reaches a record on its own.
 * - work 1.16.0, portfolio 1.15.0, people 3.1.0 and money-core 3.13.0: the second design review's fixes 2, 3, 5, 6, 7
 *   and 8, in the declarations (`loop/research-design-critic-2.md`, DIRECTION §39). EVERY VERSION BEFORE THESE IS
 *   RELEASED, People 3.0.0 among them, so each is a version and none a reset. Work's Board loses its By status heading,
 *   and Work's line to type into is declared alone and first so a host holds it in the page's header, which is words
 *   over the declaration and moves nothing. Projects keeps its two folds only past four projects under each: while
 *   four or fewer, what each earns, what agents hold and what is coming up are one open tile and the parked and
 *   finished another, where each was a 56px heading with a Show button over an empty page. People's twelve weeks of
 *   dots are two short lists, Gone quiet in the colour of what needs the person and Last in touch beside it, the one
 *   quiet longest first, and People gains `people-in-touch-90d`, the figure the second is drawn on;
 *   `people-in-touch-12w` stays declared and draws nothing, since taking a figure away is a loss an update asks about.
 *   Money's walk of the next thirty days loses its heading, the second of two under Coming and going. Headings and
 *   blocks on pages that are already there and one figure added, no list or field, so each step is a minor one and
 *   reaches a record on its own. The project page moves with them, though no pack holds it (`crossPack`): Done, by week
 *   is no tile of its own, and what was finished this week is At a glance's last figure, asking for its four weeks as
 *   a line.
 * - work 1.17.0 and people 3.2.0: a card on the Board says the day its task is due and who holds it, where it named the
 *   project, which the list under the board says; and People shows each person once, as a card with the day you were
 *   last in touch, where Gone quiet and Last in touch listed the same people over the cards. Who has gone quiet is
 *   still the page's first line, by name, and `people-in-touch-90d` stays declared and draws nothing. WORK 1.16.0 AND
 *   PEOPLE 3.1.0 ARE RELEASED, so each is a version of its own. Blocks on pages a record already holds, no list, field
 *   or figure, so each is a minor step that reaches a record on its own.
 */
export const FIRST_PARTY_VERSIONS: Readonly<Record<FirstPartyId, string>> = {
  portfolio: '1.15.0',
  people: '3.2.0',
  'money-core': '3.13.0',
  estate: '2.1.0',
  work: '1.17.0',
};

type Body = Record<string, unknown>;

/**
 * THE FIELDS THAT LINK A ROW TO ANOTHER MODULE'S LIST WITHOUT NEEDING IT. People says which projects a person
 * was met in, and a record with no Projects still has people: a student's classmates, a founder's accountant.
 * So "Met in" is a link and not a dependency. When the record will not hold the list it points at, the field is
 * left out of the document with every column drawn over it, and the pack installs on its own. Installing the
 * pack again once that list is there puts the field back. Work's tasks and threads say which project they are for and
 * who holds them the same way, so a homework list installs Work with no Projects and no People. Money says who a bill,
 * a payment, a repeating item or an instalment is with the same way since money-core 3.0.0, so Money installs and
 * draws on a record with People off.
 */
/* An organisation's `projects` is a link by the same id as a person's, since People 3.0.0, and the ledger's `party`
   points at People's organisations since money-core 3.10.0, where a bill's still points at its people. */
const LINKS: Partial<Record<FirstPartyId, readonly string[]>> = { people: ['projects'], 'money-core': ['party'], work: ['owner', 'thing'] };

/**
 * The id a declaration in a document is filed under: its kind's key.
 *
 * `ingest` STAYS WHILE NO MODULE DECLARES ONE. It went in for money-core's card alerts, which left for
 * `packs/card-alerts` at money-core 3.0.0, and `INGESTS` in `index.ts` is empty since. A pattern a
 * module declares again reaches a document through that list, and without this arm it would be filed
 * under the empty string, so `firstPartyManifest(...).provides` would carry a nameless member and a
 * record comparing two versions of the pack would see one declaration replace another.
 */
const idOf = (d: Body): string =>
  typeof d.ingest === 'string'
    ? `ingest.${d.ingest}`
    : typeof d.rule === 'string'
    ? `rule.${d.rule}`
    : typeof d.register === 'string'
    ? `register.${d.register}`
    : typeof d.page === 'string'
      ? `page.${d.page}`
      : typeof d.metric === 'string'
        ? `metric.${d.metric}`
        : /* A SCRIPT, SINCE WORK 1.8.0 SHIPS TWO. Without this arm both were filed under the empty string, so Work's
             manifest provided `''` twice and `pack-versions.test.ts` read "work@1.7.0 gained , , rule.close_follow_ups". */
          typeof d.script === 'string'
          ? `script.${d.script}`
          : '';

/** Every register a body leans on: a field's `to:`, a page's `requires`, a metric's `source`. The `links` fields are not counted. */
function leansOn(d: Body, links: readonly string[] = []): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === 'string') out.add(v.replace(/^register\./, ''));
  };
  for (const f of Array.isArray(d.fields) ? (d.fields as Body[]) : [])
    if ((f.type === 'ref' || (f.type === 'list' && f.of === 'ref')) && !links.includes(String(f.id))) add(f.to);
  for (const r of Array.isArray(d.requires) ? d.requires : []) add(r);
  if (typeof d.source === 'string' && d.source.startsWith('register.')) add(d.source);
  out.delete('session');
  if (typeof d.register === 'string') out.delete(d.register);
  return out;
}

type Split = {
  owner: Map<string, FirstPartyId>;
  packs: Map<FirstPartyId, { declarations: Body[]; seeds: Body[] }>;
  cross: Body[];
  seeds: Body[];
};

function split(): Split {
  const doc = packDocument() as { declarations: Body[]; seeds: Body[] };
  const known = new Set<string>(FIRST_PARTY);
  const owner = new Map<string, FirstPartyId>();
  for (const d of doc.declarations)
    if (typeof d.register === 'string' && typeof d.pack === 'string' && known.has(d.pack)) owner.set(d.register, d.pack as FirstPartyId);

  const packs = new Map(FIRST_PARTY.map((id) => [id, { declarations: [] as Body[], seeds: [] as Body[] }]));
  const cross: Body[] = [];
  for (const d of doc.declarations) {
    const tagged = typeof d.pack === 'string' && known.has(d.pack) ? (d.pack as FirstPartyId) : null;
    const readers = new Set([...leansOn(d)].map((r) => owner.get(r)));
    const only = readers.size === 1 ? [...readers][0] : undefined;
    const home = tagged ?? only ?? null;
    if (home === null) cross.push(d);
    else packs.get(home)!.declarations.push(d);
  }
  for (const s of doc.seeds) {
    const home = owner.get(String(s.register));
    if (home) packs.get(home)!.seeds.push(s);
  }
  return { owner, packs, cross, seeds: doc.seeds };
}

/**
 * One first-party pack's manifest: its id, its version, the registers it needs already there, and the ones it
 * only links to (`LINKS`), which it points at when the record holds them and leaves out when it does not, and the
 * words the first run hears it in (`SIGNALS`).
 */
export function firstPartyManifest(id: FirstPartyId): PackManifest & { provides: readonly string[]; links: readonly string[]; signals: readonly string[] } {
  const { packs, owner } = split();
  const mine = packs.get(id)!.declarations;
  const own = new Set(mine.filter((d) => typeof d.register === 'string').map((d) => d.register as string));
  const needs = new Set<string>();
  const any = new Set<string>();
  /* A PAGE'S LIST OF ANOTHER FIRST-PARTY PACK IS A LINK AND NOT A NEED, SINCE People 3.0.0: the blocks over it are drawn
     only where the record holds it (`placed` in `firstPartyDocument`), as a link field is kept only where the list it
     points at is. */
  const drawnWhereHeld = (d: Body, r: string): boolean => typeof d.page === 'string' && owner.has(r) && owner.get(r) !== id;
  for (const d of mine) {
    for (const r of leansOn(d, LINKS[id])) if (!own.has(r) && !drawnWhereHeld(d, r)) needs.add(`register.${r}`);
    for (const r of leansOn(d)) if (!own.has(r)) any.add(`register.${r}`);
  }
  const links = [...any].filter((r) => !needs.has(r)).sort();
  return { id, version: FIRST_PARTY_VERSIONS[id], requires: [...needs].sort(), provides: mine.map(idOf).sort(), links, signals: SIGNALS[id] };
}

/** The block kinds whose first column is what they group by, so they say nothing once it is gone. */
const GROUPED = new Set(['bar', 'split']);

/**
 * THE KEYS A LIST DECLARES A ROLE WITH, each part naming the field that plays it (`packages/kernel/src/roles.ts`).
 * People's `meets:` names `projects`, which is a link (`LINKS`), so on a record with no Projects the field goes and the
 * part must go with it: the kernel refuses a role naming a field the list does not have (`FIELD_UNKNOWN`), and
 * `projects` is a part `meet` does without, recording the person and linking nobody.
 */
const ROLE_KEYS = ['meets', 'rates', 'hand', 'org'] as const;

/**
 * A declaration with the fields in `gone` taken out, and every column and phone field drawn over them. A bar grouped by
 * a field that is gone is left out whole: "Open work by project" on a record with no projects has nothing to group by.
 */
function without(d: Body, gone: ReadonlySet<string>): Body | null {
  if (gone.size === 0) return d;
  const out: Body = { ...d };
  if (Array.isArray(d.fields)) out.fields = (d.fields as Body[]).filter((f) => !gone.has(String(f.id)));
  if (Array.isArray(d.mobile)) out.mobile = (d.mobile as unknown[]).filter((f) => !gone.has(String(f)));
  for (const key of ROLE_KEYS) {
    const role = d[key];
    if (role !== null && typeof role === 'object' && !Array.isArray(role))
      out[key] = Object.fromEntries(Object.entries(role as Body).filter(([, field]) => !gone.has(String(field))));
  }
  /* A PAIRING'S `party is empty` OVER A FIELD THAT IS GONE IS TRUE OF EVERY ROW, so it is taken out of the `all` it sits
     in and nothing the pairing matches changes. Kept, it would name a field the list no longer has, and the kernel
     refuses such a list (`pairsFault` in `packages/kernel/src/pairs.ts`), so Money would not install with People off:
     `transactions` pairs a transfer only when `party is empty`, and `party` is a link since money-core 3.0.0 (`LINKS`
     above). */
  const pairs = d.pairs as Body | undefined;
  const all = pairs !== null && typeof pairs === 'object' && pairs.where !== null && typeof pairs.where === 'object' ? (pairs.where as Body).all : undefined;
  if (pairs && Array.isArray(all))
    out.pairs = { ...pairs, where: { ...(pairs.where as Body), all: (all as Body[]).filter((c) => !(typeof c.field === 'string' && gone.has(c.field) && c.empty === true)) } };
  /* A FIGURE ASKED OF A FIELD THAT IS GONE is left out whole: `project-open` counts a project's tasks, and a record with
     no projects has none to count. */
  if (typeof d.metric === 'string' && typeof d.where === 'string' && [...gone].some((f) => new RegExp(`(?:^|,\\s*)${f}\\s`, 'u').test(d.where as string)))
    return null;
  /* A READER'S FILTER ON A FIELD THAT IS GONE GOES WITH IT: Work's strip of projects is over `thing`, and the kernel
     refuses a page filtering on a field none of its lists has (`filtersFault` in `packages/kernel/src/declare.ts`). */
  if (Array.isArray(d.filters)) {
    const kept = (d.filters as Body[]).filter((f) => !gone.has(String(f.field)));
    if (kept.length > 0) out.filters = kept;
    else delete out.filters;
  }
  if (Array.isArray(d.blocks))
    out.blocks = (d.blocks as Body[])
      .filter((b) => !(GROUPED.has(String(b.kind)) && Array.isArray(b.columns) && gone.has(String((b.columns as Body[])[0]?.field))))
      .map((b) => (Array.isArray(b.columns) ? { ...b, columns: (b.columns as Body[]).filter((c) => !gone.has(String(c.field))) } : b));
  return out;
}

export type DocumentOptions = {
  /**
   * The lists the record will hold once this pack is in. A link field (`LINKS`) to a list not among them is left
   * out. Absent keeps every link, which is the document as it always was.
   */
  holds?: Iterable<string>;
  /** The example rows to carry in place of the sample's, `[]` for none. Absent keeps the sample's. */
  seeds?: readonly Body[];
};

/** One first-party pack as a document, with its example rows. `null` for an id that is not one of the five. */
export function firstPartyDocument(id: string, options: DocumentOptions = {}): Record<string, unknown> | null {
  if (!(FIRST_PARTY as readonly string[]).includes(id)) return null;
  const every = split();
  const whole = every.packs.get(id as FirstPartyId)!;
  const links = LINKS[id as FirstPartyId] ?? [];
  const gone = new Set<string>();
  /* A LIST'S OWN LINK FIELDS THAT GO, BY LIST, SINCE money-core 3.10.0: two of its lists share the link `party` and point
     it at different lists, the ledger at People's organisations and a bill at People's people. Gone by its id alone,
     a record holding people and not yet organisations (People 2.x) would lose a bill's `party` as well as the ledger's.
     A page or a figure still reads the union, since a column names a field and not the list it came from. */
  const goneIn = new Map<string, Set<string>>();
  if (options.holds !== undefined) {
    const held = new Set(options.holds);
    for (const d of whole.declarations)
      for (const f of Array.isArray(d.fields) ? (d.fields as Body[]) : [])
        if (links.includes(String(f.id)) && f.to !== d.register && !held.has(String(f.to))) {
          gone.add(String(f.id));
          if (typeof d.register === 'string') goneIn.set(d.register, (goneIn.get(d.register) ?? new Set<string>()).add(String(f.id)));
        }
  }
  /* A WALK'S LEG OVER A LIST THE RECORD WILL NOT HOLD IS LEFT OUT, as a link field is: Money's cash walk reads Estate's
     services when they are there, and a person's or a founder's record without Estate still has a walk.

     ON A FIGURE AS WELL AS A BLOCK, since money-core 3.0.0 reads the walk in figures (`legs:` on `forecast.runway`),
     and a figure is checked at install where a block is checked when it is read: a leg over a list the record does not
     hold is refused `REGISTER_UNKNOWN` (`figureListsFault` in `packages/kernel/src/declare.ts`), so Money would not
     install at all. A LEG OVER THE PACK'S OWN LIST IS ALWAYS KEPT, because a caller's `holds` can leave out a list this
     very install adds, and a walk that lost its own bills would read too high, the one direction it must never be
     wrong in.

     AND WITH NO `holds` A FIGURE WALKS ONLY THE PACK'S OWN LISTS, where a block keeps every leg as it always did. A
     caller that does not say what the record holds is installing the document as it is, onto a record that may not
     hold Estate, and a figure checked at install would refuse the whole pack for a leg a block would only have drawn
     without. Such a record's tiles leave its subscriptions out until the pack is installed again for it. */
  const held = options.holds === undefined ? null : new Set(options.holds);
  const own = new Set(whole.declarations.flatMap((d) => (typeof d.register === 'string' ? [d.register] : [])));
  const walked = (from: Body[], unsaid: boolean): Body[] =>
    from.filter((leg) => typeof leg.register !== 'string' || own.has(leg.register) || (held === null ? unsaid : held.has(leg.register)));
  const legs = (d: Body): Body => {
    if (Array.isArray(d.legs)) return { ...d, legs: walked(d.legs as Body[], false) };
    if (held === null || !Array.isArray(d.blocks)) return d;
    return { ...d, blocks: (d.blocks as Body[]).map((b) => (Array.isArray(b.from) ? { ...b, from: walked(b.from as Body[], true) } : b)) };
  };
  /* A CARD'S TREND OVER ANOTHER MODULE'S FIGURE IS LEFT OUT when the record will not hold the list that figure reads, as
     a leg is: Projects' cards draw Work's `project-done-by-week`, and a record with Projects alone has no such figure, so
     the kernel would refuse the whole block (`METRIC_UNKNOWN`) for a line it could never draw. With no `holds` the
     column stays, as every leg of a block does. */
  const listOf = new Map<string, string>(
    [...every.packs.values()]
      .flatMap((p) => p.declarations)
      .flatMap((d) => (typeof d.metric === 'string' && typeof d.source === 'string' && d.source.startsWith('register.') ? [[d.metric, d.source.slice('register.'.length)] as const] : [])),
  );
  const drawable = (c: Body): boolean => {
    if (held === null || typeof c.metric !== 'string') return true;
    const list = listOf.get(c.metric.split(':')[0]!);
    return list === undefined || own.has(list) || held.has(list);
  };
  const trends = (d: Body): Body =>
    held === null || !Array.isArray(d.blocks)
      ? d
      : { ...d, blocks: (d.blocks as Body[]).map((b) => (Array.isArray(b.columns) ? { ...b, columns: (b.columns as Body[]).filter(drawable) } : b)) };
  /* A BLOCK OVER ANOTHER PACK'S LIST IS KEPT ONLY WHERE THE RECORD HOLDS THAT LIST, SINCE People 3.0.0, as a leg is: an
     organisation's page draws its projects and its money (`page.relation` in `modules/people.ts`), and `@braindog/declare`
     refuses a page whose block reads a list the record does not hold, so People would not install before Money and
     Projects, which is the order every record takes them in. WITH NO `holds` SUCH A BLOCK IS LEFT OUT, as a figure's
     leg is, because a document installed as it is goes onto a record that may hold none of them. No first-party page
     but that one reads another pack's list, so every other document is the same with or without this. */
  /* ONLY ANOTHER FIRST-PARTY PACK'S LIST: a list the kernel keeps itself (`session`) is on every record. */
  const reads = (list: string | null): boolean =>
    list === null || own.has(list) || !every.owner.has(list) || every.owner.get(list) === id || (held !== null && held.has(list));
  const listIn = (source: unknown): string | null => (typeof source === 'string' && source.startsWith('register.') ? source.slice('register.'.length) : null);
  /* AND ITS `requires` WITH IT, which names every list a block reads (the kernel refuses a page that reads one it does
     not name), so a page that keeps no block over Money does not ask for Money. */
  const placed = (d: Body): Body =>
    typeof d.page !== 'string' || !Array.isArray(d.blocks)
      ? d
      : {
          ...d,
          ...(Array.isArray(d.requires) ? { requires: (d.requires as unknown[]).filter((r) => reads(listIn(r))) } : {}),
          blocks: (d.blocks as Body[]).filter((b) => reads(listIn(b.source))),
        };
  const pack = {
    declarations: whole.declarations.flatMap((d) => {
      const kept = without(d, typeof d.register === 'string' ? (goneIn.get(d.register) ?? new Set<string>()) : gone);
      return kept === null ? [] : [placed(trends(legs(kept)))];
    }),
    seeds: (options.seeds ?? whole.seeds).map((s) => ({
      ...s,
      /* BY ITS OWN LIST'S GONE FIELDS, as its declaration is cut: falling back to every list's, a bill's example lost its
         `party` on a record without organisations though bills keep the field. */
      fields: Object.fromEntries(Object.entries(s.fields as Body).filter(([k]) => !(goneIn.get(String(s.register)) ?? new Set<string>()).has(k))),
    })),
  };
  return {
    pack: id,
    version: FIRST_PARTY_VERSIONS[id as FirstPartyId],
    summary: SUMMARIES[id as FirstPartyId],
    author: 'BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: pack.declarations,
    ...(pack.seeds.length > 0 ? { seeds: pack.seeds } : {}),
    /* THE SETTINGS ITS FIGURES' TARGETS ARE HELD TO (`MONEY_TARGET_SETTINGS`), which a person changes later, and Money's
       home currency. */
    ...(Object.keys(configOf(id, pack.declarations)).length > 0 ? { config: configOf(id, pack.declarations) } : {}),
  };
}

/** A first-party pack's settings: its figures' targets, and for Money the currency everything is added up in. */
const configOf = (id: string, declarations: readonly Body[]): Record<string, unknown> => ({
  ...(id === 'money-core' ? MONEY_HOME_SETTING : {}),
  ...targetConfigOf(declarations),
  ...estateTargetConfig(declarations),
});

/** The starter's declarations no single first-party pack can hold, because they read more than one. */
export const crossPack = (): Record<string, unknown>[] => split().cross;
