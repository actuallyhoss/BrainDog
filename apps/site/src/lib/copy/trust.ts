/**
 * The trust pages' words: support, security and legal. The licence is named here and in the READMEs,
 * and nowhere else a reader meets it.
 *
 * THE SUPPORT ADDRESS IS NOT TYPED HERE. It is `SUPPORT_EMAIL` in `links.ts`, the one constant the
 * pages read, and it stays empty until the owner routes it to an inbox (decisions.md item 14). A
 * sentence that shows it is a function of it, and each has a twin for the day it is empty, so no
 * page ever prints an address nobody reads. `/.well-known/security.txt` follows the same rule: it is
 * added beside `static/` the day the address is set, because RFC 9116 makes `Contact` required and a
 * file without one is worse than no file.
 */
export const trust = {
  legal: {
    title: 'Legal',
    licence: {
      title: 'Licence',
      body: [
        'BrainDog is open source. The software is licensed under the Apache License 2.0, and the renderer in packages/render is licensed under the MIT License.',
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
      /* NOT WRITTEN HERE. The legal texts are OPS-27's (W3), drafted in `apps/site/legal/` and his to
         approve; a marketing redesign does not invent a legal term. Before `LAUNCH.legal` the index
         says so in one sentence; after it, it lists the three pages below. */
      body: 'The Terms of Service, the Privacy Policy and the Data Processing Addendum are published on this page before sign-up opens, and each says when it last changed.',
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
    pending: 'This text is published here before sign-up opens.',
  },

  support: {
    meta: {
      title: 'Support · BrainDog',
      description: 'Where to get help with BrainDog, and what to put in a report so it can be answered the first time.',
    },
    title: 'Support',
    lede: 'Where to get help, and what to put in a report so it can be answered the first time.',
    mail: {
      title: 'Write to us',
      body: 'Send a question, a fault or a request about your record to the support address.',
      /* The empty-address twin. Nothing reads mail at an address until the owner routes it. */
      pending: 'The support address is published here before sign-up opens.',
    },
    /* Shown only when `LAUNCH.repo`: while the repository is private these addresses answer 404. */
    github: {
      title: 'On GitHub',
      body: 'Report a fault as an issue, or ask a question in Discussions, where the answer stays findable for the next person.',
      issues: 'Open an issue',
      discussions: 'Ask in Discussions',
    },
    report: {
      title: 'What to put in a report',
      items: [
        'What you did, step by step, and what you expected to happen.',
        'What happened instead, with the exact words of any message BrainDog showed.',
        'Where it happened: the address in the browser, or the command you ran.',
        'Which browser, or which version of the command line, and whether you use brain.dog or your own copy.',
        'Leave out passwords, keys and tokens. A report never needs one.',
      ],
    },
  },

  security: {
    meta: {
      title: 'Security · BrainDog',
      description: 'How a BrainDog record is kept: one database per record, sealed keys, sealed nightly copies, passkeys and export at any time.',
    },
    title: 'Security',
    lede: 'How your record is kept, one fact to a line.',
    kept: {
      title: 'How a record is kept',
      facts: [
        // docs/12-SECURITY.md §2; apps/worker/src/index.ts (`RECORD`, one Durable Object per record).
        'Every hosted record is its own database. No table holds two customers, so no query can reach from one record into another.',
        // docs/16-DECISIONS.md ADR-062; apps/worker/src/vault.ts and keys.ts (the host seals, the record stores).
        'The keys to services you connect are sealed before they are stored, and the record never holds one in the clear.',
        // apps/worker/src/seal.ts and nightly.ts (age to one recipient whose identity is kept outside Cloudflare).
        'Every night a copy of each hosted record is sealed to a key kept outside Cloudflare, so the stored copy alone opens nothing.',
        // docs/12-SECURITY.md §3 (passkey primary, email link fallback, no password anywhere).
        'You sign in with a passkey first, and an emailed link is the fallback. There is no password to steal.',
        // docs/16-DECISIONS.md ADR-060 (scopes read, propose, write; no admin scope; VAULT and erasure stay a browser session).
        "An agent's token can read, propose or write, and nothing more. No token can open your keys, erase data, restore a copy or delete the record: those need you, signed in, in a browser.",
        // apps/web/src/routes/settings/[area]/areas/Export.svelte; docs/12-SECURITY.md §8 (the export).
        'You can export the whole record at any time, from Settings, as a file you keep.',
      ],
    },
    report: {
      title: 'Report a vulnerability',
      body: 'Write to the support address with the steps that show the weakness. Test only against a record that is yours.',
      /* The empty-address twin, as on /support. */
      pending: 'The address for reporting a weakness is published here before sign-up opens.',
    },
  },
} as const;
