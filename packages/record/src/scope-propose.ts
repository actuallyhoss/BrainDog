/**
 * Where a row with no scope belongs, worked out from what the record already knows:
 * every key, tool and skill placed nowhere is given the one project its evidence names,
 * with that evidence said in words, so a person answers one question a list and not one press a row.
 *
 * THE FOUR VOTES, two strong and two weak:
 *   - strong, `needed`: every row that names this one (a tool whose "Keys it needs" names the key) is in one project.
 *   - strong, `used`: every run that used it in the last 90 days was in one project, and at least three did.
 *   - weak, `said`: its name, provider, "What it opens", note or "Came from" names exactly one live project, by its name,
 *     a repository it lists or a folder it lists (which is how a tool's config file says the project it came from).
 *   - weak, `made`: the run that added it was in a project.
 * A project is proposed on one strong vote, or two weak votes that agree, and NEVER WHEN ANY EVIDENCE NAMES ANOTHER
 * PROJECT: a key used in two projects is shared, and a wrong narrow hides it from every session outside the one chosen.
 * A row with no evidence proposes nothing and stays Everywhere, and that is right.
 *
 * IT ONLY NARROWS. A row that has a scope is never looked at, so nothing here can widen one: a widening happens only as
 * a person's answer. A row and project he declined (`'row:project'` in `declined`) is not proposed again.
 *
 * PURE: no clock, no database. The caller hands in the rows, the projects, and the evidence it already reads (who used
 * a key or a tool is `usedBy` in `methods/agents.ts`; the run that made a row is the log), windowed by `since`.
 *
 * NAMES, NEVER IDS. Every sentence says a project by its name and a row by its name; a repository or a folder is said
 * as "a repository of Oxbow.gg", never by its address or its path. Ids are only the handles in what is answered.
 */

/** The window the `used` vote reads, in days, as its sentence says it. The caller turns it into `since`. */
export const USED_WITHIN_DAYS = 90;

/** The fewest runs the `used` vote stands on: one or two runs in one project is a coincidence, not a home. */
export const USED_AT_LEAST = 3;

/** A name shorter than this is not looked for in a row's words: "AI" or "Go" would be found everywhere. */
const NAME_AT_LEAST = 3;

/** One of a row's own words the `said` vote reads: the field's label as a person sees it, and what it holds. */
export type ScopeText = { label: string; text: string };

/** A row that may be placed: its id, its list, its name, its project (`null` is Everywhere), and its words. */
export type ScopeRow = {
  id: string;
  list: string;
  name: string;
  project: string | null;
  texts?: readonly ScopeText[];
  /** A retired row is neither proposed for nor stranded: it is out of every session's way already. */
  retired?: boolean;
};

/** A project as the votes read it: its id, its name, the repositories and folders it lists, and whether it is finished. */
export type ScopeProject = {
  id: string;
  name: string;
  repos?: readonly string[];
  folders?: readonly string[];
  /** In a finished state (its list's `done`): never proposed, and what it holds is stranded. */
  finished?: boolean;
};

/** One use of a row by a run: which run, the project it was in (`null` for none), and when, when known. */
export type ScopeUse = { row: string; run: string; project: string | null; at?: string };

/** A row that names this one, such as a tool whose "Keys it needs" names the key: its name and its project. */
export type ScopeNamer = { row: string; by: string; project: string | null };

/** The run that added a row: the project it was in, and the agent's name when known. */
export type ScopeMade = { row: string; project: string | null; by?: string };

/** What the record already knows. Uses before `since` (an instant, compared as text) are not read. */
export type ScopeEvidence = {
  since?: string;
  uses?: readonly ScopeUse[];
  namers?: readonly ScopeNamer[];
  made?: readonly ScopeMade[];
};

/** One proposal: the row, its list, the project it belongs to, and each vote's reason as one plain sentence. */
export type ScopeProposal = { row: string; list: string; project: string; reasons: string[] };

/** A list as a sentence names its rows: its name ("Keys") and one of them ("key"). */
export type ScopeListName = { name: string; one: string };

/** One vote: its project, whether it is strong, and its sentence. */
type Vote = { project: string; strong: boolean; reason: string };

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Text a person typed, made comparable: lower case, every run of spaces one space. */
const plain = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether `needle` stands in `hay` as a word of its own: no letter or digit touches it on either side. */
function standsIn(hay: string, needle: string): boolean {
  if (needle === '') return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped(needle)}($|[^\\p{L}\\p{N}])`, 'u').test(hay);
}

/**
 * A repository as the `said` vote looks for it: its owner and name (`sam/bakery`), whatever address it was listed by
 * (`https://github.com/sam/bakery.git`, `git@github.com:sam/bakery`). `null` for one with no owner, which would be found
 * in any sentence holding the bare word.
 */
function repoOf(listed: string): string | null {
  const bare = plain(listed)
    .replace(/^[a-z+]+:\/\//, '')
    .replace(/^[^@/]+@([^:/]+):/, '$1/')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
  const parts = bare.split('/').filter((p) => p !== '');
  return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : null;
}

/** A folder as the `said` vote looks for it: lower case, no trailing slash; `null` for the root or a bare name. */
function folderOf(listed: string): string | null {
  const bare = plain(listed).replace(/\/+$/, '');
  return bare.includes('/') && bare.length > 1 ? bare : null;
}

/**
 * How one text (already `plain`) names one project, said as the end of a sentence, or `null` when it does not.
 *
 * A NAME FOUND IS TAKEN OUT OF THE TEXT (`rest`), and the longest names are looked for first, so "Oxbow.gg" is not
 * also read as a project called "Oxbow".
 */
function namedIn(hay: string, p: ScopeProject): { how: string; rest: string } | null {
  const name = plain(p.name);
  if (name.length >= NAME_AT_LEAST && standsIn(hay, name)) {
    const rest = hay.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escaped(name)}(?=$|[^\\p{L}\\p{N}])`, 'gu'), '$1 ');
    return { how: p.name, rest };
  }
  const as = (how: string) => ({ how, rest: hay });
  for (const r of p.repos ?? []) {
    const repo = repoOf(r);
    if (repo !== null && standsIn(hay, repo)) return as(`a repository of ${p.name}`);
  }
  for (const f of p.folders ?? []) {
    const folder = folderOf(f);
    if (folder !== null && new RegExp(`${escaped(folder)}($|[/\\s"'\`),;:])`).test(hay)) return as(`a folder of ${p.name}`);
  }
  return null;
}

/** Each row's evidence of one kind, by the row's id. */
function byRow<T extends { row: string }>(items: readonly T[] | undefined): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items ?? []) {
    const held = out.get(it.row);
    if (held) held.push(it);
    else out.set(it.row, [it]);
  }
  return out;
}

/**
 * Every project one row's evidence names, and the votes it makes.
 *
 * `rivals` IS EVERY PROJECT ANY EVIDENCE NAMES, a vote or not: four runs in Oxbow.gg and one in Driftwood make no `used`
 * vote, and they still say the key is shared. A project that is finished is no home and no rival, so evidence for it
 * is set aside; a project not handed in cannot be named, so it is a rival and never a proposal.
 */
function votesOf(
  row: ScopeRow,
  ev: { uses: ScopeUse[]; namers: ScopeNamer[]; made: ScopeMade[] },
  projects: ReadonlyMap<string, ScopeProject>,
): { votes: Vote[]; rivals: Set<string> } {
  const votes: Vote[] = [];
  const rivals = new Set<string>();
  const counts = (id: string): boolean => projects.get(id)?.finished !== true;
  const nameOf = (id: string): string => projects.get(id)?.name ?? '';

  /* needed: every row that names this one is in one project. One placed nowhere needs it everywhere, so no vote. */
  const placedNamers = ev.namers.filter((n) => n.project !== null && counts(n.project));
  for (const n of placedNamers) rivals.add(n.project as string);
  const namerHomes = new Set(placedNamers.map((n) => n.project as string));
  if (ev.namers.length > 0 && placedNamers.length === ev.namers.length && namerHomes.size === 1) {
    const home = [...namerHomes][0] as string;
    const names = [...new Set(ev.namers.map((n) => n.by))];
    const who = names.length === 1 ? names[0] : `${names[0]} and ${names.length - 1} more`;
    votes.push({ project: home, strong: true, reason: `Needed by ${who}${names.length === 1 ? '' : ', all'} in ${nameOf(home)}` });
  }

  /* used: every run in the window was in one project, and at least three did. */
  const runs = new Map<string, string | null>();
  for (const u of ev.uses) runs.set(u.run, u.project);
  const placedRuns = [...runs.values()].filter((p): p is string => p !== null && counts(p));
  for (const p of placedRuns) rivals.add(p);
  const runHomes = new Set(placedRuns);
  if (runs.size >= USED_AT_LEAST && placedRuns.length === runs.size && runHomes.size === 1) {
    const home = [...runHomes][0] as string;
    votes.push({ project: home, strong: true, reason: `Used by ${runs.size} runs in ${nameOf(home)} in the last ${USED_WITHIN_DAYS} days` });
  }

  /* said: its own words name exactly one live project. Two named is two rivals and no vote. */
  const texts: ScopeText[] = [{ label: '', text: row.name }, ...(row.texts ?? [])];
  const live = [...projects.values()].filter((p) => p.finished !== true).sort((a, b) => b.name.length - a.name.length);
  const said = new Map<string, string>();
  for (const t of texts) {
    let hay = plain(t.text);
    for (const p of live) {
      const found = namedIn(hay, p);
      if (found === null) continue;
      hay = found.rest;
      if (!said.has(p.id)) said.set(p.id, t.label === '' ? `Its name says ${found.how}` : `“${t.label}” names ${found.how}`);
    }
  }
  for (const id of said.keys()) rivals.add(id);
  if (said.size === 1) {
    const [home, reason] = [...said][0] as [string, string];
    votes.push({ project: home, strong: false, reason });
  }

  /* made: the run that added it was in a project. */
  const made = ev.made.find((m) => m.project !== null && counts(m.project));
  if (made) {
    const home = made.project as string;
    rivals.add(home);
    votes.push({ project: home, strong: false, reason: `Added by ${made.by?.trim() ? made.by.trim() : 'a run'} in ${nameOf(home)}` });
  }
  return { votes, rivals };
}

/**
 * The project each row with no scope belongs to, with its reasons, in the order the rows came. A row with a scope, a
 * retired row, a tie, too little evidence, and a pair in `declined` (`'row:project'`) propose nothing.
 */
export function proposalsFor(
  rows: readonly ScopeRow[],
  evidence: ScopeEvidence,
  projects: readonly ScopeProject[],
  declined: ReadonlySet<string> = new Set(),
): ScopeProposal[] {
  const known = new Map(projects.map((p) => [p.id, p]));
  const inWindow = (evidence.uses ?? []).filter((u) => evidence.since === undefined || u.at === undefined || u.at >= evidence.since);
  const uses = byRow(inWindow);
  const namers = byRow(evidence.namers);
  const made = byRow(evidence.made);
  const out: ScopeProposal[] = [];
  for (const row of rows) {
    if (row.project !== null || row.retired === true) continue;
    const { votes, rivals } = votesOf(row, { uses: uses.get(row.id) ?? [], namers: namers.get(row.id) ?? [], made: made.get(row.id) ?? [] }, known);
    if (rivals.size !== 1) continue;
    const home = [...rivals][0] as string;
    const place = known.get(home);
    if (!place || place.finished === true || declined.has(`${row.id}:${home}`)) continue;
    const strong = votes.filter((v) => v.strong);
    const weak = votes.filter((v) => !v.strong);
    if (strong.length === 0 && weak.length < 2) continue;
    out.push({ row: row.id, list: row.list, project: home, reasons: [...strong, ...weak].map((v) => v.reason) });
  }
  return out;
}

/** The rows placed in a project that is finished, which no session of a live project is handed any more. */
export function strandedFor(rows: readonly ScopeRow[], projects: readonly ScopeProject[]): ScopeRow[] {
  const finished = new Set(projects.filter((p) => p.finished === true).map((p) => p.id));
  return rows.filter((r) => r.project !== null && r.retired !== true && finished.has(r.project));
}

const countOf = (found: number | readonly unknown[]): number => (typeof found === 'number' ? found : found.length);

/** The question a list's proposals are asked in: "Move 52 keys to the projects they belong to?", empty at nought. */
export function proposalLine(found: number | readonly unknown[], list: ScopeListName): string {
  const n = countOf(found);
  if (n <= 0) return '';
  return n === 1
    ? `Move 1 ${list.one} to the project it belongs to?`
    : `Move ${n} ${list.name.toLowerCase()} to the projects they belong to?`;
}

/** The question a list's stranded rows are asked in: "3 keys belong to finished projects.", empty at nought. */
export function strandedLine(found: number | readonly unknown[], list: ScopeListName): string {
  const n = countOf(found);
  if (n <= 0) return '';
  return n === 1
    ? `1 ${list.one} belongs to a finished project.`
    : `${n} ${list.name.toLowerCase()} belong to finished projects.`;
}

/** The three answers to stranded rows. Keeping them for every project widens them, so only his answer may. */
export function strandedAnswers(found: number | readonly unknown[]): [string, string, string] {
  return countOf(found) === 1
    ? ['Retire it', 'Keep it for every project', 'Leave it']
    : ['Retire them', 'Keep them for every project', 'Leave them'];
}
