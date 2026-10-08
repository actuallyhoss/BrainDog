/**
 * The ledger of what the site claims about the product, one entry a claim.
 *
 * `said` is the claim's words exactly as the copy holds them, and `where` is the path to that string in `site`
 * (`copy.ts`), so `claims.test.ts` finds each one and fails when a sentence is reworded and the ledger is not.
 * `state` says how true it is today:
 *   - `true`: the product does it now, for anybody. A claim that rests on a launch flag names it, and the flag is on.
 *   - `flag`: the product does it once the named flag in `launch.ts` is on, and not before.
 *   - `not-yet`: nothing makes it true today, so no copy file may say it. A `flag` beside it is the one that would.
 *
 * Only sentences that claim something are here: a label, a button's verb or a drawing's made-up figure is not.
 * Which unit of work makes each `flag` and `not-yet` claim true is kept outside the repository, beside the audit
 * the ledger came from, so this file carries a plain key and nothing else.
 *
 * SIGN-UP OPENED ON 8 OCTOBER, SO WHAT RESTS ON `signup` IS `true`. Billing is still off or in test mode, so a claim
 * that a stranger can pay, upgrade, cancel or have colleagues is `flag`. The repository is private, so a claim that
 * anybody can read the code is `not-yet`, and `claims.test.ts` asks for it to be marked again once `LAUNCH.repo` is on.
 */
import type { LaunchFlag } from './launch.ts';

export type ClaimState = 'true' | 'flag' | 'not-yet';

export type Claim = {
  /** A plain key, never a scope id. */
  id: string;
  /** The claim's words, exactly as `site` holds them at `where`. */
  said: string;
  /** The dotted path into `site`, an array index as a number: `home.yours.body.2`. */
  where: string;
  state: ClaimState;
  flag?: LaunchFlag;
};

export const CLAIMS: readonly Claim[] = [
  /* The home page (`copy/home.ts`). */
  { id: 'changes-named', said: 'every change says who made it', where: 'hero.sub', state: 'true' },
  { id: 'start-free', said: 'Start for free', where: 'hero.primary', state: 'true', flag: 'signup' },
  { id: 'undo-any-change', said: 'Any change can be undone, and the name stays on it.', where: 'decide.undo', state: 'true' },
  { id: 'slash-asks-first', said: 'Nothing it writes goes in until you say yes.', where: 'home.slash.lead', state: 'true' },
  { id: 'mcp-approve-once', said: 'You approve it once in the app, and no key is copied anywhere.', where: 'home.agents.lead', state: 'true' },
  { id: 'keys-unseen', said: 'Agents use your API keys without ever seeing them.', where: 'home.agents.keys', state: 'true' },
  { id: 'connect-stripe-mercury', said: 'connect Stripe and Mercury', where: 'home.inbox.lead', state: 'true' },
  { id: 'inbox-learns', said: 'After three of a kind, Slash suggests how to file them.', where: 'home.inbox.lead', state: 'true' },
  { id: 'own-database', said: 'Each record is its own database.', where: 'home.yours.body.0', state: 'true' },
  { id: 'export-any-time', said: 'Export all of it as one file whenever you like.', where: 'home.yours.body.0', state: 'true' },
  { id: 'code-readable', said: 'The code is open, so you can read exactly how all of this works.', where: 'home.yours.body.2', state: 'not-yet', flag: 'repo' },
  { id: 'free-no-card', said: 'The whole app, for one record, with no card and no trial that runs out.', where: 'home.plans.lead', state: 'true', flag: 'signup' },
  { id: 'colleagues-no-extra', said: 'colleagues in the same record at no extra cost', where: 'home.plans.pros.said', state: 'flag', flag: 'billing' },
  { id: 'first-run-sets-up', said: 'Slash sets up the first lists and pages.', where: 'closing.body', state: 'true' },

  /* The Slash page (`copy/pricing.ts`, `slash`). */
  { id: 'slash-says-source', said: 'The answer comes from your own lists, says which one', where: 'slash.abilities.0.lead', state: 'true' },
  { id: 'slash-daily-email', said: 'It shows up on Home and in your daily email', where: 'slash.abilities.2.lead', state: 'true' },
  { id: 'filing-no-credits', said: 'every one after is filed automatically, and it costs no credits.', where: 'slash.abilities.3.lead', state: 'true' },
  { id: 'slash-no-secrets', said: 'Saved API keys and passwords are off limits. It only knows their names.', where: 'slash.rules.1.said', state: 'true' },
  { id: 'slash-quiet-two-weeks', said: 'On a new record it stays quiet for the first two weeks', where: 'slash.rules.3.said', state: 'true' },
  { id: 'slash-every-plan', said: 'Slash is included on every plan from day one.', where: 'slash.closeBody', state: 'true' },

  /* The pricing page (`copy/pricing.ts`, `pricing`). */
  { id: 'free-sub', said: 'No card, and no trial that runs out.', where: 'pricing.sub', state: 'true', flag: 'signup' },
  { id: 'pay-for-more', said: 'Pay only when you need more.', where: 'pricing.sub', state: 'flag', flag: 'billing' },
  { id: 'backups-thirty', said: 'Nightly backups, last 30 kept', where: 'pricing.plans.free.points.1', state: 'true' },
  { id: 'cancel-any-time', said: 'Change or cancel any time', where: 'pricing.plans.cloud.points.1', state: 'flag', flag: 'billing' },
  { id: 'allowance-resets', said: 'Allowances reset on the first of each month.', where: 'pricing.usageLead', state: 'true' },
  { id: 'packs-later', said: 'Credit packs and extra usage are coming later.', where: 'pricing.later', state: 'true' },
  { id: 'over-allowance-waits', said: 'work over the allowance waits for the next month.', where: 'pricing.later', state: 'true' },
  { id: 'upgrade-from-settings', said: 'Upgrade from Settings and the larger allowance applies straight away.', where: 'pricing.faq.2.a', state: 'flag', flag: 'billing' },
  { id: 'arrivals-not-counted', said: 'Mail and webhooks arriving at your record, and the notices it sends you, are never counted.', where: 'pricing.faq.3.a', state: 'true' },
  { id: 'nothing-charged', said: 'Nothing is charged, and nothing is lost.', where: 'pricing.faq.5.a', state: 'true' },
  { id: 'cancelled-exports', said: 'a cancelled record can still be exported', where: 'pricing.faq.6.a', state: 'flag', flag: 'billing' },

  /* The agents page (`copy/agents.ts`). */
  { id: 'skills-updated', said: 'the ones you and other agents wrote, updated as they learn.', where: 'agents.value.gets.2.said', state: 'true' },
  { id: 'oauth-approve', said: 'It opens the app so you can approve it, once, and pick the record.', where: 'agents.connect.ways.0.said', state: 'true' },
  { id: 'cli-install', said: 'Install the command line, then point it at your record.', where: 'agents.connect.ways.1.said', state: 'true' },
  { id: 'tool-count', said: 'Seventeen tools, and ten of them only read.', where: 'agents.mcp.title', state: 'true' },
  { id: 'door-rate', said: '120 a minute', where: 'agents.outside.ways.0.limits.2.what', state: 'true' },
  { id: 'report-key-blind', said: 'It cannot read anything, so it is safe to put in a CI job or on a server.', where: 'agents.outside.ways.1.said', state: 'true' },
  { id: 'report-rate', said: '600 rows a minute', where: 'agents.outside.ways.1.limits.5.what', state: 'true' },
  { id: 'decide-needs-person', said: 'Deciding needs a person, signed in. No token reaches it.', where: 'agents.cannot.rows.0.said', state: 'true' },

  /* The pages for each kind of person (`copy/for.ts`). */
  { id: 'bills-file-themselves', said: 'Once it knows their shape, each lands in the right list with its amount and due day.', where: 'person.who.personal.rows.0.said', state: 'true' },
  { id: 'students-reminded', said: 'Automations remind you before things are due', where: 'person.who.student.sub', state: 'true' },
  { id: 'late-invoice-drafted', said: 'a reminder is drafted in your words and waits for your yes.', where: 'person.who.founder.rows.1.said', state: 'true' },
  { id: 'team-colleagues-free', said: 'Colleagues are free, and every change says who made it.', where: 'person.who.team.sub', state: 'flag', flag: 'billing' },

  /* The trust pages (`copy/trust.ts`) and the shared words (`copy/shell.ts`). */
  { id: 'licence', said: 'The software is licensed under the Apache License 2.0', where: 'legal.licence.body.0', state: 'true' },
  { id: 'open-source', said: 'BrainDog is open source.', where: 'legal.licence.body.0', state: 'not-yet', flag: 'repo' },
  { id: 'terms-before-signup', said: 'are published on this page before sign-up opens', where: 'legal.terms.body', state: 'not-yet', flag: 'legal' },
  { id: 'text-before-signup', said: 'This text is published here before sign-up opens.', where: 'legal.pending', state: 'not-yet', flag: 'legal' },
  { id: 'terms-meta', said: 'and its Terms of Service and Privacy Policy', where: 'meta.legal.description', state: 'flag', flag: 'legal' },
  { id: 'support-before-signup', said: 'The support address is published here before sign-up opens.', where: 'support.mail.pending', state: 'not-yet' },
  { id: 'issues-on-github', said: 'Report a fault as an issue, or ask a question in Discussions', where: 'support.github.body', state: 'flag', flag: 'repo' },
  { id: 'no-shared-table', said: 'No table holds two customers', where: 'security.kept.facts.0.text', state: 'true' },
  { id: 'sealed-copies', said: 'Every night a copy of each record is sealed to a key kept outside Cloudflare', where: 'security.kept.facts.2.text', state: 'true' },
  { id: 'no-password', said: 'There is no password to steal.', where: 'security.kept.facts.3.text', state: 'true' },
  { id: 'token-reach', said: 'No token can open your keys, erase data, restore a copy or delete the record', where: 'security.kept.facts.4.text', state: 'true' },
  { id: 'report-before-signup', said: 'The address for reporting a weakness is published here before sign-up opens.', where: 'security.report.pending', state: 'not-yet' },

  /* The packs pages (`copy/packs.ts`). */
  { id: 'pack-asks-first', said: 'Opens BrainDog, which shows what this adds and asks before anything changes.', where: 'packs.detail.installNote', state: 'true' },
  { id: 'pack-start-record', said: 'No record yet? You can start one there.', where: 'packs.detail.installNote', state: 'true', flag: 'signup' },
  { id: 'pack-preview-fresh', said: 'Drawn by BrainDog in a fresh record with only this pack on', where: 'packs.detail.previewNote', state: 'true' },
];
