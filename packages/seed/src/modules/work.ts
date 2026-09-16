/**
 * Work: tasks, the threads they belong to, how each thread is going, and the agent runs working on them.
 *
 * One module of the sample record, split out of `index.ts` so each first-party module's registers, rows,
 * figures and pages sit in one file. `index.ts` composes them and keeps every export it had.
 */

import { day, days, hours, stamp, type Fields, type SeedPage, type SeedRegister } from './base.ts';

/* ── tasks ────────────────────────────────────────────────────────────────── */

export const TASKS: Fields[] = [
  { what: 'Chase Halden on 2026-041', state: 'open', thing: 2, by: day(1), effort: days(0.2), note: '' },
  { what: 'Decide the licensing tier split', state: 'blocked', thing: 1, by: day(6), effort: days(1), note: 'Waiting on SG31.' },
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
  { what: 'Year-end pack for Pell & Vine', state: 'open', thing: null, track: 5, by: day(23), effort: days(1.5), note: '' },
  { what: 'Retire the Tallow staging box', state: 'open', thing: 4, by: day(30), effort: days(0.5), note: '' },
  { what: 'Variable axis QA on the new cut', state: 'doing', thing: 1, track: 1, by: day(3), effort: days(3), note: '' },
  { what: 'Rotate the Fenwick deploy key', state: 'open', thing: 1, track: 2, by: day(12), effort: days(0.2), note: '' },
  { what: 'Write the specimen page', state: 'open', thing: 1, track: 3, by: day(18), effort: days(2), note: '' },
  { what: 'Invoice Ravensworth for September', state: 'open', thing: 2, by: day(27), effort: days(0.2), note: '' },
  { what: 'Kerning pass, lowercase', state: 'done', thing: 1, track: 1, by: day(-11), effort: days(4), note: '' },
  { what: 'Set up the newsletter archive', state: 'done', thing: 3, track: 4, by: day(-6), effort: days(1), note: '' },
  { what: 'Cancel the Hobnail plan', state: 'done', thing: 4, by: day(-58), effort: days(0.2), note: '' },
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
    holds: 'work with a state and a date, so nothing is carried in your head',
    title: 'what',
    mobile: ['what', 'thing', 'state'],
    state: 'state',
    done: ['done', 'dropped'],
    pack: 'work',
    fields: [
      { id: 'what', label: 'Description', type: 'text', required: true, search: true },
      { id: 'state', label: 'Status', type: 'enum', values: ['open', 'doing', 'blocked', 'done', 'dropped'], index: true, required: true },
      /* A task on no project is global. */
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

export const WORK_PAGES: Record<string, SeedPage> = {

  work: {
    page: 'work',
    title: 'Board',
    nav: { section: 'Work', order: 10 },
    icon: 'board',
    requires: ['register.tasks'],
    pack: 'work',
    blocks: [
      {
        kind: 'board',
        /* `By status`, for the same reason as the column two blocks down: the field this groups on
           is headed Status everywhere it is drawn. */
        heading: 'By status',
        span: 12,
        columns: [{ field: 'state' }, { field: 'what' }, { field: 'thing' }],
        source: 'register.tasks',
        empty: 'Nothing open.',
      },
      {
        kind: 'steps',
        heading: 'What has to happen first',
        /* Twelve, because there is nothing beside it. A five-twelfth block between two full-width
           ones is not a narrow card, it is a row that is seven twelfths empty. */
        span: 12,
        columns: [{ field: 'what' }, { field: 'by' }, { field: 'thing' }],
        source: 'register.tasks',
        where: 'state is open',
        order: [{ field: 'by', dir: 'asc' }],
        limit: 5,
        empty: 'Nothing waiting.',
      },
      {
        kind: 'table',
        heading: 'Everything open',
        span: 12,
        source: 'register.tasks',
        /* The heading says open. It used to be the only place that said so — the filter was keyed on
           register-and-kind inside the reader, and a heading is not evaluated. */
        where: 'state is not done or dropped',
        columns: [
          { field: 'what', label: 'Description', width: 'minmax(20ch,1fr)' },
          /* `Project` AND `Status`, AND THEY WERE `Thing` AND `State`. Every one of the five
             registers that carries a `thing` ref labels it Project and `things` labels its own
             lane Status, and this table — authored by hand rather than derived, so no rename
             reaches it — was the last place in the record saying either of the old words. A
             column header a person reads beside four others that say something else is the same
             defect as two names for one screen, one row further down. */
          { field: 'thing', label: 'Project', width: 'minmax(10ch,16ch)' },
          { field: 'state', label: 'Status', width: '12ch' },
          { field: 'by', label: 'Due', width: '15ch', align: 'end' },
        ],
        order: [{ field: 'by', dir: 'asc' }],
        empty: 'Nothing open.',
        limit: 50,
      },
    ],
  },
};
