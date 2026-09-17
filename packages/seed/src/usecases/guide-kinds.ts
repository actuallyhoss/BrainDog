/**
 * The New project guide's first plan, formed around what the person said the project is (`guide.ts`).
 *
 * ONE PROMPT, NO MODEL. Onboarding already asks what this BrainDog is for. When the answer is a project, the words in it
 * pick a kind of project (a podcast, a shop, an app) and the guide opens on that kind's milestones, first steps, first
 * choices and what helps, instead of the six milestones any project passes. The same sentence always forms the same
 * plan, so a fresh self-host with nothing configured does it. Nothing heard, and the guide opens on the general plan.
 *
 * THEY ARE EXAMPLE ROWS, installed with the pack and marked as examples, so a person can edit, finish or clear them like
 * any other use case's examples. A model, where one is configured, never writes a plan: it may only propose one on Decide.
 */

import type { ExampleLink } from './links.ts';

type Body = Record<string, unknown>;
type Stage = 'idea' | 'plan' | 'build' | 'launch' | 'grow';

/** One kind of project and the plan it opens on. A milestone, step, choice or resource names its milestone by position, from 0. */
export type GuideKind = {
  kind: string;
  /** How a sentence names it: "a podcast". */
  name: string;
  /** Lower-case words and short phrases that say a project is this kind. */
  signals: readonly string[];
  /** Six, from the idea to keeping it going. The first is underway. */
  milestones: readonly (readonly [Stage, string])[];
  steps: readonly { what: string; milestone: number; by: string }[];
  choices: readonly { question: string; milestone: number; options?: string }[];
  resources: readonly { name: string; kind: 'guide' | 'tool' | 'person' | 'example' | 'other'; milestone: number }[];
};

export const GUIDE_KINDS: readonly GuideKind[] = [
  {
    kind: 'podcast',
    name: 'a podcast',
    signals: ['podcast', 'podcasts', 'episode', 'episodes', 'audio show', 'interview show'],
    milestones: [
      ['idea', 'Say what the show is about and who will listen'],
      ['plan', 'Plan the format and the first three episodes'],
      ['build', 'Record and edit a pilot episode'],
      ['build', "Set up hosting and the show's page"],
      ['launch', 'Publish the first episodes'],
      ['grow', 'Keep to a release schedule and grow the audience'],
    ],
    steps: [
      { what: 'Write one sentence about the show and who will listen', milestone: 0, by: '+2d' },
      { what: 'Listen to three shows like yours and note what works', milestone: 0, by: '+4d' },
      { what: 'List ten episode ideas', milestone: 1, by: '+6d' },
      { what: 'Pick a length and how often episodes come out', milestone: 1, by: '+8d' },
      { what: 'Record a ten-minute test with the gear you have', milestone: 2, by: '+12d' },
    ],
    choices: [
      { question: 'What will the show be called?', milestone: 0 },
      { question: 'Alone, with a co-host, or with guests?', milestone: 1, options: 'Alone\nWith a co-host\nWith a guest each episode' },
    ],
    resources: [
      { name: 'Three shows like yours to learn from', kind: 'example', milestone: 0 },
      { name: 'A free audio editor', kind: 'tool', milestone: 2 },
      { name: 'A podcast hosting service', kind: 'tool', milestone: 3 },
    ],
  },
  {
    kind: 'video',
    name: 'a video channel',
    signals: ['youtube', 'youtube channel', 'video channel', 'videos', 'vlog', 'twitch', 'streaming', 'tiktok'],
    milestones: [
      ['idea', 'Say what the channel is about and who will watch'],
      ['plan', 'Plan the first five videos'],
      ['build', 'Film and edit the first video'],
      ['build', "Set up the channel's name, art and description"],
      ['launch', 'Publish the first videos on a schedule'],
      ['grow', 'Learn from what people watch and keep going'],
    ],
    steps: [
      { what: 'Write one sentence about the channel and who will watch', milestone: 0, by: '+2d' },
      { what: 'Watch three channels like yours and note what works', milestone: 0, by: '+4d' },
      { what: 'List ten video ideas', milestone: 1, by: '+6d' },
      { what: 'Pick how often you will post', milestone: 1, by: '+8d' },
      { what: 'Film a one-minute test with your phone', milestone: 2, by: '+10d' },
    ],
    choices: [
      { question: 'What will the channel be called?', milestone: 0 },
      { question: 'Will you be on camera?', milestone: 1, options: 'On camera\nVoice over the footage\nBoth' },
    ],
    resources: [
      { name: 'Three channels like yours to learn from', kind: 'example', milestone: 0 },
      { name: 'A free video editor', kind: 'tool', milestone: 2 },
      { name: "The platform's own guide for new creators", kind: 'guide', milestone: 3 },
    ],
  },
  {
    kind: 'newsletter',
    name: 'a newsletter or blog',
    signals: ['newsletter', 'newsletters', 'blog', 'blogging', 'substack', 'writing online'],
    milestones: [
      ['idea', 'Say what you will write about and who will read it'],
      ['plan', 'Plan the first five issues'],
      ['build', 'Write the first two issues'],
      ['build', 'Set up the sign-up page'],
      ['launch', 'Send the first issue to your first readers'],
      ['grow', 'Keep to a schedule and learn what readers like'],
    ],
    steps: [
      { what: 'Write one sentence about what you will write and for whom', milestone: 0, by: '+2d' },
      { what: 'Read three newsletters like yours and note what works', milestone: 0, by: '+4d' },
      { what: 'List ten topics', milestone: 1, by: '+6d' },
      { what: 'Pick how often you will send', milestone: 1, by: '+7d' },
      { what: 'Write a first draft of the first issue', milestone: 2, by: '+10d' },
    ],
    choices: [
      { question: 'What will it be called?', milestone: 0 },
      { question: 'Free, paid, or both?', milestone: 3, options: 'Free\nPaid\nFree with a paid tier' },
    ],
    resources: [
      { name: 'Three newsletters like yours to learn from', kind: 'example', milestone: 0 },
      { name: 'A newsletter or blogging platform', kind: 'tool', milestone: 3 },
      { name: 'Ten people who said they would read it', kind: 'person', milestone: 4 },
    ],
  },
  {
    kind: 'book',
    name: 'a book',
    signals: ['book', 'books', 'novel', 'memoir', 'comic', 'zine', 'short stories', 'poetry', 'write a book'],
    milestones: [
      ['idea', 'Say what the book is about and who it is for'],
      ['plan', 'Outline the book'],
      ['build', 'Write the first draft'],
      ['build', 'Revise it with feedback from readers'],
      ['launch', 'Publish it or send it out'],
      ['grow', 'Find readers and plan what is next'],
    ],
    steps: [
      { what: 'Write one paragraph about the book and who it is for', milestone: 0, by: '+2d' },
      { what: 'Read the opening chapters of three books like yours', milestone: 0, by: '+7d' },
      { what: 'Outline the chapters or parts', milestone: 1, by: '+10d' },
      { what: 'Set a writing time each week', milestone: 2, by: '+3d' },
      { what: 'Write the first five hundred words', milestone: 2, by: '+5d' },
    ],
    choices: [
      { question: 'What is the working title?', milestone: 0 },
      { question: 'Self-publish, or look for a publisher?', milestone: 4, options: 'Self-publish\nLook for an agent or publisher' },
    ],
    resources: [
      { name: 'Three books like yours to learn from', kind: 'example', milestone: 0 },
      { name: 'A writing app you like', kind: 'tool', milestone: 2 },
      { name: 'A first reader or a writing group', kind: 'person', milestone: 3 },
    ],
  },
  {
    kind: 'music',
    name: 'a music release',
    signals: ['album', 'band', 'ep', 'single', 'music', 'songs', 'mixtape', 'record an album'],
    milestones: [
      ['idea', 'Say what the music sounds like and who it is for'],
      ['plan', 'Choose the songs for the first release'],
      ['build', 'Record demos'],
      ['build', 'Record, mix and master'],
      ['launch', 'Release it'],
      ['grow', 'Play it live and find listeners'],
    ],
    steps: [
      { what: 'Name three artists your sound is close to', milestone: 0, by: '+2d' },
      { what: 'List the songs you already have', milestone: 1, by: '+4d' },
      { what: 'Pick the songs for the first release', milestone: 1, by: '+7d' },
      { what: 'Record a rough demo of the strongest song', milestone: 2, by: '+10d' },
      { what: 'Set a time each week to practise or write', milestone: 2, by: '+3d' },
    ],
    choices: [
      { question: 'A single, an EP or an album first?', milestone: 1, options: 'A single\nAn EP\nAn album' },
      { question: 'Record at home or in a studio?', milestone: 3, options: 'At home\nIn a studio' },
    ],
    resources: [
      { name: 'A home recording app', kind: 'tool', milestone: 2 },
      { name: 'Somebody who can mix and master', kind: 'person', milestone: 3 },
      { name: 'A service that puts music on streaming platforms', kind: 'tool', milestone: 4 },
    ],
  },
  {
    kind: 'event',
    name: 'an event',
    signals: ['event', 'events', 'festival', 'conference', 'meetup', 'concert', 'gig', 'party', 'retreat', 'wedding', 'tournament'],
    milestones: [
      ['idea', 'Say what the event is, who it is for and roughly when'],
      ['plan', 'Set the budget and pick a date'],
      ['plan', 'Book the place'],
      ['build', 'Arrange the programme, speakers or acts'],
      ['launch', 'Open tickets or send the invitations'],
      ['grow', 'Run the day and gather what people thought'],
    ],
    steps: [
      { what: 'Write one sentence about the event and who comes', milestone: 0, by: '+2d' },
      { what: 'Guess how many people will come', milestone: 0, by: '+3d' },
      { what: 'List three possible places and what each costs', milestone: 2, by: '+7d' },
      { what: 'Draft a rough budget', milestone: 1, by: '+6d' },
      { what: 'Ask two people to help run it', milestone: 1, by: '+9d' },
    ],
    choices: [
      { question: 'What date will it be?', milestone: 1 },
      { question: 'Free, or paid tickets?', milestone: 4, options: 'Free\nPaid\nPay what you can' },
    ],
    resources: [
      { name: 'A checklist from an event like yours', kind: 'example', milestone: 1 },
      { name: 'A contact at each possible place', kind: 'person', milestone: 2 },
      { name: 'A ticketing or sign-up tool', kind: 'tool', milestone: 4 },
    ],
  },
  {
    kind: 'community',
    name: 'a community',
    signals: ['community', 'club', 'discord', 'discord server', 'society', 'forum', 'network', 'members', 'support group'],
    milestones: [
      ['idea', 'Say who the community is for and why they would join'],
      ['plan', 'Choose where it meets, online or in person'],
      ['build', 'Set a few simple ground rules'],
      ['launch', 'Invite the first ten members'],
      ['launch', 'Hold the first meeting or conversation'],
      ['grow', 'Keep a regular rhythm and share the work'],
    ],
    steps: [
      { what: 'Write one sentence about who it is for', milestone: 0, by: '+2d' },
      { what: 'Look at two communities like yours', milestone: 0, by: '+4d' },
      { what: 'Name ten people who might join', milestone: 3, by: '+6d' },
      { what: 'Pick where it will meet', milestone: 1, by: '+7d' },
      { what: 'Write three ground rules', milestone: 2, by: '+9d' },
    ],
    choices: [
      { question: 'What will it be called?', milestone: 0 },
      { question: 'Open to anyone, or by invitation?', milestone: 1, options: 'Open to anyone\nBy invitation' },
    ],
    resources: [
      { name: 'Two communities like yours to learn from', kind: 'example', milestone: 0 },
      { name: 'A place to talk, such as a chat server or a forum', kind: 'tool', milestone: 1 },
      { name: 'A code of conduct to start from', kind: 'guide', milestone: 2 },
    ],
  },
  {
    kind: 'app',
    name: 'an app or website',
    signals: ['app', 'an app', 'apps', 'website', 'web app', 'mobile app', 'software', 'saas', 'startup', 'game', 'side project', 'plugin', 'extension', 'bot'],
    milestones: [
      ['idea', 'Say what problem it solves and for whom'],
      ['idea', 'Talk to people who have the problem'],
      ['plan', 'Plan the smallest first version'],
      ['build', 'Build the first version'],
      ['launch', 'Put it in front of the first users'],
      ['grow', 'Learn from how it is used and improve it'],
    ],
    steps: [
      { what: 'Write one sentence about the problem and who has it', milestone: 0, by: '+2d' },
      { what: 'Name five people who have the problem', milestone: 1, by: '+4d' },
      { what: 'Ask three of them how they deal with it today', milestone: 1, by: '+9d' },
      { what: 'List what the first version must do, and nothing more', milestone: 2, by: '+12d' },
      { what: 'Sketch the main screen on paper', milestone: 2, by: '+14d' },
    ],
    choices: [
      { question: 'What will it be called?', milestone: 0 },
      { question: 'What will you build it with?', milestone: 3 },
    ],
    resources: [
      { name: 'Three products that solve a similar problem', kind: 'example', milestone: 0 },
      { name: 'Questions to ask the people who have the problem', kind: 'guide', milestone: 1 },
      { name: 'A place to host it', kind: 'tool', milestone: 3 },
    ],
  },
  {
    kind: 'shop',
    name: 'a shop or small business',
    signals: ['shop', 'online shop', 'store', 'etsy', 'sell', 'selling', 'bakery', 'cafe', 'small business', 'clothing brand', 'handmade', 'market stall', 'side hustle'],
    milestones: [
      ['idea', 'Say what you will sell and who will buy it'],
      ['idea', 'Check that people will pay for it'],
      ['plan', 'Work out costs and prices'],
      ['build', 'Make or source the first stock'],
      ['launch', 'Open the shop and make the first sales'],
      ['grow', 'Learn what sells and keep going'],
    ],
    steps: [
      { what: 'Write one sentence about what you sell and to whom', milestone: 0, by: '+2d' },
      { what: 'Look at three shops selling something similar, and their prices', milestone: 0, by: '+4d' },
      { what: 'Ask five people what they would pay', milestone: 1, by: '+8d' },
      { what: 'Add up what one item costs you to make or buy', milestone: 2, by: '+10d' },
      { what: 'Check what your area asks of a new business', milestone: 2, by: '+14d' },
    ],
    choices: [
      { question: 'What will the shop be called?', milestone: 0 },
      { question: 'Where will you sell: online, at markets, or both?', milestone: 4, options: 'Online\nAt markets or in person\nBoth' },
    ],
    resources: [
      { name: 'Three shops like yours to learn from', kind: 'example', milestone: 0 },
      { name: 'Local guidance on registering a small business', kind: 'guide', milestone: 2 },
      { name: 'An online shop platform', kind: 'tool', milestone: 4 },
    ],
  },
  {
    kind: 'course',
    name: 'a course or class',
    signals: ['online course', 'course', 'teach', 'teaching', 'tutoring', 'classes', 'lessons', 'coaching', 'workshop', 'workshops'],
    milestones: [
      ['idea', 'Say what you will teach and who will learn it'],
      ['plan', 'Outline the lessons'],
      ['build', 'Make the first lesson'],
      ['build', 'Try it with a few learners'],
      ['launch', 'Open it to learners'],
      ['grow', 'Improve it from what learners say'],
    ],
    steps: [
      { what: 'Write one sentence about what learners will be able to do', milestone: 0, by: '+2d' },
      { what: 'List what somebody needs to know before they start', milestone: 0, by: '+4d' },
      { what: 'Outline five lessons', milestone: 1, by: '+7d' },
      { what: 'Ask three people whether they would take it', milestone: 0, by: '+6d' },
      { what: 'Make a rough version of the first lesson', milestone: 2, by: '+12d' },
    ],
    choices: [
      { question: 'Live, recorded, or both?', milestone: 2, options: 'Live\nRecorded\nBoth' },
      { question: 'Free or paid?', milestone: 4, options: 'Free\nPaid' },
    ],
    resources: [
      { name: 'Three courses like yours to learn from', kind: 'example', milestone: 0 },
      { name: 'A learner who will try it early', kind: 'person', milestone: 3 },
      { name: 'A platform to host the lessons', kind: 'tool', milestone: 4 },
    ],
  },
  {
    kind: 'cause',
    name: 'a cause or charity',
    signals: ['charity', 'nonprofit', 'non-profit', 'fundraiser', 'fundraising', 'volunteer', 'volunteers', 'volunteering', 'cause', 'campaign', 'appeal'],
    milestones: [
      ['idea', 'Say what change you want and who it helps'],
      ['idea', 'Find the people already working on it'],
      ['plan', 'Plan the first activity and what it needs'],
      ['build', 'Gather volunteers and funds'],
      ['launch', 'Run the first activity'],
      ['grow', 'Share what it achieved and keep going'],
    ],
    steps: [
      { what: 'Write one sentence about the change and who it helps', milestone: 0, by: '+2d' },
      { what: 'Find three groups already working on this', milestone: 1, by: '+5d' },
      { what: 'Ask one of them what is missing', milestone: 1, by: '+9d' },
      { what: 'List what the first activity needs', milestone: 2, by: '+12d' },
      { what: 'Name three people who might volunteer', milestone: 3, by: '+10d' },
    ],
    choices: [
      { question: 'Start as an informal group, or register as a charity?', milestone: 2, options: 'An informal group\nA registered charity' },
      { question: 'How will you raise the first funds?', milestone: 3 },
    ],
    resources: [
      { name: 'A group already doing similar work', kind: 'example', milestone: 1 },
      { name: 'Local rules for charities and fundraising', kind: 'guide', milestone: 2 },
      { name: 'A fundraising page', kind: 'tool', milestone: 3 },
    ],
  },
];

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every phrase of `kind` heard in `said`, longest first, never two over one stretch. */
function heardIn(said: string, kind: GuideKind): string[] {
  const lower = said.toLowerCase();
  const taken: [number, number][] = [];
  const out: { at: number; text: string }[] = [];
  for (const signal of [...kind.signals].sort((a, b) => b.length - a.length || a.localeCompare(b))) {
    for (const m of lower.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escape(signal)}(?![\\p{L}\\p{N}])`, 'gu'))) {
      const at = m.index ?? 0;
      const end = at + m[0].length;
      if (taken.some(([a, b]) => at < b && a < end)) continue;
      taken.push([at, end]);
      out.push({ at, text: said.slice(at, end) });
    }
  }
  return out.sort((a, b) => a.at - b.at).map((h) => h.text);
}

/** The kind of project a sentence describes and the phrases that said so, or `null` when none was heard. Ties go to the earlier kind. */
export function guideKindOf(said: string): { kind: GuideKind; heard: string[] } | null {
  let best: { kind: GuideKind; heard: string[] } | null = null;
  for (const kind of GUIDE_KINDS) {
    const heard = heardIn(said, kind);
    if (heard.length > 0 && (best === null || heard.length > best.heard.length)) best = { kind, heard };
  }
  return best;
}

/** A plan formed for a kind: the pack's example rows, and how they point at each other, which a seed cannot say. */
export type FormedPlan = { kind: string; name: string; heard: readonly string[]; seeds: Body[]; links: ExampleLink[] };

/** The example rows and their links for one kind of project. */
export function planFor(kind: GuideKind, heard: readonly string[] = []): FormedPlan {
  const titles = kind.milestones.map(([, what]) => what);
  const at = (i: number): string => titles[Math.min(Math.max(0, i), titles.length - 1)]!;
  const seeds: Body[] = [
    ...kind.milestones.map(([stage, what], i) => ({ register: 'milestones', fields: { what, stage, state: i === 0 ? 'underway' : 'not_started', order: i + 1 } })),
    ...kind.steps.map((s, i) => ({ register: 'steps', fields: { what: s.what, state: 'to_do', order: i + 1, by: s.by } })),
    ...kind.choices.map((c) => ({ register: 'choices', fields: { question: c.question, state: 'open', ...(c.options ? { options: c.options } : {}) } })),
    ...kind.resources.map((r) => ({ register: 'resources', fields: { name: r.name, kind: r.kind } })),
  ];
  const links: ExampleLink[] = [
    ...kind.steps.map((s) => ({ register: 'steps', title: s.what, field: 'milestone', to: 'milestones', target: at(s.milestone) })),
    ...kind.choices.map((c) => ({ register: 'choices', title: c.question, field: 'milestone', to: 'milestones', target: at(c.milestone) })),
    ...kind.resources.map((r) => ({ register: 'resources', title: r.name, field: 'milestone', to: 'milestones', target: at(r.milestone) })),
  ];
  return { kind: kind.kind, name: kind.name, heard, seeds, links };
}

/** The plan a sentence forms, or `null` when it names no kind of project and the guide keeps its general plan. */
export function formGuide(said: string): FormedPlan | null {
  const found = guideKindOf(said);
  return found ? planFor(found.kind, found.heard) : null;
}
