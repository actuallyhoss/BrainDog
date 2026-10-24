/**
 * A seed grown to the size of his record, for the bench and for profiling: nobody's rows, cloned from the seed's own.
 *
 * HIS SHAPE ON 24 OCT 2026 (`record_index` on his record, read only): 30 projects, 910 agent runs, 38 skills, 48 tools,
 * 176 keys, 59 tasks, 321 ledger rows, 2,527 numbers, 35 questions waiting and about 250 answered. The seed has a handful of each, so a
 * cost that grows with the record never shows on it. `growSeed` clones each list's seed rows up to those counts, a run
 * at a time spread over the last sixty days, most of them finished and a few still open, so the reads that walk runs,
 * skills and projects walk as many as his.
 *
 * In memory or on a file the caller names; never his record.
 */
import { KERNEL_WRITTEN } from '../../packages/kernel/src/index.ts';

export const HIS = { things: 30, session: 910, skills: 38, tools: 48, credentials: 176, tasks: 59, transactions: 321, datapoints: 2527, questions: 35, answered: 250 };

const DAY = 86_400_000;

/** The seed's rows of one list, as written, to clone from. */
function templates(kernel, register) {
  const out = [];
  for (let i = 1; i <= 400 && out.length < kernel.count(register); i++) {
    const row = kernel.get(`${register}#${i}`);
    if (row && !row.deleted) out.push(row.fields);
  }
  return out;
}

/** The fields a clone keeps: the template's, with its name made its own, and nothing the kernel writes. */
function clone(fields, n, nameKey) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined && !KERNEL_WRITTEN.includes(k)) out[k] = v;
  if (nameKey && typeof out[nameKey] === 'string') out[nameKey] = `${out[nameKey]}-${n}`.replace(/\s/gu, '-').toLowerCase().slice(0, 60);
  return out;
}

const NAME = { things: 'name', skills: 'name', tools: 'name', credentials: 'label', tasks: 'what' };

/**
 * Write one clone. A field the record computes comes back on a read but is refused on a write (`FIELD_UNKNOWN` at it),
 * so it is dropped and the write tried again.
 */
function write(kernel, register, fields, opts, at) {
  for (let tries = 0; tries < 8; tries++) {
    const out = kernel.backdate(at, () => kernel.create(register, fields, opts));
    if (out.ok) return;
    const field = out.refusal?.at;
    if (out.refusal?.code !== 'FIELD_UNKNOWN' || typeof field !== 'string' || !(field in fields)) throw new Error(`grow ${register}: ${out.refusal?.code} ${out.refusal?.fix}`);
    delete fields[field];
  }
  throw new Error(`grow ${register}: too many fields refused`);
}

/** Grow the seeded record to `shape` (his, by default). Answers the counts it reached. */
export function growSeed(kernel, shape = HIS, { actor = 'p_seed', now = Date.now() } = {}) {
  const reached = {};
  const things = kernel.count('things');
  for (const register of ['things', 'skills', 'tools', 'credentials', 'tasks', 'transactions', 'datapoints']) {
    const want = shape[register] ?? 0;
    const from = templates(kernel, register);
    if (from.length === 0) continue;
    for (let n = kernel.count(register); n < want; n++) {
      const fields = clone(from[n % from.length], n, register === 'things' ? 'name' : NAME[register]);
      if (register === 'things') fields.name = `Project ${n + 1}`;
      if (register === 'tasks') fields.what = `Task ${n + 1}: ${String(from[n % from.length].what ?? 'work')}`.slice(0, 120);
      /* SPREAD OVER EVERY PROJECT, as his are, so a read per project walks thirty. */
      for (const key of ['project', 'thing']) if (typeof fields[key] === 'string' && fields[key].startsWith('things#')) fields[key] = `things#${1 + (n % Math.max(things, shape.things ?? things))}`;
      write(kernel, register, fields, { actor }, now - (n % 60) * DAY);
    }
    reached[register] = kernel.count(register);
  }
  /* RUNS: most finished, one in thirty still going, each on a project, a repo and a host of its own. */
  const runs = templates(kernel, 'session');
  for (let n = kernel.count('session'); n < (shape.session ?? 0); n++) {
    const base = runs[n % runs.length];
    const ago = (n % 60) * DAY + (n % 24) * 3_600_000;
    const open = n % 30 === 0;
    const patch = { doing: `${String(base.doing ?? 'Working')} (${n})`, agent: base.agent ?? 'claude', state: open ? 'active' : 'done', repo: `repo-${n % 30}`, host: `host-${n % 4}` };
    const stamp = { started: new Date(now - ago).toISOString(), last_seen: new Date(now - ago + 3_600_000).toISOString(), project: `things#${1 + (n % (shape.things ?? 30))}` };
    write(kernel, 'session', patch, { actor, stamp }, now - ago);
  }
  reached.session = kernel.count('session');
  /* QUESTIONS, AS HIS ARE: most of his are a run asking to add a task (`rowset`), filed by the run (`S<n>`), and about
     two hundred and fifty were answered before the ones waiting. Half the answered ones are options. */
  /* AND A FEW WAITING ARE A SCRIPT'S BACKFILL, as his are (the kpi backfill, the book from account): hundreds of rows at
     once, each with its money, so one question's card is a large part of a page of the queue. */
  const ledger = templates(kernel, 'transactions').map((f) => clone(f, 0));
  const backfill = (n) => Array.from({ length: 200 }, (_, i) => ({ ...ledger[i % ledger.length], what: `Backfilled ${n}.${i}` }));
  const ask = (n, open) => {
    const run = `S${1 + ((n * 7) % kernel.count('session'))}`;
    const rowset = n % 2 === 0 || open;
    const big = open && n % 6 === 0;
    const filed = kernel.propose(
      big
        ? { question: `Add the ledger backfill ${n + 1}, 200 rows?`, body_kind: 'rowset', body: { register: 'transactions', rows: backfill(n) } }
        : rowset
        ? { question: `Add task ${n + 1} for project ${1 + (n % 30)} to Tasks?`, body_kind: 'rowset', body: { register: 'tasks', rows: [{ what: `Grown task ${n + 1}: follow up on the project`, state: 'open', thing: `things#${1 + (n % 30)}`, note: 'Built, not live. Done when it is live and checked.' }] } }
        : { question: `Which way for project ${1 + (n % 30)}, option A or B (${n + 1})?`, body_kind: 'options', body: { options: [{ id: 'a', label: 'Option A', because: 'It is the smaller change.' }, { id: 'b', label: 'Option B', because: 'It keeps the old path.' }] } },
      run,
    );
    if (!filed.ok) throw new Error(`grow questions: ${filed.refusal?.code} ${filed.refusal?.fix}`);
    if (open) return;
    const decided = kernel.decide(filed.value.id, { decide: { option: rowset ? 'accept' : 'a', reason: 'The smaller change.' } }, actor);
    if (!decided.ok) throw new Error(`grow decisions: ${decided.refusal?.code} ${decided.refusal?.fix}`);
  };
  for (let n = 0; n < (shape.answered ?? 0); n++) ask(n, false);
  for (let n = 0; n < (shape.questions ?? 0); n++) ask((shape.answered ?? 0) + n, true);
  reached.questions = shape.questions ?? 0;
  return reached;
}
