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

import { wholeDocument } from '../index.ts';
import { ADDON_LEG_LISTS } from '../modules/held-legs.ts';
import { MONEY_HOME_SETTING, targetConfigOf } from '../modules/money.ts';
import { ESTATE_SIGNALS, estateTargetConfig } from '../modules/estate.ts';
import { MONEY_SIGNALS } from '../modules/money/signals.ts';
import { PEOPLE_SIGNALS } from '../modules/people.ts';
import { PORTFOLIO_SIGNALS } from '../modules/portfolio.ts';
import { WORK_SIGNALS } from '../modules/work.ts';
import type { PackManifest } from './agents.ts';

export type FirstPartyId = 'core' | 'portfolio' | 'people' | 'money-core' | 'estate' | 'work';

/** Dependencies first: every other list points at a project, and Money points at People. */
export const FIRST_PARTY: readonly FirstPartyId[] = ['core', 'portfolio', 'people', 'money-core', 'estate', 'work'];

/** The first-party pack core's pages and lists were cut out of: a record that holds it and not core is owed core. */
export const CORE_CAME_FROM: FirstPartyId = 'people';

/**
 * THE ICON EACH PACK WEARS in the store and the installed list, a name from the app's icon set. Kept apart from the
 * declarations on purpose: `test/pack-versions.test.ts` fingerprints declarations and settings, so a pack's icon can
 * change without a new version.
 */
export const FIRST_PARTY_ICONS: Readonly<Record<FirstPartyId, string>> = {
  core: 'heart-pulse',
  portfolio: 'projects',
  people: 'people',
  'money-core': 'money',
  estate: 'service',
  work: 'work',
};

const SUMMARIES: Record<FirstPartyId, string> = {
  core: 'The pages every record has: Health, Scripts, Calendar and Activity.',
  portfolio: 'The things you run, and the plan for each.',
  people: 'Clients, contractors and accountants, the organisations they are with, and where each one was seen.',
  'money-core': 'Cash, what comes in and what goes out, with a date and a currency.',
  estate: 'Domains, hosting, subscriptions, memberships, insurance and bills, and when each one renews.',
  work: 'Tasks, the threads of work they belong to, and how each thread is going.',
};

/**
 * THE WORDS A PERSON USES FOR WHAT EACH PACK KEEPS, which the first run listens for in the sentence it is told
 * (`apps/web/src/lib/shape.ts`). They are the manifest's, the way a use case's `signals` are its own, so each pack keeps
 * its own beside its declarations (`ESTATE_SIGNALS` in `modules/estate.ts` and the rest), and this reads them, when
 * asked and not when this file loads, for the reason in its header.
 * A word may belong to two packs: "freelance" says there is money and there are clients. "track" is in none, since
 * "I track a few side projects" is a verb about projects and not a Work list.
 */
const signalsOf = (id: FirstPartyId): readonly string[] =>
  ({ core: [], portfolio: PORTFOLIO_SIGNALS, people: PEOPLE_SIGNALS, 'money-core': MONEY_SIGNALS, estate: ESTATE_SIGNALS, work: WORK_SIGNALS })[id];

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
 * - money-core 3.4.0, work 1.11.0, estate 2.1.0 and portfolio 1.8.0: every page is calmer. Each opens
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
 * - portfolio 1.13.0, money-core 3.8.0 and work 1.14.0: each page says only what is true of the record.
 *   Projects says an empty page in its line, with a third line for nothing in play, draws In play only while one is,
 *   lets no other block say it is empty, and reads one project for Parked and finished's count. Money draws Accounts
 *   only while there is cash to cut and a book's month only while something left it (`book-spent-month` added). Work
 *   says an empty list in one line and no band says it is empty. A figure added and empty lines taken away, no list or
 *   field, so each step is a minor one.
 * - money-core 3.9.0: Cash ahead, on Money and on a book's page, offers two years at most. The record walked the longest
 *   of `horizons:` on every load (3.7.0), so five years and `last` made each opening of Money walk at least 1,825 days
 *   for a chart that opens on 90, and as far as ten years over a long plan. The longest length
 *   is still what a walk may cost, whether a load walks it or a reader asks for it. Two lengths taken off a control, no
 *   list, field or figure, so the step is a minor one.
 * - people 3.0.0, money-core 3.10.0 and portfolio 1.14.0: the record understands who and what it meets.
 *   People gains Organisations, moved from the Founder use case under the same
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
 *   book's page, offers five years and `last` again: the kernel now walks two years at most
 *   unasked (`WALK_UNASKED`) and further only when a reader picks a longer length, which the page asks for, so the cost
 *   3.9.0 took them off for is gone. Two lengths put back on a control, so it is no step of its own. Projects gain
 *   `domains`, a field added, so a minor step. STILL 3.0.0, UNRELEASED:
 *   mail nobody's pattern claimed makes nobody, its sender kept as a mention
 *   (`rule.meet-senders`) unless the kernel already knows its address (`only: 'known'`), a pattern's mail from a public
 *   host names no organisation, neither rule writes a subject, Everyone is grouped by organisation and leaves out a
 *   person folded into another, and an organisation's page draws its projects and money where the record holds them
 *   (`placed` in `firstPartyDocument`, which makes those two lists People's links and not its needs).
 * - money-core 3.11.0 and work 1.15.0: each page leads with its picture and no tile is half empty (the
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
 *   and 8, in the declarations. EVERY VERSION BEFORE THESE IS
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
 * - money-core 3.14.0: an account's `last4` reads "Digits the bank prints", where it said "Last four digits", the words a
 *   question about an unknown card quotes back. Some banks print two,
 *   three or six, and the field holds whatever the message names. The id stays `last4`, so every bank pattern's lookup
 *   still reads it. A label on a field a record already holds, so a minor step that reaches a record on its own. Money's
 *   module is cut into a folder in the same step (`modules/money/`), which moves no byte of the document.
 * - money-core 3.15.0: Money's first sign of life, `ledger-rows-7d`, how many cleared Ledger rows are dated in the last
 *   seven days, with a target of at least one so a Ledger that stopped reads as missing its mark (REC-B01 job 3,
 *   `modules/money/figures/signs.ts`). The other three signs the unit names wait for words the kernel does not read yet,
 *   and come in a later step. One figure added, no list or field, so a minor step that reaches a record on its own.
 * - people 3.3.0: Health, a page of the record's vital signs (modules/health.ts): one line from signs-red,
 *   then the signs by state, Needs a look first, and a sign with nothing to read under Not read yet, never Alive. It reads
 *   the kernel's signs source and two built-in figures and no list, so it leans on nothing. A page added, nothing taken
 *   away, so a minor step that reaches a record on its own and asks no question. UNRELEASED, so batch 47 folds in: under
 *   the first line, how many signs are not read yet, from the built-in `signs-unread` (figures-47), and the green-days
 *   lines say every watched sign was green, since the hold watches ten signs and not all of them.
 * - money-core 3.16.0, ONE UNRELEASED STEP, everything since 3.15.0 folded into it. Three more signs, once the kernel reads
 *   their words (`age`, `currencies`, `empty`): `ledger-newest-days`, `currencies-held` and `uncategorised-share-30d`
 *   (`modules/money/figures/signs.ts`), and two more: `statement-oldest-days`, the age of the
 *   oldest balance (`rolled.read: age`), and `nights-missed-30d`, the nights the cash line kept no point, once a
 *   kept line names the lists its figure reads. Paydays: a repeating line gains `day_of_month` (a day 1 to 31,
 *   last, or two, '15, last', labelled "Days of the month") and `weekend` (leave, before, after; default leave), Money
 *   gains `rest_days` (Saturday and Sunday), and the repeating leg names both fields so the walk uses them; and
 *   `script.last_day` (batch 48), once a day and fetching nothing, asks one question for every line whose Next is a
 *   month's last day on the 28th to the 30th, each answer's patches writing `day_of_month`. A balance's
 *   age is what the bank last said: `cash-as-of` and `balances-stale` read the roll's own day (`rolled.read:
 *   as_of`, `read: stale`) where they read the typed "As of" a bank message never writes; `account-ages` dates each
 *   account by its newest statement, which a book's Accounts cards and Money's Last confirmed tile inside Heads up read
 *   through `stale: { figure }` (`modules/money/pages/parts/ages.ts`); and `rule.cash-stale`, a note each time a typed
 *   day passed a week, goes. A row's currency comes from its account and stays: the Ledger's `amount` declares
 *   `currency_from: account.balance` and `currency_fixed`, and its `available` and `balance_after`, a balance check's
 *   `balance`, an instalment's `amount` and a repeating line's `amount` declare `currency_from`, so an amount sent with
 *   no code takes its account's. Today's money this week (uc6-money-47): `received-7d`, the Ledger's money in over
 *   seven days, and `settled-in-7d`, bills and invoices paid to you over seven days, each currency on its own. Categories going
 *   the other way (hop-figures-50): `categories-against-direction`, live categories marked one way that a Ledger
 *   entry going the other way points at, read through `where`'s `pointed` hop, with its line under Heads up. Figures,
 *   a script, fields and a setting added and a rule taken away, nothing another pack reads,
 *   so a minor step. NOT A QUIET ONE: a rule taken away is a loss (`packs/quiet.ts`), so a record on 3.15.0 or before is
 *   asked once in Decide ("take away Cash stale") and gets none of this until it says yes.
 * - money-core 3.17.0 (cash-check-52): `cash-cross-check`, Cash now worked out a second way, less Cash now. The
 *   kernel walks each cash account entry by entry from its newest statement, apart from the roll, and the figure is the
 *   difference a currency at a time: nought, or the figure on Money is wrong. With no balance typed it has no value.
 *   MONEY-CORE 3.16.0 IS RELEASED (`test/fixtures/released/money-core-3.16.0.json`), so this is a version of its own. One
 *   figure added, nothing taken away or retyped, so a minor step that reaches a record on its own. The Money page draws it (cash-page-54): one tile under the walk while it is not nought. The line it drew while no
 *   balance is typed went before release, for the lead a record with two books opens on (below).
 *   Filing rules (filing-list-56): a list of its own, a text, how it matches, which way and the category
 *   it files under; the Ledger says which rule filed an entry (`filed_by`); a rule for money in never files money out,
 *   and a category's own Matches files for this one version more, live and the right way only.
 *   A closed account (account-state-56): Accounts gains Status, open or closed, with closed its finished state, and
 *   today's cash, the oldest balance, the Last confirmed cards and a book's Accounts cards leave a closed one out. An
 *   account typed before the field counts as open. A list, fields and a state added, nothing taken away, still minor.
 *   A payment marks what it paid (pay-links-57): a bill gains Paid so far, an instalment Paid by, a link to
 *   the Ledger entry that paid it, and a repeating line Last paid and Last amount. The Ledger declares
 *   `delete: refuse_while_referenced`, so a payment an instalment names is not deleted out from under it. Fields and a
 *   delete rule added, nothing taken away, still minor. The script that writes them (`scripts/settle.js`) is
 *   registered since batch 60, for a bill (below); an instalment's Paid by and a repeating line's Last paid and Last
 *   amount are still filled by a person, and the note a person reads says nothing of those two.
 *   A lead for two books (the look of 13 October, fault F): with two books or more Money's first line says how many
 *   books and accounts the money is kept in, two counts and no sum, where no block was the lead and the app said its
 *   own filler. Money is at the most blocks a page declares, so it took the place of the line for no balance typed,
 *   which stood under the box to add an account and was untrue with accounts and none of them cash. A block swapped
 *   for another inside the unreleased step, so no version of its own.
 *   The Ledger, open (ledger-tile-59): the six newest entries stand in a tile of their own on Money, headed
 *   Ledger, before Heads up, each line its entry, drawn once an entry has cleared. History gives up What moved, its
 *   twelve lines folded shut, so the page still declares twenty-four blocks and says what moved once. And the two late
 *   lines on Heads up say "past their due date" in the danger colour (bad-phrase-59), the words unchanged. Blocks
 *   swapped and two sentences marked inside the unreleased step, so no version of its own.
 *   A payment marks the bill it pays (settle-rule-60): `script.settle` is registered, and `rule.payment-settles`
 *   starts it when a Ledger entry that names a bill in Settles has cleared, handing the entry and the bill by their
 *   ids, which the script reads as well as a handle. The bill is part paid with the sum so far, or paid with the day;
 *   only cleared money is counted. Nothing starts it for an instalment or a repeating line: Settles points at Bills
 *   alone. A rule and a script added inside the unreleased step, so no version of its own.
 *   One more sign of life (repeating-overdue-67): `repeating-overdue`, how many live repeating lines
 *   have a Next more than three days gone, with nought the target. Only a line a payment was matched to before is
 *   counted (repeating-sign-fix-69): `last_paid is set`. And named for it, Matched repeating lines past their day
 *   (repeating-sign-72), so nought is no word on a line nothing was matched to. A figure added
 *   inside the unreleased step.
 *   A name beside the bank's words (payee-field-68): the Ledger gains `payee`, Paid to or from,
 *   searchable and not indexed, and `counterparty_text` is labelled As the bank wrote it.
 * - portfolio 1.16.0 and work 1.18.0 (batch 46, REC-C08's remainder and REC-C16): a project others point at stays. Projects
 *   declares `delete: refuse_while_referenced`, as Accounts does, so a project a task, a bill, a service or a person names
 *   is not deleted out from under them, and the refusal names the lists and how many. Under What each one earns, one
 *   line is always drawn while a project is in play, "N of M projects in play say what they earned in a year", two
 *   counts and never a sum, so a record where nobody said reads that and not nothing. A project page says where it
 *   stands from what happened on it while nobody has said: Where it stands is the typed card only while `project-said`
 *   counts one of health, progress, aim or agent, and otherwise a tile of `project-moved-7d`, the tasks on it written
 *   this week, read off the day the record stamps them. `project-said` reads Projects and is Portfolio's;
 *   `project-moved-7d` reads tasks and is filed with Work by the list it reads, which is why Work moves too. PORTFOLIO
 *   1.15.0 AND WORK 1.17.0 ARE RELEASED, so each is a version of its own. A key on a list, a block and two figures
 *   added, nothing taken away or retyped, so each is a minor step that reaches a record on its own. The project page
 *   moves with them, though no pack holds it (`crossPack`).
 * - estate 2.2.0: a service's type gains server, database, storage and network, said Server, Database, Storage and
 *   Network. A record that came in from a cloud account brought its own values for these with no label, and the month
 *   by type read a key. Four values added after the eight and nothing taken away, so the step is a minor one; a value a
 *   record added itself stays (laidBack). And a project's Costs a year is left out until a cost is recorded
 *   (pinwheel-60): `project-cost` reads only services whose cost is set, so a project whose services say no cost draws
 *   no figure where it drew 0. One `where` narrowed inside the unreleased step, so no version of its own.
 * - portfolio 1.17.0 (seed-58, the look of 13 October, fault J): the line under What each one earns is drawn only while
 *   one project in play says what it earned (`projects-earning-said` above nought), where it was drawn while any was in
 *   play and read "0 of 11 projects in play say what they earned in a year" on a record that never meant to say. The
 *   words are the same. PORTFOLIO 1.16.0 IS RELEASED, so this is a version of its own. One `when` changed on the two
 *   keyed copies of a block that is there, nothing added or taken away, so a minor step. And Projects' In play cards
 *   say `edit: true` on `about` (card-edit-wire-93, inside the unreleased step), so a project's one line is
 *   typed on its card where the reader may write the list: one key on a column that is there, so no version of its own.
 *   And Projects draws the questions about its own list (`list is things`) as a queue gated on
 *   `questions-open-in:things`, with a clause in the line (waiting-work-projects-99, batch 99, inside the
 *   unreleased step): one block added to a page that is there, nothing taken away.
 * - work 1.19.0: a thread has six states and declared moves, a day it aims for, and a follow-up takes
 *   its parent's project, thread and owner one by one (and the agent, when the agent holding the parent made the
 *   follow-up), and a thread that is holding may be marked
 *   done (work-moves-62-63, batch 63, inside the unreleased step). WORK 1.18.0 IS RELEASED (commit 63423720), so this is a
 *   version of its own. Two values, their labels and the moves on one field, one field added and one script's title
 *   and source changed, nothing taken away, so a minor step. And the Board page takes Work's capture line, first after
 *   its sentence (board-capture-line-83, batch 83, inside the unreleased step): one block added to a page that is
 *   there, nothing taken away. And Work draws the questions about its own list (`list is tasks`) as a queue gated on
 *   `questions-open-in:tasks`, with a clause in the line (waiting-work-projects-99, batch 99, inside the
 *   unreleased step): one block added to a page that is there, nothing taken away. And Work declares a head, its open
 *   count, Add and a search word, and lists open work with no project under a fold of its own, over a new figure
 *   `tasks-no-project` (work-head-and-no-project-101, PGS-A14, batch 101, inside the unreleased step):
 *   one figure and two blocks added, nothing taken away. And the Board reads every task in play before any done one,
 *   its line says what is kept for later, and Everything open goes from under it (inside
 *   the unreleased step): one block taken from a page that is there, no id added or taken away.
 * - work 1.19.0, the Timeline (inside the unreleased step): the dated tasks on one time axis
 *   are a page of Work, `page.roadmap`, which the Roadmap add-on hands over (`hands`, so a record holding Roadmap keeps the
 *   page and Roadmap retires). A page added, nothing taken away, no version of its own.
 * - money-core 3.17.0, still unreleased, takes three more things of batch 61 with no version of its own: the Ledger
 *   pairs a move between two currencies at the rate of the day it left, within 2% (`pairs.across_currency`,
 *   pairs-fx-61); two figures over who made each Ledger entry, `filed-for-you-30d` and `filed-today`, read from
 *   `events.transactions` (filing-figures-61); and the Ledger tile on Money is drawn by any entry that is not void
 *   (ledger-gate-60-61).
 * - money-core 3.17.0, still unreleased (commit 63423720, the deployed build, holds 3.16.0), takes batch 62's change
 *   with no version of its own: a payment made void, or put back to pending, reopens the bill it had paid
 *   (settle-reopen-62). `payment-settles` starts on any status and `settle` counts cleared money alone.
 * - money-core 3.17.0, still unreleased (commit 63423720, the deployed build, holds 3.16.0), takes batch 63's changes
 *   with no version of its own, pinned once (`2c10a714a36d7c85`): four figures of this month's spending against last,
 *   `spent-last-month`, `spent-by-category-last-month`, `spent-by-category-to-date-last-month` and
 *   `spent-vs-last-month`, a difference by category against the month before (spend-figures-63); the
 *   Ledger tile reads `filed-today` and `filed-for-you-30d` in its written line (ledger-by-63), which
 *   no host draws yet; `filed-for-you-30d` counts what an agent, a bank add-on or a rule made, where it counted
 *   anything but a person (filing-figures-draw-62-63); and `settle` leaves a Paid so far somebody typed when a pending
 *   or void payment paid none of it.
 * - money-core 3.17.0, still unreleased (commit 63423720, the deployed build, holds 3.16.0), takes batch 66's change
 *   with no version of its own (`e84778f2db7564d6`): a plan is a thing of its own (plans-list-66, REC-B12 jobs 1 and
 *   2). The list `plans`, declared before Instalments, which gains `plan_row` and `left_after`; the script
 *   `plans_from_names`, once a day and when `part-counts-plan` hands it a part made or changed. A record updating
 *   holds its plans as rows after the script's first run and its parts linked after the second. `plan-links-parts`
 *   starts that second run when the plan is made, handing the script the plan, and the script never opens a closed
 *   plan (plans-calm-67-68).
 * - money-core 3.17.0, still unreleased (commit 63423720, the deployed build, holds 3.16.0), takes batch 68's changes
 *   with no version of its own: the Ledger's `payee` (payee-field-68, above); `rule.plan-links-parts` (plans-calm-67-68,
 *   above); the page `money-plan`, one plan's page, with six figures of one plan, `plan-parts-paid`, `plan-parts`,
 *   `plan-paid`, `plan-left`, `plan-next-due` and `plan-last-due`, and two by plan, `installments-paid-by-plan` and
 *   `installments-total-by-plan` (plan-page-68); and `budget-passed-on`, the day a category's spending
 *   reached its budget, a running total with a stop (budget-passed-on-68).
 * - money-core 3.17.0, still unreleased (commit 63423720, the deployed build, holds 3.16.0), takes batch 70's change with
 *   no version of its own: the cash walk's leg of everyday spending (everyday-leg-69-70), measured
 *   over the Ledger and moved a week at a time, on Cash ahead, its bridge and the four figures over the walk.
 * - money-core 3.17.0, still unreleased, takes batch 70's page changes too, each a block changed and no id added or
 *   taken away: Money's Instalments tile reads each plan's paid of total from its two figures by plan
 *   (instalments-tile-70); Money places This month's spending and Budgets after Instalments, and the
 *   History heading and Being chased leave the page (money-wire-70); a plan's page is led by
 *   one sentence (plan-lead-sentence-70); and a filing rule's Reads choice `payee` is labelled As the bank wrote it
 *   (filing-reads-words-70).
 * - money-core 3.17.0, still unreleased (commit 63423720, the deployed build, holds 3.16.0), takes batch 71's books with
 *   no version of its own: three rules and `script.book_from_account` file a Ledger entry, a
 *   repeating line or an instalment in its account's book (book-fill-71); seven figures say one book's month and what
 *   is filed in no book (book-figures-71); and the book page gained This month, a row of the three (book-page-71).
 *   And batch 72's (plan-lead-all-paid-72), in the same unreleased step: two figures of one plan, `plan-parts-open` and
 *   `plan-share-left`, and the plan page's second lead sentence, for a plan with every part paid. And the nightly
 *   count of `script.book_from_account` is of what still stands, as the page counts it.
 *   Batch 74 took `plan-share-left` out again (plan-lead-one-figure-74): the plan page's two lead sentences each wait
 *   on `plan-parts` and `plan-parts-open` together, two counts, so a plan in two currencies or of nought amounts is
 *   led by one sentence.
 *   And batch 73's, in the same unreleased step (commit 63423720, the deployed build, holds 3.16.0): a fourth rule,
 *   `bill-takes-book`, so a bill or invoice on an account is filed in that account's book, Bills and invoices gaining
 *   the account it names (bill-takes-book-73); Money declares `budgets-set` itself, which Personal 2.4.0 hands it
 *   (budgets-set-73); two figures of what is due to and from one book (book-owed-figures-73) and three of a book's
 *   months, with the row What is due and the chart In and out, by month on a book's page (book-page-months-73); and the
 *   Ledger tile on Money says who was paid, and the bank's own line where nobody is known (ledger-payee-73).
 *   And batch 74's, in the same unreleased step: a project's money on its way, `project-owed`, is named Still to come
 *   in, where it said Owed to you (owed-words-74); and `repeating-overdue` reads no value where it read nought, the
 *   count per the one state its lines are in, so a record whose lines were never matched is shown no mark it met
 *   (seed-money-signs-73-74).
 *   And batch 75's, in the same unreleased step: Bills and invoices gains `chase_draft`, Draft to send, and
 *   `invoice-chased` writes it where it is empty when Chase it is answered, the invoice's amount and due day in one
 *   sentence, never over words somebody changed (money-chase-draft-75). No id added or taken away.
 *   And batch 76's, in the same unreleased step: `book-lasts-until`, the day one book's money runs out, walked from
 *   that book's cash over its own bills, repeating lines, instalments and money on its way, and the cell Money lasts
 *   until on a book's What is due (book-lasts-until-76); and Money's seeds carry a starter set of
 *   eight categories, in and out, in place of one of the sample's (ruling 341, money-starter-categories-76), which no
 *   fingerprint reads. NO RECORD IS GIVEN IT AS ITS OWN YET: nothing that installs asks for `starters`, so the set
 *   reaches a record only among the sample's rows, tagged as examples, and the change notes do not promise it (audit
 *   80). One id added, none taken away.
 *   And batch 77's, in the same unreleased step: `invoice-chased` holds two draft steps whose conditions never hold
 *   together, so an invoice paid in part that says what was paid is drafted for what is left of it
 *   (`{{short:amount-paid_so_far}}`) and every other invoice keeps its sentence (chase-part-paid-77). No id
 *   added or taken away.
 *   And batch 78's, in the same unreleased step (commit 63423720, the deployed build, holds 3.16.0), four changes and
 *   three ids added: `repeating-overdue` now counts the late with `past` inside `state is live, last_paid is set`, so
 *   a kept record reads 0 and met and a record with no matched line still reads no value (repeating-overdue-past-78,
 *   signs-metric-75-76). Money's line is split in two, one drawn, so a record whose money lasts reads that it lasts
 *   the year, and Heads up gives up its line on categories marked the other way so the page stays at twenty-four
 *   blocks, the figure still declared (money-lasts-line-78). A book's page gains one line under What is due,
 *   that its money lasts the year, drawn on `book-lasts-until` carrying `beyond` (book-lasts-year-78).
 *   And a cleared payment that names nothing finds what it paid: `script.match_payment`, `rule.payment-matches` that
 *   starts it, and `rule.instalment-settles` that runs `settle` once an instalment names its payment
 *   (match-payment-78). A repeating line found is said in the run and not marked
 *   (repeat-next-80b-82: the step that kept the payment on it could not move its Next, so it is held); no question
 *   is asked that has a repeating line among its answers.
 * - money-core 3.17.0, still unreleased (commit 63423720, the deployed build, holds 3.16.0), takes batch 82's changes
 *   with no version of its own: `match_payment` falls back to the plain compare when its host refuses a fold, and
 *   logs that it did (fold-fallback-82); and `rule.payment-matches` takes `script.settle_matched_line` back as its
 *   second step, which moves a repeating line's Next by the host's `ctx.cycle` and asks nothing, and
 *   `rule.recurring-went-through` moves Next on when 'It went through' is pressed (money-next-moves-100). Two ids
 *   added to an unreleased version.
 * - people 3.4.0: the People page says how many people may be on the record twice (people-held-twice-69), one note under
 *   its two lead notes, from the built-in figure held-twice and drawn only above nought. 3.3.0 is released (commit
 *   63423720 holds it), so a version of its own. A note added, nothing taken away, so a minor step that reaches a record
 *   on its own and asks no question. Still unreleased, it takes batch 74's link with no version of its own: the note
 *   links the list of everyone in order of name (people-twice-link-74). And batch 78's: the link opens the list at the
 *   people held twice, `/r/people?twice=1`, and says See them (twice-link-78). And batch 80's: the note says the number
 *   is how many too many ("Too many: N"), since the list the link opens shows every one of each pair
 *   (people-note-count-79-80). And batch 82's: the note says the people the link shows first, from the built-in figure
 *   held-twice-shown, and then how many too many ("N people may be on this record twice, M too many")
 *   (people-twice-note-82). And Calendar is a new page, `page.calendar` (calendar-page-82): this month and the next
 *   two, with everything that has a day it is due, from every list; one calendar over the computed deadlines, off
 *   the rail. A page added, nothing taken away. And batch 88's Activity, `page.activity` (activity-page-88): everything
 *   that changed, a day at a time with one line a run, and beside it who worked, what changed, the busy hours and
 *   what an agent asked, off the rail. A page added, nothing taken away.
 * - portfolio 1.19.0 (the KPI plan of 21 October, K1-A): a project's key numbers are rows of its own. Portfolio takes
 *   Numbers (`datapoints`) over from the founder use case under the same id, which founder 3.0.0 hands it (`hands`), so
 *   every record with projects can hold readings. Its organisation and service are not Portfolio's: they point at
 *   People's and Estate's lists, so the founder lays them (`extends`) beside the figures and blocks that read them, and
 *   Portfolio still needs no other list. A new list `kpis`, Key numbers (`KPI_LIST` in
 *   `modules/portfolio.ts`): which project, where its values come from, its shape, which way is good, its target and
 *   by when, how often, who keeps it, whether it shows on Today or leads the card, a draft until kept, and live or
 *   retired. Projects gain `kind`, business, client work, product or content. Two figures, `kpis-held` and
 *   `kpi-stale`. PORTFOLIO 1.18.0 MAY BE RELEASED, so this is a version of its own. Two lists, a field and two figures
 *   added, nothing taken away, so a minor step.
 * - portfolio 1.20.0 (the KPI plan of 21 October, the cards' line): `page.portfolio`'s cards draw the line of the key
 *   number each project leads with, its trend column saying `kpi: headline` beside Work's `project-done-by-week`, which
 *   a card whose project keeps no key number still draws. 1.19.0 IS RELEASED (origin/master holds it), so a version of
 *   its own. A key on one column, no id added or taken away, so a minor step that reaches a record on its own.
 * - people 3.5.0: Health is said in plain words. Its lines count checks and not signs ("15 checks have not run yet"),
 *   nought red is "Nothing on this record needs a look", its groups are Needs a look, All good and Not checked yet, and
 *   the run of good days says every check passed. Words inside `page.health` only, no id added or taken away, so a
 *   minor step that reaches a record on its own.
 * - money-core 3.18.0: a part of a plan whose day has gone is late. `installments-late`
 *   counts the parts still open past their day, going out, and its first row is the part late longest; Money's first
 *   line says it by name after the money, and with two books the line says the money there is (`cash-now`) where it
 *   said two counts; Heads up's line of bills late says the part first (`says:`). 3.17.0 IS RELEASED (the deploy of
 *   23 October holds it), so a version of its own. One figure added and nothing taken away, so a minor step that
 *   reaches a record on its own.
 * - portfolio 1.21.0 (batch 4's look on his record): Projects' In play cards draw every project in play or parked, a
 *   hundred at most, where they drew the first twelve by name, so the lane bar over them says In play 13 as Today and
 *   the sidebar do, where it said 5. One block's limit raised, nothing added or taken away, so a minor step that
 *   reaches a record on its own. 1.20.0 IS RELEASED (the deploy of 23 October holds it).
 * - portfolio 1.22.0 (the alive scope of 24 October): Projects ships `script.kpi_backfill`, which offers each
 *   project its key numbers from what Numbers holds, once a day and once a project, as questions on Decide. It was
 *   written and tested and declared nowhere, so a record with readings held no key number. One script added and
 *   nothing taken away, so a minor step; it asks and writes nothing itself.
 * - money-core 3.19.0, people 3.6.0 and estate 2.3.0 (things, not rows, 24 October): an account, a bill or invoice and a
 *   service each have a page of their own, a template over their list (`page.money-account`, `page.money-bill`,
 *   `page.service`), with no `nav` and `fleeting`, so none takes an address from a steadier page. People's Everyone is
 *   faces, the owner left off (`self is not true`), and `people-count` counts the people it draws. Three pages added and
 *   two declarations changed, nothing taken away, so minor steps. 3.18.0, 3.5.0 and 2.2.0 ARE RELEASED (origin/master).
 * - portfolio 1.23.0 (the thinking scope of 24 October): a project's plan is drawn, not listed. Stages, a
 *   list of steps over the projects, each with its done-when line, drawn on the project page as its road with the next
 *   one marked; and a project's plan field, which keeps its plan as its road alone or its roadmap alone, the shape
 *   kept from what BrainDog drew for it. Its two lead notes are one note with two sentences (`says:`), so the page
 *   stays at twenty-one blocks. A list, a field and three figures added and nothing taken away, so a minor step that
 *   reaches a record on its own. 1.22.0 is master's (the KPI backfill).
 * - money-core 3.20.0 (the scope of 24 October): a paid bill asks once to move its twin repeating line
 *   on (`bill-moves-line`, `move_line`), and a payment that fits a bill and a line under one name links the bill; a card
 *   says what is to pay on it from its texts once its limit is typed (`limit`, `to_pay`, `to_pay_on` on Accounts,
 *   `card-text-owes`, `card-limit-owes`, `card_owed`, `card-to-pay`, `card-to-pay-on`), said in Money's first line;
 *   and Filing rules says how many entries have no category with File old entries. 3.19.0 is master's (things,
 *   not rows), so a version of its own. Ids added and none taken away, so a minor step.
 * - portfolio 1.24.0 (the scope of 24 October): a project's kind set offers its kind's four key numbers as drafts,
 *   one question a project (`kind-offers-kpis`, `kind_drafts`), and none to a project that holds key numbers. One rule
 *   and one script added and nothing taken away, so a minor step. 1.23.0 is master's (the stages road).
 * - portfolio 1.25.0 (the screens scope of 24 October): Numbers gets a page of its own, `page.all-numbers`, which
 *   says `list: datapoints`, so the list's address opens on it: each kind of number once, under the project it is for,
 *   with its newest value, unit and age, and the two that moved most this year as lines. 1.23.0 is master's and 1.24.0
 *   another lane's, so a version of its own. One page added and nothing taken away, so a minor step.
 * - estate 2.4.0: Services names what is lapsing, a table drawn only while `lapsing` holds
 *   one, each by its name, who it is with and the day it was due, in the place of At a glance, whose two figures said
 *   no names. 2.3.0 is master's (a page for each service). One block for another and no id taken away, so a minor step.
 * - estate 2.5.0 (Vault is now Keychain): a service page links its keys as the Keychain, at /keychain. A link's words and address, no id added
 *   or taken away, so a minor step.
 * - people 3.7.0 (24 October): Scripts is a page, `page.scripts`, a table of every installed script over the
 *   kernel's `scripts` source, which `/scripts` draws where it drew a list by hand, so it can be changed by saying so and
 *   pulled as any page. 3.6.0 is master's (Everyone as faces). A page added and nothing taken away, so a minor step.
 * - money-core 3.21.0: the calendar of what falls due on `page.money` wears no
 *   heading or glyph of its own, since it opens Coming and going and the tile read two headings one over the other; and
 *   it reads `source: deadlines` with money on it, as Today's Due soon does, where it read Bills and invoices alone.
 *   3.20.0 is master's. One block changed, nothing added or taken away, so a minor step that reaches a
 *   record on its own.
 * - portfolio 1.26.0: the In play cards' when reads the record's own `project-worked`, a
 *   project's tasks and its runs together, the figure Today's cards read, where it read Work's `project-last-worked`,
 *   the tasks alone. 1.25.0 is master's (Numbers' page). One column changed and no id added or taken away, so a minor
 *   step.
 * - money-core 3.22.0: `plans_from_names` matches a plan's name whatever its capitals,
 *   accents and spaces, where "harbourview" beside "Harbourview" made a second plan, and asks once about two plans already here
 *   under one name; `register.plans` gains `one_with`, which his yes sets on the second plan as it closes it, and
 *   `rule.plan-made-one` hands that plan's parts to the first. 3.21.0 is master's. A field and a rule added
 *   and nothing taken away, so a minor step.
 * - money-core 3.23.0 (the look of 25 October): the Lasts tile's two cells say "With what is due and expected" and "If
 *   nothing more comes in", where "Lasts past 25 Oct 2027" beside "If nothing comes in: 80 days" read as a contradiction.
 *   3.22.0 is on production. Words only, no id added or taken away, so a minor step.
 * - money-core 3.24.0 (the look of 26 October): the Accounts split's limit is twelve, where six cut a seventh account off
 *   a tile beside a line that said "7 accounts". 3.23.0 is master's. One number changed, no id added or taken away, so a minor step.
 * - money-core 3.25.0: `script.settle_matched_line` binds `settle` by name in its own text, where the Worker's bundle had
 *   renamed the function it took and every run that found its repeating line threw "settle is not defined". 3.24.0 is
 *   master's. One script's text changed, no id added or taken away, so a minor step.
 * - money-core 3.26.0 (Needs you, 25 October): `script.book_from_account`'s nightly "File them" carries at most 200 changes,
 *   the most one option may carry, where it asked for 900 and every run over 200 entries in no book was refused and asked
 *   nothing. 3.25.0 is master's. One number changed, no id added or taken away, so a minor step.
 * - money-core 3.27.0: In and out, by month reads its months ahead off the walk Cash ahead draws (`metric.in-ahead-by-month`,
 *   `metric.out-ahead-by-month`), where bills due once and what repeats at its monthly share left every part of a plan
 *   out of the month it falls due, and Cash ahead opens on twelve weeks, where ten stopped short of the largest part.
 *   Lasts is one figure, the days it lasts with nothing coming in, with a sentence of the day that ends on and what falls
 *   due then, where "Lasts past" a year away stood beside it unexplained. The first line says Cash now in each currency
 *   apart and about what that comes to at the rate's day, where dollars were blended in at a month-old rate unsaid, and
 *   counts the accounts the Accounts tile lists, and Every month says what goes out in the next thirty days as Today
 *   does (`metric.leaving-30d`), parts of plans with it. 3.26.0 is master's. Two figures added and nothing taken away, so a
 *   minor step.
 * - money-core 3.28.0: "It went through" on a repeating line marks the one open bill for the same money paid as well
 *   (`script.settle_matched_line` may write Bills and invoices), where the bill stayed open and read late on Today the
 *   morning after he answered. 3.27.0 is master's. One script changed, no id added or taken away, so a minor step.
 * - money-core 3.29.0: Money is a section with a page per job, `page.money-accounts`, `page.money-ledger`,
 *   `page.money-budgets`, `page.money-coming`, `page.money-forecast`, `page.money-reports` and `page.money-payees`, each
 *   its line alone until its blocks are written, and Categories gains `icon`, `colour`, `budget_alert`, `rollover` and
 *   `parent`, all optional. 3.27.0 is master's. Pages and fields added and nothing taken away, so a minor step. THE
 *   WAVE THAT FILLED THE PAGES CLOSED IN THE SAME UNRELEASED STEP: the home leads with one hero, Coming up and what was
 *   spent, with no side column; the pages are written; `script.offer_budgets` offers each category a budget from last
 *   month's pace and sets none; and sixteen figures the pages read come with them (`metric.account-now`,
 *   `metric.payees-paid-90d` and the rest). The cash walk names Certificates' list, and a record without that add-on
 *   installs Money with the leg left out (`ADDON_LEG_LISTS`). Figures and a script added and nothing taken away, so the
 *   step stays minor and stays 3.29.0, since no record was given it.
 * - money-core 3.27.1: `script.book_from_account` and `script.plans_from_names` read each list in row number order
 *   (`{ order: 'seq' }`), where a list in its own order (the Ledger by day) lost the rows between two pages and a record
 *   with more than fifty lines or parts was booked and counted short. Two scripts' sources changed, no id added or taken
 *   away, so a patch step. 3.27.0 is released.
 * - people 3.8.0: Organisations gains `retired_on`, which its `org:` names as the
 *   kernel's `retired` part, so a shop met by a name a card text cut short is retired on his yes, kept and never
 *   deleted, and People's list and count leave it out. 3.7.0 is master's (Scripts as a page). A field added and
 *   nothing taken away, so a minor step.
 * - portfolio 1.27.0: `page.portfolio` opens on an Add a project capture while nothing is
 *   in play, under a line of its own where the record holds no project at all; the line saying none is in play draws
 *   only while one is parked, and the one saying nothing needs a push only while one is in play, so a new record's
 *   Projects is one line and one box. 1.26.0 is master's. Blocks added and nothing taken away, so a minor step.
 * - portfolio 1.28.0 (the look of 25 October): Numbers opens on a plain line and its link to every reading says what it opens, and Where they
 *   are counts the projects Projects draws, Finished left out. Words and one filter moved, no id added or taken away, so a minor step.
 * - portfolio 1.29.0 (the agents' reads): a project's mark, hue and draft flag are declared `hidden_from_agents`, so the short
 *   answers an agent reads leave them out; `format: full` and the app keep them. Three fields flagged, no id added or taken away, so a minor step.
 * - portfolio 1.30.0 (the Projects board): `page.portfolio` leads with the board its cards block is drawn as (`key: board`),
 *   a headline said from late work, dates, quiet numbers, questions and renewals, in place of the line read off health;
 *   Where they are and What each one earns go, the board saying both. Blocks taken away and one keyed, no id added or
 *   taken away, so a minor step.
 * - portfolio 1.30.1 (29 October, his word: "instead of finished projects it should say closed"): the status `retired`
 *   reads Closed, and the two figures that count it say Closed. The stored value stays `retired`. Words inside
 *   declarations already there, nothing added or taken away, so a patch step.
 * - people 3.9.0: each person on `page.people` is one line, what the note says
 *   they are under the name, with the projects they are on and when you last spoke; and the shops a card text named are
 *   one line under Organisations, counted by the new `metric.organisations-from-card-texts`, where they were listed as
 *   organisations. A figure added and nothing taken away, so a minor step.
 * - people 4.0.0 and core 1.0.0: Health, Scripts, Calendar and Activity leave People for `core`, the document every record
 *   holds (`CORE_PAGES`), under the same page ids, so the navigation order and hides that name them stay as they are.
 *   People hands the four to core in the same plan (`hands`), which the quiet updater reads as not lost. A page leaves, so
 *   People's step is a major one. Core is 1.0.0, and a record that never held it takes it in the same pass.
 * - people 4.1.0 (29 October, "organizations under people (4) and organizations page, showing (17)"): one meaning of an
 *   organisation, the rows not merged and not retired, so `metric.organisations-count` counts the shops from card texts
 *   too and says what the sidebar and the list say. `page.people` loses its table of organisations with a kind and the
 *   line about the shops, and says how many there are as a link to their list; Everyone takes the page's width. Two
 *   blocks taken away and one added, a figure's filter widened, no id added or taken away, so a minor step.
 * - core 1.1.0: `page.scripts` heads the column of where each script stands "Status". Words on a column, no id added or
 *   taken away, so a minor step.
 * - money-core 3.29.1: fewer words on every Money page. Notes that said what a figure is go, leads are one line with a
 *   figure in it, and an empty list says one line. Words inside declarations already there, nothing added or taken
 *   away, so a patch step.
 * - money-core 3.30.0: money that stays yours is not spending. A category says so (`transfer` on `register.categories`,
 *   "Money stays yours"), the Ledger reads it through the entry's category (`stays`, worked out at read), and every
 *   figure, page and walk of spending and income says `stays is not true` beside `transfer is false`, so a card paid off,
 *   cash taken out or a move whose other leg is not in the Ledger is counted in neither. And Money's line says how many
 *   accounts the money is spread over and no longer how many books, and the hero's notes are one short line each. Two
 *   fields added and nothing taken away, so a minor step.
 * - work 1.20.0 (round 1030): the project chips count what Open counts (`counts:` on a filter), and the first line says
 *   none of your tasks is late. A key added to a filter and words, so a minor step.
 * - money-core 3.31.0 (29 October, "finish all the money stuff"): net worth with what the add-ons hold
 *   (`metric.net-worth`, kept night by night in `series.net-worth`, over `metric.held-beyond-cash` and
 *   `metric.owed-over-time`, whose add-on parts are `optional`), and the night's Snapshots row carries it, in dollars and
 *   in grams of gold too; a budget for a week or a year (`budget_period` on `register.categories`, with what carried over
 *   in `carried`, figures and bars a period, and `script.budget_watch` reading each budget's own period); and a repeating
 *   line marked "Post it for me" posts itself on its day on an account no bank feeds (`script.post_due`), a real charge
 *   later taking its place (`script.replace_posted`, `rule.posted-replaced`). Fields, figures, scripts and a rule added,
 *   `metric.budgets-total` a sum of three, and nothing taken away, so a minor step.
 * - money-core 3.31.0 (also): every money figure agrees with the others and means what it says (round 1030). A payment whose
 *   words name nothing pays a bill of the exact same money within ten days, or asks once "Is this the Northwind Premiums
 *   payment?", and recent payments are looked at again (`payment-matches-again`). A category of moves asks once whether
 *   its money stays yours (`category-stays-asks`, `script.category_stays`). Lines to file are counted as the list lists
 *   them. Spending is called Spent with its period everywhere, repeating money "Repeating, a month", and what the walk
 *   holds ahead "To come in" and "To go out". Two figures, `installments-a-month` and `spoken-for-share`, say how much of
 *   what comes in each month repeating bills and instalments take, and `unnamed-paid-90d` how many payments name nobody.
 *   Rules, a script and figures added and nothing taken away, so a minor step.
 * - money-core 3.31.0 (also): Money's home draws the money over time (cash's own last twelve weeks, a whole row under the hero)
 *   and the budgets at a glance beside Instalments while a budget is set. Two blocks added and nothing taken away, so a
 *   minor step.
 * - money-core 3.31.0 (also): Accounts' Stripe line is a warning, with its sign, where it was a plain note. A tone and an
 *   icon on a block, so no step of its own. Money's budgets at a glance draw a month's budgets only, as Budgets' own
 *   first tile does.
 * - money-core 3.32.0 (round 1030, the audit of 30 October): Money's Accounts tile lists every open account, the card
 *   too, over the new `metric.balance-by-account`; Budgets heads each list by its period and leaves the bare "No budget
 *   yet" table to the app's Set a budget tile. A figure added and a table taken off a page, so a minor step.
 * - estate 2.6.0 (round 1030): the Services page says Services as the bar does, and its Lapsing table says when each
 *   service lapses and why, from the service's own note. Columns added and nothing taken away, so a minor step.
 * - people 4.2.0 (round 1030): People says how many organisations you work with apart from the shops card texts named,
 *   over the new `metric.organisations-known` (organisations with a kind). A figure added and nothing taken away, so a
 *   minor step.
 * - people 4.2.1 (round 1030, the audit of 30 October): People's line under everyone says one count, the organisations
 *   and shops the list holds, where it split them by kind and the split disagreed with the list's own groups. Words only.
 * - core 1.2.0 (round 1030): Health's first line no longer says "on this record", and a line links to Tidy up. Words and
 *   a note added, nothing taken away, so a minor step.
 * - money-core 3.32.0 (round 1030): how much of what comes in is spoken for is read against the money that actually
 *   came in, a third of the last three whole months (`metric.received-a-month`), and Reports says it only once those
 *   three months hold money in (`metric.received-three-months-back`); repeating money in, which a real life often keeps
 *   none of, made a scratch record say 2,027%; past all of it the line says the two amounts (`metric.spoken-for-month`).
 *   Budgets opens on its bars, every budget together first, each line saying what is left or how far over. An account's
 *   What moved is drawn as the Ledger draws its lines. Coming up is one sentence everywhere, what falls due with money
 *   from today and fourteen days ahead (`COMING_UP_WHERE`): Money's home reads it, and the Coming up page lists what is
 *   late, the next seven days, the seven after and later. Three figures added, a cell taken off Reports' Health, so a
 *   minor step.
 * - money-core 3.32.0 (also): what went out in a category, or to one payee, summed week by week (`spent-in-category-by-week`,
 *   `paid-to-by-week`), for a widget asked for "by week". Two figures added and nothing taken away, so no step of its own.
 * - people 4.2.1 (round 1030): the organisations line on People says the shops only when a card text named one, with no
 *   "(s)". Words inside a declaration already there, nothing added or taken away, so a patch step.
 * - money-core 3.32.0 (also, the recheck of 30 October): Payees says "Nothing paid out in 90 days" only when nothing went
 *   out, never over payments that name nobody, and its Last paid lists money out only; Coming up's Bills and invoices
 *   sign each amount by which way it goes. Words, a `when` and a `where`, so no step of its own.
 * - work 1.20.0 (also, the recheck of 30 October): Yours and Agents count what Open counts too (`counts:` on a filter of
 *   its own choices, which the kernel now reads). A key on a filter, so no step of its own.
 * - money-core 3.32.1 (SHL-A23): a repeating line is posted to an account unless "No bank feed" says no, and every feed
 *   says no on the accounts it keeps (Mercury 1.3.0, Stripe 1.5.0), so Money reads no feed's own field. A Stripe
 *   balance below zero is read in any currency, below zero being a sign, where seven currencies were listed. A script's
 *   words and a filter, so a patch step.
 * - money-core 3.32.1 (also, the live check of 30 October): net worth takes away what is left on a plan only where Property
 *   counts what it buys (`property-left`) and the Debts add-on's balances, never two flats' sixty parts with neither flat
 *   counted, and Over time says so under its line; the filing rules' line counts lines, one or several; an account's
 *   balance box says what to type. A figure's parts and words, nothing added or taken away, so a patch step.
 * - money-core 3.32.2 (file-paid, his word of 30 October): a payment that pays a bill or a repeating line and is filed
 *   under a category whose money stays yours is filed under the bill's category, so it counts as spending
 *   (`rule.payment-files-paid`, `script.file_paid`, and `script.settle_matched_line` for a line), and a category the bill
 *   filed offers no filing rule (`script.learn_category`). A rule and its script added, nothing taken away, and every
 *   record on 3.32.1 gains them as it updates, so a patch step as he asked.
 * - money-core 3.33.0 (round 1031, the live check's money items): a category can be ticked "A correction, not spending"
 *   (`categories.correction`), asked once for a category whose name says so (`rule.category-correction-asks`,
 *   `rule.category-correction-yes`, `script.category_correction`), and every spending and income figure leaves those
 *   lines out; Reports' sentence follows the picked range (`metric.received-last` and eleven more by range); Paid most
 *   adds every line to a payee; the 30-day figure is "Bills and usual spending"; lines imported twice are offered to be
 *   archived (`script.ledger_twice`). Fields, rules, scripts and figures added, nothing taken away, so a minor step.
 *   Before it shipped, Snapshots was also marked as written by automations alone (`register.snapshots` `kept_by`), so
 *   BrainDog no longer offers it a page.
 * - work 1.20.1 (finish loop, 30 Oct): Work's "No due day" lists the newest first (`page.work`), not by a due day none of
 *   them has, and "Later" by due day, then newest first. An order, nothing added or taken away, so a patch step.
 *   Also before it shipped: Work's band reads "Your work this week" and Timeline's lane "Tasks by due day", keys kept.
 * - core 1.2.1 (finish loop, 30 Oct): Health's "Not checked yet" group shows every card, so the cards add up to the
 *   count above them. A limit, nothing added or taken away, so a patch step. Also before it shipped, the Scripts page's
 *   note says "Every script you have" (`page.scripts`).
 * - people 4.2.2 (finish loop, 30 Oct): People's held-twice note says "may be listed twice" (`page.people`). Words
 *   only, so a patch step.
 * - people 4.2.2, before it shipped (audit 31 Oct m, AM17): People's line says "contacts besides you", since the
 *   list shows the owner too (`page.people`), and "people besides you" since audit 31 Oct n (AN16).
 * - money-core 3.33.0, before it shipped (numbers-agree): Forecast opens on 12 weeks like Money and Today, Reports'
 *   All line says the day money first moved (`metric.moved-since`).
 * - estate 2.6.1 (finish loop, 30 Oct, audit 2 B14): `rule.renew-soon` asks only about a service that costs more than
 *   nothing, and the two rules that act on its answer are named for what they do, since a question's answers read
 *   them as their reasons. Words and a condition, nothing added or taken away, so a patch step.
 * - money-core 3.33.0, before it shipped (audit 31 Oct f, AF4): Money's first line leads with late bills, or the low
 *   point when cash goes under within 12 weeks, the card second (`page.money`).
 * - money-core 3.33.0, before it shipped (polish-i, PI1): the first line's late figure is the link to the late bills,
 *   and Heads up no longer repeats it (`page.money`).
 * - money-core 3.33.0, before it shipped (audit 31 Oct g, AG1): a chased invoice's note says "in Needs you", where it
 *   said "in Decide" (`rule.invoice-chased`).
 * - money-core 3.33.0, before it shipped (audit 31 Oct h, AH15): with nothing due Money asks for a bill, and
 *   `metric.bills-open` and `metric.repeating-held` are added.
 * - money-core 3.33.0, before it shipped (audit 31 Oct j, AJ4): a plan's summary cell reads "Paid", where it read
 *   "Paid in" (`page.money-plan`).
 * - money-core 3.33.0, before it shipped (mb, MB3): a plan's summary draws only the tiles with something to say, so
 *   no "Late £0" or "Left £0" (`page.money-plan`).
 * - money-core 3.33.0, before it shipped (audit 31 Oct m, AM1 AM3): `metric.bills-held` is added; with no account Money
 *   opens on one to add with what was told under it (`page.money`), and Cash ahead signs its tiles by their way
 *   (`page.money`, `widget.cash-today`).
 * - money-core 3.33.0, before it shipped (left-h): `metric.settled-out-7d` is added, what he paid out in the last 7
 *   days, for Today's no-account tile.
 * - money-core 3.33.0, before it shipped (polish, 1 Nov): the Ledger tile says "36 came in today.", without "each
 *   under the day it happened" (`page.money`).
 * - portfolio 1.30.2 (audit 31 Oct g, AG22): a card's key number field reads "Shown first", where it read "Leads the
 *   card". Words only, so a patch step.
 * - work 1.20.1, before it shipped (audit 31 Oct f, AF20): Work's folded groups say how many they hold (`page.work`).
 */
export const FIRST_PARTY_VERSIONS: Readonly<Record<FirstPartyId, string>> = {
  core: '1.2.1',
  portfolio: '1.30.2',
  people: '4.2.2',
  'money-core': '3.33.0',
  estate: '2.6.1',
  work: '1.20.1',
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
   points at People's organisations since money-core 3.10.0, where a bill's still points at its people. AND WHICH PROJECT
   A BILL, A PAYMENT OR A REPEATING LINE IS FOR (`thing`, audit 31 Oct m, AM4), as Work's tasks say it: Money turned on
   from a money line on a Student's Today was refused, "money-core points at the things list ... which is not here". */
const LINKS: Partial<Record<FirstPartyId, readonly string[]>> = { people: ['projects'], 'money-core': ['party', 'thing'], work: ['owner', 'thing'] };

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
  const doc = wholeDocument() as { declarations: Body[]; seeds: Body[] };
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
 * words the first run hears it in (`signalsOf`).
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
  return { id, version: FIRST_PARTY_VERSIONS[id], requires: [...needs].sort(), provides: mine.map(idOf).sort(), links, signals: signalsOf(id) };
}

/** The pages that live in `core` and no longer in People, handed over by People from 4.0.0 under the ids they always had. */
export const CORE_PAGES = ['health', 'scripts', 'calendar', 'activity'] as const;

/** What People hands on, by declaration id: each of the four pages to `core`. */
const PEOPLE_HANDS: Record<string, string> = Object.fromEntries(CORE_PAGES.map((p) => [`page.${p}`, 'core']));

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
      /* A BLOCK WHOSE SENTENCE READS A FIELD THAT IS GONE is left out whole, as a figure over one is: Work's With no
         project lists open tasks whose project is empty, and a record with no projects has no such field
         (FIELD_UNKNOWN at install). */
      .filter((b) => !(typeof b.where === 'string' && [...gone].some((f) => new RegExp(`(?:^|,\\s*)${f}\\s`, 'u').test(b.where as string))))
      .map((b) => (Array.isArray(b.columns) ? { ...b, columns: (b.columns as Body[]).filter((c) => !gone.has(String(c.field))) } : b));
  return out;
}

/**
 * WHETHER A DECLARATION A RELINK WOULD ADD WAS LEFT OUT ONLY FOR A LINK THE RECORD LACKED, and the same plan lays that
 * link back (round 1030). money-core 3.32.0's `paid-to-by-week` reads the ledger's `party`, so a record that gained
 * organisations after Money held a Money with neither, and the relink, which never adds, left the ledger naming nobody
 * for good. Such an add is not one the person took off: it reads a link field of this pack (`LINKS`), and a list of
 * this document that declares that field is among the plan's changes, the link going in. What the person took off is
 * still kept off by the caller (`losses` reads `tookOff`).
 */
export function laidWithLink(id: string, doc: Record<string, unknown>, add: string, changed: readonly string[]): boolean {
  const links = new Set(LINKS[id as FirstPartyId] ?? []);
  if (links.size === 0) return false;
  const declarations = (doc.declarations ?? []) as Body[];
  const idOf = (d: Body): string | null => {
    for (const kind of ['register', 'metric', 'page', 'rule'] as const) if (typeof d[kind] === 'string') return `${kind}.${String(d[kind])}`;
    return null;
  };
  const added = declarations.find((d) => idOf(d) === add);
  if (added === undefined) return false;
  const cut = without(added, links);
  if (cut !== null && JSON.stringify(cut) === JSON.stringify(added)) return false;
  return declarations.some(
    (d) => typeof d.register === 'string' && changed.includes(`register.${d.register}`) && Array.isArray(d.fields) && (d.fields as Body[]).some((f) => links.has(String(f.id))),
  );
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
  /* A LEG OVER A LIST ONLY AN ADD-ON HOLDS (Certificates) IS KEPT ONLY WHERE THE RECORD SAYS IT HOLDS IT, in a block as in
     a figure: no record is known to hold an add-on's list, and a block with a leg over a list that is not there is refused
     when it is read. */
  const walked = (from: Body[], unsaid: boolean): Body[] =>
    from.filter(
      (leg) =>
        typeof leg.register !== 'string' ||
        own.has(leg.register) ||
        (ADDON_LEG_LISTS.has(leg.register) ? held !== null && held.has(leg.register) : held === null ? unsaid : held.has(leg.register)),
    );
  const legs = (d: Body): Body => {
    if (Array.isArray(d.legs)) return { ...d, legs: walked(d.legs as Body[], false) };
    if (!Array.isArray(d.blocks)) return d;
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
    ...(id === 'people' ? { hands: PEOPLE_HANDS } : {}),
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
