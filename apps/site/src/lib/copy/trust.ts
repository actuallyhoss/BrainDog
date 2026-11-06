/**
 * The trust pages' words: support, security and legal. The licence is named here and in the READMEs,
 * and nowhere else a reader meets it.
 *
 * THE SUPPORT ADDRESS IS NOT TYPED HERE. It is `SUPPORT_EMAIL` in `links.ts`, the one constant the
 * pages read, and it stays empty until the owner routes it to an inbox. A
 * sentence that shows it is a function of it, and each has a twin for the day it is empty, so no
 * page ever prints an address nobody reads. `/.well-known/security.txt` follows the same rule: it is
 * added beside `static/` the day the address is set, because RFC 9116 makes `Contact` required and a
 * file without one is worse than no file.
 */
export const trust = {
  legal: {
    /* The list of a text's sections at its top (plan F26). */
    contents: 'On this page',
    title: 'Legal',
    lede: 'What BrainDog is published under, and the terms of a hosted record.',
    licence: {
      title: 'Licence',
      body: [
        'The software is licensed under the Apache License 2.0, and its renderer under the MIT License.',
        'It is provided as is, without warranty of any kind, express or implied. The licence texts set out the full terms.',
      ],
      links: [
        { label: 'Apache License 2.0', href: 'https://www.apache.org/licenses/LICENSE-2.0' },
        { label: 'MIT License', href: 'https://opensource.org/license/mit' },
        { label: 'The code on GitHub', href: 'https://github.com/actuallyhoss/BrainDog' },
      ],
    },
    terms: {
      title: 'Terms and privacy',
      /* NOT WRITTEN HERE. The legal texts are drafted in `apps/site/legal/` and the owner's to
         approve; a marketing redesign does not invent a legal term. Before `LAUNCH.legal` the index
         says so in one sentence; after it, it lists the three pages below. */
      body: 'The Terms of Service, the Privacy Policy and the Data Processing Addendum will be published on this page, and each will say when it last changed.',
      live: 'The terms you agree to when you make a hosted record, how your data is handled, and who handles it for us.',
    },
    /* One entry per text in `apps/site/legal/`, by its file name, which is also its address under
       `/legal/`. Fair use and refunds are sections of the Terms, not texts of their own. */
    texts: {
      terms: { title: 'Terms of Service', description: 'The terms of a hosted BrainDog record.' },
      privacy: { title: 'Privacy Policy', description: 'What BrainDog keeps about you, why, and for how long.' },
      processing: { title: 'Data Processing Addendum', description: 'How BrainDog handles personal data for a business, and the companies that help run it.' },
    },
    /* The one sentence an unpublished text's page says. The page exists so a strict prerender passes
       and carries `noindex`, and nothing links to it. */
    pending: 'This text will be published here.',
  },

  support: {
    meta: {
      title: 'Support · BrainDog',
      description: 'Where to get help with BrainDog, and what to put in a report so it can be answered the first time.',
    },
    title: 'Support',
    lede: 'Write to us and a person answers.',
    mail: {
      title: 'Write to us',
      body: 'Send a question, a fault or a request about your BrainDog to the support address.',
      /* The empty-address twin. Nothing reads mail at an address until the owner routes it. */
      pending: 'The support address will be listed here.',
    },
    /* Shown only when `LAUNCH.repo`: while the repository is private these addresses answer 404. */
    github: {
      title: 'On GitHub',
      body: 'Report a fault as an issue, and the answer helps the next person too.',
      issues: 'Open an issue',
    },
    report: {
      title: 'What to put in a report',
      items: [
        'What you did, step by step, and what you expected to happen.',
        'What happened instead, with the exact words of any message BrainDog showed.',
        'Where it happened: the address in the browser, or the command you ran.',
        'Which browser, or which version of the command line, and the name of the BrainDog it happened in.',
        'Leave out passwords, keys and tokens. A report never needs one.',
      ],
    },
  },

  security: {
    meta: {
      title: 'Security: how BrainDog protects your data and keys',
      description: 'How BrainDog keeps your projects, money and keys safe: a database of your own, sealed keys, sealed nightly copies, no password, and agents that ask first.',
    },
    title: 'Security',
    lede: "How your projects, money and keys stay safe from other people and from an agent's mistakes.",
    kept: {
      title: 'How your BrainDog is kept',
      /* One tile each on /security: a short name, the glyph its well draws, and the fact as it has always been worded. */
      facts: [
        // docs/12-SECURITY.md §2; apps/worker/src/index.ts (`RECORD`, one Durable Object per record).
        {
          title: 'Its own database',
          glyph: 'server',
          text: "Your BrainDog is its own database, apart from everyone else's. No other customer's search can reach it.",
        },
        // docs/16-DECISIONS.md ADR-062; apps/worker/src/vault.ts and keys.ts (the host seals, the record stores).
        {
          title: 'Sealed keys',
          glyph: 'key',
          text: "Keys are sealed before they're stored. BrainDog never holds one in the clear.",
        },
        // apps/worker/src/seal.ts and nightly.ts (age to one recipient whose identity is kept outside Cloudflare).
        {
          title: 'Sealed nightly copies',
          glyph: 'lock',
          text: 'Every night a copy is sealed to a key kept elsewhere, so the copy alone opens nothing.',
        },
        // apps/web/src/lib/copy/account.ts `signInLede` and apps/worker/src/google.ts (email, Google or a passkey; no password).
        {
          title: 'No password',
          glyph: 'shield',
          text: 'You sign in with your email, Google or a passkey. There is no password to steal.',
        },
        // docs/16-DECISIONS.md ADR-060 (scopes read, propose, write; no admin scope). The ladder is
        // packages/record/src/ladder.ts; what the owner's switch never covers is `NEVER_BYPASS` (handOver, deleteRecord,
        // erase) and reading a key's value, docs/03-agents/04-scopes.md. Since 2 November the switch covers the team, so
        // inviting people left this list (3 November), and restoring a copy with it.
        {
          title: 'What an agent can do',
          glyph: 'agent',
          text: 'A new agent asks before every change to your work. It earns the right to act alone one kind of change at a time, and loses it on an undo. Reading a key, handing BrainDog over or deleting it always needs you, signed in.',
        },
        // apps/web/src/routes/settings/[area]/areas/Export.svelte; docs/12-SECURITY.md §8 (the export).
        {
          title: 'Export any time',
          glyph: 'download',
          text: 'Export everything as one file from Settings.',
        },
      ],
    },
    /* THE DRAWINGS BESIDE THE FACTS. Each says only what its fact says, and each is a picture with its words as its name. */
    drawn: {
      records: "Four BrainDogs side by side, yours and three that are someone else's, each its own database, with nothing running between them",
      recordName: (n: number) => (n === 1 ? 'Yours' : "Someone else's"),
      sealed: ['A key you connect', 'Sealed first', 'Stored, never in the clear'],
      sealedLabel: 'A key you connect is sealed first, then stored, and never kept in the clear',
      sealedNote: 'Agents and scripts use your keys without ever seeing them.',
      /* The pricing table's own figure: `Nightly, last 30 kept` (`copy/pricing.ts`). */
      nights: 'Thirty nights of sealed copies, the newest last',
      nightsFrom: '30 nights ago',
      nightsTo: 'Last night',
      nightsRead: 'The last 30 copies are kept, and each one is sealed.',
      signin: ['A link by email', 'Or Google', 'Or a passkey', 'No password, anywhere'],
      signinLabel: 'Signing in: a link by email, Google or a passkey, and no password field',
      /* WHAT AN AI TOOL CAN DO IS THE AGENTS PAGE'S, said once there (plan F21): a second table here could drift from it. */
      reachLink: "What an agent can and can't do",
      reachHref: '/agents',
      exportName: 'Everything, in one file',
      exportNote: 'Every list, page and rule in it',
      /* A link and not a drawn button: a drawn button looked pressable and did nothing. */
      exportLink: 'How export works',
      exportHref: '/docs/use/export-and-delete',
    },
    report: {
      title: 'Report a vulnerability',
      body: 'Write to the support address with the steps that show the weakness. Test only against a BrainDog that is yours.',
      /* The empty-address twin, as on /support. */
      pending: 'The address for reporting a weakness will be listed here.',
      /* THE REPOSITORY'S OWN PROMISE, `SECURITY.md` at the root, its table of what happens after a report, word for word
         in its figures. It is drawn only beside the address, because it is a promise about mail somebody reads. */
      after: 'What happens after you write',
      steps: [
        { what: 'A person reads it', when: 'within 3 working days' },
        { what: 'A first assessment', when: 'within 10 working days' },
        { what: 'A fix, or a dated plan', when: 'within 90 days' },
        { what: 'An advisory, with credit', when: 'at the fix, or at 90 days' },
      ],
    },
  },
} as const;
