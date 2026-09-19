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
  { what: 'Turn auto-renew back on for kilnfonts.example', state: 'open', thing: 1, by: day(-4), effort: days(0.2), note: '' },
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

export const WORK_REGISTERS: Record<string, SeedRegister> = {
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
      { id: 'by', type: 'enum', values: ['claude', 'codex', 'cursor', 'you'], index: true, required: true },
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
  /* WHAT WAITS ON A PERSON: work an agent handed back to be checked, and work that cannot move. */
  'tasks-waiting': {
    metric: 'tasks-waiting',
    name: 'Waiting on you',
    source: 'register.tasks',
    where: 'state is review or blocked',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
  'tasks-with-agents': {
    metric: 'tasks-with-agents',
    name: 'With an agent',
    source: 'register.tasks',
    where: `${LIVE}, agent is set`,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
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

/* ── the pages ────────────────────────────────────────────────────────────── */

/* NO LABEL: a column over a list's title is headed by what one row of the list is called, so a record whose tasks are
   Tickets reads Ticket, and one that relabels them later reads that. */
const DESCRIPTION = { field: 'what', width: 'minmax(20ch,1fr)' } as const;

export const WORK_PAGES: Record<string, SeedPage> = {
  /**
   * WORK LEADS WITH WHAT IS IN PLAY AND WHAT WAITS ON YOU (`loop/DIRECTION.md` §3, `research-modules.md` §2.2). "What I
   * have to do next, what my agents are doing, and what's stuck": the figures, the queue a person works from, what is
   * due, how the work moved week by week, where it sits, and what agents took. The board is its own page beside it.
   */
  work: {
    page: 'work',
    title: 'Overview',
    nav: { section: 'Work', order: 10 },
    icon: 'task',
    requires: ['register.tasks'],
    pack: 'work',
    blocks: [
      {
        kind: 'stat',
        lead: true,
        heading: 'Right now',
        span: 12,
        cells: [
          { metric: 'open-tasks', label: 'Open', trend: '8w', note: '{{tasks-with-agents}} with an agent, {{tasks-later}} kept for later' },
          { metric: 'tasks-waiting', label: 'Waiting on you', note: 'to check, or blocked' },
          { metric: 'tasks-due-7d', label: 'Due in 7 days', note: '{{tasks-overdue}} past their date' },
          { metric: 'tasks-done-7d', label: 'Done in 7 days', note: '{{tasks-done-7d-agents}} of them by an agent' },
        ],
      },
      {
        /* THE QUEUE A PERSON WORKS FROM: what an agent handed back to be checked, and what cannot move, with who touched
           it last, so a person sees whose work they are checking. */
        kind: 'table',
        heading: 'Waiting on you',
        span: 12,
        source: 'register.tasks',
        where: 'state is review or blocked',
        columns: [
          DESCRIPTION,
          { field: 'state', label: 'Status', width: '12ch' },
          { field: 'agent', label: 'Agent', width: '10ch' },
          { field: 'note', label: 'Why', width: 'minmax(16ch,1fr)' },
          { field: 'changed', label: 'Changed by', width: '16ch' },
        ],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 12,
        empty: 'Nothing is waiting on you.',
      },
      {
        kind: 'table',
        heading: 'Due soon',
        span: 7,
        source: 'register.tasks',
        where: `${LIVE}, by before +15d`,
        columns: [
          DESCRIPTION,
          { field: 'thing', label: 'Project', width: 'minmax(8ch,14ch)' },
          { field: 'by', label: 'Due', width: '13ch', align: 'end' },
        ],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 8,
        empty: 'Nothing is due in the next two weeks.',
      },
      {
        /* WHERE THE OPEN WORK SITS, in days of effort, and what belongs to no project, last. A task with no size adds
           nothing and draws no bar, so open work nobody sized says the empty line rather than "No project 0 d". */
        kind: 'bar',
        heading: 'Open work by project',
        span: 5,
        source: 'register.tasks',
        where: LIVE,
        columns: [{ field: 'thing' }, { field: 'effort' }],
        limit: 6,
        unset: 'No project',
        empty: 'No open work has a size yet.',
      },
      {
        kind: 'series',
        heading: 'Done, and due ahead',
        span: 12,
        series: [{ metric: 'tasks-done-by-week', then: 'tasks-due-by-week', label: 'Done, then due' }],
        back: 8,
        ahead: 4,
        empty: 'Nothing was finished or is due in these weeks.',
      },
      {
        /* WHAT AGENTS HOLD NOW, and where each one is with it. */
        kind: 'table',
        heading: 'With an agent',
        span: 12,
        source: 'register.tasks',
        where: `${LIVE}, agent is set`,
        columns: [
          DESCRIPTION,
          { field: 'agent', label: 'Agent', width: '10ch' },
          { field: 'state', label: 'Status', width: '12ch' },
          { field: 'by', label: 'Due', width: '13ch', align: 'end' },
        ],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 12,
        empty: 'No agent holds a task. An agent takes one by setting itself as its agent.',
      },
      {
        kind: 'table',
        heading: 'Done lately',
        span: 12,
        source: 'register.tasks',
        where: 'state is done',
        columns: [
          DESCRIPTION,
          { field: 'agent', label: 'Agent', width: '10ch' },
          { field: 'done_on', label: 'Done on', width: '13ch', align: 'end' },
        ],
        order: [{ field: 'done_on', dir: 'desc' }],
        limit: 6,
        empty: 'Nothing is done yet.',
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
        kind: 'board',
        heading: 'By status',
        span: 12,
        columns: [{ field: 'state' }, { field: 'what' }, { field: 'thing' }],
        source: 'register.tasks',
        where: 'state is not dropped',
        /* AND WHICH CARDS AN AGENT IS ON RIGHT NOW. This is the page that answers "what are my agents
           doing", and until now it answered it only in a strip beside the board: a card being worked
           on looked exactly like one nobody had opened in a week. */
        working: true,
        empty: 'Nothing open.',
      },
      {
        kind: 'table',
        heading: 'Everything open',
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
        empty: 'Nothing open.',
        limit: 50,
      },
    ],
  },
};
