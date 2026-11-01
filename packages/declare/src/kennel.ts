/**
 * The Kennel: the registry every BrainDog reads add-ons and use cases from, as rules with no storage in them
 * (`docs/14-KENNEL-AND-COMMUNITY.md` §1).
 *
 * THE HOSTS ONLY READ AND WRITE. The Cloud keeps the Kennel in R2 (`apps/worker/src/kennel.ts`) and a self-host proxies
 * it (`apps/selfhost/src/kennel.ts`). Each hands this module what it read and writes back what this module answers, so
 * every rule is said once and a test holds it with no bucket at all.
 *
 * A SUBMISSION IS A CATALOGUE FILE LIKE ANY OTHER. It walks through `readCatalogueFile`, the door a record installs
 * through, and then through `publishTo`, which already keeps versions immutable, in order, and bumped as far as what
 * they change. What this module adds is who is asking, what the Kennel holds a file to beyond what a record does (a
 * title, and no manifest key outside `MANIFEST_KEYS`), and that nothing from outside is listed until a person has
 * looked at it, unless the operator has said its publisher is trusted.
 *
 * WHO IS ASKING IS A KEY OR A PERSON, NEVER A NAME. An author's signature names its key, and the key id is the
 * publisher; with no signature, the host says which signed-in person sent it. The name a submission gives is only what
 * readers see. An id belongs to whoever published it first, so a later version comes from the same person, or is signed
 * by a key that signed it before or one that key rotated to. An author's name is held the same way once they sign: every
 * later version under it, of any id, is signed by that key or its rotation (`claimOn`).
 *
 * THE STATE IS THREE FILES AND THE PUBLISHED FILES BESIDE THEM: the Kennel's own index (never the bundled one, whose ids
 * it keeps for BrainDog), the review file (what waits, what was refused, and who submitted in the last day), and the
 * trusted publishers. A change comes back as the index to write, a function over the review file, and the files to
 * write, move or drop, so a host that loses a race to another writer can apply the same change to what it reads next.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { addressFault, listingFault } from './address.ts';
import {
  CATALOGUE_FORMAT,
  PACK_FILE_MOST_BYTES,
  catalogueFile,
  compareVersions,
  fileChecksum,
  installedIdOf,
  MANIFEST_KEYS,
  previewFile,
  publishTo,
  readCatalogueFile,
  readPreview,
  type CatalogueEntry,
  type CatalogueFile,
  type CatalogueIndex,
  type CatalogueVersion,
  type EntryKind,
  type Preview,
  type Publisher,
} from './catalogue.ts';
import { usesFault } from './uses.ts';
import { isSignature, keyIdOf, REASON_MOST, revocationOf, rotatedFrom, verifiedStatements, verifySignature, type AuthorKey, type KeyStatements, type Signature } from './signing.ts';

/** Where every host answers the Kennel: under `/api/*`, which the site already forwards to the app. */
export const KENNEL_BASE = '/api/kennel/v1/';
export const KENNEL_FORMAT = 1;
/** The public Kennel a self-host reads when its operator names no other. */
export const DEFAULT_KENNEL = 'https://app.brain.dog/api/kennel/v1/';

/** The most a submitted file may weigh: what the file's own door allows, so the Kennel refuses nothing a record would take for size. */
export const SUBMIT_MOST_BYTES = PACK_FILE_MOST_BYTES;
/** Accepted submissions in a day from one publisher, listed or waiting. */
export const SUBMISSIONS_A_DAY = 10;
/** Submissions waiting for review from everybody at once. Past it, the next waits until the operator has been through some. */
export const PENDING_MOST = 200;
/** Refusals kept in the review file for the operator to read back, newest first. */
export const REFUSED_KEPT = 100;
/** The most characters a publisher's name is shown with. */
export const PUBLISHER_NAME_MOST = 80;
/** The most characters an operator's reason for a verdict holds. */
export const VERDICT_REASON_MOST = 500;
/**
 * The day's submissions the review file remembers, whatever else happens. Pruned to the last day on every write, it is
 * bounded by `PENDING_MOST` plus what trusted publishers list; this is the ceiling if the operator trusts many.
 */
export const RECENT_MOST = 5_000;
/**
 * The id prefix the Kennel keeps for its own nightly probe (`tools/probe/stranger.mjs`): a publish whose id
 * begins with it is refused from any publisher but one the operator trusted with `probe` (`kennel review trust <p>
 * --probe`), and even from that one only as an add-on whose file says `unlisted: true`, so a probe never reaches a
 * listing or the count of add-ons from outside.
 */
export const PROBE_PREFIX = 'probe-';

const DAY_MS = 86_400_000;
const ID = /^[a-z][a-z0-9-]{0,62}$/u;
const VERSION = /^(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})$/u;
const FILE = /^(packs|usecases)\/([a-z][a-z0-9-]{0,62})\/((?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5}))\.(pack|usecase|preview)\.json$/u;
/** A publisher as the trust file keys it: `key:<key id>` or `person:<person id>`. */
const PUBLISHER_KEY = /^(?:key|person):[A-Za-z0-9_-]{1,64}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/gu;
/** A manifest key a refusal may quote back: letters, digits, dashes and underscores, at most 40. */
const KEY_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/u;

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const chars = (s: string): number => [...s].length;

/* ── the state ──────────────────────────────────────────────────────────── */

/** One submission waiting for the operator: the entry it would be listed under, and the version as it would be listed. */
export type Pending = {
  entry: Omit<CatalogueEntry, 'latest' | 'versions'> & { publisher: Publisher };
  version: CatalogueVersion;
  submitted_at: string;
};

/** A submission the operator refused, kept so the next look at the review list says why. */
export type Refused = { kind: EntryKind; id: string; version: string; publisher: Publisher; reason: string; at: string };

export type Review = {
  format: typeof KENNEL_FORMAT;
  pending: Pending[];
  /** Newest first, at most `REFUSED_KEPT`. */
  refused: Refused[];
  /** Every accepted submission of the last day, by `publisherKey`, which the daily limit counts. */
  recent: { publisher: string; at: string }[];
};

/**
 * The publishers the operator trusts to list at once, by `publisherKey`. `probe` marks the one the nightly probe signs
 * with, which alone may publish under `PROBE_PREFIX`; it is kept only beside `trusted: true`.
 */
export type Publishers = { format: typeof KENNEL_FORMAT; trusted: Record<string, { trusted: boolean; at: string; probe?: true }> };

export const emptyReview = (): Review => ({ format: KENNEL_FORMAT, pending: [], refused: [], recent: [] });
export const emptyPublishers = (): Publishers => ({ format: KENNEL_FORMAT, trusted: {} });

/** A publisher as the trust file and the daily limit key it. */
export const publisherKey = (p: Pick<Publisher, 'kind' | 'id'>): string => `${p.kind}:${p.id}`;

/** The review file as a host stored it, or `null` when it is not one, so a host refuses to write over what it cannot read. */
export function readReview(doc: unknown): Review | null {
  if (!isMap(doc) || doc.format !== KENNEL_FORMAT || !Array.isArray(doc.pending) || !Array.isArray(doc.refused) || !Array.isArray(doc.recent)) return null;
  const pending = doc.pending.filter(
    (p): p is Pending => isMap(p) && isMap(p.entry) && isMap(p.entry.publisher) && typeof p.entry.id === 'string' && isMap(p.version) && typeof p.version.version === 'string' && typeof p.version.checksum === 'string' && typeof p.submitted_at === 'string',
  );
  const refused = doc.refused.filter((r): r is Refused => isMap(r) && typeof r.id === 'string' && typeof r.version === 'string' && typeof r.reason === 'string');
  const recent = doc.recent.filter((r): r is { publisher: string; at: string } => isMap(r) && typeof r.publisher === 'string' && typeof r.at === 'string');
  return { format: KENNEL_FORMAT, pending, refused, recent };
}

/** The trusted publishers as a host stored them, or `null` when that is not what the file holds. */
export function readPublishers(doc: unknown): Publishers | null {
  if (!isMap(doc) || doc.format !== KENNEL_FORMAT || !isMap(doc.trusted)) return null;
  const trusted: Publishers['trusted'] = {};
  for (const [key, v] of Object.entries(doc.trusted))
    if (PUBLISHER_KEY.test(key) && isMap(v) && typeof v.trusted === 'boolean' && typeof v.at === 'string')
      trusted[key] = { trusted: v.trusted, at: v.at, ...(v.trusted && v.probe === true ? { probe: true as const } : {}) };
  return { format: KENNEL_FORMAT, trusted };
}

/** Whether the operator said this publisher lists at once. */
const trusted = (publishers: Publishers, p: Pick<Publisher, 'kind' | 'id'>): boolean => {
  const key = publisherKey(p);
  return Object.hasOwn(publishers.trusted, key) && publishers.trusted[key]?.trusted === true;
};

/** Whether this publisher is the probe's: trusted, and trusted with `probe`. */
export const probePublisher = (publishers: Publishers, p: Pick<Publisher, 'kind' | 'id'>): boolean =>
  trusted(publishers, p) && publishers.trusted[publisherKey(p)]?.probe === true;

/** What a host hands `acceptSubmission`. */
export type KennelState = {
  /** The catalogue bundled with the deployed build: BrainDog's own, whose ids no submission may take. */
  bundled: CatalogueIndex;
  /** Installed ids the host keeps beyond the bundled catalogue: its built-in use cases and modules. */
  reserved: readonly string[];
  /** The Kennel's own index: everything listed from outside. */
  index: CatalogueIndex;
  review: Review;
  publishers: Publishers;
  /** A listed file's text by its catalogue path, or `null`, so a new version is compared with the one before it. */
  read: (path: string) => string | null | Promise<string | null>;
};

/**
 * What a write changes, for the host to apply in this order: `files`, then `index` (the commit), then `move`, then
 * `review`, then `drop`. A change with no `index` commits on `review` instead.
 *
 * THE MOVE COMES AFTER THE COMMIT, so the only write that puts bytes at a listed path is the one whose index named them.
 * Two submissions of one id and version that race each write their own waiting copy, under its own checksum, and only
 * the winner of the index copies its bytes to where readers are served; a loser that wrote there first could leave its
 * bytes under the winner's checksum. Until the copy lands, and if it never does, a reader is served the waiting copy the
 * index's checksum names (`listedPending`), which is why a host drops it only once the copy has landed.
 */
export type Change = {
  /** The Kennel's index to write, or `null` when it does not change. */
  index: CatalogueIndex | null;
  /** The review file as a function of the one read, or `null` when it does not change. */
  review: ((was: Review) => Review) | null;
  /** Files to write under the Kennel's prefix before the commit: waiting copies and previews, never a listed file. */
  files: { path: string; text: string }[];
  /** A waiting file copied to the path it is listed at, once the commit has named it. */
  move: { from: string; to: string } | null;
  /** Files to remove once both indexes are written. */
  drop: string[];
};

/**
 * Where a file waits: under `pending/`, beside nothing a reader is served, until an operator lists it or, for a trusted
 * publisher, until the index that lists it is written.
 *
 * UNDER ITS OWN CHECKSUM, because the file is written before the review file or the index names it. Two submissions of
 * one id and version that race each write their file first and only one wins; at one path per version the loser's bytes
 * could be left where the winner's waited, and the operator would then list a file its own checksum refuses.
 */
export const pendingPath = (path: string, checksum: string): string => `pending/${checksum}/${path}`;

/**
 * The waiting copy of a listed file, by the checksum the index lists it with, or `null` when the index lists no such
 * version. A host serves it when the listed path is empty: the moment between the commit and the copy, or a copy that
 * never landed. Its bytes are the ones the index names, because the path is their checksum.
 */
export function listedPending(index: CatalogueIndex, path: string): string | null {
  const m = FILE.exec(path);
  if (!m) return null;
  const [, folder, id, version, shape] = m;
  const kind: EntryKind = folder === 'packs' ? 'pack' : 'usecase';
  if (shape !== kind) return null;
  const listed = index.entries.find((e) => e.kind === kind && e.id === id)?.versions.find((v) => v.version === version);
  return listed === undefined ? null : pendingPath(path, listed.checksum);
}

const listedAt = (index: CatalogueIndex, kind: EntryKind, id: string, version: string): boolean =>
  index.entries.some((e) => e.kind === kind && e.id === id && e.versions.some((v) => v.version === version));

const byKindAndId = (a: CatalogueEntry, b: CatalogueEntry): number => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);

/** The index with one version listed under its entry, the entry made when it is the first. */
function listIn(index: CatalogueIndex, entry: Omit<CatalogueEntry, 'latest' | 'versions'>, version: CatalogueVersion): CatalogueIndex {
  const was = index.entries.find((e) => e.kind === entry.kind && e.id === entry.id);
  const versions = [version, ...(was?.versions ?? []).filter((v) => v.version !== version.version)].sort((a, b) => compareVersions(b.version, a.version));
  const listed: CatalogueEntry = { ...entry, versions, latest: (versions[0] ?? version).version };
  return { ...index, entries: [...index.entries.filter((e) => e !== was), listed].sort(byKindAndId) };
}

/* ── submitting ─────────────────────────────────────────────────────────── */

/**
 * Who is submitting: an author's key, whose signature the file carries, or a person the host signed in. A key sent from
 * a signed-in session also carries that `person`, so the key may claim an id the same person published unsigned.
 */
export type Identity =
  | { kind: 'key'; signature: Signature; name?: string | undefined; person?: string | undefined }
  | { kind: 'person'; id: string; name?: string | undefined };

export type Submitted = Change & { answer: { state: 'listed' | 'review'; kind: EntryKind; id: string; version: string } };

const subjectOf = (file: CatalogueFile): { id: string; version: string; author: string } =>
  file.kind === 'usecase'
    ? { id: file.shared.usecase.usecase, version: file.shared.usecase.version, author: file.shared.usecase.author }
    : { id: file.file.pack.manifest.pack, version: file.file.pack.manifest.version, author: file.file.pack.manifest.author };

/** The name readers see for a publisher: the one given, else the file's author, one line, at most `PUBLISHER_NAME_MOST` characters. */
const nameOf = (given: string | undefined, author: string): string => {
  const said = (given ?? '').replace(CONTROL, ' ').trim();
  const name = said !== '' ? said : author.replace(CONTROL, ' ').trim();
  return [...(name !== '' ? name : 'An author')].slice(0, PUBLISHER_NAME_MOST).join('');
};

/**
 * BRAINDOG'S OWN NAME IS NOT A NAME ANYBODY ELSE PUBLISHES UNDER, as `readPackFile` keeps ids beginning `braindog`. A
 * reader trusts "BrainDog" as the maker of what the build ships, so a file from outside that says it is BrainDog's is
 * refused before it could sit beside them in the listing.
 */
const braindogNamed = (name: string): boolean => name.toLowerCase().replace(/[^a-z]/gu, '').startsWith('braindog');

/** Every key that signed an entry's listed versions, and the publisher's own key when it is one. */
const signersOf = (listed: CatalogueEntry | null, owner: Publisher | null): string[] => [
  ...new Set([...(owner?.kind === 'key' ? [owner.id] : []), ...(listed?.versions ?? []).flatMap((v) => (v.signature ? [v.signature.key_id] : []))]),
];

/**
 * Whether this identity may publish under an id somebody already holds. A person may add to what they published; a key
 * may add to what it or a key it rotated from signed. Nobody may add to another publisher's entry.
 *
 * A REFUSAL NAMES THE ID, NEVER THE TITLE. The id is one the file's door already held to lower-case letters, digits and
 * dashes; the title is free text the sender wrote, and this public door answers nothing it was sent (`platform.md` §6
 * point 8).
 */
function mayTake(listed: CatalogueEntry | null, owner: Publisher | null, identity: Identity, statements: KeyStatements, id: string): Result<true> {
  if (listed === null && owner === null) return ok(true);
  const signers = signersOf(listed, owner);
  const pinned = signers[0];
  const theirs = no<true>('PROVIDES_CONFLICT', `${id} belongs to another publisher in the Kennel. Give this one another id.`, { at: 'id' });
  if (identity.kind === 'person') {
    if (owner?.kind === 'person' && owner.id === identity.id) return ok(true);
    return pinned === undefined ? theirs : no<true>('SIGNATURE_INVALID', `Earlier versions of ${id} are signed by key ${pinned}. Sign this one with that key too.`, { at: 'signature' });
  }
  const key = identity.signature.key_id;
  if (signers.includes(key) || rotatedFrom(statements, signers, key) !== null) return ok(true);
  /* AN ID A PERSON PUBLISHED UNSIGNED MAY BE CLAIMED BY THAT PERSON'S KEY: the host signed them in beside the
     signature, so the key is theirs. Once signed, the id is pinned to the key by the signature on that version. */
  if (owner?.kind === 'person' && identity.person !== undefined && identity.person === owner.id) return ok(true);
  return pinned === undefined ? theirs : no<true>('SIGNATURE_INVALID', `Earlier versions of ${id} are signed by key ${pinned}, and this one by key ${key}. Sign it with that key.`, { at: 'signature' });
}

/**
 * AN AUTHOR WHO HAS SIGNED SIGNS EVERY VERSION AFTER, of any id. The first signed version the Kennel lists under an
 * author's name claims that name for its key, kept where the pin on an id is kept: in the signatures on the listed
 * versions, so no file beside the index holds it and a host writes nothing new. A later version under that name is
 * signed by a key that signed under it before, or by one such a key rotated to (the index's verified statements, read
 * as Browse reads them). An author who never signed publishes unsigned as before.
 *
 * NAMES MATCH ONCE FOLDED (width, case and spacing), both the file's author and the name readers see, so a version is
 * not slipped in under a name by spelling it in capitals. The refusal says the name as the Kennel lists it, never as
 * this file spells it, since this public door echoes nothing it was sent.
 */
type Claim = { name: string; keys: string[] };

/* THE RECORD'S STAND-IN AUTHOR IS NOBODY'S NAME. A use case shared or a template written with no author named goes out
   as 'a BrainDog owner' (`packages/record/src/usecase.ts`, `apps/web/src/lib/market/template.ts`), so the first key to
   sign under it would otherwise claim it and refuse every other person's publish. It is never claimed. */
const STAND_IN_AUTHOR = 'a BrainDog owner';

const folded = (name: string): string => name.normalize('NFKC').replace(CONTROL, ' ').replace(/\s+/gu, ' ').trim().toLowerCase();

/** The claim on any of these names: the name as listed, and every key that signed under it, the first one first. */
function claimOn(index: CatalogueIndex, names: readonly string[]): Claim | null {
  const wanted = new Set(names.map(folded).filter((n) => n !== '' && n !== folded(STAND_IN_AUTHOR)));
  const signed: { name: string; key: string; at: string }[] = [];
  for (const e of index.entries) {
    const said = [e.author, e.publisher?.name ?? ''].find((n) => wanted.has(folded(n)));
    if (said === undefined) continue;
    for (const v of e.versions) if (v.signature) signed.push({ name: said, key: v.signature.key_id, at: v.published_at });
  }
  signed.sort((a, b) => a.at.localeCompare(b.at));
  const first = signed[0];
  return first === undefined ? null : { name: first.name, keys: [...new Set(signed.map((s) => s.key))] };
}

/* SIGNATURE_REQUIRED is the code this refusal is for, and waits on the registry (`packages/ports`); until it is there
   the Kennel says SIGNATURE_INVALID, which a host and Browse already read as "signed wrong or not at all". */
function mayAuthor(claim: Claim | null, identity: Identity, statements: KeyStatements): Result<true> {
  if (claim === null) return ok(true);
  if (identity.kind === 'person')
    return no('SIGNATURE_INVALID', `${claim.name} signs every version, and this one is not signed. Publish it from the app you signed with before.`, { at: 'signature' });
  const key = identity.signature.key_id;
  if (claim.keys.includes(key) || rotatedFrom(statements, claim.keys, key) !== null) return ok(true);
  return no('SIGNATURE_INVALID', `${claim.name} signs every version with one key, and this one is signed with another. Sign it with that key, or publish its rotation to the new key first.`, {
    at: 'signature',
  });
}

const unsigned = ({ signature: _signature, ...v }: CatalogueVersion): CatalogueVersion => v;

/**
 * A file submitted to the Kennel, checked in `platform.md` §4.0 K's order: its size, its door, its title, its manifest
 * keys, an id BrainDog keeps, who is asking and whether the id is theirs, `publishTo`'s rules over what is listed and
 * what waits, and the two limits. Answers where it went, `listed` for a trusted publisher and `review` for everybody else,
 * with the change a host writes.
 */
export async function acceptSubmission(state: KennelState, text: string, identity: Identity, now: Date): Promise<Result<Submitted>> {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > SUBMIT_MOST_BYTES)
    return no('PACK_OVER_CAP', `This file is ${Math.ceil(bytes / 1024)} KB, and the Kennel takes at most ${SUBMIT_MOST_BYTES / 1024} KB. Ship fewer example rows, or split it.`, { at: 'text' });
  const read = await readCatalogueFile(text, { kind: 'kennel' });
  if (!read.ok) return read as Result<Submitted>;
  const file = read.value;
  /* The door parsed it as an object, or it would have refused above. */
  const doc = JSON.parse(text) as Record<string, unknown>;

  if (typeof doc.title !== 'string' || doc.title.trim() === '')
    return no('PACK_MALFORMED', 'The Kennel lists a file under its title, and this one has none. Add a title and submit it again.', { at: 'title' });
  /* WHAT A LISTING NEVER SAYS (a price, a rating), AND AN ADDRESS WHERE NONE MAY BE, each by its own name and before
     the closed list, which would only call `price` a key BrainDog does not read (`address.ts`). */
  const unlistable = listingFault(doc);
  if (unlistable) return { ok: false, refusal: unlistable };
  const remote = addressFault(doc);
  if (remote) return { ok: false, refusal: remote };
  /* THE MANIFEST'S CLOSED LIST IS THE KENNEL'S TO HOLD, NOT THE RECORD'S: a record reads the keys it
     knows and stays lenient, so an update it already holds never breaks, and the registry is where a key nobody reads is
     said by name. A use case keeps its own list, which its door already holds. */
  if (file.kind === 'pack') {
    const stray = Object.keys(doc).filter((k) => !(MANIFEST_KEYS as readonly string[]).includes(k));
    /* A KEY IS NAMED BACK ONLY WHEN IT READS AS A NAME, because this is a public door and what it answers is never an
       echo of what it was sent (`platform.md` §6 point 8). A key that is not one is still refused, only not quoted. */
    const quoted = stray.filter((k) => KEY_NAME.test(k)).slice(0, 3);
    if (stray.length > 0)
      return no(
        'PACK_MALFORMED',
        `The Kennel takes the manifest keys BrainDog reads and no others, and this file also says ${quoted.length > 0 ? quoted.join(', ') : 'a key BrainDog does not read'}. Take ${stray.length === 1 ? 'it' : 'them'} out and submit it again.`,
        { at: quoted[0] ?? 'manifest' },
      );
    /* WHAT IT USES OF YOURS IS SAID BY ITS AUTHOR, NOT ONLY READ OFF IT (`uses.ts`): a submission that names a list, a
       figure or a page it does not own and does not list in `uses` is refused, with the line to add, so nothing from
       outside waits for review or is listed with a reach its author left unsaid. */
    const unasked = usesFault(doc, true);
    if (unasked) return { ok: false, refusal: unasked };
  }
  const { id, version, author } = subjectOf(file);
  if (state.bundled.entries.some((e) => e.id === id) || state.reserved.includes(installedIdOf({ kind: file.kind, id })))
    return no('PROVIDES_CONFLICT', `${id} is the id of one of BrainDog's own, which the Kennel keeps for it. Give this one another id.`, { at: file.kind });

  const checksum = await fileChecksum(text);
  let publisher: Publisher;
  if (identity.kind === 'key') {
    const signed = await verifySignature(identity.signature, file.kind, id, version, checksum);
    if (!signed.ok) return signed as Result<Submitted>;
    publisher = { kind: 'key', id: identity.signature.key_id, name: nameOf(identity.name, author) };
  } else publisher = { kind: 'person', id: identity.id, name: nameOf(identity.name, author) };
  if (braindogNamed(author) || braindogNamed(publisher.name))
    return no('PROVIDES_CONFLICT', 'BrainDog is the name BrainDog publishes its own under. Publish this one under your own name.', { at: 'author' });
  /* THE PROBE'S PREFIX IS HELD ONCE THE PUBLISHER IS KNOWN, from a verified signature or the host's sign-in, so nobody
     names themselves the probe. A probe that is not unlisted would sit in Browse and in the count of add-ons from
     outside, which is what its nightly sign measures, so it is refused too. */
  if (id.startsWith(PROBE_PREFIX)) {
    if (!probePublisher(state.publishers, publisher))
      return no('PROVIDES_CONFLICT', `Ids that begin ${PROBE_PREFIX} are kept for the Kennel's own nightly probe. Give this one another id.`, { at: 'id' });
    if (file.kind !== 'pack' || doc.unlisted !== true)
      return no('PACK_MALFORMED', `A probe publishes an add-on whose file says unlisted: true, so it is never listed. Add it and publish ${id} again.`, { at: 'unlisted' });
  }

  const statements = await verifiedStatements(state.index.keys);
  if (identity.kind === 'key' && revocationOf(statements, identity.signature.key_id))
    return no('SIGNATURE_INVALID', `Key ${identity.signature.key_id} is revoked, so it signs nothing more. Sign with the key it rotated to.`, { at: 'signature' });
  const listed = state.index.entries.find((e) => e.kind === file.kind && e.id === id) ?? null;
  /* A WAITING ENTRY ALREADY LISTED IS ONE WHOSE REVIEW FILE WAS NOT WRITTEN AFTER ITS INDEX WAS, and counts for nothing. */
  const waiting = state.review.pending.filter((p) => p.entry.kind === file.kind && p.entry.id === id && !listedAt(state.index, file.kind, id, p.version.version));
  const owner = listed?.publisher ?? waiting[0]?.entry.publisher ?? null;
  /* THE AUTHOR'S CLAIM COMES BEFORE THE ID'S, so a version under a signed author's name, of an id they hold or a new
     one, is told the one sentence Browse says to its publisher. A signed-in person adding to an entry they published
     unsigned is the one exception: the host vouches it is them, and a name is not unique, so a key that signs under the
     same name never locks them out of their own add-on. */
  const ownEntry = identity.kind === 'person' && owner?.kind === 'person' && owner.id === identity.id;
  const authored = ownEntry ? ok(true) : mayAuthor(claimOn(state.index, [author, publisher.name]), identity, statements);
  if (!authored.ok) return authored as Result<Submitted>;
  const may = mayTake(listed, owner, identity, statements, id);
  if (!may.ok) return may as Result<Submitted>;
  /* ONE VERSION OF AN ENTRY WAITS AT A TIME. Its bump was computed against what is listed, and a second one computed
     against the first could list a breaking change as a minor if the operator then refused the first. */
  const held = waiting[0];
  if (held !== undefined)
    return no(
      'ALREADY_KNOWN',
      held.version.version === version
        ? `${id} ${version} is already waiting for review.`
        : `${id} ${held.version.version} is waiting for review. Submit ${version} once it has been listed or refused.`,
      { at: 'version' },
    );
  /* A VERSION ALREADY LISTED, OR ONE NOT LATER THAN WHAT IS, IS REFUSED HERE BY ITS ID. `publishTo` refuses both too,
     but names the file's title, which is free text the sender wrote (`mayTake`). A version it would refuse as malformed
     is left to it, so that refusal still comes first. */
  if (listed !== null && VERSION.test(version) && listed.versions.some((v) => v.version === version))
    return no('ALREADY_KNOWN', `${id} ${version} is already in the Kennel, and a published version never changes. Submit this file as a later version.`, { at: 'version' });
  if (listed !== null && VERSION.test(version) && compareVersions(version, listed.latest) <= 0)
    return no('ALREADY_KNOWN', `${id} ${listed.latest} is already in the Kennel, so this file needs a later version than ${version}.`, { at: 'version' });

  /* THE PIN IS HELD ABOVE, BY KEY OR BY PERSON, SO `publishTo` IS HANDED THE ENTRY WITH ITS SIGNATURES TAKEN OFF. It pins
     an entry to the key in the author's own key file, which a submission never carries, and would refuse every signed
     version after the first as unsigned. Everything else it holds, a version published once, the order of versions, the
     bump, and the file's `changes` read into the version's `notes`, it holds here exactly as it does for a folder. */
  const by: Publisher = owner === null ? publisher : { ...owner, name: publisher.name };
  const view: CatalogueIndex = { ...state.index, entries: state.index.entries.map((e) => (e === listed ? { ...e, versions: e.versions.map(unsigned) } : e)) };
  const published = await publishTo(view, text, state.read, now, undefined, by);
  if (!published.ok) return published as Result<Submitted>;

  /* THE CATEGORIES ARE `publishTo`'S, which reads them from what the file declares and gives "made by BrainDog" only to a
     BrainDog publisher: `by` is a key or a person, so no submission earns it, whatever author its file names. */
  const { latest: _latest, versions: _versions, ...made } = published.value.entry;
  const entry: Pending['entry'] = { ...made, publisher: by };
  const listing: CatalogueVersion = { ...published.value.version, ...(identity.kind === 'key' ? { signature: identity.signature } : {}) };

  const who = publisherKey(publisher);
  const since = now.getTime() - DAY_MS;
  const today = state.review.recent.filter((r) => r.publisher === who && Date.parse(r.at) > since).map((r) => Date.parse(r.at));
  if (today.length >= SUBMISSIONS_A_DAY)
    return no('RATE_LIMITED', `The Kennel takes ${SUBMISSIONS_A_DAY} submissions a day from one publisher, and this would be one more. Submit it again tomorrow.`, {
      at: 'publisher',
      retry_after: Math.max(1, Math.ceil((Math.min(...today) + DAY_MS - now.getTime()) / 1000)),
    });

  const noted = (was: Review): Review => ({
    ...was,
    recent: [...was.recent.filter((r) => Date.parse(r.at) > since), { publisher: who, at: now.toISOString() }].slice(-RECENT_MOST),
  });
  const path = published.value.path;
  const waitsAt = pendingPath(path, listing.checksum);
  const answer = { kind: file.kind, id, version };
  /* A TRUSTED FILE WAITS TOO, for as long as its index write takes: it is written under its checksum and copied to its
     listed path only once the index names it (`Change`), so a trusted submission that loses the race writes nothing a
     reader is served. */
  if (trusted(state.publishers, entry.publisher))
    return ok({
      answer: { state: 'listed', ...answer },
      index: listIn(state.index, entry, listing),
      review: noted,
      files: [{ path: waitsAt, text }],
      move: { from: waitsAt, to: path },
      drop: [waitsAt],
    });

  const queued = state.review.pending.filter((p) => !listedAt(state.index, p.entry.kind, p.entry.id, p.version.version)).length;
  if (queued >= PENDING_MOST)
    return no('RATE_LIMITED', `${PENDING_MOST} submissions are waiting for review, which is as many as the Kennel holds. Submit it again in a day or two.`, { at: 'review' });
  const pending: Pending = { entry, version: listing, submitted_at: now.toISOString() };
  return ok({
    answer: { state: 'review', ...answer },
    index: null,
    review: (was) => noted({ ...was, pending: [...was.pending.filter((p) => !(p.entry.kind === file.kind && p.entry.id === id)), pending] }),
    files: [{ path: waitsAt, text }],
    move: null,
    drop: [],
  });
}

/* ── the operator's review ──────────────────────────────────────────────── */

export type Verdict = { kind: EntryKind; id: string; version: string; verdict: 'list' | 'refuse'; reason: string; preview?: Preview };

export type Reviewed = Change & { answer: { state: 'listed' | 'refused'; kind: EntryKind; id: string; version: string } };

/**
 * The operator's verdict on a waiting submission. Listed, it moves beside the others with when it was reviewed, and a
 * preview the operator made is kept beside it; refused, it is taken off the list with the reason.
 *
 * A VERDICT ON A VERSION ALREADY LISTED ONLY TIDIES. The index is written before the review file, so a host that lost
 * the second write leaves a listed version still waiting; listing it again takes it off the list, copies its file to
 * where it is listed when the listed checksum is the waiting one's, in case the copy after the commit never landed, and
 * changes nothing else.
 */
export function reviewVerdict(state: Pick<KennelState, 'index' | 'review'>, verdict: Verdict, now: Date): Result<Reviewed> {
  const { kind, id, version } = verdict;
  const path = catalogueFile(id, version, kind);
  const answer = { kind, id, version };
  const matches = (p: Pending): boolean => p.entry.kind === kind && p.entry.id === id && p.version.version === version;
  const dropped = (was: Review): Review => ({ ...was, pending: was.pending.filter((p) => !matches(p)) });
  const held = state.review.pending.find(matches);

  if (listedAt(state.index, kind, id, version)) {
    if (verdict.verdict === 'refuse') return no('ALREADY_KNOWN', `${id} ${version} is already listed. Yank it instead, with the reason.`, { at: 'version' });
    if (!held) return ok({ answer: { state: 'listed', ...answer }, index: null, review: null, files: [], move: null, drop: [] });
    const waitsAt = pendingPath(path, held.version.checksum);
    const same = listedPending(state.index, path) === waitsAt;
    return ok({ answer: { state: 'listed', ...answer }, index: null, review: dropped, files: [], move: same ? { from: waitsAt, to: path } : null, drop: [waitsAt] });
  }
  if (!held) return no('VALUE_MALFORMED', `Nothing is waiting for review as ${kind} ${id} ${version}.`, { at: 'version' });

  if (verdict.verdict === 'refuse') {
    const refused: Refused = { kind, id, version, publisher: held.entry.publisher, reason: verdict.reason, at: now.toISOString() };
    return ok({
      answer: { state: 'refused', ...answer },
      index: null,
      review: (was) => ({ ...dropped(was), refused: [refused, ...was.refused].slice(0, REFUSED_KEPT) }),
      files: [],
      move: null,
      drop: [pendingPath(path, held.version.checksum)],
    });
  }
  /* WHO HOLDS THE ID IS READ AGAIN NOW, against the index as it stands. A submission checked while the id was free can
     wait in review while another publisher lists that id first, because the two writes each check only their own file;
     listing it then would hand the entry to whoever waited. So a waiting version is listed only under the publisher the
     index already names, and only when it is later than what is listed. */
  const listed = state.index.entries.find((e) => e.kind === kind && e.id === id) ?? null;
  if (listed !== null && (listed.publisher === undefined || publisherKey(listed.publisher) !== publisherKey(held.entry.publisher)))
    return no('PROVIDES_CONFLICT', `${id} is listed under another publisher now. Refuse this version, with that reason.`, { at: 'id' });
  if (listed !== null && compareVersions(version, listed.latest) <= 0)
    return no('ALREADY_KNOWN', `${id} ${listed.latest} is listed now, so ${version} is not later than it. Refuse this version, with that reason.`, { at: 'version' });
  const listing: CatalogueVersion = { ...held.version, reviewed: now.toISOString(), ...(verdict.preview ? { preview: true as const } : {}) };
  return ok({
    answer: { state: 'listed', ...answer },
    index: listIn(state.index, held.entry, listing),
    review: dropped,
    files: verdict.preview ? [{ path: previewFile(id, version, kind), text: JSON.stringify(verdict.preview) }] : [],
    move: { from: pendingPath(path, held.version.checksum), to: path },
    drop: [pendingPath(path, held.version.checksum)],
  });
}

/**
 * A waiting submission and the path its file waits at, or `null`: what `GET review?kind=&id=&version=` answers, so the
 * operator reads the file itself, every script's source included, before listing it (`platform.md` §5).
 */
export function waitingFile(review: Review, kind: string, id: string, version: string): { pending: Pending; path: string } | null {
  const held = review.pending.find((p) => p.entry.kind === kind && p.entry.id === id && p.version.version === version);
  return held === undefined ? null : { pending: held, path: pendingPath(catalogueFile(held.entry.id, held.version.version, held.entry.kind), held.version.checksum) };
}

/**
 * The trusted publishers with one publisher's standing set, as `POST publisher` asks. THE ASK IS THE WHOLE STANDING:
 * `probe` holds only when this ask says it, beside `trusted`, so trusting the probe's key again without it takes the
 * prefix back.
 */
export const trustIn = (publishers: Publishers, ask: { publisher: string; trusted: boolean; probe?: boolean | undefined }, now: Date): Publishers => ({
  ...publishers,
  trusted: { ...publishers.trusted, [ask.publisher]: { trusted: ask.trusted, at: now.toISOString(), ...(ask.trusted && ask.probe === true ? { probe: true as const } : {}) } },
});

/* ── yanking ────────────────────────────────────────────────────────────── */

const YANK_FORMAT = 'braindog-yank-1';
const ALG = { name: 'Ed25519' } as const;

/** The text an author's key signs to yank one version. */
export const yankText = (kind: EntryKind, id: string, version: string, reason: string): string => `${YANK_FORMAT}\n${kind}\n${id}\n${version}\n${reason}`;

const toB64 = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of view) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const fromB64 = (text: string): Uint8Array<ArrayBuffer> => {
  const s = atob(text.replace(/-/gu, '+').replace(/_/gu, '/'));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

/** Whether a signature is its own key's, over `yankText` for this version and this reason. */
export async function verifyYank(signature: unknown, kind: EntryKind, id: string, version: string, reason: string): Promise<boolean> {
  if (!isSignature(signature)) return false;
  try {
    if ((await keyIdOf(signature.public_key)) !== signature.key_id) return false;
    const pub = await crypto.subtle.importKey('raw', fromB64(signature.public_key), ALG, false, ['verify']);
    return await crypto.subtle.verify(ALG, pub, fromB64(signature.sig), new TextEncoder().encode(yankText(kind, id, version, reason)));
  } catch {
    return false;
  }
}

/** A yank signed by an author's key, which the command line sends with `POST yank`. The caller reads the key file. */
export async function signYank(key: AuthorKey, kind: EntryKind, id: string, version: string, reason: string, now: Date = new Date()): Promise<Result<Signature>> {
  let sig: string;
  try {
    const priv = await crypto.subtle.importKey('pkcs8', fromB64(key.private_key), ALG, false, ['sign']);
    sig = toB64(await crypto.subtle.sign(ALG, priv, new TextEncoder().encode(yankText(kind, id, version, reason))));
  } catch {
    return no('VALUE_MALFORMED', 'The private key in this author key file does not read as an Ed25519 key.', { at: 'key' });
  }
  const signature: Signature = { alg: 'ed25519', key_id: key.key_id, public_key: key.public_key, sig, signed_at: now.toISOString() };
  return (await verifyYank(signature, kind, id, version, reason)) ? ok(signature) : no('VALUE_MALFORMED', 'The two halves of this author key file do not belong together. Make a new one.', { at: 'key' });
}

/** Who asks for a yank: the operator, a person the host signed in, or an author's key over `yankText`. */
export type Yanker = { kind: 'operator' } | { kind: 'person'; id: string } | { kind: 'key'; signature: Signature };

export type YankRequest = { kind: EntryKind; id: string; version: string; reason: string; by: Yanker };

export type Yanked = Change & { answer: { state: 'yanked'; kind: EntryKind; id: string; version: string } };

/**
 * One version marked yanked, by its publisher's key, its publisher in person, or the operator. It stays in the index and
 * its file stays where it is, so a record that holds it still reads it by its exact version; a reader offers the newest
 * version that is not yanked (`offeredVersion`), and says why this one was taken back.
 */
export async function yankIn(index: CatalogueIndex, request: YankRequest, now: Date): Promise<Result<Yanked>> {
  const { kind, id, version, reason, by } = request;
  const entry = index.entries.find((e) => e.kind === kind && e.id === id);
  const at = entry?.versions.find((v) => v.version === version);
  if (!entry || !at) return no('VALUE_MALFORMED', `The Kennel lists no ${kind === 'pack' ? 'add-on' : 'use case'} ${id} at ${version}.`, { at: 'version' });
  if (at.yanked) return no('ALREADY_KNOWN', `${entry.title} ${version} is already yanked.`, { at: 'version' });
  const owner = entry.publisher ?? null;
  if (by.kind === 'person' && !(owner?.kind === 'person' && owner.id === by.id))
    return no('FORBIDDEN', `Only whoever published ${entry.title}, or the operator, yanks a version of it.`, { at: 'publisher' });
  if (by.kind === 'key') {
    if (!(await verifyYank(by.signature, kind, id, version, reason)))
      return no('SIGNATURE_INVALID', `The signature on this yank of ${entry.title} ${version} does not verify over its kind, id, version and reason.`, { at: 'signature' });
    const statements = await verifiedStatements(index.keys);
    const signers = signersOf(entry, owner);
    const key = by.signature.key_id;
    if (revocationOf(statements, key)) return no('SIGNATURE_INVALID', `Key ${key} is revoked, so it yanks nothing. Sign with the key it rotated to.`, { at: 'signature' });
    if (!signers.includes(key) && rotatedFrom(statements, signers, key) === null)
      return no('SIGNATURE_INVALID', `${entry.title} is signed by ${signers.length > 0 ? `key ${signers.join(', ')}` : 'no key'}, and this yank by key ${key}.`, { at: 'signature' });
  }
  const versions = entry.versions.map((v) => (v === at ? { ...v, yanked: { reason, at: now.toISOString() } } : v));
  return ok({
    answer: { state: 'yanked', kind, id, version },
    index: { ...index, entries: index.entries.map((e) => (e === entry ? { ...e, versions } : e)) },
    review: null,
    files: [],
    move: null,
    drop: [],
  });
}

/* ── reading ────────────────────────────────────────────────────────────── */

/**
 * The one index a host answers: the bundled catalogue, first-party and always the deployed build's, then every Kennel
 * entry whose id the bundled one does not hold. An id is one thing to a reader whatever its kind, so a bundled id keeps
 * both kinds. Either side may be missing, and nothing at all is an empty catalogue.
 */
export function mergeIndexes(bundled: CatalogueIndex | null, kennel: CatalogueIndex | null): CatalogueIndex {
  const first = bundled?.entries ?? [];
  const taken = new Set(first.map((e) => e.id));
  const entries = [...first, ...(kennel?.entries ?? []).filter((e) => !taken.has(e.id))].sort(byKindAndId);
  const rotations = [...(bundled?.keys?.rotations ?? []), ...(kennel?.keys?.rotations ?? [])].filter(
    (r, i, all) => all.findIndex((s) => s.from_key_id === r.from_key_id && s.to_key_id === r.to_key_id) === i,
  );
  const revocations = [...(bundled?.keys?.revocations ?? []), ...(kennel?.keys?.revocations ?? [])].filter((r, i, all) => all.findIndex((s) => s.key_id === r.key_id) === i);
  const name = bundled?.name || kennel?.name || 'BrainDog';
  return rotations.length + revocations.length === 0 ? { format: CATALOGUE_FORMAT, name, entries } : { format: CATALOGUE_FORMAT, name, entries, keys: { rotations, revocations } };
}

/** The steps an install count is said at, highest first. */
const COUNT_STEPS = [1000, 500, 100, 50, 10] as const;

/** An install count as every reader says it: rounded down to 10, 50, 100, 500 or 1000, and `null` below 10. */
export const roundCount = (n: number): number | null => (Number.isFinite(n) ? (COUNT_STEPS.find((step) => n >= step) ?? null) : null);

/** What a request under `KENNEL_BASE` asks for, one reading for every host. */
export type KennelAsk =
  | { ask: 'index' | 'counts' | 'submit' | 'yank' | 'mine' | 'review' | 'verdict' | 'publisher' }
  /** `path` is the file's path inside a catalogue, safe to join: every part was matched whole. */
  | { ask: 'file' | 'preview'; path: string; kind: EntryKind; id: string; version: string };

/**
 * A method and a path read as one Kennel ask, or why not: a path the Kennel does not answer, or a method it does not
 * take there. A file's path is matched whole, so no `..` and no other name reaches a folder or a bucket.
 */
export function kennelAsk(method: string, pathname: string): KennelAsk | { wrong: 'path' } | { wrong: 'method'; allow: string } {
  if (!pathname.startsWith(KENNEL_BASE)) return { wrong: 'path' };
  const rest = pathname.slice(KENNEL_BASE.length);
  const read = method === 'GET' || method === 'HEAD';
  if (rest === 'index.json' || rest === 'counts.json') return read ? { ask: rest === 'index.json' ? 'index' : 'counts' } : { wrong: 'method', allow: 'GET, HEAD' };
  const m = FILE.exec(rest);
  if (m) {
    const [, folder, id, version, shape] = m;
    const kind: EntryKind = folder === 'packs' ? 'pack' : 'usecase';
    if (id === undefined || version === undefined || (shape !== 'preview' && shape !== kind)) return { wrong: 'path' };
    return read ? { ask: shape === 'preview' ? 'preview' : 'file', path: rest, kind, id, version } : { wrong: 'method', allow: 'GET, HEAD' };
  }
  if (rest === 'submit' || rest === 'yank' || rest === 'mine' || rest === 'publisher') return method === 'POST' ? { ask: rest } : { wrong: 'method', allow: 'POST' };
  if (rest === 'review') return read ? { ask: 'review' } : method === 'POST' ? { ask: 'verdict' } : { wrong: 'method', allow: 'GET, HEAD, POST' };
  return { wrong: 'path' };
}

/* ── what a publisher sees of their own ─────────────────────────────────── */

/**
 * The text a key signs to ask for its own submissions (`POST mine`), through the same signature as a yank so no second
 * signing scheme exists. It names nothing real: a yank of this kind, id and version would find no entry to act on.
 */
export const MINE_ASKED = { kind: 'pack', id: 'mine', version: '0.0.0', reason: 'mine' } as const;

/** Who is asking: the keys whose signature verified, and the person the host signed in, either or both. */
export type Whose = { keys: readonly string[]; person: string | null };

/** One submission of the asker's, in the state the publisher reads it in. */
export type MineRow = {
  kind: EntryKind;
  id: string;
  title: string;
  version: string;
  /** `waiting` for the operator, `listed` to everyone, `declined` with the operator's reason, `unpublished` by the publisher. */
  state: 'waiting' | 'listed' | 'declined' | 'unpublished';
  /** The operator's reason for a decline, or the publisher's for taking it back. Absent for waiting and listed. */
  reason?: string;
  at: string;
};

const theirs = (p: Pick<Publisher, 'kind' | 'id'> | undefined | null, who: Whose): boolean =>
  p !== undefined && p !== null && ((p.kind === 'key' && who.keys.includes(p.id)) || (p.kind === 'person' && who.person !== null && p.id === who.person));

/**
 * Every submission of one publisher and where it stands: waiting for review, listed, declined with the reason the
 * operator gave, or taken back. A declined version that a later one of the same id has since replaced (waiting, listed
 * or the same number sent again) is left out, so a fix sent in is not shown beside the decline it answered. Newest
 * first, then by id.
 */
export function mineIn(state: Pick<KennelState, 'index' | 'review'>, who: Whose): MineRow[] {
  const rows: MineRow[] = [];
  for (const e of state.index.entries) {
    if (!theirs(e.publisher, who)) continue;
    for (const v of e.versions) {
      const base = { kind: e.kind, id: e.id, title: e.title, version: v.version };
      if (v.yanked) rows.push({ ...base, state: 'unpublished', reason: v.yanked.reason, at: v.yanked.at });
      else rows.push({ ...base, state: 'listed', at: v.reviewed ?? v.published_at ?? '' });
    }
  }
  for (const p of state.review.pending) {
    if (!theirs(p.entry.publisher, who) || listedAt(state.index, p.entry.kind, p.entry.id, p.version.version)) continue;
    rows.push({ kind: p.entry.kind, id: p.entry.id, title: p.entry.title, version: p.version.version, state: 'waiting', at: p.submitted_at });
  }
  const titleOf = (kind: EntryKind, id: string): string => rows.find((r) => r.kind === kind && r.id === id)?.title ?? id;
  for (const r of state.review.refused) {
    if (!theirs(r.publisher, who)) continue;
    const replaced = rows.some((o) => o.kind === r.kind && o.id === r.id && o.state !== 'declined' && compareVersions(o.version, r.version) >= 0);
    const again = rows.some((o) => o.kind === r.kind && o.id === r.id && o.state === 'declined' && o.version === r.version);
    if (replaced || again) continue;
    rows.push({ kind: r.kind, id: r.id, title: titleOf(r.kind, r.id), version: r.version, state: 'declined', reason: r.reason, at: r.at });
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id) || compareVersions(b.version, a.version));
}

/** `POST mine`'s body: `{ signature? }`, the signature a key makes over `MINE_ASKED`. A body with none asks as the signed-in person. */
export function readMine(body: unknown): Result<{ signature: Signature | null }> {
  if (body === undefined || body === null) return ok({ signature: null });
  if (!isMap(body)) return notObject('mine', '{ signature? }');
  const sig = body.signature;
  if (sig !== undefined && sig !== null && !isSignature(sig)) return no('SIGNATURE_INVALID', 'signature is not an author signature over this ask.', { at: 'signature' });
  return ok({ signature: isSignature(sig) ? sig : null });
}

/* ── the bodies the writes take ─────────────────────────────────────────── */

const notObject = (door: string, shape: string): Result<never> => no('BODY_MALFORMED', `${door} takes a JSON object: ${shape}.`, { at: 'body' });

export type Submission = { text: string; signature: Signature | null; name?: string };

/** `POST submit`'s body: `{ text, signature?, publisher?: { name } }`. */
export function readSubmission(body: unknown): Result<Submission> {
  if (!isMap(body)) return notObject('submit', '{ text, signature?, publisher? }');
  if (typeof body.text !== 'string' || body.text === '') return no('VALUE_MALFORMED', 'text is the file itself, as one string.', { at: 'text' });
  const sig = body.signature;
  if (sig !== undefined && sig !== null && !isSignature(sig)) return no('SIGNATURE_INVALID', 'signature is not an author signature over this file.', { at: 'signature' });
  const p = body.publisher;
  if (p !== undefined && p !== null && (!isMap(p) || typeof p.name !== 'string')) return no('VALUE_MALFORMED', 'publisher is { name }: the name readers see beside the file.', { at: 'publisher' });
  return ok({ text: body.text, signature: isSignature(sig) ? sig : null, ...(isMap(p) && typeof p.name === 'string' ? { name: p.name } : {}) });
}

/** The kind, id and version a write names, each checked as a catalogue checks them. */
function named(body: Record<string, unknown>): Result<{ kind: EntryKind; id: string; version: string }> {
  if (body.kind !== 'pack' && body.kind !== 'usecase') return no('VALUE_MALFORMED', 'kind is pack or usecase.', { at: 'kind', allowed: ['pack', 'usecase'] });
  if (typeof body.id !== 'string' || !ID.test(body.id)) return no('VALUE_MALFORMED', 'id is lower-case letters, digits and dashes.', { at: 'id' });
  if (typeof body.version !== 'string' || !VERSION.test(body.version)) return no('VALUE_MALFORMED', 'version is three numbers, as in 1.0.0.', { at: 'version' });
  return ok({ kind: body.kind, id: body.id, version: body.version });
}

/** `POST yank`'s body: `{ kind, id, version, reason, signature? }`. */
export function readYank(body: unknown): Result<{ kind: EntryKind; id: string; version: string; reason: string; signature: Signature | null }> {
  if (!isMap(body)) return notObject('yank', '{ kind, id, version, reason, signature? }');
  const which = named(body);
  if (!which.ok) return which as Result<never>;
  if (typeof body.reason !== 'string' || body.reason.trim() === '' || chars(body.reason) > REASON_MOST)
    return no('VALUE_MALFORMED', `reason says why this version is taken back, in at most ${REASON_MOST} characters. Readers see it as written.`, { at: 'reason' });
  const sig = body.signature;
  if (sig !== undefined && sig !== null && !isSignature(sig)) return no('SIGNATURE_INVALID', 'signature is not an author signature over this yank.', { at: 'signature' });
  return ok({ ...which.value, reason: body.reason, signature: isSignature(sig) ? sig : null });
}

/** `POST review`'s body: `{ kind, id, version, verdict, reason, preview? }`. A refusal says why; a preview is checked as a reader checks one. */
export function readVerdict(body: unknown): Result<Verdict> {
  if (!isMap(body)) return notObject('review', '{ kind, id, version, verdict, reason, preview? }');
  const which = named(body);
  if (!which.ok) return which as Result<never>;
  if (body.verdict !== 'list' && body.verdict !== 'refuse') return no('VALUE_MALFORMED', 'verdict is list or refuse.', { at: 'verdict', allowed: ['list', 'refuse'] });
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (typeof body.reason !== 'string' || chars(reason) > VERDICT_REASON_MOST || (body.verdict === 'refuse' && reason === ''))
    return no('VALUE_MALFORMED', `reason is a line of text of at most ${VERDICT_REASON_MOST} characters, and a refusal always has one.`, { at: 'reason' });
  if (body.preview === undefined || body.preview === null) return ok({ ...which.value, verdict: body.verdict, reason });
  const preview = readPreview(body.preview);
  if (!preview.ok) return preview as Result<never>;
  return ok({ ...which.value, verdict: body.verdict, reason, preview: preview.value });
}

/**
 * `POST publisher`'s body: `{ publisher, trusted, probe? }`, the publisher as `key:<key id>` or `person:<person id>`, and
 * `probe` when it is the nightly probe's, which alone publishes under `PROBE_PREFIX`.
 */
export function readTrust(body: unknown): Result<{ publisher: string; trusted: boolean; probe?: boolean }> {
  if (!isMap(body)) return notObject('publisher', '{ publisher, trusted, probe? }');
  if (typeof body.publisher !== 'string' || !PUBLISHER_KEY.test(body.publisher))
    return no('VALUE_MALFORMED', 'publisher is key:<key id> or person:<person id>, as the review list names it.', { at: 'publisher' });
  if (typeof body.trusted !== 'boolean') return no('VALUE_MALFORMED', 'trusted is true or false.', { at: 'trusted' });
  if (body.probe !== undefined && body.probe !== null && typeof body.probe !== 'boolean') return no('VALUE_MALFORMED', 'probe is true or false, or left out.', { at: 'probe' });
  if (body.probe === true && !body.trusted) return no('VALUE_MALFORMED', 'Only a trusted publisher is the probe. Send trusted: true with probe.', { at: 'probe' });
  return ok({ publisher: body.publisher, trusted: body.trusted, ...(body.probe === true ? { probe: true } : {}) });
}
