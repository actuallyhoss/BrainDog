/**
 * Going back, proven on a real record.
 *
 *   node apps/worker/scripts/go-back.mjs <record>
 *
 * WHY. Going back is on for every Cloud record and had never been done on a real one. The path has had real faults: an
 * object that answered every door 500 until an eviction (`route.ts`, `recoverRestore`). So the whole of it is done here
 * through the doors a person uses, on the one record that exists to be broken, and it prints PASS or the step that
 * failed.
 *
 * WHAT IT DOES, IN ORDER. Three entries are written. A copy is taken. Three more are written and a second member is
 * invited. The record goes back to the copy. Then: it answers `boot` 200 within a minute; its log ends at the copy plus
 * one `restore.pitr`; the three later entries are gone; a `before-restore` copy is listed; both members' ways in answer.
 * Then it goes back again, to `before-restore`, and the three later entries and the invitation must have returned.
 *
 * IT RUNS ON `OPS_RECORD` AND NOTHING ELSE, and that is its only rule about which record: the name it is handed must be
 * the one production's `OPS_RECORD` names in `apps/worker/wrangler.jsonc`. Nobody's own record is named there, so
 * nobody's own record can be put back by this. While `OPS_RECORD` is empty it refuses every name.
 *
 * AS THE RECORD'S OWNER, WITH THE SESSION THE CANARY'S SIGN-IN KEPT. Copies and going back are a signed-in owner's and
 * no token opens them, so it reads the browser state `signin-live` left at `CANARY_SESSION` (`tools/canary/lib.mjs`)
 * and sends the cookie to the canary's own origin only. It mints nothing and prints nothing of the session.
 *
 * THE SECOND MEMBER IS AN INVITATION BY ADDRESS, which mails nothing and needs no second passkey. It is made after the
 * copy, so a record that truly went back no longer holds it, and one that returned to `before-restore` holds it again.
 * "Both members sign in" is read as: the owner's kept session opens the record, the people on it are who they were at
 * the copy, and the invitations answer without a fault. A second person's passkey ceremony is the browser's half of
 * this unit, not this script's.
 *
 * WHAT IT LEAVES BEHIND: six entries marked `Going back check`, one copy and two `before-restore` copies. The canary's
 * weekly reset (`tools/canary/reset.mjs`) takes the entries; the copies age out with the rest.
 *
 * EXIT CODES: 0 PASS; 1 a step failed or the record was refused; 3 not run, with why (no canary is named yet).
 */

import { randomBytes } from 'node:crypto';

/** The words every entry this writes carries, so they can be told from anything else on the record. */
export const MARK = 'Going back check';

/** How long the record has to answer `boot` 200 after going back. */
export const BOOT_WITHIN_MS = 60_000;

/** A step that did not hold: which one, and why, in a sentence a person reads. */
class Failed extends Error {
  constructor(step, why) {
    super(why);
    this.step = step;
  }
}

/** A refusal's own sentence, or the status when it gave none. */
const fixOf = (answer) => answer?.said?.refusal?.fix ?? `it answered ${answer?.status ?? 'nothing'}`;

/** One log line as it is quoted: when, what kind, and what it says. Anything shaped like an id is left out. */
export const quote = (line) =>
  `${line?.ts ?? ''}  ${line?.kind ?? ''}  ${String(line?.note ?? line?.title ?? '')}`.replace(/(?<![0-9A-Za-z])(?:[a-z]+_)?[0-9A-HJKMNP-TV-Z]{26}(?![0-9A-Za-z])/gu, '…').trimEnd();

/** Whether a log line is one of this run's entries of `part` (`first` or `later`). */
const marked = (line, stamp, part) => `${line?.title ?? ''} ${line?.note ?? ''}`.includes(`${MARK} ${stamp} ${part}`);

/**
 * Why `record` may not be run on, or `null` when it may: it must be the one `ops` names, and `ops` must name one.
 * No name is special here. A person's own record is refused because it is not the operator's, as every other is.
 */
export function refusalFor(record, ops) {
  const named = String(ops ?? '').trim();
  if (named === '') return 'OPS_RECORD is empty in apps/worker/wrangler.jsonc, so there is no record this may put back.';
  if (String(record ?? '').trim() !== named) return `This puts back the operator's own record, ${named}, and nothing else. It was handed another name.`;
  return null;
}

/**
 * What one run needs from its host: `ask(method, body)` answering `{ status, said }` as the record's API does, `wait`
 * and `now` for the minute `boot` is given, and `say` for each line. A test hands in a host in memory.
 */
function doors({ ask, step }) {
  const call = async (method, body = {}) => {
    const answer = await ask(method, body);
    if (answer?.status !== 200 || answer.said?.ok !== true) throw new Failed(step(), `${method} was refused: ${fixOf(answer)}`);
    return answer.said.value;
  };
  /** The record's log, newest first, changes only. */
  const log = async () => {
    const page = await call('recentHistory', { limit: 200 });
    return Array.isArray(page?.events) ? page.events : [];
  };
  return { call, log };
}

/** Three entries of `part`, one at a time, so the log holds one line each. `field` is where the list keeps its words. */
async function writeThree(call, list, field, stamp, part) {
  for (let n = 1; n <= 3; n++) {
    const words = `${MARK} ${stamp} ${part} ${n}`;
    await call('create', { register: list, fields: { [field]: words }, note: words });
  }
}

/**
 * The field of `list` an entry's words go in: the first text the list says it must have, read from the record's own
 * description of the list. No field is named here, since which one it is belongs to the pack the record holds.
 */
async function wordsOf(call, list) {
  const shape = await call('schema', { register: list });
  const fields = Array.isArray(shape?.fields) ? shape.fields : [];
  return fields.find((f) => f?.required === true && f?.type === 'text' && typeof f?.id === 'string')?.id ?? null;
}

/**
 * `boot` asked until it answers 200, for at most a minute. A fault while the record resets is counted and allowed; a
 * minute of them is the failure this unit exists to find. Answers how long it took and how many asks were not 200.
 */
export async function bootWithin({ ask, wait, now }, limit = BOOT_WITHIN_MS) {
  const began = now();
  let misses = 0;
  for (;;) {
    const answer = await ask('boot', {});
    if (answer?.status === 200 && answer.said?.ok === true) return { ok: true, ms: now() - began, misses };
    misses += 1;
    if (now() - began >= limit) return { ok: false, ms: now() - began, misses, last: answer?.status ?? 0 };
    await wait(2_000);
  }
}

/** The people on the record, as a sorted list of who they are, so two reads can be compared. */
const peopleOf = (members) => (Array.isArray(members) ? members.map((m) => String(m?.person_id ?? '')).sort().join(' ') : '');

/** Whether the invitations hold one for `address`. */
const invited = (invitations, address) => Array.isArray(invitations) && invitations.some((i) => i?.email === address);

/**
 * The whole proof on one record. Answers `{ pass: true, lines, quoted }` or `{ pass: false, step, why, lines }`, and
 * says each line as it goes. `ops` is the name `OPS_RECORD` holds; `list` the list the entries go into.
 */
export async function goBack({ record, ops, ask, wait = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, say = console.log, list = 'tasks', stamp = randomBytes(4).toString('hex') }) {
  const lines = [];
  const tell = (line) => (lines.push(line), say(line));
  const refused = refusalFor(record, ops);
  if (refused !== null) {
    tell(`FAIL  the record named: ${refused}`);
    return { pass: false, step: 'the record named', why: refused, lines };
  }
  let at = 'the owner signs in';
  const { call, log } = doors({ ask, step: () => at });
  const address = `go-back-${stamp}@example.com`;
  try {
    await call('boot');
    const people = peopleOf(await call('members'));
    if (people === '') throw new Failed(at, 'the record lists nobody on it, so there is no owner to compare against.');

    at = 'three entries are written';
    const field = await wordsOf(call, list);
    if (field === null) throw new Failed(at, `the list ${list} has no text every entry must have, so there is nowhere to write the words. Name another list with GO_BACK_LIST.`);
    await writeThree(call, list, field, stamp, 'first');
    const before = (await log())[0]?.id ?? null;

    at = 'a copy is taken';
    const copy = await call('snapshot', {});
    if (typeof copy?.id !== 'string' || copy.id === '') throw new Failed(at, 'the copy came back without a name.');
    const after = (await log())[0]?.id ?? null;
    tell(`  a copy was taken: ${copy.id}`);

    at = 'three more entries are written';
    await writeThree(call, list, field, stamp, 'later');

    at = 'a second member is added';
    await call('invite', { email: address, level: 'read' });
    if (!invited(await call('invitations'), address)) throw new Failed(at, 'the invitation was taken and is not in the list of invitations.');

    at = 'the record goes back to the copy';
    const back = await call('restore', { bookmark: copy.id });
    const kept = typeof back?.kept === 'string' ? back.kept : null;

    at = 'boot answers 200 within a minute';
    const up = await bootWithin({ ask, wait, now });
    if (!up.ok) throw new Failed(at, `after ${Math.round(up.ms / 1000)} seconds it still answered ${up.last}, ${up.misses} asks in a row.`);
    tell(`  the record answered again after ${Math.round(up.ms / 1000)} seconds${up.misses > 0 ? `, past ${up.misses} asks it did not answer` : ''}`);

    at = 'the log ends at the copy plus one restore.pitr';
    const went = await log();
    const head = went.findIndex((line) => line?.id === before || line?.id === after);
    if (head === -1) throw new Failed(at, 'the last line written before the copy is not in the log any more.');
    const since = went.slice(0, head);
    if (since.length !== 1 || since[0]?.kind !== 'restore.pitr')
      throw new Failed(at, `above the copy the log holds ${since.length === 0 ? 'nothing' : since.map((line) => String(line?.kind)).join(', ')}, where one restore.pitr was expected.`);
    const quoted = [quote(went[head]), quote(since[0])];

    at = 'the three later entries are gone';
    const stayed = went.filter((line) => marked(line, stamp, 'later')).length;
    if (stayed > 0) throw new Failed(at, `${stayed} of the lines written after the copy are still in the log.`);
    if (went.filter((line) => marked(line, stamp, 'first')).length < 3) throw new Failed(at, 'the three entries written before the copy are not all in the log, so it went back too far.');

    at = 'a before-restore copy is listed';
    const copies = await call('snapshots');
    const names = Array.isArray(copies) ? copies.map((c) => String(c?.id ?? '')) : [];
    if (kept === null || !kept.startsWith('before-restore')) throw new Failed(at, 'going back did not say which copy holds what the record was.');
    if (!names.includes(kept)) throw new Failed(at, `${kept} is not among the copies listed.`);

    at = 'both members sign in';
    await call('boot');
    if (peopleOf(await call('members')) !== people) throw new Failed(at, 'the people on the record are not who they were when the copy was taken.');
    if (invited(await call('invitations'), address)) throw new Failed(at, 'the invitation made after the copy is still there, so not all of the record went back.');

    at = 'the record goes back to before-restore';
    await call('restore', { bookmark: kept });
    at = 'boot answers 200 within a minute, the second time';
    const again = await bootWithin({ ask, wait, now });
    if (!again.ok) throw new Failed(at, `after ${Math.round(again.ms / 1000)} seconds it still answered ${again.last}.`);

    at = 'the three later entries return';
    const returned = await log();
    const came = returned.filter((line) => marked(line, stamp, 'later')).length;
    if (came < 3) throw new Failed(at, `${came} of the three came back.`);
    if (returned[0]?.kind !== 'restore.pitr') throw new Failed(at, `the newest line is ${String(returned[0]?.kind)}, where the second restore.pitr was expected.`);

    at = 'the second member returns';
    const pending = await call('invitations');
    if (!invited(pending, address)) throw new Failed(at, 'the invitation is not back with the rest.');
    if (peopleOf(await call('members')) !== people) throw new Failed(at, 'the people on the record changed.');

    /* TIDIED, NOT JUDGED: the invitation is this run's own and is taken back. A refusal here is said and is not a fail,
       since going back is proven by then and the link runs out in a day. */
    const mine = pending.find((i) => i?.email === address);
    const revoked = await ask('revokeInvite', { id: mine?.id });
    if (revoked?.said?.ok !== true) tell(`  the invitation could not be taken back: ${fixOf(revoked)}`);

    tell('  the log after going back, its last two lines:');
    for (const line of quoted) tell(`    ${line}`);
    tell('PASS');
    return { pass: true, lines, quoted };
  } catch (e) {
    const step = e instanceof Failed ? e.step : at;
    const why = e instanceof Error ? e.message.split('\n')[0] : String(e);
    tell(`FAIL  ${step}: ${why}`);
    return { pass: false, step, why, lines };
  }
}

/**
 * The run from a shell: the record named on the command line (the canary's, when none is), checked against production's
 * `OPS_RECORD`, and asked with the session the canary's sign-in kept. `3` when there is no canary to run on yet.
 */
export async function main(argv = process.argv.slice(2), env = process.env, say = console.log) {
  const { wranglerConfig } = await import('./provision-check.mjs');
  const ops = String(wranglerConfig().env?.production?.vars?.OPS_RECORD ?? '').trim();
  const record = String(argv[0] ?? env.SMOKE_SLUG ?? '').trim();
  if (record === '') {
    say('Going back: not run: no record was named and SMOKE_SLUG is not set, so there is no canary yet.');
    return 3;
  }
  const refused = refusalFor(record, ops);
  if (refused !== null) {
    say(`FAIL  the record named: ${refused}`);
    return 1;
  }
  /* THE CANARY'S OWN TOOLS, LOADED ONLY NOW: they start a self-host's parts on import, which a refusal has no use for. */
  const canary = await import('../../../tools/canary/lib.mjs');
  const where = canary.where({ ...env, SMOKE_SLUG: record });
  const kept = await canary.sessionFrom(env);
  const cookie = kept.state ? canary.cookieFor(kept.state, where.origin) : null;
  if (cookie === null) {
    say(`FAIL  the owner signs in: ${kept.why ?? 'The kept session holds no cookie for the canary, so nobody is signed in.'}`);
    return 1;
  }
  const at = { origin: where.origin, slug: record, live: true, cookie };
  const list = String(env.GO_BACK_LIST ?? '').trim() || 'tasks';
  try {
    const out = await goBack({ record, ops, list, say, ask: (method, body) => canary.call(at, method, body) });
    return out.pass ? 0 : 1;
  } finally {
    await canary.endSession(where.origin, cookie, String(env.CANARY_SESSION ?? '').trim() || null);
  }
}

if (import.meta.main)
  main().then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(`FAIL  going back stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
    },
  );
