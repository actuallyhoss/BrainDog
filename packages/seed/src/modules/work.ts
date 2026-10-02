/**
 * Work: tasks, the threads they belong to, how each thread is going, and the agent runs working on them.
 *
 * One module of the sample record, split out of `index.ts` so each first-party module's registers, rows,
 * figures and pages sit in one file. `index.ts` composes them and keeps every export it had.
 */

import { TODAY, day, days, hours, stamp, type Fields, type SeedMetric, type SeedPage, type SeedRegister } from './base.ts';

/* ── tasks ────────────────────────────────────────────────────────────────── */

export const TASKS: Fields[] = [
  { what: 'Chase Halden on 2026-041', state: 'review', thing: 2, agent: 'cursor', by: day(1), effort: days(0.2), note: 'Cursor drafted the chaser. Read it before it goes.' },
  { what: 'Decide the licensing tier split', state: 'blocked', thing: 1, by: day(6), effort: days(1), note: 'Waiting on the pricing question on Decide.' },
  /* THE REMEDY, AND IT USED TO BE THE CAUSE. This said "Move kilnfonts.example off auto-renew",
     and the service row two hundred lines down is `lapsing` BECAUSE auto-renew is off: the audit
     note says so in as many words, and the Kiln project's own document says letting it lapse
     breaks links in files that have already been delivered. Three places named the fault and the
     one task tracking it proposed doing the fault again. This record is the product's only worked
     example, and a stranger reads it as what a real record looks like. */
  { what: 'Turn auto-renew back on for kilnfonts.example', state: 'open', thing: 1, priority: 'urgent', why: 'The domain lapses when the card fails again.', by: day(-4), effort: days(0.2), note: '' },
  { what: 'Draft the September issue', state: 'doing', thing: 3, by: day(4), effort: days(2), note: '' },
  /* SEVEN OF THE FOURTEEN NAME A TRACK, and none of them did. `tasks` declares a `track:` ref and
     every row left it null, so the Track column on `/r/tasks` was fourteen dashes and every track
     page reported "Still open · 0 · No open tasks on this track" — an empty state that is correct
     about the data and wrong about the world, on five pages whose whole subject is the work. Two of
     the seven are `done`, so the filtering that heading promises is exercised rather than assumed. */
  { what: 'Wire the sending domain to Ledger Post', state: 'open', thing: 3, track: 4, by: day(9), effort: days(0.5), note: '' },
  { what: 'Year-end pack for Pell & Vine', state: 'open', thing: null, track: 5, owner: 4, by: day(23), effort: days(1.5), note: '' },
  { what: 'Retire the Tallow staging box', state: 'open', thing: 4, by: day(30), effort: days(0.5), note: '' },
  { what: 'Variable axis QA on the new cut', state: 'doing', thing: 1, track: 1, agent: 'claude', by: day(3), effort: days(3), note: '' },
  { what: 'Rotate the Fenwick deploy key', state: 'open', thing: 1, track: 2, by: day(12), effort: days(0.2), note: '' },
  { what: 'Write the specimen page', state: 'doing', thing: 1, track: 3, agent: 'codex', by: day(18), effort: days(2), note: '' },
  { what: 'Invoice Ravensworth for September', state: 'open', thing: 2, by: day(27), effort: days(0.2), note: '' },
  { what: 'Kerning pass, lowercase', state: 'done', thing: 1, track: 1, agent: 'claude', by: day(-11), done_on: day(-12), effort: days(4), note: '' },
  { what: 'Set up the newsletter archive', state: 'done', thing: 3, track: 4, owner: 6, by: day(-6), done_on: day(-7), effort: days(1), note: '' },
  { what: 'Cancel the Hobnail plan', state: 'done', thing: 4, by: day(-58), done_on: day(-58), effort: days(0.2), note: '' },
  /* FROM HERE ON, WORK AS A PERSON AND THEIR AGENTS SHARE IT: who holds a task, which agent took it, the steps a task
     was split into (`parent`), and the day each one was finished, so the page can say what moved week by week.
     Appended rather than interleaved, because `tasks#1` to `tasks#14` are named elsewhere by number. */
  { what: 'Illustrations for the specimen page', state: 'doing', thing: 1, track: 3, parent: 10, owner: 3, by: day(10), effort: days(3), note: '' },
  { what: 'Type tester for the specimen page', state: 'open', thing: 1, track: 3, parent: 10, by: day(14), effort: days(1), note: '' },
  { what: 'Reconcile the Fenwick invoice against services', state: 'review', thing: 3, track: 2, agent: 'claude', by: day(2), effort: days(0.5), note: 'Two services share one monthly total. Claude matched them by renewal date; check the match.' },
  /* DUE THE SAME DAY AS `tasks#4`, on purpose: two tasks on one day are listed in the same order by the record and the
     sample, newest first, and a sample with no tie could not show that. */
  { what: 'Check the September bank statement', state: 'open', thing: null, by: day(4), effort: days(0.2), note: '' },
  { what: 'Mastering pass, all instances', state: 'done', thing: 1, track: 1, agent: 'claude', by: day(-3), done_on: day(-4), effort: days(2), note: '' },
  { what: 'Outline check on instances 1 to 3', state: 'done', thing: 1, track: 1, agent: 'claude', by: day(-19), done_on: day(-20), effort: days(0.5), note: '' },
  { what: 'Sign off instances 1 to 3', state: 'done', thing: 1, track: 1, by: day(-18), done_on: day(-19), effort: days(0.5), note: '' },
  { what: 'Move the Portage API to the new host', state: 'done', thing: 3, owner: 6, by: day(-24), done_on: day(-26), effort: days(2), note: '' },
  { what: 'Send the August invoices', state: 'done', thing: null, by: day(-31), done_on: day(-31), effort: days(0.3), note: '' },
  { what: 'Update the licence PDF template', state: 'done', thing: 1, agent: 'codex', by: day(-40), done_on: day(-45), effort: days(0.5), note: '' },
  { what: 'Archive the old Marlow brand files', state: 'dropped', thing: 2, by: day(-30), done_on: day(-30), effort: days(0.2), note: 'Marlow keeps its own archive.' },
  /* FINISHED TODAY AND NOT DATED BY HAND: the record fills Done on, and the sample fills it the same way (`finished`). */
  { what: 'Send the specimen proofs to Kiln', state: 'done', thing: 1, track: 3, by: day(1), effort: days(0.3), note: '' },
  /* KEPT FOR LATER, so the board draws its Later column and Open is seen to leave it out: work nobody has taken on yet has
     no due day and is not counted as open. */
  { what: 'Try a second layout for the specimen page', state: 'backlog', thing: 1, track: 3, effort: days(1), note: 'Once the first one is live.' },
];

/**
 * Agent runs, S1 to S5, in the kernel's `session` register and in its field names.
 *
 * `project` is the spoken id of a project, `things#1`, which is what the ladder writes when it places
 * a run. `last_seen` uses `hours(n)` because a run's age is said in minutes and hours. Both are fields
 * only the record writes, so these rows go in through `openRun` below.
 *
 * A person is never a run, so every run here is an agent's: three are Kiln's, and two are finished.
 */
export const RUNS: Fields[] = [
  { doing: 'Variable axis QA, instances 3 of 9', agent: 'claude', state: 'active', project: 'things#1', repo: 'kiln-type', host: 'kiln-mbp', branch: 'axis-qa', next: 'Sign off instances 4 to 6 once the mastering pass lands.', last_seen: hours(0.05) },
  { doing: 'Drafting the specimen page copy', agent: 'codex', state: 'active', project: 'things#1', repo: 'kiln-site', host: 'kiln-mbp', branch: 'specimen-copy', last_seen: hours(0.2) },
  { doing: 'Reconciling the Fenwick invoice against services', agent: 'claude', state: 'idle', project: 'things#3', repo: 'portage', host: 'studio-desktop', next: 'Propose merging the two Fenwick services, citing the rows read.', tried: ['Matching on the invoice total; two services share it.'], last_seen: hours(2) },
  { doing: 'Drafting the chaser for invoice 2026-041', agent: 'cursor', state: 'done', project: 'things#2', host: 'studio-desktop', last_seen: hours(26) },
  { doing: 'Kerning pass, lowercase', agent: 'claude', state: 'done', project: 'things#1', repo: 'kiln-type', host: 'kiln-mbp', last_seen: hours(34) },
];

/**
 * Sixty days of `open-tasks`, one point a day, as the daily snapshot would have written them.
 *
 * WORKED BACK FROM THE ROWS, as `cashSeries` is: a task open now was open on each of those days, and a finished one was
 * open until the day it was finished. A task finished with no day was finished today. A live record has no such history:
 * its line starts on the day Work is installed.
 */
export function openTasksSeries(back = 60): { at: string; value: number }[] {
  const out: { at: string; value: number }[] = [];
  for (let offset = -back; offset <= -1; offset++) {
    const at = day(offset);
    const open = TASKS.filter((t) => {
      /* A TASK KEPT FOR LATER IS NOT OPEN WORK, as the figure says. The sample has no day it was moved there, so it is left out of every day. */
      if (t.state === 'backlog') return false;
      if (t.state !== 'done' && t.state !== 'dropped') return true;
      const finished = typeof t.done_on === 'string' ? t.done_on : TODAY;
      return finished > at;
    }).length;
    out.push({ at, value: open });
  }
  return out;
}

/* Five tracks, and the shape of the set is the point.
   Two are open and healthy, one is at risk, one is HOLDING (so no update is expected of it, and it
   must not appear in the missing bucket), and one is open with no update at all — which is the case
   that renders as "Update missing" rather than as blank. A seed where every row is in the happy
   state cannot show you what the mechanism is for. */
export const TRACKS: Fields[] = [
  { name: 'Variable axis QA', state: 'open', thing: 1, opened: day(-38), note: 'Nine instances, three signed off. The rest need the mastering pass first.' },
  { name: 'Get off the Fenwick contract', state: 'open', thing: 3, opened: day(-61), note: 'Notice period is 60 days from the anniversary.' },
  { name: 'Specimen page rebuild', state: 'open', thing: 1, opened: day(-12) },
  /* `thing: 3` AND IT SAID `2`. Everything else about this thread is Portage: the service it names,
     the domain it names, and both tasks hanging off it all carry `thing: 3`, and `things#2` is
     Marlow & Co. The Project column on the list and on the phone card printed the wrong project for
     it, which is the one kind of mistake a worked example must not make: a stranger reads this
     record as what a real one looks like. */
  { name: 'Move the newsletter off portagemail', state: 'holding', thing: 3, opened: day(-90), note: 'Waiting on the deliverability question, SG29.' },
  { name: 'Year-end filing', state: 'done', opened: day(-210) },
];

/* Updates run oldest to newest per track, because the derivation takes the LAST one and a seed
   ordered the other way would pass every test while showing the wrong health on screen.
   `stamp` counts HOURS, so a figure in days is written as days times 24 rather than left looking
   like a date and behaving like an afternoon. */
export const UPDATES: Fields[] = [
  { body: 'Three instances signed off. Mastering pass is the gate on the other six.', health: 'on_track', track: 1, by: 'you', at: stamp(-20 * 24) },
  { body: 'Mastering pass done. Six instances queued, claude is working through them.', health: 'on_track', track: 1, by: 'claude', at: stamp(-3 * 24) },
  { body: 'Notice window opens on the 12th and closes 60 days later. Nothing to do until then.', health: 'on_track', track: 2, by: 'you', at: stamp(-30 * 24) },
  { body: 'Missed the window last year by four days. Diarised this time, but the renewal auto-charges before the notice lands.', health: 'at_risk', track: 2, by: 'you', at: stamp(-2 * 24) },
  { body: 'Parked behind SG29. Nothing moves until the sending question is decided.', health: 'on_track', track: 4, by: 'you', at: stamp(-45 * 24) },
];

/** A Work list, which may say who holds its rows (`hand:`, `42 §4.4`), as `people.ts`'s own type adds its keys. */
type WorkRegister = SeedRegister & { hand?: { person: string; agent: string; taken: string } };

export const WORK_REGISTERS: Record<string, WorkRegister> = {
  /* NO `sessions` HERE. Agent runs are the kernel's own `session` register (migration 0002), which
     every agent write lands on. A second copy declared here drew a second "Agent runs" list. */
  /**
   * A TRACK IS A LINE OF WORK THAT OUTLIVES THE THINGS ON IT.
   *
   * "Rebuild the specimen page", "get off the Fenwick contract", "variable axis QA" — the thread a
   * person is actually pursuing, which is bigger than a task and smaller than a project. A project
   * is a thing you own; a track is something you are in the middle of, and it ends.
   *
   * IT IS OPTIONAL EVERYWHERE, and that is the single most important property. The prior system
   * traced in 10 §7 put 105 of its 123 tasks into a group, and 61% of those groups held fewer than
   * two items — a grouping field that everything carries is a column of noise that has stopped
   * telling you anything. So `track` is absent from every register's `mobile` list, absent from the
   * default columns, and its field description leads with the normal case. Most rows carry no
   * track. That is not a gap to be filled in.
   *
   * There is NO health field here on purpose. Health exists only as a property of an `updates` row,
   * because a mutable string with no author and no date cannot tell you whether a track was
   * verified healthy on Friday or has said the same thing since March (20 §9). The current value is
   * derived from the newest update, never stored beside it — a column plus a trail of changes to
   * that column is two systems that can disagree.
   */
  tracks: {
    id: 'tracks',
    icon: 'rows',
    /* `Threads`, AND IT WAS `Tracks`. It appears in the rail on every screen and as a column on
       Tasks, and it was never explained anywhere: a reader meets it cold and it reads as music or
       as shipping. A thread of work is the thing this holds and it is the word people already use
       for it. The id stays `tracks`, which is what the URL and a predicate say. */
    name: 'Threads',
    one: 'thread',
    holds: 'the lines of work you are in the middle of, and what each one is waiting on',
    title: 'name',
    mobile: ['name', 'thing', 'state'],
    state: 'state',
    done: ['done', 'dropped'],
    pack: 'work',
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'state', label: 'Status', type: 'enum', values: ['open', 'holding', 'done', 'dropped'], index: true, required: true },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
      { id: 'opened', type: 'day', index: true },
      { id: 'note', type: 'document' },
    ],
  },

  /**
   * An update: prose, a health, an author and a date, appended and never edited.
   *
   * FOUR PARTS, AND THE FOURTH IS THE ONE EVERYBODY OMITS (20 §9). Health is never a standalone
   * field — you cannot post prose without a health and cannot have a health without prose, an
   * author and a date. The current health is the newest row's, derived. Absence renders as its own
   * value rather than as nothing. And "no update expected" is a SEPARATE value from "update
   * missing", driven by the track's own state — without that, every finished and dormant track
   * piles into the missing bucket, the bucket becomes noise, and the reminder is dead inside a
   * month.
   *
   * Corrections are new rows carrying `supersedes`. There is no edit and no delete, because the
   * append-only log IS the storage for state here rather than an audit artefact bolted beside it.
   */
  updates: {
    id: 'updates',
    icon: 'doc',
    name: 'Updates',
    one: 'update',
    /* `a thread` AND IT WAS `a track`. `holds` is drawn under the heading of an empty list —
       "Updates holds …" — so this sentence is on a screen, and it was the last one in the
       declarations still saying the word the register above it stopped using. */
    holds: 'what was true about a thread on a date, who said so, and how it was going',
    title: 'body',
    mobile: ['body', 'health', 'at'],
    pack: 'work',
    fields: [
      { id: 'body', label: 'Update', type: 'document', required: true, search: true },
      { id: 'health', type: 'enum', values: ['on_track', 'at_risk', 'off_track'], index: true, required: true },
      { id: 'track', label: 'Thread', type: 'ref', to: 'tracks', index: true, required: true },
      /* TEXT, AND IT WAS A CLOSED LIST OF FOUR VENDORS until Work 1.7.0: `claude`, `codex`, `cursor` and `you` were the only
         authors an update could have, so one written by Gemini, a teammate or a script was refused `ENUM_VALUE_UNKNOWN` at
         the write, while `tasks.agent` beside it was already text. Which agents exist is a record's business, not the
         core's. Opening an `enum` to `text` is a widening (`packages/kernel/src/widen.ts`): every stored word reads back
         unchanged, which `test/lists-opened.test.ts` drives over a row written under the closed list. */
      { id: 'by', type: 'text', index: true, required: true },
      { id: 'at', label: 'When', type: 'instant', index: true, required: true },
      { id: 'supersedes', label: 'Replaces', type: 'ref', to: 'updates' },
    ],
  },

  tasks: {
    id: 'tasks',
    icon: 'task',
    name: 'Tasks',
    one: 'task',
    /* WHAT AN AGENT READS BEFORE IT TOUCHES ONE, so the sentence says how the work is shared: take a task by setting
       Agent, split one by adding tasks Part of it, hand it back as To check, and say the day it was done. */
    holds: 'work with a state and a date, who holds it, and which agent took it, so nothing is carried in your head',
    title: 'what',
    mobile: ['what', 'thing', 'state'],
    state: 'state',
    done: ['done', 'dropped'],
    /* THE RECORD DATES THE FINISH: Done on is filled when a task moves to done and emptied when it is reopened, so the
       weeks on the Overview count every finished task and not only the ones somebody dated. */
    finished: 'done_on',
    /* WHO HOLDS A TASK, SO "HAND TO" CAN GIVE IT TO SOMEBODY IN ONE PRESS: a person by Owner, an agent by Agent, and a
       task an agent takes is Doing. */
    hand: { person: 'owner', agent: 'agent', taken: 'doing' },
    pack: 'work',
    fields: [
      { id: 'what', label: 'Description', type: 'text', required: true, search: true },
      /* `review` IS THE QUEUE A PERSON WORKS FROM: an agent finished its part and a person checks it before it is done.
         `backlog` IS WORK KEPT FOR LATER, not yet taken on: a team's backlog, or homework for next term. It comes first on
         the board, and a new task is To do unless somebody says Later. */
      {
        id: 'state',
        label: 'Status',
        type: 'enum',
        values: ['backlog', 'open', 'doing', 'review', 'blocked', 'done', 'dropped'],
        labels: { backlog: 'Later', review: 'To check' },
        default: 'open',
        index: true,
        required: true,
      },
      /* HOW SOON IT MATTERS, when somebody says. Usually unset: a homework list and a team's backlog both use it, few rows need it, and it is not
         indexed: a register holds eight indexes and the rest are read far more. */
      {
        id: 'priority',
        label: 'Priority',
        type: 'enum',
        values: ['urgent', 'high', 'normal', 'low'],
        labels: { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' },
      },
      /* WHY IT SITS AT ITS TIER, in a line, so a list ordered by tier can be argued with by the person reading it and
         an agent that sets a tier says what it weighed. Optional, and not indexed, for the same reason as the tier. */
      { id: 'why', label: 'Why this tier', type: 'text' },
      /* WHO HOLDS IT, a person. Empty is you. A link, so Work installs on a record with no People and leaves it out. */
      { id: 'owner', label: 'Owner', type: 'ref', to: 'people', index: true },
      /* THE AGENT THAT TOOK IT, by the name it signs its runs with (claude, codex, cursor). An agent is a delegate, never
         the owner, so the two are separate fields. */
      { id: 'agent', label: 'Agent', type: 'text', index: true },
      /* A TASK SPLIT INTO STEPS: each step points at the task it is part of. */
      { id: 'parent', label: 'Part of', type: 'ref', to: 'tasks', index: true },
      /* THE DAY IT WAS FINISHED, filled by the record on the move to done unless the write says the day (`finished`). */
      { id: 'done_on', label: 'Done on', type: 'day', index: true },
      /* A task on no project is global. A link, like Owner, so Work installs on a record with no Projects and leaves it out. */
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true, scope: {} },
      { id: 'by', label: 'Due', type: 'day', index: true, deadline: true, remind: ['0d'] },
      /* Usually unset, and the schema has to be the thing that says so — the prose two documents
         away saying "most tasks carry no thread" is what lost last time (10 §7). */
      { id: 'track', label: 'Thread', type: 'ref', to: 'tracks', index: true },
      { id: 'effort', type: 'duration', unit: 'd' },
      { id: 'note', type: 'document' },
    ],
  },
};

/* ── the figures ──────────────────────────────────────────────────────────── */

/** Every state a task is still in play in, kept for later included. */
const LIVE = 'state is not done or dropped';

/** Work somebody has taken on: in play, and not kept for later. What Open counts. */
const OPEN = 'state is not backlog or done or dropped';

/**
 * What waits on a person: handed back to be checked, or stuck.
 *
 * ONE PREDICATE FOR THE FIGURE AND THE QUEUE UNDER IT, because they are the same question asked twice on one screen and
 * they were two copies of one sentence. The Overview's other lists are cut from `IN_HAND` below, which is the states
 * this is not, so a copy drifting would put a ticket back under two headings without either of them changing.
 */
const WAITING = 'state is review or blocked';

/**
 * TAKEN ON AND NOT WAITING ON ANYBODY: what the Overview's lists divide between them.
 *
 * THE LISTS ARE CUT SO THAT NO TASK CAN FALL UNDER TWO, and the cut is by state first, then by agent, then by day.
 * Waiting on you takes `WAITING` whoever holds the task, because a task an agent handed back is waiting on a person
 * and not on the agent. With an agent takes the rest of what an agent holds. What is left is yours, and the day
 * divides it: Late, Today, This week, After this week, and No due day. Later is the backlog, whatever its date, which
 * is the word the Board already uses for it.
 *
 * A TASK OF YOURS WITH NO DUE DAY HAS A LIST OF ITS OWN because no sentence the grammar reads can put it under After
 * this week. At 1.6.0 it was under none of the six: a task created with nothing but a description, state `open` by
 * default and no agent, was on no list of the Overview (`test/work-overview-twice.test.ts` found it left out). A
 * sentence ANDs its clauses on the comma and reads `or` only between values of one field, so `by is empty or after +7d`
 * is refused (VALUE_MALFORMED: "empty is not a value by can hold", the wall `money-core`'s `recurring-ended` hit), and
 * `by is not before +8d` is refused the same way. The only clauses on a day that a missing day passes are `is empty`
 * and `is not` a finite list of days, and neither can leave out every day up to a line, so no one list can hold both
 * the undated and the far off. `by is empty` is read by the record and by the app's sample engine alike.
 */
const IN_HAND = 'state is open or doing';
const YOURS = `${IN_HAND}, agent is empty`;

/**
 * WORK'S FIGURES, as documents a page names. Counts of tasks, never a score: how much is open, what is due soon or past
 * its date, what waits on a person, and what was finished, by the day it was finished.
 *
 * NOTHING HERE IS ABOUT ONE KIND OF PERSON. A student's homework and a team's cycle are the same five questions.
 */
export const WORK_METRICS: Record<string, SeedMetric> = {
  /* REMEMBERED DAILY, so Open draws how much work was open over the weeks and not only today's count. */
  'open-tasks': {
    metric: 'open-tasks',
    name: 'Open',
    source: 'register.tasks',
    /* NOT THE BACKLOG. A team with forty tickets kept for later has not got forty open, so those are counted beside it. */
    where: OPEN,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
    snapshot: { grain: 'day', into: 'series.open-tasks' },
  },
  'tasks-later': {
    metric: 'tasks-later',
    name: 'Kept for later',
    source: 'register.tasks',
    where: 'state is backlog',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  'tasks-due-7d': {
    metric: 'tasks-due-7d',
    name: 'Due in 7 days',
    source: 'register.tasks',
    where: `${LIVE}, by after yesterday, by before +8d`,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  'tasks-overdue': {
    metric: 'tasks-overdue',
    name: 'Past their date',
    source: 'register.tasks',
    where: `${LIVE}, by before today`,
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
  /**
   * YOURS, BAND BY BAND, SINCE work 1.10.0: what is late, due today and due later this week among the tasks in your own
   * hands (`YOURS`, taken on and no agent holding it), each over its band's own clauses on Work's page. Past their date
   * and Due in 7 days count the backlog and what an agent holds too, so the line said '2 late' over a Late band that
   * said nothing of yours was, and Today drew 'Nothing due today.' on a day only an agent's task fell due. A band drawn
   * on its own count is drawn exactly while it holds a task.
   */
  'tasks-late-yours': {
    metric: 'tasks-late-yours',
    name: 'Yours, late',
    source: 'register.tasks',
    where: `${YOURS}, by before today`,
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
  'tasks-today-yours': {
    metric: 'tasks-today-yours',
    name: 'Yours, due today',
    source: 'register.tasks',
    where: `${YOURS}, by is today`,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  'tasks-week-yours': {
    metric: 'tasks-week-yours',
    name: 'Yours, due this week',
    source: 'register.tasks',
    where: `${YOURS}, by after today, by before +8d`,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* WHAT IS FOLDED UNDER NOT THIS WEEK, SINCE work 1.11.0, each over its band's own clauses, and the three together for
     the section over them, so no band is drawn empty and a record with nothing further off draws no folded heading. */
  'tasks-after-week-yours': {
    metric: 'tasks-after-week-yours',
    name: 'Yours, after this week',
    source: 'register.tasks',
    where: `${YOURS}, by after +7d`,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  'tasks-undated-yours': {
    metric: 'tasks-undated-yours',
    name: 'Yours, with no due day',
    source: 'register.tasks',
    where: `${YOURS}, by is empty`,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* A TREE AND NOT A SENTENCE, because it is an `or` of three bands, and a sentence ORs only the values of one field. */
  'tasks-not-this-week': {
    metric: 'tasks-not-this-week',
    name: 'Not this week',
    source: 'register.tasks',
    where: {
      any: [
        {
          all: [
            { field: 'state', in: ['open', 'doing'] },
            { field: 'agent', empty: true },
            { any: [{ field: 'by', after: '+7d' }, { field: 'by', empty: true }] },
          ],
        },
        { field: 'state', is: 'backlog' },
      ],
    },
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* WHAT WAITS ON A PERSON: work an agent handed back to be checked, and work that cannot move. */
  'tasks-waiting': {
    metric: 'tasks-waiting',
    name: 'Waiting on you',
    source: 'register.tasks',
    where: WAITING,
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* WHAT AN AGENT HAS IN HAND, SINCE work 1.10.0, over the With an agent band's own clauses: taken on and not handed
     back. It counted every live task an agent was named on, so a task it handed back was counted here and again as
     waiting on you, and the band was drawn over nothing on a day an agent held only that. */
  'tasks-with-agents': {
    metric: 'tasks-with-agents',
    name: 'With an agent',
    source: 'register.tasks',
    where: `${IN_HAND}, agent is set`,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* REMEMBERED DAILY since work 1.10.0, as Open is, so the two figures on Right now each draw their weeks as a line. */
  'tasks-done-7d': {
    metric: 'tasks-done-7d',
    name: 'Done in 7 days',
    source: 'register.tasks',
    where: 'state is done, done_on after -8d',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
    snapshot: { grain: 'day', into: 'series.tasks-done-7d' },
  },
  'tasks-done-7d-agents': {
    metric: 'tasks-done-7d-agents',
    name: 'Done in 7 days by an agent',
    source: 'register.tasks',
    where: 'state is done, done_on after -8d, agent is set',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /* PROGRESS OVER TIME: finished by the week it was finished, then what is due in the weeks ahead. */
  'tasks-done-by-week': {
    metric: 'tasks-done-by-week',
    name: 'Done, by week',
    source: 'register.tasks',
    where: 'state is done, done_on after -63d',
    value: { count: 'id' },
    group_by: 'done_on',
    bucket: 'week',
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  /**
   * ONE PROJECT'S FINISHED WORK, BY THE WEEK IT WAS FINISHED, since work 1.10.0: the line a project draws of how its work
   * is moving, read as `project-done-by-week:<project>` the way `project-done-7d:<project>` is. Work's, because it reads
   * tasks alone, and left out with every figure over `thing` on a record that holds no projects (`without` in
   * `packs/first-party.ts`).
   */
  'project-done-by-week': {
    metric: 'project-done-by-week',
    name: 'Done, by week',
    source: 'register.tasks',
    where: 'thing is {{it}}, state is done, done_on after -63d',
    value: { count: 'id' },
    group_by: 'done_on',
    bucket: 'week',
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  'tasks-due-by-week': {
    metric: 'tasks-due-by-week',
    name: 'Due, by week',
    source: 'register.tasks',
    where: `${LIVE}, by after yesterday, by before +29d`,
    value: { count: 'id' },
    group_by: 'by',
    bucket: 'week',
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
};

/* ── follow-ups ───────────────────────────────────────────────────────────── */

/**
 * The script that closes a task's follow-ups when the task is done: every step `Part of` it that is still open, doing
 * or blocked moves to done, with a line in its note naming the task it closed with.
 *
 * MEASURED BEFORE IT (`probe-cascade.test.ts`, and on a self-host with Work in
 * `apps/selfhost/test/follow-ups.test.ts`): a parent moved to done left its child open, so the Overview kept drawing a
 * step of work that was over. A dropped step is left alone, because somebody decided it was not worth doing, and a step
 * in review is left alone, because it waits on a person who has not looked yet.
 *
 * THE PARENT IS READ AGAIN BEFORE ANYTHING MOVES. The rule queues the run and a host runs it later, so a task done and
 * reopened in between is open by the time this reads it, and closing its steps then would undo the reopening. So a
 * reopened task brings nothing back and closes nothing either.
 */
const CLOSE_FOLLOW_UPS = `export default async function run(ctx) {
  const parent = await ctx.record.get(ctx.input.id);
  if (!parent || parent.fields.state !== 'done') return;
  const steps = await ctx.record.list('tasks', { all: [{ field: 'parent', is: parent.id }, { field: 'state', in: ['open', 'doing', 'blocked'] }] });
  const line = 'Closed with ' + parent.fields.what + ' (tasks#' + parent.seq + ').';
  for (const step of steps) {
    const note = typeof step.fields.note === 'string' && step.fields.note.trim() !== '' ? step.fields.note + '\\n\\n' + line : line;
    ctx.update('tasks#' + step.seq, { state: 'done', note }, step.version);
  }
}`;

/**
 * The script that starts a new follow-up where its parent is: a task created `Part of` another and on no project takes
 * the parent's project, and its thread when it names none.
 *
 * ONE LEVEL, AS `parent` HOLDS ONE. The copy is made once, at the create, and never again: moving the parent to another
 * project later does not move its steps, because by then somebody may have placed a step somewhere on purpose.
 *
 * `thing` MAY NOT BE A FIELD AT ALL. Work installs without Projects and leaves the field out (`LINKS` in
 * `packs/first-party.ts`), so the script copies only what the parent holds and the list declares; on such a record a
 * follow-up still takes its parent's thread.
 */
const START_WITH_PARENT = `export default async function run(ctx) {
  const task = await ctx.record.get(ctx.input.id);
  if (!task || !task.fields.parent || task.fields.thing) return;
  const parent = await ctx.record.get(task.fields.parent);
  if (!parent) return;
  const patch = {};
  if (parent.fields.thing) patch.thing = parent.fields.thing;
  if (!task.fields.track && parent.fields.track) patch.track = parent.fields.track;
  if (Object.keys(patch).length > 0) ctx.update('tasks#' + task.seq, patch, task.version);
}`;

/** A script of Work's, as a pack document writes it: no egress, no keys, reading and writing tasks, started by a rule. */
const workScript = (script: string, title: string, source: string): Record<string, unknown> => ({
  script,
  title,
  pack: 'work',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['tasks'],
  writes: ['tasks'],
  source,
});

/**
 * WORK'S AUTOMATIONS: two rules and the two scripts they start, in the pack document's own form (the kind first).
 *
 * A RULE STARTS A SCRIPT THROUGH A `script` STEP, and nothing about tasks is in the kernel: the kernel queues the
 * script's run (`startScript` in `packages/kernel/src/flow.ts`), the host runs it in its sandbox, and its writes land
 * through the ordinary write path as `script:<id>@v<n>`. `32-PARITY §5` wrote the cascade as one rule on the child that hops to its parent with `via:`, which this build refuses at install
 * (`MATCH_OP_UNSUPPORTED`), and a rule on the child is evaluated when the child is written, not when its parent is.
 *
 * NOT INTO `RULES`, which holds the older `register:` and `then:` form that `installSeed` runs over rows already
 * written (`applyRule`). These go into the pack document and into `installSeed` as `AUTOMATIONS` in `../index.ts`, and
 * both halves always arrive in one call, because a rule whose script is missing fails every run it starts.
 *
 * `op: [update]` AND `fields: [state]` ON THE FIRST, so a task created already done closes nothing and an edit to a
 * done task's words does not close its steps a second time. Reopening is an update of `state` too, and the rule's
 * `when:` leaves it out, so reopening starts nothing.
 */
export const WORK_AUTOMATIONS: Record<string, unknown>[] = [
  {
    rule: 'close_follow_ups',
    pack: 'work',
    on: { written: { register: 'tasks', op: ['update'], fields: ['state'] } },
    when: 'state is done',
    steps: [{ script: { id: 'close_follow_ups', as: 'closing' } }],
  },
  {
    rule: 'start_with_parent',
    pack: 'work',
    on: { written: { register: 'tasks', op: ['create'] } },
    when: 'parent is set',
    steps: [{ script: { id: 'start_with_parent', as: 'placing' } }],
  },
  workScript('close_follow_ups', 'Close the follow-ups of a finished task', CLOSE_FOLLOW_UPS),
  workScript('start_with_parent', 'Start a follow-up in the project of its parent', START_WITH_PARENT),
];

/* ── the pages ────────────────────────────────────────────────────────────── */

/* NO LABEL: a column over a list's title is headed by what one row of the list is called, so a record whose tasks are
   Tickets reads Ticket, and one that relabels them later reads that. */
const DESCRIPTION = { field: 'what', width: 'minmax(20ch,1fr)' } as const;

/**
 * BY TIER, THEN BY THE DAY IT FALLS DUE, the order a board of work is read in. The record sorts an enum by the order
 * its values were declared in, so `urgent` comes before `low`, and a task with no tier sorts after every tier, as an
 * empty value always does. BOTH KEYS SAY `asc` because an order that says no direction is read descending, which would
 * put Low first and the latest day at the top.
 */
const TIER_THEN_DUE = [
  { field: 'priority', dir: 'asc' },
  { field: 'by', dir: 'asc' },
] as const;

export const WORK_PAGES: Record<string, SeedPage> = {
  /**
   * WORK LEADS WITH WHAT IS IN PLAY AND WHAT WAITS ON YOU. "What I
   * have to do next, what my agents are doing, and what's stuck": the figures, the queue a person works from, what is
   * due, how the work moved week by week, where it sits, and what agents took. The board is its own page beside it.
   *
   * SINCE work 1.9.0 IT IS A TO-DO FIRST: the capture line leads, the lists of yours are ordered by tier and then by due
   * day, and beside what agents hold are what they ask (`governance.open`).
   *
   * SINCE work 1.10.0 IT IS THE WORK SCREEN'S BANDS, declared (`apps/web/src/lib/work/Work.svelte`), so that screen can
   * be drawn from this page: one line of what matters, the capture line, two figures, then Late, Today, This week, With
   * an agent, Waiting on you and Done recently, top to bottom, each the whole width, and what is further off folded shut
   * under Not this week. A band with nothing in it is not drawn (`when:`), so a quiet day shows what there is and a new
   * record shows the capture line alone. The figures are cut to Open and Done in 7 days, the load and how fast it
   * moves; what is late and what waits on you is in the line and in its own band. The chart of the weeks, the bar by
   * project and the queue of what agents ask went: the figures draw their weeks, a project's page draws its own, and
   * Decide holds the questions.
   *
   * EVERY BAND STILL HOLDS A TASK ONCE. A sentence cannot read "late, and not with an agent" as one band and "with an
   * agent, and not late" as the next (`IN_HAND` above), so the cut is by state first, as before: Waiting on you takes
   * what waits on a person, With an agent what an agent holds, and the day divides what is yours. A band is drawn on a
   * figure that counts exactly its own tasks (Late, Today and This week over the `-yours` figures), so it is never hidden
   * while it holds one and never drawn empty.
   *
   * CALMER, SINCE work 1.11.0 (DIRECTION §35): the line, the capture line and the five bands of what is still to do,
   * then two folds, Not this week and Done lately. Open is said once, in the line, so the figures tile went; how fast work
   * moves is a line over eight weeks under Done lately. A strip of projects narrows every band (`filters:`).
   *
   * EVEN ROWS, SINCE work 1.12.0 (the visual review of October 2nd): Today the whole width, then Late and This week side
   * by side, half each, and Done lately wears a glyph a folded heading draws.
   */
  work: {
    page: 'work',
    /* CALLED WORK, as the section it heads is, because the page is the to-do and not a report about one. */
    title: 'Work',
    nav: { section: 'Work', order: 10 },
    icon: 'task',
    requires: ['register.tasks'],
    pack: 'work',
    /* ONE PROJECT AT A TIME, SINCE work 1.11.0: a strip of the projects that have open work, chosen once and narrowing
       every band, where the Work screen drew the same choice as a select, as chips and as a tile. The field is the
       tasks' `thing`, which the page calls Project; a record without Projects has no such field, and no strip
       (`without` in `packs/first-party.ts`). */
    filters: [{ field: 'thing', control: 'chips' }],
    blocks: [
      {
        /* THE PAGE'S ONE LINE, drawn in the title's tile. A clause whose figure is nought is left out by the writer
           (`leadOf`), so a quiet week says only what there is; a record with nothing open says nothing at all. Late is
           yours (`tasks-late-yours`), the count of the Late band under it, so the line and the band never disagree; an
           agent's late task is counted where it is drawn, with the agent or waiting on you.

           IT NAMES THE LATE TASK, SINCE work 1.13.0 (the visual review of October 2nd), where it counted the table:
           "Turn auto-renew back on is late, and 6 more tasks are too" rather than "15 open tasks, 1 late". The task is
           the one late longest (`.first`), from whatever this record's tasks are. With nothing late the line is the
           counts, as it was. */
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'tasks-late-yours', gt: 0 },
        body: '{{tasks-late-yours.first}} is late, and {{tasks-late-yours.more}} more task(s) are too',
      },
      {
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'tasks-late-yours', is: 0 },
        body: '{{open-tasks}} open task(s), {{tasks-waiting}} waiting on you',
      },
      {
        /* CAPTURE FIRST, before any figure, because a task that is not written down the moment it comes to mind is the
           one carried in your head. The heading is the field's prompt (`render/src/capture.ts`), and a task added here
           is To do with no day, so it lands under Not this week until somebody gives it one. */
        kind: 'capture',
        heading: 'What needs doing?',
        icon: 'plus',
        span: 12,
        register: 'tasks',
      },
      {
        kind: 'todo',
        heading: 'Today',
        icon: 'calendar',
        span: 12,
        source: 'register.tasks',
        where: `${YOURS}, by is today`,
        columns: [{ field: 'what' }, { field: 'thing' }],
        order: TIER_THEN_DUE,
        limit: 12,
        when: { metric: 'tasks-today-yours', gt: 0 },
        empty: 'Nothing due today.',
      },
      {
        /* A `todo` AND NOT A `table`, SO THAT A TASK CAN BE FINISHED WHERE IT IS READ. The host wires the tick onto
           every `todo` row. Late, Today and This week are yours, cut at today and at a week, ordered by tier and then
           by day.

           LATE AND THIS WEEK SIDE BY SIDE, HALF EACH, UNDER TODAY, SINCE work 1.12.0: two short lists the whole width
           each were two strips of white with a task at the left of each. Today keeps the whole width above them. */
        kind: 'todo',
        heading: 'Late',
        icon: 'alert',
        span: 6,
        source: 'register.tasks',
        where: `${YOURS}, by before today`,
        columns: [{ field: 'what' }, { field: 'by' }],
        order: TIER_THEN_DUE,
        limit: 12,
        when: { metric: 'tasks-late-yours', gt: 0 },
        empty: 'Nothing of yours is late.',
      },
      {
        kind: 'todo',
        heading: 'This week',
        icon: 'calendar-days',
        span: 6,
        source: 'register.tasks',
        where: `${YOURS}, by after today, by before +8d`,
        columns: [{ field: 'what' }, { field: 'by' }],
        order: TIER_THEN_DUE,
        limit: 12,
        when: { metric: 'tasks-week-yours', gt: 0 },
        empty: 'Nothing else this week.',
      },
      {
        /* WHAT AGENTS HOLD NOW, with the dot on the one an agent is on this minute. Not what they handed back: that
           waits on you, below. */
        kind: 'todo',
        heading: 'With an agent',
        icon: 'session',
        span: 12,
        source: 'register.tasks',
        where: `${IN_HAND}, agent is set`,
        columns: [{ field: 'what' }, { field: 'agent' }],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 8,
        working: true,
        when: { metric: 'tasks-with-agents', gt: 0 },
        empty: 'No agent holds a task.',
      },
      {
        /* WHAT WAITS ON A PERSON, with the note as the reason it waits and, under it, when the task falls due and who
           changed it last. `todo` is `cells: 4, optional: 2` in `braindog-render`'s `kinds.ts`, and both renderers draw
           the third and fourth cells as one quiet line joined by a dot (`src/todo.ts`, held by
           `test/waiting-due.test.ts`). `changed` is not a field of tasks; the kernel reads it from each row's history. */
        kind: 'todo',
        heading: 'Waiting on you',
        icon: 'hourglass',
        span: 12,
        source: 'register.tasks',
        where: WAITING,
        columns: [{ field: 'what' }, { field: 'note' }, { field: 'by' }, { field: 'changed' }],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 8,
        when: { metric: 'tasks-waiting', gt: 0 },
        empty: 'Nothing waits on you.',
      },
      {
        /* WHAT IS FURTHER OFF, FOLDED SHUT: yours after this week, yours with no day, and what is kept for later. A
           section folds the blocks after it, so these are a tap away and not on the page a person reads each morning.
           No Due day is its own band because no sentence can put a task with no day under After this week (`IN_HAND`). */
        kind: 'section',
        heading: 'Not this week',
        icon: 'archive',
        span: 12,
        fold: true,
        when: { metric: 'tasks-not-this-week', gt: 0 },
      },
      {
        kind: 'todo',
        heading: 'After this week',
        icon: 'calendar-days',
        span: 12,
        source: 'register.tasks',
        where: `${YOURS}, by after +7d`,
        columns: [{ field: 'what' }, { field: 'by' }],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 8,
        when: { metric: 'tasks-after-week-yours', gt: 0 },
        empty: 'Nothing after this week.',
      },
      {
        /* The project is its detail, because there is no day to show. */
        kind: 'todo',
        heading: 'No due day',
        icon: 'circle-dashed',
        span: 12,
        source: 'register.tasks',
        where: `${YOURS}, by is empty`,
        columns: [{ field: 'what' }, { field: 'thing' }],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 8,
        when: { metric: 'tasks-undated-yours', gt: 0 },
        empty: 'Everything has a day.',
      },
      {
        kind: 'todo',
        heading: 'Later',
        icon: 'archive',
        span: 12,
        source: 'register.tasks',
        where: 'state is backlog',
        columns: [{ field: 'what' }, { field: 'thing' }],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 8,
        when: { metric: 'tasks-later', gt: 0 },
        empty: 'Nothing kept for later.',
      },
      {
        /* WHAT WAS FINISHED, FOLDED SHUT, SINCE work 1.11.0: how fast work moves and what moved, a tap away. Above the
           fold the page is what is still to do. */
        kind: 'section',
        heading: 'Done lately',
        /* `check`, SINCE work 1.12.0: a folded heading draws only the glyphs the app ships with, and `circle-check` drew
           nothing there. */
        icon: 'check',
        span: 12,
        fold: true,
        when: { metric: 'tasks-done-7d', gt: 0 },
      },
      {
        /* HOW FAST IT MOVES, DRAWING ITS EIGHT WEEKS AS A LINE from its nightly series (`snapshot` above). ONE FIGURE AND
           NOT TWO, SINCE work 1.11.0: Open was the line's own first figure, said again under it. */
        kind: 'stat',
        heading: 'How fast it moves',
        icon: 'chart-line',
        span: 12,
        when: { metric: 'tasks-done-7d', gt: 0 },
        cells: [{ metric: 'tasks-done-7d', label: 'Done in 7 days', trend: '8w', note: '{{tasks-done-7d-agents}} of them by an agent' }],
      },
      {
        /* WHAT WAS FINISHED IN THE LAST SEVEN DAYS, NEWEST FIRST, ticked, so a task closed by mistake is opened again
           from here. Over Done in 7 days' own clauses, and drawn while that figure has any. */
        kind: 'todo',
        heading: 'Done recently',
        icon: 'circle-check',
        span: 12,
        source: 'register.tasks',
        where: 'state is done, done_on after -8d',
        columns: [{ field: 'what' }, { field: 'done_on' }, { field: 'agent' }],
        order: [{ field: 'done_on', dir: 'desc' }],
        limit: 8,
        when: { metric: 'tasks-done-7d', gt: 0 },
        empty: 'Nothing done this week.',
      },
    ],
  },

  /** THE BOARD AND THE LIST, for moving work along and seeing all of it. */
  'work-board': {
    page: 'work-board',
    title: 'Board',
    nav: { section: 'Work', order: 20 },
    icon: 'board',
    requires: ['register.tasks'],
    pack: 'work',
    blocks: [
      {
        /* THE BOARD'S ONE LINE, since work 1.10.0: how much is on it, and the two columns that need somebody. */
        kind: 'note',
        lead: true,
        span: 12,
        body: '{{open-tasks}} open task(s), {{tasks-waiting}} to check or blocked, {{tasks-with-agents}} with an agent',
      },
      {
        kind: 'board',
        heading: 'By status',
        icon: 'board',
        span: 12,
        columns: [{ field: 'state' }, { field: 'what' }, { field: 'thing' }],
        source: 'register.tasks',
        where: 'state is not dropped',
        /* EACH COLUMN BY TIER, THEN BY DUE DAY. A board keeps its rows in the order they are read within each column
           (`render/src/board.ts`), so the order the record reads them in is the order a column draws. */
        order: TIER_THEN_DUE,
        /* AND WHICH CARDS AN AGENT IS ON RIGHT NOW. This is the page that answers "what are my agents
           doing", and until now it answered it only in a strip beside the board: a card being worked
           on looked exactly like one nobody had opened in a week. */
        working: true,
        empty: 'Nothing open.',
      },
      {
        kind: 'table',
        heading: 'Everything open',
        icon: 'rows',
        span: 12,
        source: 'register.tasks',
        /* WHAT OPEN COUNTS: work kept for later has its own column on the board above. */
        where: OPEN,
        columns: [
          DESCRIPTION,
          { field: 'thing', label: 'Project', width: 'minmax(10ch,16ch)' },
          { field: 'owner', label: 'Owner', width: 'minmax(8ch,14ch)' },
          { field: 'agent', label: 'Agent', width: '10ch' },
          { field: 'state', label: 'Status', width: '12ch' },
          { field: 'by', label: 'Due', width: '13ch', align: 'end' },
        ],
        order: [{ field: 'by', dir: 'asc' }],
        when: { metric: 'open-tasks', gt: 0 },
        empty: 'Nothing open.',
        limit: 50,
      },
    ],
  },
};
