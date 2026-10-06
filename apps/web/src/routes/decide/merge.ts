/**
 * A MERGE, READ AS ONE QUESTION ABOUT WHO IS WHO (DIRECTION §38): every name the record thinks may be one person or one
 * organisation, where each was seen, and the three answers, Merge all, Keep apart and Pick one, each one press.
 *
 * TWO SHAPES, ONE CARD. The record asks today with a `rowset` that folds rows into the one it keeps (`kernel/people.ts`
 * `nearMatch`): a patch on each folded row naming the kept one in `merged_into` and deleting it, and at most one patch
 * on the kept row carrying over what the folded ones knew. Accept is Merge all, and Reject is Keep apart. A cluster
 * asked as a question of options (`loop/contract-17.md`, one question per cluster) names its answers `merge`, `apart`
 * and `pick:<who>`, one Pick a candidate, and carries `candidates`, each `{ at, name, seen }`, on its body.
 *
 * PICK ONE IS AN OPTION THE RECORD OFFERS, NEVER A SUBSET THIS SCREEN MAKES UP. A rowset's patch on the kept row carries
 * every folded row's handles and lines at once, so accepting it with one fold ticked would hand the kept person the
 * addresses of somebody who was kept apart. A rowset read off its patches is therefore answered whole. A Pick is drawn
 * only where the record names it: a question of options, or a rowset carrying the record's own cluster (`clusterOf`),
 * whose `pick:<row>` merges that one alone and leaves the carry for Merge all.
 *
 * NAMES, NEVER IDS. A candidate is said by its name, and a row the record would not give back is said as the person or
 * organisation already here, never as `people#3`. Where each was seen is the dated line the record keeps (`met`), said
 * without its day, and a line that is a file path is left out.
 *
 * PURE, with no imports, so a test reads it in Node.
 */

type Row = Record<string, unknown>;

/** What one press sends: the option, and the places of the rows it takes when it takes some. */
export type Press = { option: string; rows?: number[] };

/** One name in the cluster: what it is called, where it was seen, whether it is the one kept, and its own Pick. */
export type Candidate = { key: string; name: string; seen: string[]; kept: boolean; pick: Press | null };

/** A merge question as the card draws it. */
export type Merge = { candidates: Candidate[]; all: Press; apart: Press };

/** A row as the gate holds it: the list's rows the proposal names, read back by `heldBy`. */
type Held = { seq: number | null; fields: Row };

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** How many places a candidate's line names before it stops: where they were seen most lately. */
export const SEEN_MOST = 3;

/* A HANDLE THE RECORD SPEAKS (`people#3`, `SG12`) is not a name, and is never drawn as one. */
const SPOKEN = /^(?:[a-z_]+#\d+|[A-Z]+\d+)$/u;
/* NOR IS A FILE PATH a place a person was seen. */
const PATH = /^(?:\/|~\/|[A-Za-z]:\\)/u;

/**
 * WHERE ONE WAS SEEN, newest first and each once: the record's dated lines (`2026-09-30 · commit 4464966 in braindog`)
 * without their day, or the words a question of options carried.
 */
export function seenOf(v: unknown): string[] {
  const lines = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
  const out: string[] = [];
  for (const line of [...lines].reverse()) {
    if (typeof line !== 'string') continue;
    const said = line.replace(/^\d{4}-\d{2}-\d{2}\s*·\s*/u, '').trim();
    if (said === '' || PATH.test(said) || out.includes(said)) continue;
    out.push(said);
    if (out.length === SEEN_MOST) break;
  }
  return out;
}

/** A name to draw, or `''` for one that is empty or only the record's handle. */
const nameOf = (v: unknown): string => {
  const said = text(v);
  return said === '' || SPOKEN.test(said) ? '' : said;
};

/** The candidates a body carries in its own words, by the handle each is filed under. */
function carried(body: Row): Map<string, { name: string; seen: string[]; kept: boolean }> {
  const out = new Map<string, { name: string; seen: string[]; kept: boolean }>();
  const list = Array.isArray(body.candidates) ? body.candidates.filter(isRow) : [];
  list.forEach((c, n) => {
    const key = text(c.at) || text(c.row) || text(c.name) || String(n);
    out.set(key, { name: nameOf(c.name), seen: seenOf(c.seen ?? c.where), kept: c.kept === true });
  });
  return out;
}

/** A row the gate holds, by the handle a proposal names it with (`people#3`). */
function heldAt(held: readonly Held[], at: string): Held | undefined {
  const seq = /#(\d+)$/u.exec(at)?.[1];
  return seq === undefined ? undefined : held.find((r) => r.seq === Number(seq));
}

/* THE FIELD A FOLDED ROW NAMES THE KEPT ONE IN, which every list that merges declares by this part's name. */
const INTO = 'merged_into';

/**
 * A ROWSET THAT ONLY FOLDS: one or more rows each patched to name the same kept row and be deleted, and at most one
 * patch on the kept row. Anything else it writes makes it some other question, which the gate draws as it always has.
 */
function fromRowset(body: Row, held: readonly Held[], offered: ReadonlySet<string>): Merge | null {
  /* ITS ANSWERS: the cluster's own words where the record offers them, with a Pick on each one folded that it names one
     for, or else its two, Accept and Reject, which answer it whole. */
  const all = [...offered].find((k) => ALL.has(k)) ?? (offered.has('accept') ? 'accept' : undefined);
  const apart = [...offered].find((k) => APART.has(k)) ?? (offered.has('reject') ? 'reject' : undefined);
  if (all === undefined || apart === undefined) return null;
  const pickOf = (at: string): Press | null => {
    const key = [...offered].find((k) => PICK.exec(k)?.[1] === at);
    return key === undefined ? null : { option: key };
  };
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const folds: { at: string; n: number }[] = [];
  let into = '';
  let keepAt: number | null = null;
  for (const [n, r] of rows.entries()) {
    if (!isRow(r) || typeof r.at !== 'string' || !isRow(r.patch)) return null;
    const to = r.patch[INTO];
    if (typeof to === 'string' && to !== '') {
      if ((into !== '' && to !== into) || !('deleted_at' in r.patch)) return null;
      into = to;
      folds.push({ at: r.at, n });
    } else if (keepAt === null) keepAt = n;
    else return null;
  }
  if (into === '' || folds.length === 0) return null;
  /* THE ONE PATCH THAT IS NOT A FOLD MUST BE ON THE ROW KEPT. */
  if (keepAt !== null && (rows[keepAt] as Row).at !== into) return null;

  const own = carried(body);
  const said = (at: string): { name: string; seen: string[] } => {
    const c = own.get(at);
    const row = heldAt(held, at);
    const name = c?.name || nameOf(row?.fields.name) || nameOf(row?.fields.title);
    const seen = c && c.seen.length > 0 ? c.seen : seenOf(row?.fields.met);
    return { name, seen };
  };
  const candidates: Candidate[] = [
    { key: into, ...said(into), kept: true, pick: null },
    ...folds.map((f) => ({ key: f.at, ...said(f.at), kept: false, pick: pickOf(f.at) })),
  ];
  return { candidates, all: { option: all }, apart: { option: apart } };
}

/* AN OPTION'S ID FOR EACH ANSWER, as a question of options may spell it. */
const ALL = new Set(['merge', 'merge_all', 'merge-all']);
const APART = new Set(['apart', 'keep_apart', 'keep-apart', 'separate']);
const PICK = /^pick[:_-](.+)$/u;

/** A QUESTION OF OPTIONS OVER A CLUSTER: its candidates on the body, and Merge all and Keep apart among its options. */
function fromOptions(body: Row, offered: ReadonlySet<string>): Merge | null {
  const own = carried(body);
  if (own.size < 2) return null;
  const all = [...offered].find((k) => ALL.has(k));
  const apart = [...offered].find((k) => APART.has(k));
  if (all === undefined || apart === undefined) return null;
  const picks = new Map<string, string>();
  for (const k of offered) {
    const who = PICK.exec(k)?.[1];
    if (who !== undefined) picks.set(who, k);
  }
  const candidates = [...own].map(([key, c]): Candidate => {
    const pick = picks.get(key) ?? (c.name !== '' ? picks.get(c.name) : undefined);
    return { key, name: c.name, seen: c.seen, kept: c.kept, pick: pick === undefined ? null : { option: pick } };
  });
  return { candidates, all: { option: all }, apart: { option: apart } };
}

/**
 * THE RECORD'S OWN CLUSTER (`packages/record` `MergeCluster`), which it carries on a rowset it worked a merge out for:
 * every candidate by name with where each was seen, and its answers, `merge`, `apart` and one `pick:<row>` for each one
 * folded when more than one is. Read as a question of options reads, so each one folded gets its own Pick. `accept` and
 * `reject` still answer the question whole, from the keyboard.
 */
export function clusterOf(merge: unknown): { body: Row; offered: string[] } | null {
  if (!isRow(merge) || !Array.isArray(merge.candidates) || !Array.isArray(merge.options)) return null;
  const candidates = merge.candidates.filter(isRow).map((c) => ({ at: text(c.row), name: c.name, seen: c.seen, kept: c.keeps === true }));
  const offered = merge.options.filter(isRow).map((o) => text(o.option)).filter((k) => k !== '');
  return candidates.length < 2 || candidates.some((c) => c.at === '') ? null : { body: { candidates }, offered };
}

/**
 * THE MERGE A QUESTION ASKS, or `null` for a question that is not one. `offered` is the keys of the answers the question
 * has, so a press the record does not offer is never drawn; `held` is the rows of the list the proposal names, as the
 * gate read them back. A rowset that carries the record's own cluster (`merge`) is read by it, with the answers it
 * names, and one without is read off its patches.
 */
export function mergeOf(
  about: { kind: string; body: Row; merge?: unknown } | undefined,
  offered: readonly string[],
  held: readonly Held[] = [],
): Merge | null {
  if (!about || !isRow(about.body)) return null;
  const keys = new Set(offered);
  /* THE CLUSTER'S ANSWERS ONLY AS THE QUESTION OFFERS THEM, since a press is sent only for an answer the question has: a
     question still offering Accept and Reject draws the cluster's names and places over those two, answered whole. */
  const cluster = about.kind === 'rowset' ? clusterOf(about.merge) : null;
  if (cluster !== null && cluster.offered.some((k) => keys.has(k))) return fromOptions(cluster.body, keys);
  if (about.kind === 'rowset') return fromRowset(cluster === null ? about.body : { ...about.body, candidates: cluster.body.candidates }, held, keys);
  if (about.kind === 'options') return fromOptions(about.body, keys);
  return null;
}

/** The name the merged one keeps: the candidate kept, else the first one named. */
export const keptName = (m: Merge): string => m.candidates.find((c) => c.kept && c.name !== '')?.name ?? m.candidates.find((c) => c.name !== '')?.name ?? '';

/**
 * THE WORDS. Plain, and each names the person's own: a press says what it does, and the line it leaves says what was
 * done, with Undo beside it for six seconds before it goes to the record.
 */
export const words = {
  heading: 'Who is who',
  /** Over the names: how many there are, and that the record is not sure. */
  lead: (n: number) => (n === 2 ? 'These two may be the same.' : `These ${n.toLocaleString('en-GB')} may be the same.`),
  /** A candidate the record would not name back to this reader. */
  unnamed: 'The one already here',
  /** Beside the one the others fold into. */
  kept: 'Kept',
  /** Where one was seen, and nothing at all for one the record has no place for, rather than a line that says so. */
  seen: (where: readonly string[]) => (where.length === 0 ? '' : `Seen in ${where.join(', ')}`),
  mergeAll: 'Merge all',
  apart: 'Keep apart',
  /** A candidate's own press, and what a screen reader hears for it. */
  pick: 'Pick this one',
  pickNamed: (name: string) => `Pick ${name}`,
  /** The line each press leaves, with Undo. */
  mergedAll: (into: string) => (into === '' ? 'Merged them into one.' : `Merged them into ${into}.`),
  keptApart: 'Kept them apart. You will not be asked about them again.',
  picked: (name: string) => (name === '' ? 'Picked one.' : `Picked ${name}.`),
  /** A press undone. */
  undone: 'Undone. Nothing was changed.',
  /** An Undo pressed after the answer had already gone. */
  tooLate: 'That answer was already kept.',
} as const;
