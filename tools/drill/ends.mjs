/**
 * The drill's ends: the lock, the delete and the close, then the sweep (LCH-A03 job 2,
 * `loop/scope/area-launch-a.md:365-418`). Each step is `{ name, pass, said }` as in `steps.mjs`, and takes the drill
 * those steps left: the session the link opened and the record it made.
 *
 * ONLY ITS OWN. `file-delete` deletes the record this drill made, by the name it was made under, and nothing it did not
 * make; the sweep deletes only records named `drill-…` owned by an address that spent an invite code noted `drill`, and
 * closes that address only when it owns nothing else.
 *
 * WHAT THE DELETE KEPT is the record's answer once `apps/worker/src/destroy.ts` returns `{ kept, removed }` (LCH-A03 job
 * 3). Until then the delete is asserted and the step says it cannot read what was kept.
 */

import { randomBytes } from 'node:crypto';

import { api, ask, drill, fixOf, hide, linkIn, NOTE, ok, red, skip } from './steps.mjs';

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

/**
 * `file-delete`: one file uploaded, then the record deleted by its name. The answer says what it kept, a final copy
 * named `final-`, once the host returns it; and the record no longer opens.
 */
export async function fileDelete(d) {
  if (!d.made || !d.cookie) return skip(d, 'file-delete', 'there is no record of the drill’s to delete.');
  const up = await ask(d, `/app/${d.made.slug}/api/files`, { method: 'PUT', raw: PIXEL, type: 'image/png' });
  if (up.status !== 200 || typeof up.said?.sha256 !== 'string') return red(d, 'file-delete', `the file was not taken: ${fixOf(up)}.`);
  const gone = await api(d, 'deleteRecord', { slug: d.made.slug });
  if (gone.said?.ok !== true || gone.said.value?.deleted !== true) return red(d, 'file-delete', `the record was not deleted: ${fixOf(gone)}.`);
  d.deleted = true;
  const kept = gone.said.value?.kept;
  const removed = gone.said.value?.removed;
  let what = 'the delete does not yet say what it kept, so what was kept cannot be read';
  if (kept !== undefined) {
    if (typeof kept !== 'string' || !/(^|\/)final-/u.test(kept)) return red(d, 'file-delete', 'the delete kept something that is not a final copy.');
    what = `it kept one final copy${typeof removed === 'number' ? ` and removed ${removed} other ${removed === 1 ? 'copy' : 'copies'}` : ''}`;
  }
  const after = await api(d, 'boot');
  if (after.said?.ok === true) return red(d, 'file-delete', 'the record was said to be deleted and still opens.');
  const listed = await ask(d, '/account/records', { method: 'GET' });
  if ((listed.said?.value ?? []).some((r) => r?.slug === d.made.slug)) return red(d, 'file-delete', 'the record was said to be deleted and is still listed as reachable.');
  return ok(d, 'file-delete', `a file was uploaded, the record was deleted by its name and no longer opens; ${what}.`);
}

/** `close`: the account closed, and a sign-in for its address answers exactly as one for an address nobody has. */
export async function close(d) {
  if (!d.cookie || !d.address) return skip(d, 'close', 'there is no account of the drill’s to close.');
  const closed = await ask(d, '/account/close', { body: { email: d.address } });
  if (closed.said?.ok !== true) return red(d, 'close', `the account did not close: ${fixOf(closed)}.`);
  d.closed = true;
  const mark = await d.mail.mark();
  const was = await ask(d, '/auth/magic/start', { body: { email: d.address }, cookie: null });
  const nobody = await ask(d, '/auth/magic/start', { body: { email: `nobody-${randomBytes(4).toString('hex')}@example.test` }, cookie: null });
  if (was.status !== nobody.status || JSON.stringify(was.said) !== JSON.stringify(nobody.said))
    return red(d, 'close', `a sign-in for the closed address answered ${was.status}, and one for an unknown address ${nobody.status}: they must be the same.`);
  if (d.mail.kind !== 'none' && (await d.mail.next(mark, { to: d.address, ms: d.quietMs })) !== null) return red(d, 'close', 'a sign-in link was mailed to the closed address.');
  return ok(d, 'close', `the account closed, and a sign-in for its address answered as one for an unknown address${d.mail.kind === 'none' ? '' : ', with nothing mailed'}.`);
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

/** The three ends, in order, by name. The sweep is its own, since it takes the operator's key and no drill. */
export const ENDS = { lockout, 'file-delete': fileDelete, close };
