/**
 * The drill's ends: the lock, the delete and the close, then the sweep.
 * Each step is `{ name, pass, said }` as in `steps.mjs`, and takes the drill
 * those steps left: the session the link opened and the record it made.
 *
 * ONLY ITS OWN. `file-delete` deletes the record this drill made, by the name it was made under, and nothing it did not
 * make; the sweep deletes only records named `drill-…` owned by an address that spent an invite code noted `drill`, and
 * closes that address only when it owns nothing else.
 *
 * WHAT THE DELETE KEPT is the record's answer: `destroyRecord` (`apps/worker/src/destroy.ts`) answers `{ kept, removed }`,
 * the final copy's key and how many other copies and files it took. A host whose delete does not pass
 * that answer on yet is asserted as deleted, and the step says it cannot read what was kept.
 *
 * `erase` IS LCH-A16's LIVED PROOF: in the drill's own record a second person joins by invitation, attaches a file in a
 * list the drill declares, and is erased by the owner through the record's own doors; then the file's address answers
 * nothing and a search for the person's name finds nothing; then their account is closed, so the next run can invite the
 * same address as a new person. The second person is a second mail door, read from the
 * environment by name and never printed: `DRILL_SECOND_ADDRESS` (the door) and `DRILL_SECOND_KEY` (the agent key that
 * reads the Inbox its letters land in, the canary's, named by `SMOKE_SLUG`). Without them the step skips and says why.
 *
 * `close` ALSO HOLDS THE SOLE-OWNER RULE: while the drill alone owns its record, a close is refused with the door's own
 * sentence (`packages/host/src/auth.ts`, "Delete <record>, or make somebody else its owner, first."). It is asked just
 * before `file-delete` deletes the record, the one moment the drill is a sole owner, and `close` says what it saw.
 */

import { randomBytes } from 'node:crypto';

import { api, ask, drill, fixOf, hide, inboxMail, linkIn, NOTE, ok, red, skip } from './steps.mjs';

/** How many wrong sign-ins one address gets before the lock: the Directory's `SIGN_IN.most`. */
export const WRONG_MOST = 10;

/** The age past which the sweep deletes a drill's record. */
export const DAY = 86_400_000;

/** A link token in the shape the host mints, which no link was minted as: a wrong key, not a malformed one. */
const wrongToken = () => randomBytes(32).toString('base64url');

/** One PNG pixel, the smallest file the record's file door takes by its first bytes. */
const PIXEL = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

/**
 * `lockout`: an agent call with a bad token does not count, ten wrong sign-ins from one address are each refused, the
 * eleventh is a 429, and an agent token minted before the lock still works during it.
 */
export async function lockout(d) {
  if (!d.made || !d.cookie) return skip(d, 'lockout', 'there is no record of the drill’s to hold an agent token.');
  const minted = await api(d, 'createToken', { scope: 'read', label: 'drill' });
  const bearer = minted.said?.ok === true ? minted.said.value?.bearer : null;
  if (typeof bearer !== 'string') return red(d, 'lockout', `no agent token could be made to try during the lock: ${fixOf(minted)}.`);
  d.bearer = bearer;
  const bad = await api(d, 'boot', {}, { cookie: null, bearer: `${bearer.split('.')[0]}.${wrongToken()}` });
  if (bad.status !== 401) return red(d, 'lockout', `an agent call with a bad token answered ${bad.status}, where it must be 401.`);
  /* THE DRILL'S OWN EARLIER WRONG SIGN-INS COUNT, the spent link opened again among them, so it sends what is left of ten. */
  const left = Math.max(0, WRONG_MOST - d.strikes);
  const seen = [];
  for (let i = 0; i <= left; i++) seen.push((await ask(d, '/auth/magic/redeem', { body: { linkToken: wrongToken() }, cookie: null })).status);
  const refused = seen.slice(0, left);
  const earlier = d.strikes === 0 ? '' : d.strikes === 1 ? ' (one of them the spent link opened again)' : ` (${d.strikes} of them earlier in the drill)`;
  if (!refused.every((s) => s === 401 || s === 400)) return red(d, 'lockout', `ten wrong sign-ins${earlier} answered ${refused.join(', ')}, where each must be refused and none locked yet, so the bad agent token or something else counted.`);
  if (seen[left] !== 429) return red(d, 'lockout', `the eleventh wrong sign-in answered ${seen[left]}, where it must be 429.`);
  const good = await api(d, 'boot', {}, { cookie: null, bearer });
  if (good.said?.ok !== true) return red(d, 'lockout', `during the lock the good agent token was refused: ${fixOf(good)}.`);
  return ok(d, 'lockout', `a bad agent token did not count, ten wrong sign-ins${earlier} were refused, the eleventh was locked (429), and the good agent token still worked.`);
}

/** The second person the erase step lets in and erases: an invented name, and nobody's. */
export const SECOND_NAME = 'Marlo Quince';

/** The list the drill declares in its own record, so the second person's file has a field to be attached in. */
export const PAPERS = {
  register: 'drill_papers',
  name: 'Papers',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true, search: true },
    { id: 'paper', type: 'file' },
  ],
};

/** The basis an erasure keeps: it must not name the person, or the erasure would write them again. */
const BASIS = 'The drill checks that a person can be erased.';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The second person the environment names, `{ address, key, mail }`, or `{ why }` when it names none. Read by name and
 * never printed: `DRILL_SECOND_ADDRESS` is a second mail door, and `DRILL_SECOND_KEY` the agent key that reads the
 * Inbox of the canary its letters land in (`SMOKE_SLUG`).
 */
export function secondFrom(env, host) {
  const v = (k) => String(env?.[k] ?? '').trim() || null;
  const address = v('DRILL_SECOND_ADDRESS');
  const key = v('DRILL_SECOND_KEY');
  const missing = [address ? null : 'DRILL_SECOND_ADDRESS', key ? null : 'DRILL_SECOND_KEY'].filter(Boolean);
  if (missing.length) return { why: `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set, so there is no second person to erase.` };
  const slug = v('SMOKE_SLUG');
  if (!slug) return { why: 'no canary is named (SMOKE_SLUG), so the second address’s letters cannot be read.' };
  return { address, key, mail: inboxMail({ origin: host, slug, key }) };
}

/** The invitation's token, from the answer `invite` gives: its `token`, or the fragment of its link. */
const inviteTokenOf = (value) => (typeof value?.token === 'string' && value.token !== '' ? value.token : (/\/invite#([^&\s]+)/u.exec(String(value?.link ?? ''))?.[1] ?? null));

/** The proof a letter carries beside the invitation it was minted for: `/invite#<token>&proof=<proof>`. */
export function proofIn(letter, token) {
  const words = `${letter?.text ?? ''} ${letter?.html ?? ''}`.replace(/&amp;/gu, '&');
  const at = words.indexOf(`#${token}&proof=`);
  if (at < 0) return null;
  return /^[^\s&"'<]+/u.exec(words.slice(at + token.length + '#&proof='.length))?.[0] ?? null;
}

/** How many things a search found: its rows and its comments. */
const foundBy = (a) => (a?.said?.value?.hits?.length ?? 0) + (a?.said?.value?.comments?.length ?? 0);

/**
 * `erase`: in the drill's own record, a second person is let in by invitation and attaches a file; the owner erases them
 * through the record's own doors (`members`, `erase`); then the file's address answers nothing and a search for their name
 * finds nothing. Before the erasure both are seen to answer, so the nothing after it is the erasure's and not a door that
 * never worked. The file goes through the outbox (`erase.r2`), so its address is asked again until it answers nothing,
 * for as long as the drill waits for a letter.
 */
export async function erase(d, env = process.env) {
  if (!d.made || !d.cookie) return skip(d, 'erase', 'there is no record of the drill’s to share.');
  const second = d.second ?? secondFrom(env, d.host);
  if (second.why) return skip(d, 'erase', second.why);
  const operatorKey = d.operatorKey ?? (String(env?.DRILL_OPERATOR_KEY ?? '').trim() || null);
  if (!operatorKey) return skip(d, 'erase', 'no operator key, so the drill’s record cannot leave Free, where nobody else can join.');
  d.secrets.push(second.address, operatorKey, ...(second.key ? [second.key] : []));
  const slug = d.made.slug;
  /* FREE IS FOR ONE PERSON, so the record is the operator's gift of Cloud for the length of the step, noted `drill`, and
     given back once the second person is gone (`apps/worker/src/ops-plan.ts`). */
  const plan = (to) => ask(d, '/account/ops/plan', { body: { record: slug, plan: to, note: NOTE }, cookie: null, bearer: operatorKey });
  const gift = await plan('hosted');
  if (gift.said?.ok !== true) return red(d, 'erase', `the drill’s record could not leave Free for a second person to join: ${fixOf(gift)}.`);
  const s = drill({ host: d.host, address: second.address, slug, mail: second.mail, ip: d.ip, send: d.send, waitMs: d.waitMs, quietMs: d.quietMs });
  s.made = d.made;
  const r = await shared(d, second, slug, s);
  /* A RUN CUT SHORT AFTER THE SECOND PERSON JOINED still closes their account, for the reason `shared` closes it. */
  if (!r.pass && s.cookie && !s.closed) await ask(s, '/account/close', { body: { email: second.address } });
  const back = await plan(null);
  if (r.pass && back.said?.ok !== true) return red(d, 'erase', `the second person was erased, and the record could not go back to Free: ${fixOf(back)}.`);
  return r;
}

/** `erase` once the record can hold two people: the second let in, their file attached, then erased and looked for. */
async function shared(d, second, slug, s) {
  const declared = await api(d, 'setDeclaration', { body: PAPERS, version: 0 });
  if (declared.said?.ok !== true) return red(d, 'erase', `the drill’s list for a file could not be made: ${fixOf(declared)}.`);
  const invited = await api(d, 'invite', { email: second.address, level: 'write' });
  const token = inviteTokenOf(invited.said?.value);
  if (invited.said?.ok !== true || token === null) return red(d, 'erase', `no invitation was made for a second person: ${fixOf(invited)}.`);
  d.secrets.push(token);
  const mark = await second.mail.mark();
  const asked = await ask(s, '/auth/invite', { body: { inviteToken: token, accept: true, name: SECOND_NAME }, cookie: null });
  if (asked.status !== 202) return red(d, 'erase', `opening the invitation answered ${asked.status}, where a new address is mailed its proof: ${fixOf(asked)}.`);
  const proof = proofIn(await second.mail.next(mark, { to: second.address, ms: d.waitMs }), token);
  if (proof === null) return red(d, 'erase', `no letter proving the second address came within ${Math.round(d.waitMs / 1000)} seconds.`);
  d.secrets.push(proof);
  const joined = await ask(s, '/auth/invite', { body: { inviteToken: token, accept: true, proof, name: SECOND_NAME }, cookie: null });
  if (!joined.cookie) return red(d, 'erase', `the second person was not let in: ${fixOf(joined)}.`);
  s.cookie = joined.cookie;
  d.secrets.push(joined.cookie);
  /* A SIGN-IN THAT SUCCEEDS CLEARS ITS ADDRESS'S STRIKES (`open` in `packages/record/src/identity.ts`), and the second
     person signs in from the drill's own, so `lockout` counts from none and not from what `link-once` left. */
  d.strikes = 0;
  const moved = await ask(s, '/auth/switch', { body: { slug } });
  if (moved.cookie) {
    s.cookie = moved.cookie;
    d.secrets.push(moved.cookie);
  }
  const up = await ask(s, `/${slug}/api/files`, { method: 'PUT', raw: PIXEL, type: 'image/png' });
  const sha = up.said?.sha256;
  if (up.status !== 200 || typeof sha !== 'string') return red(d, 'erase', `the second person’s file was not taken: ${fixOf(up)}.`);
  const paper = { sha256: sha, mime: 'image/png', bytes: PIXEL.length, name: `${SECOND_NAME} id.png` };
  const attached = await api(s, 'create', { register: PAPERS.register, fields: { what: `Papers from ${SECOND_NAME}`, paper } });
  if (attached.said?.ok !== true) return red(d, 'erase', `the second person could not attach the file: ${fixOf(attached)}.`);
  const file = `/${slug}/api/files/${sha}`;
  const before = await ask(d, file, { method: 'GET' });
  if (before.status !== 200) return red(d, 'erase', `before the erasure the file did not answer at its address (${before.status}), so its silence after would prove nothing.`);
  if (foundBy(await api(d, 'search', { q: SECOND_NAME })) === 0) return red(d, 'erase', 'before the erasure a search for the second person’s name found nothing, so finding nothing after would prove nothing.');
  const people = await api(d, 'members');
  const person = (people.said?.value ?? []).find((m) => String(m?.email ?? '').toLowerCase() === second.address.toLowerCase());
  if (!person) return red(d, 'erase', `the second person is not among the record’s people: ${fixOf(people)}.`);
  const erased = await api(d, 'erase', { personId: person.person_id, subjects: [], basis: BASIS });
  if (erased.said?.ok !== true) return red(d, 'erase', `the second person was not erased: ${fixOf(erased)}.`);
  const until = Date.now() + d.waitMs;
  let still = await ask(d, file, { method: 'GET' });
  while (still.status !== 404 && Date.now() < until) {
    await pause(250);
    still = await ask(d, file, { method: 'GET' });
  }
  if (still.status !== 404) return red(d, 'erase', `after the erasure the file still answered ${still.status} at its address, ${Math.round(d.waitMs / 1000)} seconds on.`);
  const after = await api(d, 'search', { q: SECOND_NAME });
  if (after.said?.ok !== true) return red(d, 'erase', `after the erasure the search did not answer: ${fixOf(after)}.`);
  const left = foundBy(after);
  if (left > 0) return red(d, 'erase', `after the erasure a search for the second person’s name still found ${left}.`);
  /* THE SECOND ADDRESS IS CLOSED AS WELL, or the next run finds it already signed up: an invitation to an address with a
     sign-in here asks it to sign in first (`packages/host/src/invite.ts`, path 2), and every run after the first is red. */
  const gone = await ask(s, '/account/close', { body: { email: second.address } });
  if (gone.said?.ok !== true) return red(d, 'erase', `the second person was erased, and their account did not close, so the next run cannot invite them: ${fixOf(gone)}.`);
  s.closed = true;
  return ok(d, 'erase', 'a second person was let in by invitation and attached a file; once the owner erased them, the file’s address answered nothing and a search for their name found nothing.');
}

/** The close door's sentence for a sole owner (`closeDoor` in `packages/host/src/auth.ts`), for the record named. */
export const soleOwnerFix = (slug) => `Delete ${slug}, or make somebody else its owner, first.`;

/**
 * A close asked while the drill alone owns its record: `{ status, fix, refused }`, `refused` being whether the door
 * answered with its sole-owner sentence for that record. Nothing is closed by a close that is refused.
 */
export async function soleOwnerClose(d) {
  const out = await ask(d, '/account/close', { body: { email: d.address } });
  const fix = out.said?.refusal?.fix ?? null;
  return { status: out.status, fix, closed: out.said?.ok === true, refused: out.said?.ok !== true && fix === soleOwnerFix(d.made.slug) };
}

/** What the delete's answer says it kept, as a line, or `{ wrong }` where the answer is there and is not what it should be. */
export function keptOf(value) {
  const kept = value?.kept;
  const removed = value?.removed;
  if (kept === undefined || kept === null) return { line: 'the delete does not yet say what it kept, so what was kept cannot be read' };
  if (typeof kept !== 'string' || !/(^|\/)final-/u.test(kept)) return { wrong: 'the delete kept something that is not a final copy.' };
  if (!Number.isInteger(removed) || removed < 0) return { wrong: 'the delete said what it kept and not how many other copies and files it removed.' };
  return { line: `it kept one final copy, named final-, and removed ${removed} other ${removed === 1 ? 'copy or file' : 'copies and files'}` };
}

/**
 * `file-delete`: one file uploaded, then the record deleted by its name. The answer says what it kept, one final copy
 * named `final-`, and how many other copies and files went; and the record no longer opens. Just before the delete, while
 * the drill alone owns the record, a close is asked and its refusal kept for `close` to say.
 */
export async function fileDelete(d) {
  if (!d.made || !d.cookie) return skip(d, 'file-delete', 'there is no record of the drill’s to delete.');
  const up = await ask(d, `/${d.made.slug}/api/files`, { method: 'PUT', raw: PIXEL, type: 'image/png' });
  if (up.status !== 200 || typeof up.said?.sha256 !== 'string') return red(d, 'file-delete', `the file was not taken: ${fixOf(up)}.`);
  if (d.address) d.soleOwner = await soleOwnerClose(d);
  if (d.soleOwner?.closed) return red(d, 'file-delete', 'the account closed while it alone owned its record, so the record was left with no owner.');
  const gone = await api(d, 'deleteRecord', { slug: d.made.slug });
  if (gone.said?.ok !== true || gone.said.value?.deleted !== true) return red(d, 'file-delete', `the record was not deleted: ${fixOf(gone)}.`);
  d.deleted = true;
  const what = keptOf(gone.said.value);
  if (what.wrong) return red(d, 'file-delete', what.wrong);
  const after = await api(d, 'boot');
  if (after.said?.ok === true) return red(d, 'file-delete', 'the record was said to be deleted and still opens.');
  const listed = await ask(d, '/account/records', { method: 'GET' });
  if ((listed.said?.value ?? []).some((r) => r?.slug === d.made.slug)) return red(d, 'file-delete', 'the record was said to be deleted and is still listed as reachable.');
  return ok(d, 'file-delete', `a file was uploaded, the record was deleted by its name and no longer opens; ${what.line}.`);
}

/**
 * `close`: while the drill alone owned its record, a close was refused with the door's sentence; then the account
 * closed, and a sign-in for its address answers exactly as one for an address nobody has. A record still standing here
 * (its `file-delete` not run) is asked now, and the account is left open, since an owner's close is meant to be refused.
 */
export async function close(d) {
  if (!d.cookie || !d.address) return skip(d, 'close', 'there is no account of the drill’s to close.');
  if (d.made && !d.deleted) {
    const now = await soleOwnerClose(d);
    if (now.closed) return red(d, 'close', 'the account closed while it alone owned its record, so the record was left with no owner.');
    if (!now.refused) return red(d, 'close', `while it alone owned its record, the close answered ${now.status}, not the door’s sentence: “${now.fix ?? 'nothing'}”.`);
    return ok(d, 'close', `while it alone owned its record, the close was refused: “${now.fix}” The record still stands, so the account was left open.`);
  }
  let alone = '';
  if (d.soleOwner) {
    if (!d.soleOwner.refused) return red(d, 'close', `while it alone owned its record, the close answered ${d.soleOwner.status}, not the door’s sentence: “${d.soleOwner.fix ?? 'nothing'}”.`);
    alone = `while it alone owned its record, a close was refused (“${d.soleOwner.fix}”); then `;
  }
  const closed = await ask(d, '/account/close', { body: { email: d.address } });
  if (closed.said?.ok !== true) return red(d, 'close', `the account did not close: ${fixOf(closed)}.`);
  d.closed = true;
  const mark = await d.mail.mark();
  const was = await ask(d, '/auth/magic/start', { body: { email: d.address }, cookie: null });
  const nobody = await ask(d, '/auth/magic/start', { body: { email: `nobody-${randomBytes(4).toString('hex')}@example.test` }, cookie: null });
  if (was.status !== nobody.status || JSON.stringify(was.said) !== JSON.stringify(nobody.said))
    return red(d, 'close', `a sign-in for the closed address answered ${was.status}, and one for an unknown address ${nobody.status}: they must be the same.`);
  if (d.mail.kind !== 'none' && (await d.mail.next(mark, { to: d.address, ms: d.quietMs })) !== null) return red(d, 'close', 'a sign-in link was mailed to the closed address.');
  return ok(d, 'close', `${alone}the account closed, and a sign-in for its address answered as one for an unknown address${d.mail.kind === 'none' ? '' : ', with nothing mailed'}.`);
}

/**
 * The sweep: every drill record older than a day, deleted. A drill that was cut before its `file-delete` leaves its
 * record behind, and this is what takes it.
 *
 * FOUND BY THE OPERATOR'S LIST of invite codes (`GET /account/ops/invite`, which never holds a code): a code noted
 * `drill`, spent, made more than a day before `now`, names the address that spent it. That address is signed in the way
 * anybody's is, by a sign-in link read through the mail port, and only its records named `drill-…` are deleted. It is
 * closed once it owns nothing else. Without the operator key or a way to read mail it does nothing and says so.
 */
export async function sweep({ host, operatorKey = null, mail, now = Date.now(), olderMs = DAY, waitMs, ip = null, send = fetch } = {}) {
  const d0 = drill({ host, mail, ip, send, ...(waitMs === undefined ? {} : { waitMs }) });
  if (!operatorKey) return skip(d0, 'sweep', 'no operator key, so the drill’s invite codes cannot be listed.');
  if (!mail || mail.kind === 'none') return skip(d0, 'sweep', 'no inbox key, so a drill’s address cannot be signed in to sweep it.');
  d0.secrets.push(operatorKey);
  const listed = await ask(d0, '/account/ops/invite', { method: 'GET', cookie: null, bearer: operatorKey });
  if (listed.said?.ok !== true) return red(d0, 'sweep', `the invite codes could not be listed: ${fixOf(listed)}.`);
  const old = (listed.said.value?.codes ?? []).filter((c) => c?.note === NOTE && c.state === 'spent' && typeof c.made === 'string' && now - Number(c.made_at) > olderMs);
  let swept = 0;
  const wrong = [];
  for (const code of old) {
    const d = drill({ host, address: code.made, mail, ip, send, ...(waitMs === undefined ? {} : { waitMs }) });
    const mark = await mail.mark();
    await ask(d, '/auth/magic/start', { body: { email: d.address }, cookie: null });
    const link = linkIn(await mail.next(mark, { to: d.address, ms: d.waitMs }), 'magic');
    if (link === null) continue; /* closed already, or never made: nothing of it is left to sweep. */
    d.link = link;
    const signed = await ask(d, '/auth/magic/redeem', { body: { linkToken: link.token }, cookie: null });
    if (!signed.cookie) {
      wrong.push(hide(d, `a drill address could not be signed in: ${fixOf(signed)}`));
      continue;
    }
    d.cookie = signed.cookie;
    const reach = (await ask(d, '/account/records', { method: 'GET' })).said?.value ?? [];
    for (const r of reach.filter((x) => x?.level === 'owner' && /^drill-[a-z0-9-]+$/u.test(String(x.slug)))) {
      const opened = await ask(d, '/auth/switch', { body: { slug: r.slug } });
      if (opened.cookie) d.cookie = opened.cookie;
      d.made = { slug: r.slug };
      const gone = await api(d, 'deleteRecord', { slug: r.slug });
      if (gone.said?.value?.deleted === true) swept++;
      else wrong.push(hide(d, `a drill record could not be deleted: ${fixOf(gone)}`));
    }
    const left = (await ask(d, '/account/records', { method: 'GET' })).said?.value ?? [];
    if (left.length === 0) await ask(d, '/account/close', { body: { email: d.address } });
    await ask(d, '/auth/logout', { body: {} });
  }
  if (wrong.length) return red(d0, 'sweep', `${wrong.join('; ')}.`);
  return ok(d0, 'sweep', swept === 0 ? 'no drill record older than a day was left.' : `${swept} drill ${swept === 1 ? 'record' : 'records'} older than a day ${swept === 1 ? 'was' : 'were'} deleted.`);
}

/**
 * The four ends, in order, by name. The sweep is its own, since it takes the operator's key and no drill. `erase` runs
 * first, before `lockout` locks the address the drill asks from, since the second person signs in from the same one.
 */
export const ENDS = { erase, lockout, 'file-delete': fileDelete, close };
