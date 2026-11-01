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
  { what: 'Decide the licensing tier split', state: 'blocked', thing: 1, by: day(6), effort: days(1), note: 'Waiting on the pricing question in Needs you.' },
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
 * a run. `last_seen` uses `hours(n)` because a run's age is said in minutes and hours, and `started` with it, so each
 * run is a span of time the agents home can draw as a lane. All three are fields only the record writes, so these rows
 * go in through `openRun` below.
 *
 * A person is never a run, so every run here is an agent's: three are Kiln's, and two are finished.
 */
export const RUNS: Fields[] = [
  { doing: 'Variable axis QA, instances 3 of 9', agent: 'claude', state: 'active', project: 'things#1', repo: 'kiln-type', host: 'kiln-mbp', branch: 'axis-qa', next: 'Sign off instances 4 to 6 once the mastering pass lands.', started: hours(3.5), last_seen: hours(0.05) },
  { doing: 'Drafting the specimen page copy', agent: 'codex', state: 'active', project: 'things#1', repo: 'kiln-site', host: 'kiln-mbp', branch: 'specimen-copy', started: hours(1.4), last_seen: hours(0.2) },
  { doing: 'Reconciling the Fenwick invoice against services', agent: 'claude', state: 'idle', project: 'things#3', repo: 'portage', host: 'studio-desktop', next: 'Propose merging the two Fenwick services, citing the rows read.', tried: ['Matching on the invoice total; two services share it.'], started: hours(5), last_seen: hours(2) },
  { doing: 'Drafting the chaser for invoice 2026-041', agent: 'cursor', state: 'done', project: 'things#2', host: 'studio-desktop', started: hours(27), last_seen: hours(26) },
  { doing: 'Kerning pass, lowercase', agent: 'claude', state: 'done', project: 'things#1', repo: 'kiln-type', host: 'kiln-mbp', started: hours(36.5), last_seen: hours(34) },
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
  { body: 'Three instances signed off. The other six wait on the mastering pass.', health: 'on_track', track: 1, by: 'you', at: stamp(-20 * 24) },
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
      /* SIX STATES AND THE MOVES BETWEEN THEM, SINCE work 1.19.0. There were four and no declared moves, so a thread
         was open the day it was thought of and an idea could be marked done in one step. An idea and a plan come
         before the work, and the four stored values stay as they were. Every move not written here is refused with
         the moves allowed (`TRANSITION_ILLEGAL`): nothing reaches done but work that was open or held up, a thread held
         up goes back to the plan or on, and what was finished or dropped comes back by being opened again.
         HOLDING GOES TO DONE: a thread waiting on somebody else is often finished by them, and the first cut made a
         person open it for a moment to close it, and refused an agent that closed one. */
      {
        id: 'state',
        label: 'Status',
        type: 'enum',
        values: ['idea', 'planned', 'open', 'holding', 'done', 'dropped'],
        labels: { idea: 'Idea', planned: 'Planned', open: 'Open', holding: 'Holding', done: 'Done', dropped: 'Dropped' },
        transitions: {
          idea: { to: ['planned', 'open', 'dropped'] },
          planned: { to: ['idea', 'open', 'holding', 'dropped'] },
          open: { to: ['holding', 'done', 'dropped'] },
          holding: { to: ['planned', 'open', 'done', 'dropped'] },
          done: { to: ['open'] },
          dropped: { to: ['idea', 'open'] },
        },
        index: true,
        required: true,
      },
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
      { id: 'opened', type: 'day', index: true },
      /* THE DAY IT AIMS FOR, SINCE work 1.19.0, the one day a thread is ABOUT: a deadline, so a thread is in every
         "Due this week" beside the tasks and the bills, and the record reminds on the day. Usually unset. */
      { id: 'target', label: 'Aiming for', type: 'day', index: true, deadline: true, remind: ['0d'] },
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
      /* SAID IN SENTENCE CASE (proj F11): a thread's composer offers On track, At risk and
         Off track, the words a project says its health in. */
      { id: 'health', type: 'enum', values: ['on_track', 'at_risk', 'off_track'], labels: { on_track: 'On track', at_risk: 'At risk', off_track: 'Off track' }, index: true, required: true },
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
      /* ASSIGNED TO (work 1.21.0): "Owner" read as the BrainDog's owner on a team. The id stays. */
      { id: 'owner', label: 'Assigned to', type: 'ref', to: 'people', index: true },
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

/** OPEN AND NOT WRITTEN IN THREE MONTHS: what has not moved, which the old Work screen counted after 90 days. */
const STALE = `${OPEN}, updated_at before -90d`;

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
/* AND NOT SOMEBODY ELSE'S (work 1.21.0, teams): on a record more than one person holds, a task assigned to a colleague
   is theirs, so yours is unassigned or assigned to you (`owner is not someone else`, read for whoever is looking). On a
   record of one, or without People's Owner field, nobody else holds anything and yours is what it was. */
const NOT_THEIRS = 'owner is not someone else';
const YOURS = `${IN_HAND}, agent is empty, ${NOT_THEIRS}`;

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
  /* EVERY TASK NOT FINISHED, kept for later included: what Work's head counts, so it equals the chips under it, which
     count every row not in a done state. */
  'tasks-in-play': {
    metric: 'tasks-in-play',
    name: 'Open',
    source: 'register.tasks',
    where: LIVE,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
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
  /* TODAY AND THE REST OF THE WEEK AS ONE BAND, SINCE work 1.15.0, over that band's own clauses, so This week is drawn
     exactly while it holds a task of yours due from today to a week out. Today and This week keep their own figures. */
  'tasks-this-week-yours': {
    metric: 'tasks-this-week-yours',
    name: 'Yours, due today or this week',
    source: 'register.tasks',
    where: `${YOURS}, by after yesterday, by before +8d`,
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
  /**
   * OPEN WORK THAT BELONGS TO NO PROJECT, SINCE work 1.19.0: what Open counts, with the project left empty,
   * which With no project draws and is gated on. A task typed into the capture line has no project, and the Board
   * showed such tasks with a dash under Project and nowhere said how many. Over `thing`, so it is left out with every
   * figure over a project on a record that holds no projects (`without` in `packs/first-party.ts`).
   */
  'tasks-no-project': {
    metric: 'tasks-no-project',
    name: 'With no project',
    source: 'register.tasks',
    where: `${OPEN}, thing is empty`,
    value: { count: 'id' },
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
 * The script that starts a new follow-up where its parent is: a task created `Part of` another takes, one by one, each
 * of the parent's project, thread and owner that it left empty, and its agent where that agent made the follow-up.
 *
 * EACH OF THE THREE ON ITS OWN, SINCE work 1.19.0. Until then it copied the project and the thread and never whose the
 * work is, and it stopped altogether when the follow-up named a project, so that one took no thread either. What the
 * follow-up says for itself is never written over.
 *
 * THE AGENT ONLY FOR AN AGENT'S OWN STEP. The first cut of 1.19.0 copied it onto every follow-up, so a step a person
 * added under a task an agent holds was handed to that agent without anybody saying so, and giving work to an agent is
 * a person's call. The second copied it onto none, because a script was handed the task and not who wrote it. Now the
 * script reads who made the follow-up from its input, `made_by`, in the shape the record says a run in everywhere else
 * (`RunBy` in `packages/kernel/src/pages.ts`: `{ run, agent, client, parent }`, and nothing for a person, a rule or an
 * import), and a step takes its parent's agent when THE AGENT THAT HOLDS THE PARENT made it: Claude splitting its own
 * task keeps each step. A step Codex adds under Claude's task is given to nobody, as a person's is, since one agent
 * handing work to another is no more a person's call than the first cut was. Names are compared without case or
 * outer spaces, and what is written is the parent's own spelling. `other`, the word for a run of no known kind, is
 * nobody's name and is never matched.
 *
 * A HOST THAT SAYS NOTHING GIVES NOTHING. Where `made_by` is not handed (a kernel older than the one that hands it) or
 * is not that shape, no agent is copied and the rest is placed as before, so the script is right on every host and
 * only less helpful on an old one.
 *
 * ONE LEVEL, AS `parent` HOLDS ONE. The copy is made once, at the create, and never again: moving the parent to another
 * project later does not move its steps, because by then somebody may have placed a step somewhere on purpose.
 *
 * `thing` AND `owner` MAY NOT BE FIELDS AT ALL. Work installs without Projects and without People and leaves each
 * field out (`LINKS` in `packs/first-party.ts`), so the script copies only what the parent holds and the list
 * declares; on such a record a follow-up still takes its parent's thread.
 */
const START_WITH_PARENT = `export default async function run(ctx) {
  const task = await ctx.record.get(ctx.input.id);
  if (!task || !task.fields.parent) return;
  const parent = await ctx.record.get(task.fields.parent);
  if (!parent) return;
  const patch = {};
  for (const field of ['thing', 'track', 'owner'])
    if (!task.fields[field] && parent.fields[field]) patch[field] = parent.fields[field];
  const name = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
  const by = ctx.input.made_by;
  const maker = by !== null && typeof by === 'object' ? name(by.agent) : '';
  if (!task.fields.agent && maker !== '' && maker !== 'other' && maker === name(parent.fields.agent)) patch.agent = parent.fields.agent;
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
  workScript('start_with_parent', 'Start a follow-up where its parent is', START_WITH_PARENT),
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

/**
 * OPEN WORK WITH NO PROJECT, AS ONE TILE, SINCE work 1.19.0: the five newest, each with its due day, so
 * a task typed in a hurry is seen where it can be given a project. A record whose every open task has a project draws
 * nothing: a table holding no task is not drawn (`holdsNothing` in `packages/kernel/src/drawn.ts`), and on Work the
 * fold over it is gated on `tasks-no-project`. NO `when:` OF ITS OWN, because the add-on file waits it on Projects
 * (`when: { holds }`), and a block says one `when:`. EXPORTED so a Home can take the same tile, word for word (AGT-D14
 * job 2, a new version of each use case).
 */
export const WITH_NO_PROJECT = {
  kind: 'table',
  heading: 'With no project',
  icon: 'folder',
  span: 12,
  source: 'register.tasks',
  where: `${OPEN}, thing is empty`,
  columns: [DESCRIPTION, { field: 'by', label: 'Due', width: '13ch', align: 'end' }],
  order: [{ field: 'created_at', dir: 'desc' }],
  limit: 5,
} as const;

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
   * CALMER, SINCE work 1.11.0: the line, the capture line and the five bands of what is still to do,
   * then two folds, Not this week and Done lately. Open is said once, in the line, so the figures tile went; how fast work
   * moves is a line over eight weeks under Done lately. A strip of projects narrows every band (`filters:`).
   *
   * EVEN ROWS, SINCE work 1.12.0 (the visual review of October 2nd): Today the whole width, then Late and This week side
   * by side, half each, and Done lately wears a glyph a folded heading draws.
   *
   * ONE SENTENCE FOR AN EMPTY LIST, SINCE work 1.14.0: with nothing open the page is its line and the
   * capture line, and only a line says what is empty. Every band said it in its own words ("Nothing due today.",
   * "Nothing waits on you."), so a record whose list held nothing, or whose project strip narrowed a band to nothing,
   * read eight tiles of white saying so. A band with nothing in it is not drawn now, under its figure or under the strip.
   *
   * NO HALF-EMPTY TILES, SINCE work 1.15.0 (the design review's fix 8). A row of tiles stretches to its
   * tallest, so Late beside This week was a tile 220px tall holding one line. Late is a strip the whole width, and
   * This week, With an agent and Waiting on you share the row under it, a third each; Today is the top of This week,
   * which is ordered by the day first. Over them, a strip of figures: what is open, what falls due this week, and what
   * was finished, with its last seven days. The line says counts, "1 late, 3 waiting on you", where it named a task
   * and read like one.
   *
   * THE LINE TO TYPE INTO IS THE HEADER'S, SINCE work 1.16.0 (the second design review's fix 3), as
   * Today's is: it is declared alone and first, straight after the page's sentence, which is what a host reads to hold
   * it beside the page's name, where it spent a whole tile on one field. And every band says its own width: Late, the
   * figures and the folds write `span: 12`, a width of their own that a host does not halve beside a neighbour, so Late
   * is a strip whatever follows it.
   */
  work: {
    page: 'work',
    /* CALLED WORK, as the section it heads is, because the page is the to-do and not a report about one. */
    title: 'Work',
    /* ITS PLACE ON THE RAIL, SINCE batch 101 (places-and-computed-101): the lead pages sit Work, Orders, Projects,
       Money, People, Agents, lowest first (`placesOf` in `packages/record/src/places.ts`). */
    nav: { section: 'Work', order: 10, place: 10 },
    icon: 'task',
    requires: ['register.tasks'],
    pack: 'work',
    /* ONE PROJECT AT A TIME, SINCE work 1.11.0: a strip of the projects that have open work, chosen once and narrowing
       every band, where the Work screen drew the same choice as a select, as chips and as a tile. The field is the
       tasks' `thing`, which the page calls Project; a record without Projects has no such field, and no strip
       (`without` in `packs/first-party.ts`). */
    /* A HEAD BESIDE THE NAME, SINCE work 1.19.0: how many are open, one Add and a search box, so Work opens
       with its name, its count and the two things done first on it. The count is Open's own figure; the search is held
       in the address as `q`, and narrowing the page by it is the page read's. BEFORE `filters`, which a record without
       Projects goes without, so the page's keys keep one order whether the strip is there or not. */
    /* NO SEARCH BOX (proj F10): "Search this page" floated between the name and the line
       with no field round it, and the frame's own search is one press away on every screen. */
    /* THE HEAD COUNTS WHAT THE RAIL COUNTS, SINCE 28 October: Open, kept for later left out, so Work's name says the
       same number beside it on the page and in the rail ("Work 16" stood by "Work 15"). What is kept for later is
       counted once, in Not this week. From 24 October it counted every task not finished, to equal the chips. */
    header: {
      count: { metric: 'open-tasks' },
      action: { verb: 'row.create', label: 'Add' },
    },
    /* WHOSE WORK, SINCE work 1.19.0: Yours, Agents or All, as the old Work screen's toolbar picked, narrowing every
       band. Yours is what no agent holds and Agents what one does, the cut every band already makes by `agent`. */
    filters: [
      /* THE CHIPS COUNT WHAT OPEN COUNTS (Q6 of 29 October): every task not finished read one project 55, another 7 and
         a third 5 over "Open 57", the backlog among them. */
      { field: 'thing', control: 'chips', counts: OPEN },
      {
        field: 'whose',
        control: 'segmented',
        /* AND YOURS AND AGENTS COUNT WHAT OPEN COUNTS TOO (recheck of 30 October, N7): 12 and 4 stood under "Work 15". */
        counts: OPEN,
        options: [
          { value: 'yours', label: 'Yours', where: `agent is empty, ${NOT_THEIRS}` },
          { value: 'agents', label: 'Agents', where: 'agent is set' },
        ],
      },
    ],
    blocks: [
      {
        /* THE ONE SENTENCE WHEN NOTHING IS OPEN, SINCE work 1.14.0: the counts under it say nothing then, since a clause
           whose figure is nought is left out, so the page opened on the capture line with no line over it. Work kept for
           later and work finished are folded below, and are not open.

           FIRST OF THE LINES, because the record draws the counts too when nothing is late, and the nightly line is
           written for the first line a page draws (`leadBlockOf` in `packages/record/src/headlines.ts`): asked of the
           counts at nought, the model would say "nothing is open" in its own words, drawn over this sentence saying it
           again. This one has no figure, so no line is asked of it. */
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'open-tasks', is: 0 },
        body: 'Nothing is open right now',
      },
      {
        /* THE PAGE'S ONE LINE, drawn in the title's tile. A clause whose figure is nought is left out by the writer
           (`leadOf`), so a quiet week says only what there is; a record with nothing open says nothing at all. Late is
           yours (`tasks-late-yours`), the count of the Late band under it, so the line and the band never disagree; an
           agent's late task is counted where it is drawn, with the agent or waiting on you.

           COUNTS AND NOT A TASK, SINCE work 1.15.0 (the design review's fix 8): "1 late, 3 waiting on you". From 1.13.0
           it named the task late longest ("Turn auto-renew back on for kilnfonts.example is late"), which read like a
           task and not like the page's line; the task is the first of the Late strip under it. With nothing late the
           line says so in as many words, so the two lines read alike. */
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'tasks-late-yours', gt: 0 },
        /* AND FIRST, THE QUESTIONS ABOUT TASKS, SINCE work 1.19.0: "2 questions for you, 1 late". Decide's
           badge counted them while this line said only the tasks, so the page read quiet with calls waiting on its own
           work. `questions-open-in:tasks` counts what Questions for you below draws, and at nought the clause goes. Not
           "wait on you", which would read beside the tasks waiting on you as the same thing said twice. */
        body: '{{questions-open-in:tasks}} question(s) for you, {{tasks-late-yours}} late, {{tasks-waiting}} waiting on you',
      },
      {
        /* NOTHING LATE AND NOT HOW MANY ARE OPEN, SINCE work 1.15.0: Open is the first figure of the strip under the
           capture line, and a tile does not say again what the line says. */
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'tasks-late-yours', is: 0 },
        /* THE QUESTIONS SECOND HERE, SINCE work 1.19.0: first they would put "Nothing" in the middle of the line, and
           the writer leaves a clause at nought out and never mends a capital. */
        /* SAID OF WHAT IT COUNTS (Q6 of 29 October): "Nothing late" stood beside Today's "Late and urgent 6", which
           counts an agent's late work and late money too. This line counts your own tasks, and says so. */
        body: 'None of your tasks is late, {{questions-open-in:tasks}} question(s) for you, {{tasks-waiting}} waiting on you',
      },
      {
        /* CAPTURE FIRST, before any figure, because a task that is not written down the moment it comes to mind is the
           one carried in your head. The heading is the field's prompt (`render/src/capture.ts`), and a task added here
           is To do with no day, so it lands under Not this week until somebody gives it one.

           ALONE AND FIRST AFTER THE SENTENCE, ON NO SURFACE BUT ITS OWN, SINCE work 1.16.0, AND IT STAYS SO: that is how
           the page says the line is its header's, as Today's capture is. A block put before it, or a boxed section
           round it, makes it a tile again. */
        kind: 'capture',
        heading: 'What needs doing?',
        icon: 'plus',
        span: 12,
        register: 'tasks',
      },
      {
        /* WHAT A RULE OR AN AGENT ASKED ABOUT A TASK, SINCE work 1.19.0, answered here, three at a time, one
           tile each, and the rest in Decide: the questions whose row is on tasks (`list is tasks`), counted by
           `questions-open-in:tasks`, and drawn only while that is above nought, so a quiet day has no band for it.
           QUESTIONS FOR YOU AND NOT WAITING ON YOU, which is the band of tasks handed back to a person further down.

           THE WHOLE WIDTH UNDER LATE, the sixth tile before the fold at 1440: Late, this, At a glance, then This week,
           With an agent and Waiting on you a third each. The capture line is the header's and no tile. */
        kind: 'queue',
        heading: 'Questions for you',
        icon: 'ask',
        span: 12,
        source: 'governance.open',
        where: 'list is tasks',
        limit: 3,
        tiles: true,
        when: { metric: 'questions-open-in:tasks', gt: 0 },
      },
      {
        /* FOUR BANDS IN HIS ORDER, SINCE the screens scope of 24 October: Late, Waiting on you, This week, With an
           agent, half the row each, so a phone reads them in that order. Late and this week was one list, and the late
           task sat among the week's. Each is a `todo`, SO THAT A TASK CAN BE FINISHED WHERE IT IS READ; its second line
           is when it is due, then its project. */
        kind: 'todo',
        heading: 'Late',
        icon: 'calendar-days',
        span: 6,
        source: 'register.tasks',
        where: `${YOURS}, by before today`,
        columns: [{ field: 'what' }, { field: 'by' }, { field: 'thing' }],
        order: [
          { field: 'by', dir: 'asc' },
          { field: 'priority', dir: 'asc' },
        ],
        limit: 8,
        when: { metric: 'tasks-late-yours', gt: 0 },
      },
      {
        /* WHAT WAITS ON A PERSON, with the note as the reason it waits and, under it, when the task falls due and its
           project. `todo` is `cells: 4, optional: 2` in `braindog-render`'s `kinds.ts`, and both renderers draw the third
           and fourth cells as one quiet line joined by a dot (`src/todo.ts`, held by `test/waiting-due.test.ts`). SECOND,
           after Late. */
        kind: 'todo',
        heading: 'Waiting on you',
        icon: 'hourglass',
        span: 6,
        source: 'register.tasks',
        where: WAITING,
        columns: [{ field: 'what' }, { field: 'note' }, { field: 'by' }, { field: 'thing' }],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 8,
        when: { metric: 'tasks-waiting', gt: 0 },
      },
      {
        /* YOURS FROM TODAY TO A WEEK OUT, what `tasks-this-week-yours` counts. NAMED YOUR WORK THIS WEEK (finish F51):
           "This week 2" stood beside Projects' "This week 5" and Timeline's "6 due in 7 days", which count what agents
           hold and what waits on you too. This band is what is left once Waiting on you and With an agent take theirs,
           so its name says it is yours. Today's tile of the same rows has the same name. THE KEY IT HAD as "This week",
           so a look that placed it still finds it. */
        kind: 'todo',
        key: 'k1e53uhc',
        heading: 'Your work this week',
        icon: 'calendar-days',
        span: 6,
        source: 'register.tasks',
        where: `${YOURS}, by after yesterday, by before +8d`,
        columns: [{ field: 'what' }, { field: 'by' }, { field: 'thing' }],
        order: [
          { field: 'by', dir: 'asc' },
          { field: 'priority', dir: 'asc' },
        ],
        limit: 8,
        when: { metric: 'tasks-this-week-yours', gt: 0 },
      },
      {
        /* WHAT AGENTS HOLD NOW, with the dot on the one an agent is on this minute. Not what they handed back: that
           waits on you. LAST OF THE FOUR. */
        kind: 'todo',
        heading: 'With an agent',
        icon: 'session',
        span: 6,
        source: 'register.tasks',
        where: `${IN_HAND}, agent is set`,
        /* THE AGENT FIRST, THEN WHEN AND WHICH PROJECT, so every task on the page says its project. */
        columns: [{ field: 'what' }, { field: 'agent' }, { field: 'by' }, { field: 'thing' }],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 8,
        working: true,
        when: { metric: 'tasks-with-agents', gt: 0 },
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
        /* A FOLD SAYS HOW MANY IT HOLDS (audit 6f AF20): over its figure's own clauses, so its heading counts what is under
           it, and a closed card with Show and no number never hides whether there is anything there. */
        source: 'register.tasks',
        where: WORK_METRICS['tasks-not-this-week']!.where,
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
      },
      {
        /* The project is its detail, because there is no day to show. NEWEST FIRST (finish F8): it was ordered by the day
           its tasks do not have, so the order was whatever the list kept, and what was just written down with no day is
           what a person looks for here. */
        kind: 'todo',
        heading: 'No due day',
        icon: 'circle-dashed',
        span: 12,
        source: 'register.tasks',
        where: `${YOURS}, by is empty`,
        columns: [{ field: 'what' }, { field: 'thing' }],
        order: [{ field: 'created_at', dir: 'desc' }],
        limit: 8,
        when: { metric: 'tasks-undated-yours', gt: 0 },
      },
      {
        /* BY ITS DAY WHERE IT HAS ONE, THEN NEWEST FIRST (finish Z3): a backlog task rarely has a due day, so ordered by
           that alone the list was in whatever order the record kept, as No due day was. An empty day sorts last. */
        kind: 'todo',
        heading: 'Later',
        icon: 'archive',
        span: 12,
        source: 'register.tasks',
        where: 'state is backlog',
        columns: [{ field: 'what' }, { field: 'thing' }],
        order: [
          { field: 'by', dir: 'asc' },
          { field: 'created_at', dir: 'desc' },
        ],
        limit: 8,
        when: { metric: 'tasks-later', gt: 0 },
      },
      {
        /* OPEN WORK WITH NO PROJECT, FOLDED SHUT, SINCE work 1.19.0: a fold of its own, so the tile is below
           the fold whatever else the page draws, and a tap away where a project can be given. Not under Not this week,
           which is drawn only while something is further off, and a task with no project may be due today. */
        kind: 'section',
        heading: 'Needs a project',
        icon: 'inbox',
        span: 12,
        fold: true,
        source: 'register.tasks',
        where: WITH_NO_PROJECT.where,
        when: { metric: 'tasks-no-project', gt: 0 },
      },
      { ...WITH_NO_PROJECT },
      {
        /* WHAT HAS NOT MOVED IN THREE MONTHS, FOLDED SHUT, SINCE work 1.19.0: open work last written more than 90
           days ago, the longest untouched first, a tap away to be done, dated or dropped. NO FIGURE
           GATES IT: a block with nothing in it is not drawn, and a heading over nothing goes with it (`emptyHidden`). */
        kind: 'section',
        heading: 'Not moved in three months',
        icon: 'hourglass',
        span: 12,
        fold: true,
        source: 'register.tasks',
        where: STALE,
      },
      {
        /* A TABLE AND NOT A LIST THAT TICKS, as With no project is: a task here is in its band above too, and a list a
           person ticks down holds a task once (`work-overview-twice.test.ts`). The longest untouched first. */
        kind: 'table',
        heading: 'Untouched for 90 days',
        icon: 'hourglass',
        span: 12,
        source: 'register.tasks',
        where: STALE,
        columns: [DESCRIPTION, { field: 'by', label: 'Due', width: '13ch', align: 'end' }],
        order: [{ field: 'updated_at', dir: 'asc' }],
        limit: 8,
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
        source: 'register.tasks',
        where: 'state is done, done_on after -8d',
        when: { metric: 'tasks-done-7d', gt: 0 },
      },
      /* NO HOW FAST IT MOVES SINCE work 1.15.0: Done this week, with its last seven nights, is the strip's third figure. */
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
      },
    ],
  },

  /**
   * THE BOARD AND THE LIST, for moving work along and seeing all of it.
   *
   * AND THE SAME ONE SENTENCE FOR AN EMPTY LIST AS WORK'S, SINCE work 1.14.0: the line says nothing is open, and the
   * board and the list say nothing of their own, since a block with nothing in it is not drawn.
   *
   * NO HEADING OVER THE BOARD, SINCE work 1.16.0 (the second design review's fix 2). It read "By status" under a page
   * called Board whose every column is headed by its status, so the tile said what it was three times.
   *
   * AND NO LIST UNDER IT: Everything open drew every open task a second time, with
   * a count of its own beside the line's, and on a phone it ran on under a board already fifteen thousand pixels long.
   */
  'work-board': {
    page: 'work-board',
    title: 'Board',
    nav: { section: 'Work', order: 20 },
    icon: 'board',
    requires: ['register.tasks'],
    pack: 'work',
    blocks: [
      {
        /* WITH NOTHING OPEN, SINCE work 1.14.0, the counts under it have no clause left to say. First, as on Work, so the
           nightly line is never asked of the counts at nought and drawn over this one. */
        kind: 'note',
        lead: true,
        span: 12,
        when: { metric: 'open-tasks', is: 0 },
        body: 'Nothing is open right now',
      },
      {
        /* THE BOARD'S ONE LINE, since work 1.10.0: how much is on it, and the two columns that need somebody. WHAT IS
           KEPT FOR LATER IS SAID TOO: Later is a column of this board, and the line
           counted only Open, so the columns that are not Done added up to more than it said. */
        kind: 'note',
        lead: true,
        span: 12,
        body: '{{open-tasks}} open task(s), {{tasks-later}} for later, {{tasks-waiting}} to check or blocked, {{tasks-with-agents}} with an agent',
      },
      {
        /* ADD IN PLACE, SINCE work 1.19.0: the same line as Work's, first after the sentence and before the board, so a
           task thought of while moving cards is written where the cards are. It is To do with no day, so it lands in
           the board's To do column. Same prompt as Work's, because it is the same question. */
        kind: 'capture',
        heading: 'What needs doing?',
        icon: 'plus',
        span: 12,
        register: 'tasks',
      },
      {
        kind: 'board',
        span: 12,
        /* A CARD SAYS WHEN IT IS DUE AND WHO HOLDS IT, SINCE work 1.17.0, where it named its project: a board is read
           for what is next and whose it is, and the project is on the task's own page. The day comes before the
           holder, because who holds a task is a link that goes on a record without People (`LINKS` in
           `packs/first-party.ts`), and the day must not move when it does. */
        columns: [{ field: 'state' }, { field: 'what' }, { field: 'by' }, { field: 'owner' }],
        source: 'register.tasks',
        where: 'state is not dropped',
        /* EACH COLUMN BY TIER, THEN BY DUE DAY. A board keeps its rows in the order they are read within each column
           (`render/src/board.ts`), so the order the record reads them in is the order a column draws. BY STATE FIRST:
          read by tier alone, finished urgent work came before open work of a lower
           tier, the read stopped at fifty inside Open, and the line said 36 open over columns holding 34. The record
           sorts an enum by its declared order, so every task in play is read before any done one, and Done takes what
           room is left. */
        order: [{ field: 'state', dir: 'asc' }, ...TIER_THEN_DUE],
        limit: 100,
        /* AND WHICH CARDS AN AGENT IS ON RIGHT NOW. This is the page that answers "what are my agents
           doing", and until now it answered it only in a strip beside the board: a card being worked
           on looked exactly like one nobody had opened in a week. */
        working: true,
      },
    ],
  },

  /**
   * THE TIMELINE, SINCE work 1.19.0: the dated tasks on one time axis, an effort as a window and a due day as a line, and
   * either dragged to a new date. It was the Roadmap add-on, one page over Work's own list, and is a page of Work now. THE
   * PAGE ID IS THE ADD-ON'S (`roadmap`), so a record holding Roadmap is handed the page, its changes and where it is
   * pinned (`packs/roadmap`, `hands`), and the add-on retires.
   */
  roadmap: {
    page: 'roadmap',
    title: 'Timeline',
    nav: { section: 'Work', order: 30 },
    icon: 'calendar',
    requires: ['register.tasks'],
    pack: 'work',
    blocks: [
      {
        /* THE PAGE'S LINE IS WHAT IS LATE AND WHAT IS NEAR on the axis under it, not what the page is for. A clause whose
           figure is nought is left out (`leadOf`), so a quiet axis says only what there is. */
        kind: 'note',
        lead: true,
        span: 12,
        body: '{{tasks-overdue}} past their date, {{tasks-due-7d}} due in 7 days',
      },
      {
        /* TASKS BY DUE DAY, NOT IN PLAY (finish F52): "In play 15" counted tasks where in play means projects everywhere
           else, the sidebar's and Projects' 3. THE KEY IT HAD as "In play", so a look that placed it still finds it. */
        kind: 'roadmap',
        key: 'k0bndy4b',
        heading: 'Tasks by due day',
        span: 12,
        source: 'register.tasks',
        where: 'by is set, state is not done or dropped',
        columns: [
          { field: 'what', label: 'What' },
          { field: 'by', label: 'Due' },
          { field: 'effort', label: 'Effort' },
        ],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 200,
        /* WHAT WILL STAND HERE AND HOW IT GETS HERE, SINCE work 1.22.0 (the lists review, L37): an axis with nothing on it
           said only what was missing. */
        empty: 'Each open task with a due day stands here on its day. Give a task a due day and it joins the line.',
      },
    ],
  },
};

/**
 * THE WORDS A PERSON USES FOR WHAT THIS PACK KEEPS, which the first run listens for in the sentence it is told
 * (`apps/web/src/lib/shape.ts`), carried in its manifest as `signals` (`firstPartyManifest`). Kept with the pack's own
 * declarations, as an add-on's are in its file: they are its words, and a word one of them shares with an add-on's id
 * ("subscriptions") is the pack's to say and not the code's that reads it. Lower-case words and short phrases, each
 * inflection written out, because the reader matches whole words and never stems.
 */
export const WORK_SIGNALS: readonly string[] = ['task', 'tasks', 'todo', 'todos', 'to-do', 'to-dos', 'deadline', 'deadlines', 'sprint', 'sprints', 'backlog', 'roadmap', 'milestone', 'milestones'];

/**
 * THE WIDGETS WORK BRINGS TO TODAY (SHL-A22, 30 October), in the shape an add-on's manifest `widgets` takes, joined to
 * the core's at read time. They were the core's own catalogue's until today, which named this module's lists by id.
 * Project pulse's blank is a project, its choices the projects in play, the one moved last first.
 */
export const WORK_WIDGETS = {
  pack: 'work',
  title: 'Work',
  widgets: [
    {
      id: 'next-up',
      alike: ['work-due'],
      title: 'Next up',
      says: 'Your tasks due in the next seven days, soonest first. Tick one where it is.',
      group: 'work',
      for: 'both',
      icon: 'check',
      block: {
        kind: 'todo',
        heading: 'Next up',
        icon: 'check',
        source: 'register.tasks',
        /* TODAY'S OWN THIS WEEK, clause for clause (`work-due` in the app's `default-home.ts`), since the gallery says Today
           shows this as Your work this week (`alike`): yours, open, from today to a week out. It read every task not done
           before a week out, late and agents' ones too, and listed 7 beside Today's 2 (audit of 31 October, A35). */
        where: `${YOURS}, by after yesterday, by before +8d`,
        columns: [{ field: 'what' }, { field: 'by' }],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 8,
        empty: 'Nothing due this week.',
      },
      sizes: ['small', 'wide', 'tall', 'large', 'full'],
      size: 'tall',
      needs: { lists: ['tasks'] },
      rows: { title: 'what', day: 'by' },
      example: { rows: [{ title: 'Send the specimen proofs', meta: 'Today' }, { title: 'Book the accountant', meta: '31 Oct' }] },
      words: ['tasks', 'todo', 'to do', 'due'],
      asked: [{ match: "\\b(tasks?|to ?do|what('s| is) (due|next)|due this week)\\b", about: 'what is due' }],
      leads: ['work', 'work-board'],
    },
    {
      id: 'project-pulse',
      title: 'Project pulse',
      says: 'One project: its open work, what is due soon and when it was last worked on.',
      group: 'projects',
      for: 'business',
      icon: 'briefcase',
      block: {
        kind: 'stat',
        heading: '{{project}}',
        icon: 'briefcase',
        cells: [
          { metric: 'project-open:{{project}}', label: 'Open' },
          { metric: 'project-due-soon:{{project}}', label: 'Due soon' },
          { metric: 'project-done-7d:{{project}}', label: 'Done this week' },
        ],
      },
      blanks: [{ id: 'project', asks: 'Which project?', from: { source: 'register.things', field: 'name', where: 'lane is not parked or retired', order: [{ field: 'updated_at', dir: 'desc' }] } }],
      sizes: ['small', 'wide', 'tall', 'large'],
      size: 'wide',
      needs: { lists: ['things', 'tasks'], figures: ['project-open'] },
      example: { figures: [{ label: 'Open', said: '12' }, { label: 'Due soon', said: '3' }] },
      words: ['project', 'pulse', 'status'],
    },
  ],
};
