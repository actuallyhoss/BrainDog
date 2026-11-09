/**
 * WHICH LINES OF THE LOG THE BELL HOLDS (9 Nov, his words: "i get too many silly notifications ... i want really good stuff
 * only", and "all the match, extract, read should only show in audit but not as a real notification").
 *
 * The bell is what wants the person's attention; Activity keeps every line, and nothing here touches the log. A line is
 * read by who wrote it, what kind of line it is and which field it moves, never by its words, so a pack that ships a new
 * rule or script tomorrow is quiet the day it ships.
 *
 * IN THE BELL:
 *   - what another person did (the reader's own lines are left out by whoever asks, by their own id);
 *   - what an agent did that concerns the reader: a row it gave them or a comment naming them (`you`), a note or a
 *     comment it wrote on a row, a row it finished (moved into one of its list's `done` states), a row it deleted, a
 *     question it answered on their word, and its answer to something they told it (an instruction Done, Needs you,
 *     Declined or Expired);
 *   - what went wrong: a run of a rule, a script or a door that failed, was refused or was held (`pull` with such an
 *     `outcome`), and a copy of the record that could not be saved;
 *   - a notice something raised on purpose: a rule saying a bill is due, a key about to lapse, a door paused (`note`
 *     with no field, or `urgent`);
 *   - somebody joining from an invitation (`access.grant` written by the record itself).
 *
 * IN ACTIVITY ALONE:
 *   - a run that went through: "rule.meet-payees ran.", "“Read your Sentry projects…” ran and wrote 6 lines";
 *   - what rules, scripts and doors write as they work: rows arriving (mail, bank lines, which the bell already sums as
 *     "N things came in today"), matches, books filed, balances, a mail's Looked at, a project's Read time;
 *   - BrainDog keeping itself (`system`): an update, a sweep, a run written off;
 *   - an agent's run keeping its own row (`session`), and an agent's other edits;
 *   - a question asked (`suggest`, `propose`), which Needs you says, and the lines that only keep how a question or a
 *     decision went.
 *
 * PURE AND IMPORTING NOTHING, because the web's bell is in the shell's first chunk and reads it through
 * `@braindog/kernel/constants`. The list ids are written here and not imported: `SESSION` is `session.ts`'s and
 * `INSTRUCTIONS` is `instruction.ts`'s, and each of those reaches the migrations.
 */

/** The record's own list of runs (`SESSION`), whose rows an agent's run keeps as it works. */
const RUNS = 'session';
/** What he tells an agent from the app (`INSTRUCTIONS`), whose rows move as a run takes and answers one. */
const TOLD = 'instructions';

/** A line as far as the bell reads it. `register` absent is a line read before its row was looked up. */
export type BellShape = {
  actor: string;
  kind: string;
  target?: string | null;
  target_kind?: string | null;
  field?: string | null;
  to?: unknown;
  note?: string | null;
  /** The row's list, `null` for a line about no row, and absent where the caller has not read it yet. */
  register?: string | null;
  /** Whether the record says the line is about the reader (`assigned`, `mentioned`). */
  you?: string | null;
};

/** The answers a run gives what he told it, and the sweep's for one nobody took (`INSTRUCTION_STATES`). */
const TOLD_BACK: ReadonlySet<string> = new Set(['done', 'needs_you', 'declined', 'expired']);

/**
 * HOW A RUN THAT DID NOT GO THROUGH ENDED (`Metered['outcome']`): failed, refused by its host, or held at a limit.
 * `paused` is not one of them, because a pause always says so in a notice of its own (`pause` in `actions.ts`), and
 * the bell said it twice; `dropped` is a run nobody needs to hear about (cancelled, or its add-on turned off).
 */
export const RAN_BADLY: ReadonlySet<string> = new Set(['failed', 'refused', 'held']);

/** Whether a line is a run of a rule, a script or a door that did not go through. */
export const runFailed = (line: Pick<BellShape, 'kind' | 'to'>): boolean => {
  if (line.kind !== 'pull' || line.to === null || typeof line.to !== 'object' || Array.isArray(line.to)) return false;
  const outcome = (line.to as { outcome?: unknown }).outcome;
  return typeof outcome === 'string' && RAN_BADLY.has(outcome);
};

/** Who wrote a line: an agent (a run, a key, Slash), the record or a mechanism of it, or a person. */
export function writerOf(actor: string): 'agent' | 'machine' | 'person' {
  const who = actor.trim();
  if (/^S[1-9]\d*$/u.test(who) || who.startsWith('agent:') || who.startsWith('t_') || who === 'slash') return 'agent';
  /* `rule:`, `script:`, `ingest:`, `digest:`, `grant:`, `suggestion:`, `key_ask:`, `runner:` and the rest name a
     mechanism; `rule.` is the sample's spelling of a rule, and `p_seed` the sample's BrainDog. */
  if (who === 'system' || who === 'p_seed' || /^[a-z][a-z0-9_-]*:/u.test(who) || who.startsWith('rule.')) return 'machine';
  return 'person';
}

/** A copy of the record that could not be saved: an `export` whose note the record starts with `failed`. */
const copyFailed = (line: Pick<BellShape, 'kind' | 'note'>): boolean => line.kind === 'export' && /^failed\b/u.test(line.note ?? '');

/**
 * Whether a line is never the bell's, whatever row it is on and whoever it names: read off the line as the log keeps
 * it, before its row is looked up, so a walk of the log leaves the bulk of it (runs, and what rules, scripts and doors
 * write) without reading a row for it. `bellWorthy` asks this first.
 */
export function bellNever(line: BellShape): boolean {
  if (line.kind === 'suggest' || line.kind === 'propose') return true;
  if (line.kind === 'pull') return !runFailed(line);
  const who = writerOf(line.actor);
  if (who !== 'machine') return false;
  if (line.kind === 'note' || copyFailed(line)) return false;
  /* THE RECORD ITSELF LETS SOMEBODY IN FROM AN INVITATION, and its sweep expires what he told an agent. */
  if (line.actor === 'system') return line.kind !== 'access.grant' && line.kind !== 'state';
  return true;
}

/** A note that is a comment: what somebody wrote under a row, or a reply to one. */
const commented = (field: string | null): boolean => field === 'comment' || (field !== null && field.startsWith('reply:'));

/**
 * A note the bell holds: a comment, or a notice raised on purpose (no field, or `urgent`, `URGENT_NOTE` in `digest.ts`).
 * A note with any other field keeps how something went (a row kept private, a question handed on, where an answer came
 * from, a thing put back), and so does a note on a question or a decision. A question's own notice ("an agent asks you
 * something", signed by the question) is Needs you's.
 */
function noticed(line: BellShape): boolean {
  const field = line.field ?? null;
  if (commented(field)) return true;
  if (field !== null && field !== 'urgent') return false;
  if (line.target_kind === 'decision' || line.target_kind === 'suggestion') return false;
  return !line.actor.startsWith('suggestion:');
}

/**
 * WHETHER A LINE IS THE BELL'S. `doneOf` says the `done` states of a list, for an agent's move of a row; a list it says
 * nothing of keeps the move. A line whose `register` is absent is judged as far as it can be without its row, and
 * leans to keeping it.
 */
export function bellWorthy(line: BellShape, doneOf: (register: string) => readonly string[] | undefined = () => undefined): boolean {
  if (bellNever(line)) return false;
  const list = line.register;
  /* WHAT HE TOLD AN AGENT, by its answer and never by its delivery (sent, seen, taken, working). */
  if (list === TOLD) return line.kind === 'state' && typeof line.to === 'string' && TOLD_BACK.has(line.to);
  /* A RUN KEEPING ITS OWN ROW: where it is, what it is doing, its next step, that it went quiet or handed off. */
  if (list === RUNS) return false;
  if (line.kind === 'pull' || copyFailed(line)) return true;
  if (line.kind === 'note') return noticed(line);
  const who = writerOf(line.actor);
  if (who === 'machine') return line.kind === 'access.grant' || (list === undefined && line.kind === 'state');
  /* A ROW SOMEBODY GAVE THE READER, OR A COMMENT NAMING THEM. A rule or a script linking a row to their People row is
     not somebody giving them anything, which is why a mechanism stopped above. */
  if (line.you === 'assigned' || line.you === 'mentioned') return true;
  /* SOMEBODY ELSE ON THE RECORD, whatever they did, but read a key (`grant.read`, which the keychain's audit keeps). */
  if (who === 'person') return line.kind !== 'grant.read';
  /* AN AGENT: a note it wrote on a row (an `edit` naming no field is a note an older `log` wrote), a row it finished, a
     row it deleted, and a question it answered on his word. Its other edits are its work, and Activity holds them. */
  if (line.kind === 'edit') return (line.field ?? null) === null && typeof line.note === 'string' && line.note.trim() !== '' && list !== null;
  if (line.kind === 'state') {
    if (typeof list !== 'string') return list === undefined;
    const done = doneOf(list);
    return done === undefined || (typeof line.to === 'string' && done.includes(line.to));
  }
  return line.kind === 'delete' || line.kind === 'purge' || line.kind === 'decide';
}
