/**
 * The canary put back, once a week: the lived `default` profile imported again with replace, through the product's own
 * doors.
 *
 *   node tools/canary/reset.mjs
 *
 * WHY. A canary mended by hand hides the faults it is there to find, and the sign of that is a write on it by anything
 * but the lane. So once a week whatever was written is thrown away: the canary's own `export` is read first (which
 * also tells the reset who the canary is and who owns it), the lived record is built and re-addressed to it
 * (`./brainl.mjs`), and the canary's own `import` puts it back with `replace: true`. Where the host keeps copies, the
 * record keeps one of what it was before the replace, as any restore does.
 *
 * THROUGH THE DOORS A PERSON USES, AS ITS OWNER. `export` and `import` are ADMIN, which no token opens (ADR-060), so
 * live it goes with the session `signin-live` kept (`sessionPath` in `./lib.mjs`) and the `Origin` the record checks,
 * and that session is ended when the reset is done; on a self-host with the server key, which is the owner there. Its
 * sealed bytes travel when it holds any: `CANARY_KEK` names their wrapping key, and without it a canary that holds keys
 * is refused by the import in its own sentence.
 *
 * UNTIL HIS SITTING it runs against a fresh self-host and its first line says "self-host only". Once `SMOKE_SLUG` is
 * set, no session is red.
 *
 * EXIT CODES: 0 put back and read back as the lived record; 1 refused or not put back.
 */

import { buildLived, openLived } from '../gates/lived.mjs';
import { canaryCopy, identityOf } from './brainl.mjs';
import { call, cookieFor, endSession, fixOf, SELF_HOST_ONLY, selfHost, sessionFrom, sessionPath, where } from './lib.mjs';

/** The lived profile the canary holds. */
export const PROFILE = 'default';

/** The lived record's export, built (or found built) and opened at its own instant. */
export async function livedLines(profile = PROFILE) {
  const built = await buildLived(profile);
  const opened = await openLived(built.file);
  try {
    const out = await opened.kernel.export({ redactGrants: false });
    if (!out.ok) throw new Error(`The lived record would not export: ${out.refusal.fix}`);
    return out.value;
  } finally {
    opened.close();
  }
}

/** The canary's own export, with its sealed bytes when `kek` names their key. */
async function exported(at, kek, io) {
  const asked = await call(at, 'export', { redactGrants: false, ...(kek ? { kek_id: kek } : {}) }, io);
  if (asked.said?.ok === true) return asked.said.value;
  /* A CANARY THAT HOLDS NO KEYS NAMES NONE, AND ONE THAT DOES IS PUT BACK ONLY WITH THEM. The redacted copy is the
     fallback for the first; for the second, the import below refuses in the record's own words. */
  if (asked.said?.refusal?.code !== 'WRONG_KEY') throw new Error(`The canary would not export: ${fixOf(asked)}`);
  const plain = await call(at, 'export', {}, io);
  if (plain.said?.ok !== true) throw new Error(`The canary would not export: ${fixOf(plain)}`);
  return plain.said.value;
}

/**
 * The reset against one record, `at` being how to reach it (`{ base | origin, slug, live, bearer | cookie }`). Answers
 * the lines it said. `lived` is the lived export, handed in by a test that built it once.
 */
export async function reset(at, { lived, kek, io = {} } = {}) {
  const canary = await exported(at, kek, io);
  const who = identityOf(canary);
  const lines = await canaryCopy(lived ?? (await livedLines()), canary);
  const put = await call(at, 'import', { lines, replace: true }, io);
  if (put.said?.ok !== true) throw new Error(`The canary was not put back: ${fixOf(put)}`);
  /* AND READ BACK, because an import that answered ok and left the canary as it was is the fault this exists to find. */
  const back = await call(at, 'export', { redactGrants: false, ...(kek ? { kek_id: kek } : {}) }, io);
  const now = back.said?.ok === true ? back.said.value : (await call(at, 'export', {}, io)).said?.value;
  if (!Array.isArray(now)) throw new Error('The canary was put back and would not export again, so nothing says what it holds now.');
  const after = identityOf(now);
  if (after.id !== who.id || after.owner !== who.owner) throw new Error('The canary was put back as another record or with another owner.');
  const rows = (l) => l.filter((x) => x.startsWith('[')).length;
  return [`the lived ${PROFILE} profile was put back over ${who.slug}: ${put.said.value?.rows ?? rows(lines)} rows, and it exports ${rows(now)} lines of rows now.`];
}

async function main(env = process.env) {
  const place = where({ ...env, CANARY_ORIGIN: env.CANARY_ORIGIN || (env.DEPLOY_HOST ? `https://${env.DEPLOY_HOST}` : '') });
  if (!place.live) {
    const host = await selfHost();
    try {
      for (const line of await reset({ base: host.base, origin: host.origin, slug: host.slug, bearer: host.key }))
        console.log(`  reset, ${SELF_HOST_ONLY}: ${line}`);
    } finally {
      await host.close();
    }
    return 0;
  }
  const file = sessionPath(env);
  const kept = await sessionFrom({ ...env, CANARY_SESSION: file });
  const cookie = kept.state ? cookieFor(kept.state, place.origin) : null;
  try {
    if (cookie === null) throw new Error(`${kept.why ?? 'The kept session holds no cookie for the canary.'} The weekly reset signs in as the canary's owner, so it stopped.`);
    for (const line of await reset({ ...place, cookie }, { kek: env.CANARY_KEK || undefined })) console.log(`  reset: ${line}`);
    return 0;
  } finally {
    /* AND THE SESSION ENDS, put back or not, as the look ends its own. */
    await endSession(place.origin, cookie, file);
  }
}

if (import.meta.main)
  main().then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(`  reset refused: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    },
  );
