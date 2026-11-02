/**
 * The ledger of what the site claims about the product, one entry a claim.
 *
 * `said` is the claim's words exactly as the copy holds them, and `where` is the path to that string in `site`
 * (`copy.ts`), or in `slashPage` (`copy/slash.ts`, which the Slash page imports directly and `copy.ts` does not
 * spread) when it starts `slashPage.`, so `claims.test.ts` finds each one and fails when a sentence is reworded and
 * the ledger is not.
 * `state` says how true it is today:
 *   - `true`: the product does it now, for anybody. A claim that rests on a launch flag names it, and the flag is on.
 *   - `flag`: the product does it once the named flag in `launch.ts` is on, and not before.
 *   - `not-yet`: nothing makes it true today, so no copy file may say it. A `flag` beside it is the one that would.
 *     With `soon`, the copy says it as not yet ("Coming soon."), at `where` and nowhere else, while the flag is off.
 *
 * Only sentences that claim something are here: a label, a button's verb or a drawing's made-up figure is not.
 * Which unit of work makes each `flag` and `not-yet` claim true is kept outside the repository, beside the audit
 * the ledger came from, so this file carries a plain key and nothing else.
 *
 * SIGN-UP OPENED ON 8 OCTOBER, SO WHAT RESTS ON `signup` IS `true`, and it stays true by invitation: production runs
 * `SIGNUP=invite` from 17 October, where a stranger who presses Get early access signs up with an invite or applies
 * for one, and from 20 October the site says so ("Early access, invite only"). Billing is still off or in test mode, so a claim
 * that a stranger can pay, upgrade, cancel or have colleagues is `flag`. The repository is private, so a claim that
 * anybody can read the code is `not-yet`, and `claims.test.ts` asks for it to be marked again once `LAUNCH.repo` is on.
 */
import type { LaunchFlag } from './launch.ts';
import { APPS_AND } from './agents.ts';

export type ClaimState = 'true' | 'flag' | 'not-yet';

export type Claim = {
  /** A plain key, never a scope id. */
  id: string;
  /** The claim's words, exactly as `site` holds them at `where`. */
  said: string;
  /** The dotted path into `site` (or `slashPage.`), an array index as a number: `yours.points.2.body`. */
  where: string;
  state: ClaimState;
  flag?: LaunchFlag;
  /** A `not-yet` claim the copy says as not yet, at `where` only. */
  soon?: true;
};

export const CLAIMS: readonly Claim[] = [
  /* The home page (`copy/home.ts`, spread into `site`, so `hero.sub` is its `home.hero.sub`). */
  { id: 'ai-tools-read', said: 'Your AI tools read from it too.', where: 'hero.sub', state: 'true' },
  { id: 'agents-leave-a-note', said: "leave a note when they're done", where: 'tools.say', state: 'true' },
  { id: 'mcp-approve-once-home', said: 'You approve each one once, and no key is copied anywhere.', where: 'tools.approve', state: 'true' },
  { id: 'slash-figure-opens', said: 'every figure opens what it came from', where: 'tools.slash.say', state: 'true' },
  { id: 'chores-reason-undo', said: 'each with a reason and an undo', where: 'filing.say', state: 'true' },
  { id: 'floor-waits', said: 'Money, keys, sharing and deletes always wait for your yes.', where: 'filing.floor.say', state: 'true' },
  { id: 'undo-any-change', said: 'Every change has a name on it, and an undo.', where: 'yours.points.0.text', state: 'true' },
  { id: 'export-any-time', said: 'Export everything as one file, any time.', where: 'yours.points.1.text', state: 'true' },
  { id: 'keys-unseen', said: 'AI tools use your keys without ever seeing them.', where: 'yours.points.2.text', state: 'true' },
  { id: 'own-database-home', said: "Nothing is shared between customers, so no one else's search can reach yours.", where: 'yours.points.3.text', state: 'true' },
  { id: 'no-password-home', said: 'Sign in with your email, Google or a passkey. No password to steal.', where: 'yours.points.4.text', state: 'true' },
  { id: 'sealed-copies-home', said: 'A sealed copy every night, to a key kept outside Cloudflare.', where: 'yours.points.5.text', state: 'true' },
  { id: 'nothing-lost-home', said: 'Nothing you make now is lost.', where: 'free.laterSay', state: 'true' },
  { id: 'invite-only', said: 'BrainDog is invite only for now.', where: 'free.say', state: 'true', flag: 'signup' },

  /* The Slash page (`copy/slash.ts`, its own export `slashPage`, which the ledger reads beside `site`). */
  { id: 'slash-asks-first', said: 'Anything with money, keys, sharing or deletes waits for your yes.', where: 'slashPage.head.lead', state: 'true' },
  { id: 'own-key-no-limit', said: 'or no limit with your own AI key', where: 'slashPage.tally.say', state: 'true' },
  { id: 'finding-free', said: 'Finding is free and never spends a question.', where: 'slashPage.find.body.1', state: 'true' },
  { id: 'own-key-unlimited', said: 'Questions on your own key have no monthly limit.', where: 'slashPage.faq.questions.2.a', state: 'true' },

  /* The connect page (`copy/agents.ts`). */
  { id: 'mcp-approve-once', said: 'no key is copied anywhere', where: 'agents.lead', state: 'true' },
  { id: 'mcp-opens-once', said: 'BrainDog opens once, and you approve it.', where: 'agents.steps.items.2', state: 'true' },
  { id: 'agent-sees-no-key', said: 'See a key. It uses them from the Keychain, by name.', where: 'agents.cannot.lines.0', state: 'true' },
  { id: 'agent-asks-first', said: 'Move money, share or delete without your yes.', where: 'agents.cannot.lines.1', state: 'true' },
  { id: 'agent-signs-writes', said: 'Hide what it did. Everything it writes carries its name.', where: 'agents.cannot.lines.2', state: 'true' },
  { id: 'agent-write-undo', said: 'A receipt and an undo for everything it writes.', where: 'agents.gets.lines.2', state: 'true' },
  { id: 'five-apps-connect', said: `${APPS_AND} can read your BrainDog, suggest changes and leave notes.`, where: 'agents.lead', state: 'true' },

  /* The pricing page (`copy/pricing.ts`, `pricing`): the early access page while billing is off, then the plans. */
  { id: 'early-free', said: 'Everything in it is free while we open it up.', where: 'pricing.early.lede', state: 'true', flag: 'signup' },
  { id: 'nothing-lost', said: 'nothing you make now is lost', where: 'pricing.early.later.say', state: 'true' },
  { id: 'export-any-time-early', said: 'Yes, all of it, as one file, whenever you like.', where: 'pricing.early.faq.questions.2.a', state: 'true' },
  { id: 'export-every-plan', said: 'Yes, all of it, as one file, on every plan.', where: 'pricing.faq.questions.2.a', state: 'true' },
  { id: 'cancel-any-time', said: 'Yes, from Settings.', where: 'pricing.faq.questions.3.a', state: 'flag', flag: 'billing' },
  { id: 'extra-use-soon', said: 'Coming soon.', where: 'pricing.extra.soon', state: 'not-yet', flag: 'extra', soon: true },
  { id: 'waits-next-month', said: 'Nothing stops at the limit. It waits for next month.', where: 'pricing.holds.say', state: 'true' },
  { id: 'brief-spends-no-ask', said: 'Your brief, filing and your rules never spend one.', where: 'pricing.faq.questions.0.a', state: 'true' },
  { id: 'extra-use-capped', said: 'Turn it on with a monthly cap, and BrainDog never goes past it.', where: 'pricing.extra.say', state: 'flag', flag: 'extra' },

  /* The pages for each kind of person (`copy/for.ts`). */
  { id: 'bills-file-themselves', said: 'Once it knows their shape, each lands in the right list with its amount and due day.', where: 'person.who.personal.rows.0.said', state: 'true' },
  { id: 'students-reminded', said: 'Automations remind you before things are due', where: 'person.who.student.sub', state: 'true' },
  { id: 'late-invoice-drafted', said: 'Say yes, and a reminder is written for you to send.', where: 'person.who.founder.rows.1.said', state: 'true' },
  { id: 'team-who-changed', said: 'every change says who made it.', where: 'person.who.team.sub', state: 'true' },

  /* The trust pages (`copy/trust.ts`) and the shared words (`copy/shell.ts`). */
  { id: 'licence', said: 'The software is licensed under the Apache License 2.0', where: 'legal.licence.body.0', state: 'true' },
  { id: 'open-source', said: 'BrainDog is open source.', where: 'legal.licence.body.0', state: 'not-yet', flag: 'repo' },
  { id: 'terms-before-signup', said: 'are published on this page before sign-up opens', where: 'legal.terms.body', state: 'not-yet' },
  { id: 'text-before-signup', said: 'This text is published here before sign-up opens.', where: 'legal.pending', state: 'not-yet' },
  { id: 'terms-meta', said: 'and its Terms of Service and Privacy Policy', where: 'meta.legal.description', state: 'true', flag: 'legal' },
  { id: 'support-before-signup', said: 'The support address is published here before sign-up opens.', where: 'support.mail.pending', state: 'not-yet' },
  { id: 'issues-on-github', said: 'Report a fault as an issue, or ask a question in Discussions', where: 'support.github.body', state: 'flag', flag: 'repo' },
  { id: 'no-shared-table', said: 'Nothing is shared between customers', where: 'security.kept.facts.0.text', state: 'true' },
  { id: 'sealed-copies', said: 'Every night a copy is sealed to a key kept outside Cloudflare', where: 'security.kept.facts.2.text', state: 'true' },
  { id: 'no-password', said: 'There is no password to steal.', where: 'security.kept.facts.3.text', state: 'true' },
  { id: 'token-reach', said: 'Opening keys, erasing data, restoring a copy or deleting everything needs you, signed in.', where: 'security.kept.facts.4.text', state: 'true' },
  { id: 'report-before-signup', said: 'The address for reporting a weakness is published here before sign-up opens.', where: 'security.report.pending', state: 'not-yet' },

  /* The packs pages (`copy/packs.ts`). */
  { id: 'pack-asks-first', said: 'Opens BrainDog, which shows what this adds and asks before anything changes.', where: 'packs.detail.installNote', state: 'true' },
  { id: 'pack-preview-fresh', said: 'Drawn by BrainDog in a fresh BrainDog with only this add-on on', where: 'packs.detail.previewNote', state: 'true' },
];
