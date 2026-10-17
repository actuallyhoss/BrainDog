/**
 * The home page's words: the hero, the four cards, "It stays yours", the plans teaser and the close.
 *
 * VERBATIM FROM THE APPROVED DESIGN (DIRECTION §47, `loop/site-2026-10-17/src/site.html`), with the site's word fixes
 * (`docs/54-WRITING.md`): the brief's "the rows behind it" says "where it comes from". The claims ledger
 * (`lib/claims.ts`) reads these key paths, so a key that moves moves there too.
 *
 * THE DRAWINGS' NAMES AND FIGURES ARE NOT HERE. Maya Okafor's record is one file, `lib/demo/maya.ts`, and every card
 * draws from it. The plan figures are `lib/plans.ts`, read below and never typed.
 */

/** A small count as a word ("three agents"), as the design says it; past twelve, the digits. */
const SMALL = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const spell = (n: number): string => SMALL[n] ?? String(n);

export const home = {
  hero: {
    /* THE SLOGAN, his words, with its full stop (§47). */
    title: 'Give your business a memory.',
    /* No mechanism in the promise: no event, log, row or ledger (`test/content.test.ts`). */
    sub: 'One record of your projects, money and people, shared by you and every AI agent you use.',
    secondary: 'Connect an agent',
    works: 'Works with',
    /* The makers, once each: Claude, not "Claude Code" (§47 his notes). Their marks are `@braindog/skin/agent-marks.ts`. */
    makers: [
      { id: 'claude', name: 'Claude' },
      { id: 'chatgpt', name: 'ChatGPT' },
      { id: 'codex', name: 'Codex' },
      { id: 'cursor', name: 'Cursor' },
      { id: 'vscode', name: 'VS Code' },
    ],
  },

  cards: {
    brief: {
      title: 'It tells you where things stand.',
      say: 'A short brief every morning, rewritten whenever something changes. Tap a figure to see why.',
      label: "Maya's brief",
      behind: 'where it comes from',
    },
    agents: {
      title: 'Your agents share one memory.',
      say: "Each starts with your brief and leaves a note when it's done. Nothing gets explained twice.",
      notes: 'Notes on Tidepool',
      connect: 'Connect yours in one line',
    },
    chores: {
      title: 'It does the chores. You make the calls.',
      say: 'Filing, naming and sorting just happen, each with a reason and an undo. You only see what needs a person.',
      waits: 'Waits for you',
      done: 'Done on its own',
      floor: 'Money, keys, sharing and deletes always wait for your yes.',
      floorMore: 'No rule and no agent can change that.',
      /* The counts beside the two headings, and the lines the drawing says as it changes. */
      waiting: (n: number) => (n ? `${n} waiting` : 'all clear'),
      today: (n: number) => `${n} today`,
      empty: 'Nothing needs you. Everything else is handled.',
      askedBy: 'asked by',
      undo: 'Undo',
    },
    slash: {
      name: 'Slash',
      title: 'Press / and ask anything.',
      say: 'Slash answers from your record, finds anything in a keystroke, and drafts what you ask for. Nothing goes in without your yes.',
      more: 'How Slash works',
    },
  },

  yours: {
    title: 'It stays yours.',
    points: [
      { title: 'Every change has a name on it.', body: 'You see who changed what, you or which agent, and you can undo it.' },
      { title: 'Take it all with you.', body: 'Export the whole record as one file, whenever you like.' },
      { title: 'Keys stay in the vault.', body: 'Agents use your keys without ever seeing them, and no key goes into a chat.' },
    ],
  },

  closing: {
    title: 'Start your record.',
    body: 'Say what you work on, connect an agent, and read your first brief in a few minutes.',
  },
} as const;
