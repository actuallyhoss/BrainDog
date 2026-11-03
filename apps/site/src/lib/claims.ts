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
  /* The home page (`copy/home.ts`, spread into `site`, so `hero.sub` is its `home.hero.sub`). The site story of 3
     November: each is checked against the code in `loop/plans/site-story-2026-11-03/COPY.md` ("Claims"). */
  { id: 'picks-up-where-stopped', said: 'so each picks up where the last one stopped', where: 'hero.sub', state: 'true' },
  { id: 'asks-before-money-keys-deletes', said: 'they ask before touching money, keys or deletes', where: 'hero.sub', state: 'true' },
  { id: 'connect-no-key-copied', said: 'You approve each once, and no key is copied anywhere.', where: 'who.small.say', state: 'true' },
  { id: 'briefing-who-else', said: 'who else is working', where: 'who.build.say', state: 'true' },
  { id: 'session-writes-next-step', said: 'When it stops, it writes the next step down.', where: 'who.build.say', state: 'true' },
  { id: 'learns-monday-knows-tuesday', said: 'What Claude learns on Monday, Cursor knows on Tuesday.', where: 'tools.say', state: 'true' },
  { id: 'new-agent-asks', said: 'A new agent asks before every change to your work.', where: 'chores.say', state: 'true' },
  { id: 'ladder-offer-ten', said: "Once you've kept ten of its changes of one kind, BrainDog offers to let it make that kind on its own, and only that kind.", where: 'chores.say', state: 'true' },
  { id: 'ladder-undo-drops', said: 'One undo puts it back to asking.', where: 'chores.say', state: 'true' },
  { id: 'floor-waits', said: 'Deletes, money, keys and sharing ask every time.', where: 'chores.floor', state: 'true' },
  { id: 'floor-switch', said: 'You can let your own agents skip that; reading a key, giving BrainDog away and deleting it stay yours either way.', where: 'chores.floor', state: 'true' },
  { id: 'undo-any-change', said: 'Every change carries a name, person or agent, and an undo.', where: 'yours.points.0.text', state: 'true' },
  { id: 'stop-from-browser', said: 'See which agents are working now, and pause, redirect or stop one from any browser.', where: 'yours.points.1.text', state: 'true' },
  { id: 'keys-unseen', said: 'Agents use your keys without ever seeing them.', where: 'yours.points.2.text', state: 'true' },
  { id: 'statement-csv', said: "Import any bank's statement as a CSV and each line is filed; your choices become rules for the next one.", where: 'money.addons', state: 'true' },
  { id: 'stripe-mercury-read-only', said: 'Stripe and Mercury connect read only.', where: 'money.addons', state: 'true' },
  { id: 'together-invite-mail', said: 'Invite people by email and choose what each can see and change.', where: 'together.say', state: 'true' },
  { id: 'together-agents-access', said: 'Their agents get exactly their access, no more, and every change says who made it.', where: 'together.say', state: 'true' },
  { id: 'together-mention', said: 'Type @ and a name in a comment, and their phone gets a notification.', where: 'together.mention.say', state: 'true' },
  { id: 'together-link-money', said: 'Money stays off it unless you add it.', where: 'together.link.say', state: 'true' },
  { id: 'together-contacts', said: 'Bring contacts in from a CSV or vCard. Anyone already here is skipped.', where: 'together.imports', state: 'true' },
  { id: 'slash-change-undo', said: 'Ask for a change and it makes it, with an undo.', where: 'slash.say', state: 'true' },
  { id: 'invite-only', said: 'BrainDog is invite only for now.', where: 'free.say', state: 'true', flag: 'signup' },
  { id: 'faq-switch-never', said: 'but reading a key, giving BrainDog away, deleting it and paying stay yours even then.', where: 'faq.questions.3.a', state: 'true' },
  { id: 'faq-trust-settings', said: 'You can see where each agent stands, and put any kind back to asking, in Settings.', where: 'faq.questions.4.a', state: 'true' },
  { id: 'faq-chatgpt-paid', said: 'ChatGPT needs a paid plan for this', where: 'faq.questions.2.a', state: 'true' },

  /* The Slash page (`copy/slash.ts`, its own export `slashPage`, which the ledger reads beside `site`). */
  { id: 'slash-asks-first', said: 'Money, keys, sharing and deletes come back to you as a question first.', where: 'slashPage.make.body.1', state: 'true' },
  { id: 'own-key-no-limit', said: 'or no limit with your own AI key', where: 'slashPage.tally.say', state: 'true' },
  { id: 'finding-free', said: 'Finding is free and never spends a question.', where: 'slashPage.find.body.1', state: 'true' },
  { id: 'own-key-unlimited', said: 'Questions on your own key have no monthly limit.', where: 'slashPage.faq.questions.2.a', state: 'true' },

  /* The connect page (`copy/agents.ts`). The trust lines are the site story's (3 November): since the owner's switch
     went fully inclusive on 2 November, inviting and removing people is his own agents' to do when it is on. */
  { id: 'mcp-approve-once', said: 'no key is copied anywhere', where: 'agents.lead', state: 'true' },
  { id: 'agent-asks-first', said: "A new agent's changes arrive as questions, each with what would happen and why.", where: 'agents.cannot.lines.0', state: 'true' },
  { id: 'agent-earns-kind', said: 'Keep ten changes of a kind and it may make that kind alone. One undo, or an email it just read, puts it back to asking.', where: 'agents.cannot.lines.1', state: 'true' },
  { id: 'switch-never', said: 'Reading a key, giving BrainDog away and deleting it stay yours even if you let your own agents do everything.', where: 'agents.cannot.lines.2', state: 'true' },
  { id: 'agent-signs-writes', said: 'Every change carries its name, and you can undo it.', where: 'agents.cannot.lines.3', state: 'true' },

  /* The pricing page (`copy/pricing.ts`, `pricing`): the early access page while billing is off, then the plans. */
  { id: 'early-free', said: 'everything in it is free while we open it up.', where: 'pricing.early.lede', state: 'true', flag: 'signup' },
  { id: 'nothing-lost', said: 'Nothing you set up now is lost.', where: 'pricing.early.later.say', state: 'true' },
  { id: 'export-any-time-early', said: 'Yes, all of it, as one file, whenever you like.', where: 'pricing.early.faq.questions.2.a', state: 'true' },
  { id: 'export-every-plan', said: 'Yes, all of it, as one file, on every plan.', where: 'pricing.faq.questions.2.a', state: 'true' },
  { id: 'cancel-any-time', said: 'Yes, from Settings.', where: 'pricing.faq.questions.3.a', state: 'flag', flag: 'billing' },
  { id: 'extra-use-soon', said: 'Coming soon.', where: 'pricing.extra.soon', state: 'not-yet', flag: 'extra', soon: true },
  { id: 'waits-next-month', said: 'Nothing stops at the limit: it waits for next month.', where: 'pricing.holds.say', state: 'true' },
  { id: 'brief-spends-no-ask', said: 'The briefing, filing and your rules never spend one.', where: 'pricing.faq.questions.1.a', state: 'true' },
  { id: 'extra-use-capped', said: 'Turn it on with a monthly cap, and BrainDog never goes past it.', where: 'pricing.extra.say', state: 'flag', flag: 'extra' },

  /* The pages for each kind of person (`copy/for.ts`). */
  { id: 'bills-file-themselves', said: 'Once it knows their shape, each lands in the right list with its amount and due day.', where: 'person.who.personal.rows.0.said', state: 'true' },
  { id: 'students-reminded', said: 'Automations remind you before things are due', where: 'person.who.student.sub', state: 'true' },
  { id: 'team-who-changed', said: 'every change says who made it, person or agent', where: 'person.who.team.sub', state: 'true' },

  /* The trust pages (`copy/trust.ts`) and the shared words (`copy/shell.ts`). */
  { id: 'licence', said: 'The software is licensed under the Apache License 2.0', where: 'legal.licence.body.0', state: 'true' },
  { id: 'open-source', said: 'BrainDog is open source.', where: 'legal.licence.body.0', state: 'not-yet', flag: 'repo' },
  { id: 'terms-before-signup', said: 'are published on this page before sign-up opens', where: 'legal.terms.body', state: 'not-yet' },
  { id: 'text-before-signup', said: 'This text is published here before sign-up opens.', where: 'legal.pending', state: 'not-yet' },
  { id: 'terms-meta', said: 'and its Terms of Service and Privacy Policy', where: 'meta.legal.description', state: 'true', flag: 'legal' },
  { id: 'support-before-signup', said: 'The support address is published here before sign-up opens.', where: 'support.mail.pending', state: 'not-yet' },
  { id: 'issues-on-github', said: 'Report a fault as an issue, or ask a question in Discussions', where: 'support.github.body', state: 'flag', flag: 'repo' },
  { id: 'no-shared-table', said: "apart from every other customer's", where: 'security.kept.facts.0.text', state: 'true' },
  { id: 'sealed-copies', said: 'Every night a copy is sealed to a key kept outside Cloudflare', where: 'security.kept.facts.2.text', state: 'true' },
  { id: 'no-password', said: 'There is no password to steal.', where: 'security.kept.facts.3.text', state: 'true' },
  { id: 'token-reach', said: 'Reading a key, handing BrainDog over or deleting it needs you, signed in, even when you let your own agents do everything else.', where: 'security.kept.facts.4.text', state: 'true' },
  { id: 'report-before-signup', said: 'The address for reporting a weakness is published here before sign-up opens.', where: 'security.report.pending', state: 'not-yet' },

  /* The packs pages (`copy/packs.ts`). */
  { id: 'pack-asks-first', said: 'Opens BrainDog, which shows what this adds and asks before anything changes.', where: 'packs.detail.installNote', state: 'true' },
  { id: 'pack-preview-fresh', said: 'Drawn by BrainDog in a fresh BrainDog with only this add-on on', where: 'packs.detail.previewNote', state: 'true' },
];
