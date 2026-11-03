/**
 * The Kennel on the Cloud: `/api/kennel/v1/`, the registry every BrainDog reads add-ons and use cases from
 * (`docs/14-KENNEL-AND-COMMUNITY.md` §1).
 *
 * THIS FILE READS AND WRITES AND DECIDES NOTHING. Every rule, what a submission must be, what a verdict or a yank does
 * and how the two indexes become one, is `@braindog/declare/kennel`'s, so the self-host and a test hold the same rules
 * with no bucket. What is here is R2 under the prefix `kennel/`, the bundled catalogue in the static assets, and who
 * is asking.
 *
 * UNDER `/api/*` ON PURPOSE. The site already forwards `/api/*` to this Worker and this Worker already runs first there,
 * so the Kennel needed no route and no `wrangler.jsonc` change. It is answered in `route()` before any record door,
 * because it is nobody's record.
 *
 * READS ARE PUBLIC AND CARRY NO CORS HEADER: the index, a published file, its preview and the install counts are what a
 * self-host and the command line fetch, and the site reads them on its own origin, so no answer here opens itself to a
 * page on another one (the rule: no CORS anywhere). A PUBLISHED FILE IS THE ONE ANSWER A CACHE MAY KEEP. A version
 * is published once and never changes, so it is served `immutable`; everything else this file answers, the index and
 * every refusal included, is `no-store`, as every other answer from this Worker is.
 *
 * WHO IS ASKING IS READ ONLY FOR A WRITE, AND IN THIS ORDER: an author's signature in the body names its key; the
 * operator's bearer (`PROVISION_KEY`) opens review and yanks anything; any other bearer is read as `/api` reads one; and
 * only then the session cookie, and only when the request comes from a page on this host (`12 §8`, the rule every
 * cookie write here follows). A read never looks at a cookie or a header.
 *
 * EVERY WRITE OF `index.json` OR `review.json` IS CONDITIONAL on the version this write read, and a write that loses the
 * race reads again and asks the rules again, up to `KENNEL_TRIES` times. The one unconditional write is the first of each
 * file, when there was nothing to read a version from, SO TWO FIRST-EVER WRITERS OF ONE FILE CAN RACE and the later put
 * wins whole. Closing that takes a create-only put, which R2's reference does not say it has, so it is left open for the
 * one moment each file is born.
 *
 * EVERY WRITE SPENDS THE WORKER'S WRITE BUDGET FOR ITS ADDRESS FIRST (`spend`), before its body is read.
 */

import { httpStatus } from '@braindog/host';
import { clearCookie, readSid, sameKey, sameOrigin, sessionCookie } from '@braindog/host/auth';
import { emptyCatalogue, readCatalogue, type CatalogueEntry, type CatalogueIndex, type CatalogueVersion, type EntryKind } from '@braindog/declare/catalogue';
import { catalogueFile, fileChecksum, installedIdOf, listedEntries, offeredVersion, PREVIEW_FORMAT, readCatalogueFile, readPreview, type Preview } from '@braindog/declare/catalogue';
import {
  acceptSubmission,
  emptyPublishers,
  emptyReview,
  KENNEL_BASE,
  kennelAsk,
  listedPending,
  mergeIndexes,
  readPublishers,
  readReview,
  readSubmission,
  readTrust,
  readVerdict,
  readYank,
  reviewVerdict,
  roundCount,
  SUBMIT_MOST_BYTES,
  MINE_ASKED,
  mineIn,
  readMine,
  trustIn,
  verifyYank,
  waitingFile,
  yankIn,
  ADVISORIES_FILE,
  REPORTS_FILE,
  PRE_REVIEW_INSTRUCTIONS,
  adviseIn,
  emptyAdvisories,
  emptyReports,
  keyStatementIn,
  mergeAdvisories,
  noteOf,
  preReviewInput,
  readAdvise,
  readAdvisories,
  readKeyStatement,
  readReport,
  readReports,
  reportIn,
  withNote,
  type Advisories,
  type Change,
  type Identity,
  type Publishers,
  type Review,
  type Yanker,
} from '@braindog/declare/kennel';
import { no, ok } from '@braindog/ports';
import type { AuthResult, Refusal, Result, Who } from '@braindog/ports';
import { seedCatalogue } from '@braindog/seed/usecases/catalogue';
import { moduleDocument } from '@braindog/seed/usecases/install';

import type { Assets } from './catalogue.ts';
import { scratchInstall, type ScratchDeps } from './kennel-scratch.ts';
import { op } from './oplog.ts';
import { bearerOf, withCookie, type BearerDeps } from './session.ts';

/** The part of an R2 bucket the Kennel uses, so a test hands in a map. The binding is `BLOBS`. */
export type KennelBucket = {
  get(key: string): Promise<{ text(): Promise<string>; etag: string } | null>;
  /** `null` when `onlyIf` did not hold: somebody else wrote the file since it was read. */
  put(key: string, value: string, options?: { onlyIf?: { etagMatches?: string }; httpMetadata?: { contentType?: string } }): Promise<object | null>;
  delete(key: string): Promise<void>;
};

/** What `route()` hands the Kennel: the two bindings, the operator's key, this host's origin, and the two ways a person is known. */
export type KennelDeps = {
  blobs?: KennelBucket | undefined;
  assets?: Assets | undefined;
  operator?: string | undefined;
  /** `https://<PUBLIC_HOST>`, the one origin a signed-in write may come from. */
  origin: string;
  /** The Directory's `session` flow. */
  session: (sid: string) => Promise<AuthResult<Who>>;
  /** The bearer path `/api` takes (`session.ts`). */
  bearer: BearerDeps;
  /**
   * The Worker's write budget for the caller's address: `null` to go on, or its 429. ASKED BEFORE A WRITE READS ITS BODY,
   * because the submit door takes no sign-in, and each signed body it reads costs three bucket reads and a signature
   * check before the day's cap is counted. Left out, nothing is limited.
   */
  spend?: (request: Request) => Promise<Response | null>;
  /**
   * The empty record every submission is installed into before it is listed or waits, and the modules it requires
   * (`kennel-scratch.ts`). Left out, the door answers as it did and says once in its log that no scratch ran.
   */
  scratch?: ScratchDeps | undefined;
  /**
   * The model the pre-review note is asked of (`PRE_REVIEW_INSTRUCTIONS`): the included model, or none, when no note is
   * written. It answers the model's JSON; a throw is no note. The note is shown to the operator and never decides.
   */
  preReview?: ((instructions: string, input: unknown) => Promise<unknown>) | undefined;
  now?: () => Date;
};

const PREFIX = 'kennel/';
const INDEX = 'index.json';
const REVIEW = 'review.json';
const PUBLISHERS = 'publishers.json';
const COUNTS = 'counts.json';

/** How many times a write that lost a race reads again before it says so. */
export const KENNEL_TRIES = 3;
/** A submission's body: the file's text escaped inside JSON is longer than the file, so three times the file's own cap. */
export const SUBMIT_BODY_MOST = 3 * SUBMIT_MOST_BYTES;
/** A yank or a trust: a few names and a reason. */
export const SMALL_BODY_MOST = 16_384;
/** A verdict may carry the operator's preview of every page an add-on adds. */
export const VERDICT_BODY_MOST = 4 * 1_048_576;

const IMMUTABLE = 'public, max-age=31536000, immutable';
const JSON_FILE = { httpMetadata: { contentType: 'application/json; charset=utf-8' } };

/**
 * Where the build puts the bundled catalogue: at the root, where the app is. The same place `catalogue.ts` reads,
 * asked here because a preview is not one of the shapes that reader answers.
 */
const PLACES = ['/catalogue/'] as const;

export const servesKennel = (pathname: string): boolean => pathname === KENNEL_BASE.slice(0, -1) || pathname.startsWith(KENNEL_BASE);

/* ── answers ─────────────────────────────────────────────────────────────── */

type How = { kept?: boolean; head?: boolean; extra?: readonly [string, string][] };

/** Every answer the Kennel gives: `no-store` unless it is a published file, and no `access-control-allow-*` on any. */
function answer(status: number, body: string, how: How = {}): Response {
  return new Response(how.head === true ? null : body, {
    status,
    headers: [
      ['content-type', 'application/json; charset=utf-8'],
      ['cache-control', how.kept === true ? IMMUTABLE : 'no-store'],
      ['x-content-type-options', 'nosniff'],
      ...(how.extra ?? []),
    ],
  });
}

/** A refusal in the envelope every `/api` answer uses, with `Retry-After` when it says when. */
function refusedWith(status: number, refusal: Refusal, how: How = {}): Response {
  const wait = refusal.retry_after;
  const later: [string, string][] = status === 429 && typeof wait === 'number' && Number.isSafeInteger(wait) && wait > 0 ? [['retry-after', String(wait)]] : [];
  return answer(status, JSON.stringify({ ok: false, refusal }), { ...how, extra: [...(how.extra ?? []), ...later] });
}

/** A write's result: `{ ok: true, value }` or its refusal, at the status `/api` gives the same code. */
function settled(out: Result<unknown>): Response {
  if (out.ok) return answer(200, JSON.stringify({ ok: true, value: out.value }));
  return refusedWith(httpStatus(out), 'refusal' in out ? out.refusal : { code: 'INTERNAL', fix: 'The Kennel could not say what went wrong. Ask again in a moment.' });
}

const WHAT: Refusal = {
  code: 'ROUTE_UNKNOWN',
  fix: 'The Kennel answers index.json, counts.json, packs/<id>/<version>.pack.json, usecases/<id>/<version>.usecase.json and their .preview.json, and takes submit, yank and mine.',
};
const NO_BUCKET: Refusal = { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog keeps no Kennel of its own: it has no BLOBS bucket, so it takes no submissions, yanks or verdicts.' };
const NOBODY: Refusal = { code: 'UNAUTHORIZED', fix: 'Sign the file with your author key, or sign in to BrainDog here and send it from this site.' };
const CROSS: Refusal = { code: 'FORBIDDEN', fix: "A write to the Kennel is accepted from a page on this BrainDog, or signed by its author's key.", at: 'origin' };
const NOT_WRITE: Refusal = { code: 'FORBIDDEN', fix: 'A token that only reads or proposes publishes and yanks nothing. Use one that may write, or sign the file with your author key.', at: 'authorization' };
const OPERATOR: Refusal = { code: 'UNAUTHORIZED', fix: 'This takes the operator key.', at: 'authorization' };
const NO_OPERATOR: Refusal = { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog has no operator key (PROVISION_KEY), so its Kennel has no review and no trusted publishers.' };

/**
 * One request under `/api/kennel/v1/`, answered whole. A path or a method the Kennel does not take is its 404 or 405, and
 * a throw from a bucket or the assets is a 500 whose line names what failed and holds no body a caller sent.
 */
export async function serveKennel(request: Request, deps: KennelDeps): Promise<Response> {
  const asked = kennelAsk(request.method, new URL(request.url).pathname);
  if ('wrong' in asked)
    return asked.wrong === 'method'
      ? refusedWith(405, { code: 'ROUTE_UNKNOWN', fix: `This Kennel address takes ${asked.allow}.` }, { extra: [['allow', asked.allow]] })
      : refusedWith(404, WHAT);
  const now = deps.now ?? (() => new Date());
  const head = request.method === 'HEAD';
  try {
    if (!head && request.method !== 'GET' && deps.spend !== undefined) {
      const over = await deps.spend(request);
      if (over !== null) {
        await request.body?.cancel().catch(() => undefined);
        return over;
      }
    }
    switch (asked.ask) {
      case 'index': {
        /* THE PUBLIC INDEX LEAVES OUT AN `unlisted` ENTRY AND A `private` ONE (`listedEntries`), while its files still
           download by exact path, and install by id or by link keeps resolving against the bundled catalogue, which
           keeps it. */
        const merged = mergeIndexes(await bundledIndex(deps.assets, false), await readingIndex(deps.blobs));
        return answer(200, JSON.stringify({ ...merged, entries: listedEntries(merged) }), { head });
      }
      case 'counts':
        return answer(200, await countsOf(deps.blobs, now()), { head });
      case 'file':
      case 'preview': {
        const text = await fileOf(deps, asked.path);
        return text === null
          ? refusedWith(404, { code: 'ROUTE_UNKNOWN', fix: `The Kennel holds no ${asked.path}.` }, { head })
          : answer(200, text, { kept: asked.ask === 'file', head });
      }
      case 'submit':
        return await submit(request, deps, now);
      case 'yank':
        return await yank(request, deps, now);
      case 'mine':
        return await mine(request, deps);
      case 'review':
      case 'verdict':
      case 'publisher':
        return await operated(request, deps, asked.ask, now);
      case 'advisories':
        return answer(200, JSON.stringify(await advisoriesOf(deps)), { head });
      case 'advise':
        return await advise(request, deps, now);
      case 'key':
        return await keyStatement(request, deps);
      case 'report':
        return await report(request, deps, now);
    }
  } catch (e) {
    op({ op: 'kennel', ask: asked.ask, ok: false, error: e instanceof Error ? e.message : String(e) }, 'error');
    return refusedWith(500, { code: 'INTERNAL', fix: 'The Kennel could not answer this just now. Ask again in a moment.' });
  }
}

/* ── reading ─────────────────────────────────────────────────────────────── */

/**
 * A file from the bundled catalogue, or `null`. THE ASSETS ANSWER THE APP'S SHELL FOR A PATH THEY DO NOT HOLD, with a
 * 200, so an answer that is not JSON is a file that is not there.
 */
async function bundledFile(assets: Assets | undefined, path: string): Promise<string | null> {
  if (assets === undefined) return null;
  for (const place of PLACES) {
    try {
      const res = await assets.fetch(new Request(`https://assets.invalid${place}${path}`));
      if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) return await res.text();
    } catch {
      /* An asset read that throws is a file that is not there, and the next place is asked. */
    }
  }
  return null;
}

/**
 * The deployed build's catalogue, or `null` where none is bundled.
 *
 * `strict` FOR A SUBMISSION, because the bundled ids are the ones no submission may take: an index that is bound and
 * does not read is a throw, never an empty list that would let one through.
 */
async function bundledIndex(assets: Assets | undefined, strict: boolean): Promise<CatalogueIndex | null> {
  const text = await bundledFile(assets, INDEX);
  if (text === null) {
    if (strict && assets !== undefined) throw new Error('the bundled catalogue index is not in the static assets, so no id can be held to it');
    return null;
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    doc = undefined;
  }
  const read = readCatalogue(doc);
  if (read.ok) return read.value;
  if (strict) throw new Error('the bundled catalogue index does not read, so no id can be held to it');
  return null;
}

const catalogueOf = (doc: unknown): CatalogueIndex | null => {
  const read = readCatalogue(doc);
  return read.ok ? read.value : null;
};

/** The Kennel's index for a reader: what R2 holds, or nothing when there is no bucket or the file does not read. */
async function readingIndex(blobs: KennelBucket | undefined): Promise<CatalogueIndex | null> {
  if (blobs === undefined) return null;
  try {
    return (await stored(blobs, INDEX, catalogueOf, () => emptyCatalogue('BrainDog Kennel'))).value;
  } catch (e) {
    /* A READER IS SERVED THE BUNDLED CATALOGUE ALONE, and the line says why; only a write refuses on it. */
    op({ op: 'kennel', ask: 'index', ok: false, error: e instanceof Error ? e.message : String(e) }, 'error');
    return null;
  }
}

/**
 * A published file or preview: R2 first, then the bundled catalogue, then the waiting copy the Kennel's index names.
 *
 * THE WAITING COPY IS ASKED LAST, and only on a miss, because it costs a read of the index: it answers only in the
 * moment between a listing's commit and its copy, or for a copy that never landed (`Change`).
 */
async function fileOf(deps: Pick<KennelDeps, 'blobs' | 'assets'>, path: string): Promise<string | null> {
  const blobs = deps.blobs;
  if (blobs === undefined) return bundledFile(deps.assets, path);
  const kept = await blobs.get(PREFIX + path);
  if (kept !== null) return kept.text();
  return (await bundledFile(deps.assets, path)) ?? (await waitingCopy(blobs, await readingIndex(blobs), path));
}

/** The waiting copy of a file the Kennel's index lists, or `null`. Its path is its checksum, so its bytes are the listed ones. */
async function waitingCopy(blobs: KennelBucket, index: CatalogueIndex | null, path: string): Promise<string | null> {
  const at = index === null ? null : listedPending(index, path);
  const copy = at === null ? null : await blobs.get(PREFIX + at);
  return copy === null ? null : copy.text();
}

/**
 * `counts.json` as R2 holds it, or nothing counted yet. The nightly walk writes it already rounded (`writeCounts`), and
 * a reader rounds again (`roundCount`), which changes nothing on a rounded number and holds a file from before.
 */
async function countsOf(blobs: KennelBucket | undefined, now: Date): Promise<string> {
  const kept = blobs === undefined ? null : await blobs.get(PREFIX + COUNTS);
  if (kept !== null) {
    try {
      const doc = JSON.parse(await kept.text()) as unknown;
      const map = typeof doc === 'object' && doc !== null ? (doc as Record<string, unknown>) : {};
      const counts = typeof map.counts === 'object' && map.counts !== null && !Array.isArray(map.counts) ? (map.counts as Record<string, unknown>) : null;
      if (typeof map.at === 'string' && counts !== null && Object.values(counts).every((n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0))
        return JSON.stringify({ at: map.at, counts });
    } catch {
      /* A counts file that does not read counts nothing, which is what a reader is told below. */
    }
  }
  return JSON.stringify({ at: now.toISOString(), counts: {} });
}

/** What the nightly walk hands the counts write: the bucket, and the bundled catalogue beside the Kennel's own index. */
export type CountsDeps = { blobs: KennelBucket; assets?: Assets | undefined };

/**
 * `counts.json` from one night's tally: how many hosted records have each listing on, keyed `<kind>:<id>`, answering how
 * many listings it names. `held` is the walk's tally by the id a record holds a pack under (`installedIdOf`).
 *
 * ONLY WHAT THE PUBLIC INDEX LISTS IS NAMED. A record's own add-on, one waiting for review and an `unlisted` one are all
 * ids in `held`, and the file is public: a count beside an id nobody published would tell the world that somebody holds
 * it. So each id is looked up in the index a reader is served (the bundled catalogue and the Kennel's, merged, listed
 * entries only), and one that is not there is left out.
 *
 * ROUNDED DOWN HERE, AND NOTHING UNDER TEN, because the file is read by anybody. `roundCount` is what every reader says,
 * and a raw number in a public file would let two nights be subtracted into which record turned what on. A reader that
 * rounds again changes nothing.
 *
 * BOTH INDEXES ARE READ STRICTLY, as a submission reads them: one that is bound and does not read is a throw, and the
 * last night's file stands. Read leniently, a night with a broken index would write every Kennel listing's count away.
 *
 * ONE UNCONDITIONAL PUT. The walk is the file's one writer and writes it whole once a night, so there is no other write
 * to lose a race to, and a night that throws before this leaves the last night's file standing.
 */
export async function writeCounts(deps: CountsDeps, held: ReadonlyMap<string, number>, now: Date): Promise<number> {
  const kennel = await stored(deps.blobs, INDEX, catalogueOf, () => emptyCatalogue('BrainDog Kennel'));
  const index = mergeIndexes(await bundledIndex(deps.assets, true), kennel.value);
  const counts: Record<string, number> = {};
  for (const entry of listedEntries(index)) {
    const said = roundCount(held.get(installedIdOf(entry)) ?? 0);
    if (said !== null) counts[`${entry.kind}:${entry.id}`] = said;
  }
  await deps.blobs.put(PREFIX + COUNTS, JSON.stringify({ at: now.toISOString(), counts }), JSON_FILE);
  return Object.keys(counts).length;
}

/* ── one reader for installs ────────────────────────────────────────────── */

/** One version as a record would install it: its entry, the version the index lists, and the file, its checksum held. */
export type KennelFound = { entry: CatalogueEntry; version: CatalogueVersion; text: string };

/** What `kennelReader` answers: the merged index, a file by its catalogue path, and one version checked whole. */
export type KennelReader = {
  /**
   * The index a host installs from: the bundled catalogue and the Kennel's merged (`mergeIndexes`), EVERY ENTRY KEPT,
   * `unlisted` ones and yanked versions included, because install by id reads them where a listing does not.
   */
  index(): Promise<CatalogueIndex>;
  /** A published file or preview by its catalogue path, as `GET` serves it (`fileOf`), or `null`. */
  file(path: string): Promise<string | null>;
  /**
   * One version and its file, or why not: an id or a version the index does not hold, a file that is not there, or a
   * file whose checksum is not the one the index lists (`CHECKSUM_MISMATCH`). A yanked version is answered with its
   * `yanked` reason, for the caller to offer or refuse.
   */
  version(kind: EntryKind, id: string, version: string): Promise<Result<KennelFound>>;
  /** Every advisory a record is told, the bundled folder's and the Kennel's (`advisoriesOf`). */
  advisories(): Promise<Advisories>;
};

/**
 * The Kennel read the way a host installs from it (SHL-B05's port is built over this, in `catalogue.ts`). THE SAME TWO
 * READS THE PUBLIC DOORS MAKE, `mergeIndexes` over the bundled index and the Kennel's and `fileOf` for a file, so what a
 * record installs by id is what `GET index.json` and `GET packs/...` serve, unlisted entries included. A Kennel index
 * that does not read is the bundled catalogue alone, as a reader is served it; only a write refuses on it.
 */
export function kennelReader(deps: Pick<KennelDeps, 'blobs' | 'assets'>): KennelReader {
  const index = async (): Promise<CatalogueIndex> => mergeIndexes(await bundledIndex(deps.assets, false), await readingIndex(deps.blobs));
  const file = (path: string): Promise<string | null> => fileOf(deps, path);
  return {
    index,
    file,
    advisories: () => advisoriesOf(deps),
    async version(kind, id, version) {
      const entry = (await index()).entries.find((e) => e.kind === kind && e.id === id);
      const said = kind === 'pack' ? 'plugin' : 'use case';
      if (entry === undefined) return no('REF_UNKNOWN', `The catalogue holds no ${said} ${id}.`, { at: 'id' });
      const listed = entry.versions.find((v) => v.version === version);
      if (listed === undefined) return no('REF_UNKNOWN', `The catalogue holds ${entry.title} at ${entry.latest}, not at ${version}.`, { at: 'version' });
      const text = await file(catalogueFile(id, version, kind));
      if (text === null) return no('UNREACHABLE', `${entry.title} ${version} is listed, but its file is not there just now. Ask again in a moment.`, { at: 'version' });
      if ((await fileChecksum(text)) !== listed.checksum)
        return no('CHECKSUM_MISMATCH', `The file served for ${entry.title} ${version} is not the one the catalogue lists, so nothing was installed from it.`, { at: 'checksum' });
      return ok({ entry, version: listed, text });
    },
  };
}

/**
 * The documents a scratch install requires (`kennel-scratch.ts` `required`), by id: BrainDog's own module as a record
 * installs one with no use case and no example rows (`moduleDocument`), else the version the Kennel lists as latest of
 * an add-on, its checksum held (`kennelReader`). An id neither holds is left out, and the scratch names it.
 */
export async function kennelRequired(deps: Pick<KennelDeps, 'blobs' | 'assets'>, ids: readonly string[], now: Date): Promise<Record<string, unknown>[]> {
  const reader = kennelReader(deps);
  const today = now.toISOString().slice(0, 10);
  const out: Record<string, unknown>[] = [];
  let index: CatalogueIndex | null = null;
  /* A MODULE'S LINK TO A LIST THE SCRATCH WILL NOT HOLD IS LEFT OUT, as a record leaves it out (`holds`): the lists are
     what BrainDog's own modules asked for here declare, so People installed without Portfolio links to no projects. */
  const holds = ids.flatMap((id) => {
    const bare = moduleDocument(null, id, { today });
    const decls = Array.isArray(bare?.declarations) ? (bare.declarations as unknown[]) : [];
    return decls.flatMap((d) => (typeof d === 'object' && d !== null && typeof (d as { register?: unknown }).register === 'string' ? [(d as { register: string }).register] : []));
  });
  for (const id of ids) {
    const own = moduleDocument(null, id, { today, holds });
    if (own !== null) {
      out.push(own as Record<string, unknown>);
      continue;
    }
    index ??= await reader.index();
    const entry = index.entries.find((e) => e.kind === 'pack' && e.id === id);
    if (entry === undefined) continue;
    const found = await reader.version('pack', id, entry.latest);
    if (!found.ok) continue;
    try {
      const doc = JSON.parse(found.value.text) as unknown;
      if (typeof doc === 'object' && doc !== null && !Array.isArray(doc)) out.push(doc as Record<string, unknown>);
    } catch {
      /* A listed file that is not JSON is a module nobody holds, and the scratch says so. */
    }
  }
  return out;
}

/* ── the four vital signs ───────────────────────────────────────────────── */

/** How old `counts.json` may be before its sign is red: a night missed, and half a night more. */
export const COUNTS_FRESH_MS = 36 * 3_600_000;
/** How long the oldest submission may wait for review before its sign is red. */
export const REVIEW_LATE_MS = 7 * 86_400_000;
/** The most entries the index sign checks a file for in one night, newest version each. */
export const VITAL_FILES_MOST = 500;

/**
 * One of the Kennel's four vital signs, as the night's note in the ops record says it: which sign,
 * whether it is well, and its line. A RED LINE CARRIES A MARK AND A WORD, never colour alone.
 */
export type KennelSign = { sign: 'index' | 'counts' | 'review' | 'outside'; ok: boolean; line: string };

const well = (sign: KennelSign['sign'], line: string): KennelSign => ({ sign, ok: true, line: `✓ ${line}` });
const red = (sign: KennelSign['sign'], line: string): KennelSign => ({ sign, ok: false, line: `✗ ${line} Needs a look.` });

/** Up to three names, and how many more. */
const someOf = (names: readonly string[]): string => (names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${String(names.length - 3)} more`);

/** A span as the note says it: hours under two days, days after. */
const ago = (ms: number): string => {
  const hours = Math.max(0, Math.floor(ms / 3_600_000));
  if (hours < 1) return 'under an hour';
  if (hours < 48) return hours === 1 ? '1 hour' : `${String(hours)} hours`;
  return `${String(Math.floor(hours / 24))} days`;
};

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * The Kennel's four vital signs for one night, in the order the note says them:
 *
 * 1. THE INDEX EQUALS ITS FILES. The bundled catalogue is `packs/` at the deployed commit (`from-packs`), so every
 *    entry's newest version, bundled or the Kennel's, is fetched as a reader is served it and held to the checksum the
 *    index lists. A file changed under a published version, or one that is gone, is named.
 * 2. `counts.json` IS YOUNGER THAN 36 HOURS AND EVERY NUMBER IS ONE OF THE FIVE STEPS (`roundCount`).
 * 3. HOW MANY SUBMISSIONS WAIT, AND THE AGE OF THE OLDEST: red past `REVIEW_LATE_MS`.
 * 4. HOW MANY LISTED ADD-ONS HAVE A PUBLISHER THAT IS NOT BRAINDOG, the measure of strangers publishing.
 *    None is red: it stays the open measure until a stranger's add-on is listed. An unlisted one, the probe's among
 *    them, and one whose every version is yanked are not counted.
 *
 * EACH SIGN IS ITS OWN: a file that does not read is that sign's red line, and the others are still said. The walk
 * calls this after the counts are written, so sign 2 reads tonight's file.
 */
export async function kennelVitals(deps: CountsDeps, now: Date): Promise<KennelSign[]> {
  let indexes: Indexes;
  try {
    const kennel = (await stored(deps.blobs, INDEX, catalogueOf, () => emptyCatalogue('BrainDog Kennel'))).value;
    indexes = { merged: mergeIndexes(await bundledIndex(deps.assets, true), kennel), kennel };
  } catch (e) {
    op({ op: 'kennel.vitals', sign: 'index', ok: false, error: why(e) }, 'error');
    indexes = { failed: 'the catalogue index does not read' };
  }
  return [await indexSign(deps, indexes), await countsSign(deps.blobs, now), await reviewSign(deps.blobs, indexes, now), outsideSign(indexes)];
}

type Indexes = { merged: CatalogueIndex; kennel: CatalogueIndex } | { failed: string };

async function indexSign(deps: CountsDeps, indexes: Indexes): Promise<KennelSign> {
  if ('failed' in indexes) return red('index', `Kennel index: ${indexes.failed}.`);
  const differ: string[] = [];
  const entries = indexes.merged.entries.slice(0, VITAL_FILES_MOST);
  for (const entry of entries) {
    const listed = entry.versions.find((v) => v.version === entry.latest) ?? entry.versions[0];
    if (listed === undefined) continue;
    try {
      const text = await fileOf(deps, catalogueFile(entry.id, listed.version, entry.kind));
      if (text === null || (await fileChecksum(text)) !== listed.checksum) differ.push(`${entry.title} ${listed.version}`);
    } catch (e) {
      op({ op: 'kennel.vitals', sign: 'index', ok: false, error: why(e) }, 'error');
      differ.push(`${entry.title} ${listed.version}`);
    }
  }
  const total = String(entries.length);
  return differ.length === 0
    ? well('index', `Kennel index: all ${total} published files match it.`)
    : red('index', `Kennel index: ${String(differ.length)} of ${total} files differ from it or are missing (${someOf(differ)}).`);
}

async function countsSign(blobs: KennelBucket, now: Date): Promise<KennelSign> {
  let doc: unknown;
  try {
    const kept = await blobs.get(PREFIX + COUNTS);
    if (kept === null) return red('counts', 'Kennel counts: never written.');
    doc = JSON.parse(await kept.text()) as unknown;
  } catch (e) {
    op({ op: 'kennel.vitals', sign: 'counts', ok: false, error: why(e) }, 'error');
    return red('counts', 'Kennel counts: the file does not read.');
  }
  const map = typeof doc === 'object' && doc !== null && !Array.isArray(doc) ? (doc as Record<string, unknown>) : {};
  const at = typeof map.at === 'string' ? Date.parse(map.at) : Number.NaN;
  const counts = typeof map.counts === 'object' && map.counts !== null && !Array.isArray(map.counts) ? Object.values(map.counts as Record<string, unknown>) : null;
  if (!Number.isFinite(at) || counts === null) return red('counts', 'Kennel counts: the file does not read.');
  const age = now.getTime() - at;
  if (age > COUNTS_FRESH_MS) return red('counts', `Kennel counts: written ${ago(age)} ago, past 36 hours.`);
  const off = counts.filter((n) => typeof n !== 'number' || roundCount(n) !== n).length;
  if (off > 0) return red('counts', `Kennel counts: ${String(off)} of ${String(counts.length)} numbers are not rounded to 10, 50, 100, 500 or 1000.`);
  return well('counts', `Kennel counts: written ${ago(age)} ago, all ${String(counts.length)} rounded.`);
}

async function reviewSign(blobs: KennelBucket, indexes: Indexes, now: Date): Promise<KennelSign> {
  let review: Review;
  try {
    review = (await stored(blobs, REVIEW, readReview, emptyReview)).value;
  } catch (e) {
    op({ op: 'kennel.vitals', sign: 'review', ok: false, error: why(e) }, 'error');
    return red('review', 'Kennel review: the review file does not read.');
  }
  /* A WAITING SUBMISSION ALREADY LISTED IS ONE WHOSE REVIEW FILE WAS NOT WRITTEN AFTER ITS INDEX, and does not wait. */
  const kennel = 'failed' in indexes ? null : indexes.kennel;
  const waiting = review.pending.filter(
    (p) => kennel === null || !kennel.entries.some((e) => e.kind === p.entry.kind && e.id === p.entry.id && e.versions.some((v) => v.version === p.version.version)),
  );
  if (waiting.length === 0) return well('review', 'Kennel review: nothing waiting.');
  const oldest = Math.min(...waiting.map((p) => Date.parse(p.submitted_at)).filter(Number.isFinite));
  const age = Number.isFinite(oldest) ? now.getTime() - oldest : 0;
  const said = `Kennel review: ${String(waiting.length)} waiting, the oldest ${ago(age)}.`;
  return age > REVIEW_LATE_MS ? red('review', said) : well('review', said);
}

function outsideSign(indexes: Indexes): KennelSign {
  if ('failed' in indexes) return red('outside', `Kennel publishers: ${indexes.failed}.`);
  const outside = listedEntries(indexes.merged).filter((e) => e.kind === 'pack' && e.publisher !== undefined && e.publisher.kind !== 'braindog' && offeredVersion(e) !== null);
  /* RED BY DESIGN UNTIL A STRANGER PUBLISHES, AND NOT A FAULT (`nightlyWalk`), so it carries its mark without "Needs a
     look", which a line said every night would teach the operator to skip. */
  if (outside.length === 0) return { sign: 'outside', ok: false, line: '✗ Kennel publishers: no listed plugin is by anyone but BrainDog yet.' };
  return well('outside', `Kennel publishers: ${outside.length === 1 ? '1 listed plugin is' : `${String(outside.length)} listed plugins are`} by publishers other than BrainDog.`);
}

/* ── the three files ────────────────────────────────────────────────────── */

type Stored<T> = { value: T; etag: string | null };

/**
 * One of the Kennel's files and the version it was read at. Absent is the empty file with no version. PRESENT AND
 * UNREADABLE IS A THROW, so nothing is ever written over a file this build cannot read.
 */
async function stored<T>(blobs: KennelBucket, name: string, read: (doc: unknown) => T | null, empty: () => T): Promise<Stored<T>> {
  const got = await blobs.get(PREFIX + name);
  if (got === null) return { value: empty(), etag: null };
  let doc: unknown;
  try {
    doc = JSON.parse(await got.text());
  } catch {
    doc = undefined;
  }
  const value = read(doc);
  if (value === null) throw new Error(`${PREFIX}${name} does not read as the Kennel's own file, so nothing was written over it`);
  return { value, etag: got.etag };
}

/** A file written only if it is still the version read; `false` when another write came first. */
async function put(blobs: KennelBucket, name: string, value: unknown, etag: string | null): Promise<boolean> {
  const text = JSON.stringify(value);
  return (await blobs.put(PREFIX + name, text, etag === null ? JSON_FILE : { ...JSON_FILE, onlyIf: { etagMatches: etag } })) !== null;
}

type Loaded = { index: Stored<CatalogueIndex>; review: Stored<Review>; publishers: Stored<Publishers> };

const loaded = async (blobs: KennelBucket): Promise<Loaded> => {
  const [index, review, publishers] = await Promise.all([
    stored(blobs, INDEX, catalogueOf, () => emptyCatalogue('BrainDog Kennel')),
    stored(blobs, REVIEW, readReview, emptyReview),
    stored(blobs, PUBLISHERS, readPublishers, emptyPublishers),
  ]);
  return { index, review, publishers };
};

/**
 * A change applied in `Change`'s order: the waiting copies first, so nothing is listed before it can be fetched; the
 * index, as the commit; the copy to the listed path, which only the write that won the commit makes; the review file
 * after it; and the files a listing leaves behind last. `false` when the commit lost a race.
 *
 * THE WAITING FILE IS READ BEFORE THE COMMIT, so a listing whose file is gone refuses before anything names it. A tidying
 * verdict, which commits no index, finds it gone when the write that listed it already copied and dropped it, and has
 * nothing to copy. A COPY THAT FAILS AFTER THE COMMIT IS A LINE, NOT A REFUSAL: the version is listed, a reader is served
 * its waiting copy (`fileOf`), and that copy is kept rather than dropped.
 */
async function applied(blobs: KennelBucket, at: Loaded, change: Change): Promise<boolean> {
  for (const file of change.files) await blobs.put(PREFIX + file.path, file.text, JSON_FILE);
  const waiting = change.move === null ? null : await blobs.get(PREFIX + change.move.from);
  const moving = waiting === null ? null : await waiting.text();
  if (change.move !== null && moving === null && change.index !== null) throw new Error(`${change.move.from} is not in the bucket, so it was not listed`);
  if (change.index !== null) {
    if (!(await put(blobs, INDEX, change.index, at.index.etag))) return false;
  } else if (change.review !== null && !(await put(blobs, REVIEW, change.review(at.review.value), at.review.etag))) return false;
  let keep: string | null = null;
  if (change.move !== null && moving !== null) {
    try {
      await blobs.put(PREFIX + change.move.to, moving, JSON_FILE);
    } catch (e) {
      keep = change.move.from;
      op({ op: 'kennel.copy', path: change.move.to, ok: false, error: e instanceof Error ? e.message : String(e) }, 'error');
    }
  }
  if (change.index !== null && change.review !== null) await patched(blobs, change.review);
  for (const path of change.drop) if (path !== keep) await blobs.delete(PREFIX + path);
  return true;
}

/**
 * The review file changed after the index already was. THE INDEX IS THE COMMIT, so this is tidying: a listed version
 * still waiting, or a submission not yet counted, which the next verdict on it or the next day puts right.
 */
async function patched(blobs: KennelBucket, change: (was: Review) => Review): Promise<void> {
  for (let tries = 0; tries < KENNEL_TRIES; tries += 1) {
    const now = await stored(blobs, REVIEW, readReview, emptyReview);
    if (await put(blobs, REVIEW, change(now.value), now.etag)) return;
  }
  op({ op: 'kennel.review', ok: false, tries: KENNEL_TRIES }, 'error');
}

/** Ask the rules over what the bucket holds and write what they say, reading again after a lost race. */
async function changed<A>(
  blobs: KennelBucket,
  rule: (state: { index: CatalogueIndex; review: Review; publishers: Publishers }) => Result<Change & { answer: A }> | Promise<Result<Change & { answer: A }>>,
): Promise<Result<A>> {
  for (let tries = 0; tries < KENNEL_TRIES; tries += 1) {
    const at = await loaded(blobs);
    const out = await rule({ index: at.index.value, review: at.review.value, publishers: at.publishers.value });
    if (!out.ok) return out as Result<A>;
    if (await applied(blobs, at, out.value)) return ok(out.value.answer);
  }
  return no('RATE_LIMITED', `Other changes to the Kennel landed while this one was being written, ${KENNEL_TRIES} times over. Send it again in a moment.`, { retry_after: 5 });
}

/* ── who is asking ──────────────────────────────────────────────────────── */

/**
 * The body as JSON, or `BODY_MALFORMED`. COUNTED AS IT ARRIVES, as `@braindog/host`'s `textOf` counts an `/api` body:
 * `Content-Length` is a claim, so it is checked first and the count is the check that holds, and reading stops at the
 * first piece past the cap, so the rest is never held.
 */
async function bodyOf(request: Request, cap: number, door: string): Promise<Result<unknown>> {
  const over = no<unknown>('BODY_MALFORMED', `${door} takes a body of at most ${cap} bytes.`, { at: 'body' });
  if (Number(request.headers.get('content-length') ?? 0) > cap) {
    await request.body?.cancel().catch(() => undefined);
    return over;
  }
  const parts: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > cap) {
        await reader.cancel().catch(() => undefined);
        return over;
      }
      parts.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.byteLength;
  }
  try {
    return ok(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
  } catch {
    return no('BODY_MALFORMED', `${door} takes a JSON object as its body.`, { at: 'body' });
  }
}

/** Whether the bearer is the operator's key, compared in constant time. An unset key is nobody's. */
async function isOperator(request: Request, key: string | undefined): Promise<boolean> {
  if (key === undefined || key === '') return false;
  const sent = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  return sent !== '' && (await sameKey(sent, key));
}

type Person = { person: string; cookie?: string } | { refused: Response };

/**
 * The person an unsigned write comes from: a bearer as `/api` reads one, or this host's session, only from a page on this
 * host. A rotation the Directory made rides back on the answer, as it does on every other door.
 */
async function personOf(request: Request, deps: KennelDeps): Promise<Person> {
  if (request.headers.get('authorization') !== null) {
    const found = await bearerOf(request, 'api', deps.bearer);
    if ('status' in found) return { refused: found.status === 403 ? refusedWith(403, found.refusal) : refusedWith(401, NOBODY) };
    const principal = found.ctx.principal;
    /* ONLY A TOKEN THAT MAY WRITE SPEAKS FOR ITS PERSON HERE. A `propose` token is an agent's, whose writes wait on
       Decide; a submission or a yank under the person's name reaches the public registry with nobody deciding. */
    if (principal.kind === 'token') return principal.scope !== 'write' ? { refused: refusedWith(403, NOT_WRITE) } : { person: principal.person };
    if (principal.kind === 'person') return { person: principal.id };
    return { refused: refusedWith(401, NOBODY) };
  }
  const cookie = readSid(request, 'secure');
  if (cookie === undefined) return { refused: refusedWith(401, NOBODY) };
  /* THE COOKIE IS READ ONLY FROM THIS HOST'S OWN PAGES, before the Directory is asked anything about it. */
  if (!sameOrigin(request, deps.origin)) return { refused: refusedWith(403, CROSS) };
  const out = await deps.session(cookie);
  const carried = out.session === undefined ? undefined : out.session === 'clear' ? clearCookie('secure') : sessionCookie(out.session.sid, 'secure');
  if (out.status === 200) return carried === undefined ? { person: out.body.person } : { person: out.body.person, cookie: carried };
  if (out.status === 429) return { refused: withCookie(refusedWith(429, { code: 'RATE_LIMITED', fix: 'Too many sign-in checks just now. Send it again shortly.', retry_after: out.retryAfter }), carried) };
  if (out.status === 503) return { refused: withCookie(refusedWith(503, { code: 'RECORD_UNAVAILABLE', fix: 'Sign-in is not answering just now. Send it again shortly.' }), carried) };
  /* Expired, signed out, or sign-in off: the same 401 as nothing presented, and the cookie goes. */
  return { refused: withCookie(refusedWith(401, NOBODY), clearCookie('secure')) };
}

/** The installed ids BrainDog keeps beyond its bundled catalogue: the built-in modules and use cases. Read once. */
let reserved: readonly string[] | null = null;
const reservedIds = (): readonly string[] => (reserved ??= seedCatalogue().map((e) => e.id));

/* ── the writes ─────────────────────────────────────────────────────────── */

async function submit(request: Request, deps: KennelDeps, now: () => Date): Promise<Response> {
  const blobs = deps.blobs;
  if (blobs === undefined) return refusedWith(501, NO_BUCKET);
  const body = await bodyOf(request, SUBMIT_BODY_MOST, 'submit');
  if (!body.ok) return settled(body);
  const asked = readSubmission(body.value);
  if (!asked.ok) return settled(asked);
  const { text, signature, name } = asked.value;
  let identity: Identity;
  let cookie: string | undefined;
  if (signature !== null) {
    /* THE SESSION IS READ BESIDE A SIGNATURE, never in its place, so a person's key may claim an id that person
       published unsigned (`packages/declare/src/kennel.ts` `mayTake`). Nobody signed in is a key alone, as before. */
    const who = await personOf(request, deps);
    identity = { kind: 'key', signature, name, ...('refused' in who ? {} : { person: who.person }) };
    if (!('refused' in who)) cookie = who.cookie;
  } else {
    const who = await personOf(request, deps);
    if ('refused' in who) return who.refused;
    identity = { kind: 'person', id: who.person, name };
    cookie = who.cookie;
  }
  const bundled = (await bundledIndex(deps.assets, true)) ?? emptyCatalogue('BrainDog');
  /* THE VERSION BEFORE IS READ AS A READER IS SERVED IT, its waiting copy included, so a bump is never computed against
     nothing because the last listing's copy had not landed. */
  const readIn =
    (index: CatalogueIndex) =>
    async (path: string): Promise<string | null> => {
      const kept = await blobs.get(PREFIX + path);
      return kept !== null ? kept.text() : waitingCopy(blobs, index, path);
    };
  /* THE SCRATCH INSTALL, FOR EVERY PUBLISHER, TRUSTED OR NOT, before anything is written: a trusted version is listed by
     this call and a waiting one by a verdict with no install between, so this is the one place a page that does not
     draw is caught before a record installs it. IT RUNS ONLY FOR A SUBMISSION THE DOOR TAKES, once its
     signature is verified, its id is the sender's and the day's cap is counted, so a forged signature or a file the
     door refuses never costs an install, and is told the door's own sentence. Asked once, kept across a race's retry. */
  let undrawn: Promise<Refusal | null> | undefined;
  const scratch: { refused: Refusal | null } = { refused: null };
  const out = await changed(blobs, async (state) => {
    const took = await acceptSubmission({ ...state, bundled, reserved: reservedIds(), read: readIn(state.index) }, text, identity, now());
    if (!took.ok) return took;
    scratch.refused = await (undrawn ??= scratched(text, deps.scratch));
    return scratch.refused === null ? took : { ok: false, refusal: scratch.refused };
  });
  if (scratch.refused !== null) return withCookie(refusedWith(422, scratch.refused), cookie);
  if (out.ok && out.value.state === 'review') await noted(blobs, deps, text, out.value, now);
  return withCookie(settled(out), cookie);
}

/** The longest the pre-review note may hold the submitter's answer up. Past it the submission waits with no note. */
const NOTE_WAIT_MS = 20_000;

/**
 * THE PRE-REVIEW NOTE, once a submission waits: the model reads the file's own words, the reach the Kennel computed and
 * the code, and writes the operator one note. Written beside the waiting entry after the commit, so a model that is
 * slow, down or wrong never refuses or delays a submission past `NOTE_WAIT_MS`, and never lists one: it is a line in
 * the queue, nothing more.
 */
async function noted(blobs: KennelBucket, deps: KennelDeps, text: string, which: { kind: EntryKind; id: string; version: string }, now: () => Date): Promise<void> {
  const ask = deps.preReview;
  if (ask === undefined) return;
  try {
    const review = (await stored(blobs, REVIEW, readReview, emptyReview)).value;
    const pending = review.pending.find((p) => p.entry.kind === which.kind && p.entry.id === which.id && p.version.version === which.version);
    if (pending === undefined) return;
    const input = preReviewInput(JSON.parse(text) as unknown, pending.version.reach);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const late = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), NOTE_WAIT_MS)));
    const said = await Promise.race([ask(PRE_REVIEW_INSTRUCTIONS, input).then(noteOf), late]).finally(() => { if (timer !== null) clearTimeout(timer); });
    if (said === null) return;
    const note = { text: input.cut ? `${said} (Read only the start of its code.)` : said, by: 'model', at: now().toISOString() };
    await patched(blobs, (was) => withNote(was, which, note));
  } catch (e) {
    op({ op: 'kennel', ask: 'submit', note: 'none', error: e instanceof Error ? e.message : String(e) }, 'error');
  }
}

/** Whether this isolate has said that its Kennel lists with no scratch install. Said once, not on every submission. */
let unscratchedSaid = false;

/**
 * The scratch install (`kennel-scratch.ts`) of a submission the door has taken (`acceptSubmission`), or `null` to go on.
 * The file is read again as the door read it: cheap beside an install.
 */
async function scratched(text: string, scratch: ScratchDeps | undefined): Promise<Refusal | null> {
  if (scratch === undefined) {
    if (!unscratchedSaid) op({ op: 'kennel', ask: 'submit', scratch: 'none', why: 'no scratch record was handed to this Kennel, so a submission is taken without one' });
    unscratchedSaid = true;
    return null;
  }
  const read = await readCatalogueFile(text, { kind: 'kennel' });
  if (!read.ok) return null;
  if (read.value.kind === 'pack') return scratchInstall(read.value.file.doc, scratch);
  const { shared } = read.value;
  return shared.doc === null ? null : scratchInstall(shared.doc, scratch, shared.usecase.modules);
}

async function yank(request: Request, deps: KennelDeps, now: () => Date): Promise<Response> {
  const blobs = deps.blobs;
  if (blobs === undefined) return refusedWith(501, NO_BUCKET);
  const body = await bodyOf(request, SMALL_BODY_MOST, 'yank');
  if (!body.ok) return settled(body);
  const asked = readYank(body.value);
  if (!asked.ok) return settled(asked);
  const { signature, ...which } = asked.value;
  let by: Yanker;
  let cookie: string | undefined;
  if (signature !== null) by = { kind: 'key', signature };
  else if (await isOperator(request, deps.operator)) by = { kind: 'operator' };
  else {
    const who = await personOf(request, deps);
    if ('refused' in who) return who.refused;
    by = { kind: 'person', id: who.person };
    cookie = who.cookie;
  }
  const out = await changed(blobs, (state) => yankIn(state.index, { ...which, by }, now()));
  return withCookie(settled(out), cookie);
}

/**
 * A publisher's own submissions and where each stands (`mineIn`): waiting, listed, declined with the operator's reason,
 * or taken back. Asked by the signed-in person, by a key whose signature over `MINE_ASKED` verifies, or both; a body
 * naming neither gets the 401 every unsigned write gets. NOTHING OF ANOTHER PUBLISHER'S IS EVER IN THE ANSWER, and a
 * reason is shown only to whoever it was written for.
 */
async function mine(request: Request, deps: KennelDeps): Promise<Response> {
  const blobs = deps.blobs;
  if (blobs === undefined) return refusedWith(501, NO_BUCKET);
  const body = await bodyOf(request, SMALL_BODY_MOST, 'mine');
  if (!body.ok) return settled(body);
  const asked = readMine(body.value);
  if (!asked.ok) return settled(asked);
  const { signature } = asked.value;
  const keys: string[] = [];
  if (signature !== null) {
    if (!(await verifyYank(signature, MINE_ASKED.kind, MINE_ASKED.id, MINE_ASKED.version, MINE_ASKED.reason)))
      return refusedWith(401, { code: 'SIGNATURE_INVALID', fix: 'The signature on this ask does not verify. Sign it with your author key.', at: 'signature' });
    keys.push(signature.key_id);
  }
  /* THE SESSION IS READ BESIDE A KEY, never in its place, as a submission reads it: a person may see what they published unsigned. */
  const who = await personOf(request, deps);
  if ('refused' in who && keys.length === 0) return who.refused;
  const person = 'refused' in who ? null : who.person;
  const state = await loaded(blobs);
  const rows = mineIn({ index: state.index.value, review: state.review.value }, { keys, person });
  return withCookie(answer(200, JSON.stringify({ ok: true, value: { rows } })), 'refused' in who ? undefined : who.cookie);
}

/** The picture of a waiting file's pages, drawn in a scratch record, or `undefined` when none can be drawn (the listing goes without). */
export async function drawnPreview(deps: Pick<KennelDeps, 'blobs' | 'scratch'>, which: { kind: EntryKind; id: string; version: string }, now: Date): Promise<Preview | undefined> {
  if (deps.blobs === undefined || deps.scratch === undefined) return undefined;
  try {
    const review = (await stored(deps.blobs, REVIEW, readReview, emptyReview)).value;
    const found = waitingFile(review, which.kind, which.id, which.version);
    const kept = found === null ? null : await deps.blobs.get(PREFIX + found.path);
    if (kept === null) return undefined;
    const read = await readCatalogueFile(await kept.text(), { kind: 'kennel' });
    if (!read.ok) return undefined;
    const pages: unknown[] = [];
    const refused =
      read.value.kind === 'pack'
        ? await scratchInstall(read.value.file.doc, deps.scratch, [], pages)
        : read.value.shared.doc === null
          ? null
          : await scratchInstall(read.value.shared.doc, deps.scratch, read.value.shared.usecase.modules, pages);
    if (refused !== null || pages.length === 0) return undefined;
    const made = readPreview({ format: PREVIEW_FORMAT, made_at: now.toISOString(), pages });
    return made.ok ? made.value : undefined;
  } catch (e) {
    op({ op: 'kennel', ask: 'verdict', picture: 'none', error: e instanceof Error ? e.message : String(e) }, 'error');
    return undefined;
  }
}

/** The operator's doors: what waits, one waiting file whole, a verdict on one, and whether a publisher lists at once. */
async function operated(request: Request, deps: KennelDeps, ask: 'review' | 'verdict' | 'publisher', now: () => Date): Promise<Response> {
  if (deps.operator === undefined || deps.operator === '') return refusedWith(501, NO_OPERATOR);
  if (!(await isOperator(request, deps.operator))) return refusedWith(401, OPERATOR);
  const blobs = deps.blobs;
  if (blobs === undefined) return refusedWith(501, NO_BUCKET);

  if (ask === 'review') {
    const review = (await stored(blobs, REVIEW, readReview, emptyReview)).value;
    const head = request.method === 'HEAD';
    const q = new URL(request.url).searchParams;
    const [kind, id, version] = [q.get('kind'), q.get('id'), q.get('version')];
    if (kind === null && id === null && version === null)
      return answer(200, JSON.stringify({ ok: true, value: { pending: review.pending, refused: review.refused, reports: (await reportsOf(blobs)).value.reports.slice(-100).reverse(), advisories: (await advisoriesOf(deps)).advisories } }), { head });
    /* ONE WAITING FILE, WHOLE, so the operator reads what a submission would install, its scripts' source included. */
    if (kind === null || id === null || version === null)
      return settled(no('VALUE_MALFORMED', 'A waiting file is asked for by kind, id and version together, as the review list names it.', { at: 'query' }));
    const found = waitingFile(review, kind, id, version);
    const kept = found === null ? null : await blobs.get(PREFIX + found.path);
    if (found === null || kept === null) return refusedWith(404, { code: 'ROUTE_UNKNOWN', fix: `Nothing is waiting for review as ${kind} ${id} ${version}.` }, { head });
    return answer(200, JSON.stringify({ ok: true, value: { ...found.pending, text: await kept.text() } }), { head });
  }
  if (ask === 'verdict') {
    const body = await bodyOf(request, VERDICT_BODY_MOST, 'review');
    if (!body.ok) return settled(body);
    const verdict = readVerdict(body.value);
    if (!verdict.ok) return settled(verdict);
    /* A LISTING WITH NO PICTURE GETS ONE DRAWN FROM THE PACK'S OWN PAGES in a scratch record, so a stranger's pack is never
       shown by anything the operator or the author supplied; a pack that draws nothing is listed without one. */
    const wanted = verdict.value.verdict === 'list' && verdict.value.preview === undefined;
    const preview = wanted ? await drawnPreview(deps, verdict.value, now()) : undefined;
    const given = preview === undefined ? verdict.value : { ...verdict.value, preview };
    return settled(await changed(blobs, (state) => reviewVerdict(state, given, now())));
  }
  const body = await bodyOf(request, SMALL_BODY_MOST, 'publisher');
  if (!body.ok) return settled(body);
  const trust = readTrust(body.value);
  if (!trust.ok) return settled(trust);
  for (let tries = 0; tries < KENNEL_TRIES; tries += 1) {
    const at = await stored(blobs, PUBLISHERS, readPublishers, emptyPublishers);
    if (await put(blobs, PUBLISHERS, trustIn(at.value, trust.value, now()), at.etag)) return settled(ok(trust.value));
  }
  return settled(no('RATE_LIMITED', `Other changes to the trusted publishers landed while this one was being written, ${KENNEL_TRIES} times over. Send it again in a moment.`, { retry_after: 5 }));
}

/* ── advisories, key statements and reports ─────────────────────────────── */

const advisoriesIn = (doc: unknown): Advisories | null => readAdvisories(doc);

/**
 * Every advisory a reader is told: the bundled folder's (BrainDog's own word on its own add-ons, shipped with the
 * build) and the Kennel's, merged. A Kennel file that does not read is the bundled one alone, as the index is served.
 */
async function advisoriesOf(deps: Pick<KennelDeps, 'blobs' | 'assets'>): Promise<Advisories> {
  const bundledText = await bundledFile(deps.assets, ADVISORIES_FILE);
  let bundled: Advisories | null = null;
  try {
    bundled = bundledText === null ? null : readAdvisories(JSON.parse(bundledText));
  } catch {
    bundled = null;
  }
  let kept: Advisories | null = null;
  if (deps.blobs !== undefined)
    try {
      kept = (await stored(deps.blobs, ADVISORIES_FILE, advisoriesIn, emptyAdvisories)).value;
    } catch (e) {
      op({ op: 'kennel', ask: 'advisories', ok: false, error: e instanceof Error ? e.message : String(e) }, 'error');
    }
  return mergeAdvisories(bundled, kept);
}

/** The operator's advisory on a listed add-on, or its withdrawal. Records act on it the next time they read the index. */
async function advise(request: Request, deps: KennelDeps, now: () => Date): Promise<Response> {
  if (deps.operator === undefined || deps.operator === '') return refusedWith(501, NO_OPERATOR);
  if (!(await isOperator(request, deps.operator))) return refusedWith(401, OPERATOR);
  const blobs = deps.blobs;
  if (blobs === undefined) return refusedWith(501, NO_BUCKET);
  const body = await bodyOf(request, SMALL_BODY_MOST, 'advise');
  if (!body.ok) return settled(body);
  const asked = readAdvise(body.value);
  if (!asked.ok) return settled(asked);
  const bundled = (await bundledIndex(deps.assets, false)) ?? emptyCatalogue('BrainDog');
  for (let tries = 0; tries < KENNEL_TRIES; tries += 1) {
    const [file, index] = await Promise.all([stored(blobs, ADVISORIES_FILE, advisoriesIn, emptyAdvisories), stored(blobs, INDEX, catalogueOf, () => emptyCatalogue('BrainDog Kennel'))]);
    const out = adviseIn(file.value, [index.value, bundled], asked.value, now());
    if (!out.ok) return settled(out);
    if (await put(blobs, ADVISORIES_FILE, out.value.file, file.etag)) return settled(ok(out.value.answer));
  }
  return settled(no('RATE_LIMITED', `Other changes to the advisories landed while this one was being written, ${String(KENNEL_TRIES)} times over. Send it again in a moment.`, { retry_after: 5 }));
}

/**
 * An author's signed rotation or revocation, into the index's `keys` for every record to read. NO SIGN-IN: the statement
 * is signed by the key it speaks for, which is the whole of who is asking, and the key must have signed something listed.
 */
async function keyStatement(request: Request, deps: KennelDeps): Promise<Response> {
  const blobs = deps.blobs;
  if (blobs === undefined) return refusedWith(501, NO_BUCKET);
  const body = await bodyOf(request, SMALL_BODY_MOST, 'key');
  if (!body.ok) return settled(body);
  const asked = readKeyStatement(body.value);
  if (!asked.ok) return settled(asked);
  return settled(
    await changed(blobs, async (state) => {
      const out = await keyStatementIn(state.index, asked.value.statement);
      return out.ok ? ok({ answer: out.value.answer, index: out.value.index, review: null, files: [], move: null, drop: [] }) : (out as Result<never>);
    }),
  );
}

async function reportsOf(blobs: KennelBucket) {
  return stored(blobs, REPORTS_FILE, readReports, emptyReports);
}

/** A signed-in person's word that a listed add-on is wrong, for the operator to read beside the review list. */
async function report(request: Request, deps: KennelDeps, now: () => Date): Promise<Response> {
  const blobs = deps.blobs;
  if (blobs === undefined) return refusedWith(501, NO_BUCKET);
  const body = await bodyOf(request, SMALL_BODY_MOST, 'report');
  if (!body.ok) return settled(body);
  const asked = readReport(body.value);
  if (!asked.ok) return settled(asked);
  const who = await personOf(request, deps);
  if ('refused' in who) return who.refused;
  const bundled = (await bundledIndex(deps.assets, false)) ?? emptyCatalogue('BrainDog');
  for (let tries = 0; tries < KENNEL_TRIES; tries += 1) {
    const [file, index] = await Promise.all([reportsOf(blobs), stored(blobs, INDEX, catalogueOf, () => emptyCatalogue('BrainDog Kennel'))]);
    const out = reportIn(file.value, [index.value, bundled], asked.value, `person:${who.person}`, now());
    if (!out.ok) return withCookie(settled(out), who.cookie);
    if (await put(blobs, REPORTS_FILE, out.value.file, file.etag)) return withCookie(settled(ok(out.value.answer)), who.cookie);
  }
  return withCookie(settled(no('RATE_LIMITED', 'Other reports landed while this one was being written. Send it again in a moment.', { retry_after: 5 })), who.cookie);
}
