/**
 * Publishing from the app: a use case from `/packs/share` and a page shared as a template from its menu, each sent to
 * the Kennel as the signed-in person (`POST /api/kennel/v1/submit`), and what a share changes
 * since the version it counts on from.
 *
 * THE PUBLISHER'S KEY SIGNS IT. The body is `{ text, signature }`: the signature is made in this browser by the key
 * `author-key.ts` keeps there (made once, its private half never leaves), over the kind, id, version and checksum the
 * Kennel reads from the file, and it carries the key's public half and id, which the Kennel holds as the publisher and
 * Browse draws the publisher's line from. No publisher name goes, because the Kennel names the file by its `author` line.
 *
 * A BROWSER THAT CANNOT KEEP A KEY (no WebCrypto, no Ed25519, no IndexedDB) PUBLISHES AS THE SESSION, `{ text }`, as
 * before, and the sentence it ends in says it went unsigned. So does an id whose earlier versions went out unsigned under
 * this person's session: the Kennel holds it as theirs and not their key's, so the signed send is refused as another
 * publisher's and is sent once more unsigned, which the Kennel holds to the same person. The cookie goes because the
 * request comes from a page on this host, which is the only way the Kennel reads one.
 *
 * A SELF-HOST TAKES NO SUBMISSIONS and answers with a sentence naming the Kennel it reads, which the screen says as it
 * is, as it says every other refusal: this file never guesses a host's reason.
 *
 * PLAIN NODE LOADS THIS FILE: its one value import is relative, and the catalogue's readers and the author key are
 * imported only when a diff or a publish is asked for, so a page's menu does not carry the declare package for a button
 * nobody pressed.
 */

import type { Changes, Signature } from '@braindog/declare/catalogue';

import { KENNEL_AT } from './counts.ts';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** The browser's own fetch, called through a function so it is never invoked detached from the window. */
export const kennelFetch: Fetcher = (input, init) => globalThis.fetch(input, init);

export type EntryKind = 'pack' | 'usecase';

/**
 * What the Kennel answers a submission with: listed at once for a trusted publisher, or waiting for the operator.
 * `unsigned` says why it went out with no signature: this browser keeps no key, or the id's earlier versions went unsigned.
 */
export type Submitted = { state: 'listed' | 'review'; kind: EntryKind; id: string; version: string; unsigned?: 'browser' | 'earlier' };

/** What signs a file before it goes: its signature, or `null` when this browser cannot sign. */
export type Signer = (text: string) => Promise<Signature | null>;

/** The publisher's key in this browser, loaded at the press. A load that fails signs nothing, and the file goes unsigned. */
export const browserSigner: Signer = async (text) => {
  try {
    return await (await import('./author-key.ts')).signatureFor(text);
  } catch {
    return null;
  }
};

export const publishWords = {
  /* THE STORE, NEVER "THE KENNEL": the Kennel is what this build calls the service, and Browse is the store a
     person sees. */
  publish: 'Publish to the store',
  publishing: 'Publishing',
  listed: (title: string, version: string): string => `${title} ${version} is in the store:`,
  review: (title: string, version: string): string => `${title} ${version} is waiting for review, and is listed once it is read:`,
  seeIt: 'see it in Browse.',
  seeBrowse: 'Browse shows it then.',
  unreached: 'BrainDog could not reach the store. Try again in a moment.',
  unread: 'The store answered in a way this version of BrainDog does not read.',
  unsignedBrowser: 'It went out unsigned, because this browser cannot keep a signing key.',
  unsignedEarlier: 'It went out unsigned, as its earlier versions did.',
  /* WHAT A SHARE CHANGES, read from `changesBetween` in `@braindog/declare/catalogue`. */
  kinds: { register: 'list', page: 'page', rule: 'automation', metric: 'figure', script: 'script', ingest: 'door', theme: 'theme', block: 'block' } as Record<string, string>,
  part: 'part',
  added: (kind: string, title: string): string => `Adds the ${kind} ${title}`,
  removed: (kind: string, title: string): string => `Takes out the ${kind} ${title}`,
  changed: (kind: string, title: string): string => `Changes the ${kind} ${title}`,
  needs: (name: string): string => `Needs the ${name} plugin too`,
  /* SEVERAL AS ONE LINE (design pass, 1 Nov): a whole starter's file said "Needs the … plugin too" twenty-two times
     over, a column of one sentence with the names at its end. */
  needsAll: (names: readonly string[]): string => `Needs these plugins too: ${new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(names)}`,
  needsNoMore: (name: string): string => `No longer needs ${name}`,
  callsNew: (host: string): string => `Calls out to ${host}, which it did not before`,
  callsNoMore: (host: string): string => `No longer calls out to ${host}`,
  examples: (from: number, to: number): string => `${to} ${to === 1 ? 'example' : 'examples'}, where it had ${from}`,
  words: 'Its words, labels or skills changed',
} as const;

/* ── sending ────────────────────────────────────────────────────────────── */

/** The Kennel's answer read: `{ ok: true, value }` with a state this build knows, or the refusal's own sentence. */
export function answerOf(doc: unknown): { ok: true; value: Submitted } | { ok: false; fix: string } {
  const d = typeof doc === 'object' && doc !== null ? (doc as Record<string, unknown>) : null;
  if (d?.ok === false) {
    const refusal = d.refusal as { fix?: unknown } | undefined;
    return { ok: false, fix: typeof refusal?.fix === 'string' && refusal.fix !== '' ? refusal.fix : publishWords.unread };
  }
  const v = d?.ok === true && typeof d.value === 'object' && d.value !== null ? (d.value as Record<string, unknown>) : null;
  if (!v || (v.state !== 'listed' && v.state !== 'review') || (v.kind !== 'pack' && v.kind !== 'usecase') || typeof v.id !== 'string' || typeof v.version !== 'string')
    return { ok: false, fix: publishWords.unread };
  return { ok: true, value: { state: v.state, kind: v.kind, id: v.id, version: v.version } };
}

/** One send of one body, and the refusal's code and place when it is refused, which only this file reads. */
async function sendOnce(fetcher: Fetcher, body: { text: string; signature?: Signature }): Promise<{ answer: ReturnType<typeof answerOf>; code: string | null; at: string | null }> {
  let res: Response;
  try {
    res = await fetcher(`${KENNEL_AT}submit`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { answer: { ok: false, fix: publishWords.unreached }, code: null, at: null };
  }
  let doc: unknown;
  try {
    doc = await res.json();
  } catch {
    return { answer: { ok: false, fix: res.ok ? publishWords.unread : publishWords.unreached }, code: null, at: null };
  }
  const refusal = typeof doc === 'object' && doc !== null && (doc as { ok?: unknown }).ok === false ? ((doc as { refusal?: { code?: unknown; at?: unknown } }).refusal ?? null) : null;
  return { answer: answerOf(doc), code: typeof refusal?.code === 'string' ? refusal.code : null, at: typeof refusal?.at === 'string' ? refusal.at : null };
}

/**
 * Send one file to the Kennel, signed by the publisher's key in this browser (`signer`), or as the signed-in person when
 * it cannot sign. One call per press; the screen guards the press. A signed send refused because the id is held by a
 * person (the Kennel's "belongs to another publisher", at `id`) is sent once more unsigned: if the person is the one who
 * published it, it is theirs, and if not, the Kennel says the same again.
 */
export async function submitToKennel(fetcher: Fetcher, text: string, signer: Signer = browserSigner): Promise<{ ok: true; value: Submitted } | { ok: false; fix: string }> {
  const signature = await signer(text);
  if (signature === null) {
    const { answer } = await sendOnce(fetcher, { text });
    return answer.ok ? { ok: true, value: { ...answer.value, unsigned: 'browser' } } : answer;
  }
  const signed = await sendOnce(fetcher, { text, signature });
  if (signed.answer.ok || signed.code !== 'PROVIDES_CONFLICT' || signed.at !== 'id') return signed.answer;
  const { answer } = await sendOnce(fetcher, { text });
  return answer.ok ? { ok: true, value: { ...answer.value, unsigned: 'earlier' } } : answer;
}

/** The line a publish adds when it went out with no signature, or `null` when it was signed. */
export const unsignedSaid = (s: Pick<Submitted, 'unsigned'>): string | null =>
  s.unsigned === 'browser' ? publishWords.unsignedBrowser : s.unsigned === 'earlier' ? publishWords.unsignedEarlier : null;

/** The sentence a submission ends in, up to its link: listed, or waiting for review, after the unsigned line when it went unsigned. */
export const publishedSaid = (s: Submitted & { title: string }): string => {
  const said = s.state === 'listed' ? publishWords.listed(s.title, s.version) : publishWords.review(s.title, s.version);
  const unsigned = unsignedSaid(s);
  /* THE UNSIGNED LINE GOES FIRST, so the sentence still ends where the screen puts its link. */
  return unsigned === null ? said : `${unsigned} ${said}`;
};

/** The link's own words. A waiting file is not in the index yet, so its link is Browse itself. */
export const publishedLink = (s: Submitted): string => (s.state === 'listed' ? publishWords.seeIt : publishWords.seeBrowse);

/**
 * Where the link goes: the listing's detail page once it is listed (`listingHref` in `listing.ts`, written out here so a
 * page's menu does not load the built-in use cases that file reads), else Browse.
 */
export const publishedHref = (s: Submitted): string =>
  s.state === 'listed' ? `/plugins/${encodeURIComponent(s.id)}${s.kind === 'pack' ? '?kind=pack' : ''}` : '/plugins';

/* ── reading the Kennel ─────────────────────────────────────────────────── */

const partsOf = (v: string): [number, number, number] | null => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/u.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** One version published in the Kennel, whole, or `null` when it holds none by that number (or cannot be reached). */
export async function publishedText(fetcher: Fetcher, kind: EntryKind, id: string, version: string): Promise<string | null> {
  const path = kind === 'pack' ? `packs/${encodeURIComponent(id)}/${encodeURIComponent(version)}.pack.json` : `usecases/${encodeURIComponent(id)}/${encodeURIComponent(version)}.usecase.json`;
  try {
    const res = await fetcher(`${KENNEL_AT}${path}`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/**
 * The version a new file goes out as: a patch on from the newest the Kennel lists under this id, or `first` when it
 * lists none. A Kennel that cannot be read leaves `first`, and a version it already holds is refused there with its own
 * sentence.
 */
export async function nextVersion(fetcher: Fetcher, kind: EntryKind, id: string, first = '1.0.0'): Promise<string> {
  let doc: unknown;
  try {
    const res = await fetcher(`${KENNEL_AT}index.json`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (!res.ok) return first;
    doc = await res.json();
  } catch {
    return first;
  }
  const entries = typeof doc === 'object' && doc !== null && Array.isArray((doc as { entries?: unknown }).entries) ? ((doc as { entries: unknown[] }).entries as Record<string, unknown>[]) : [];
  const entry = entries.find((e) => typeof e === 'object' && e !== null && e.kind === kind && e.id === id);
  const listed = entry?.versions;
  const versions = Array.isArray(listed) ? (listed as { version?: unknown }[]) : [];
  const later = (a: [number, number, number], b: [number, number, number]): boolean => (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) > 0;
  let newest: [number, number, number] | null = null;
  for (const v of versions) {
    const p = typeof v === 'object' && v !== null && typeof v.version === 'string' ? partsOf(v.version) : null;
    if (p && (!newest || later(p, newest))) newest = p;
  }
  const floor = partsOf(first);
  if (!newest || (floor && later(floor, newest))) return first;
  return `${newest[0]}.${newest[1]}.${newest[2] + 1}`;
}

/* ── what changed ───────────────────────────────────────────────────────── */

/**
 * What a file changes against the one it counts on from, read through the door each came in by (`readCatalogueFile`)
 * and compared declaration by declaration (`changesBetween`), so the screen says what the Kennel will say. `before` of
 * `null` is a first version: everything in it is added.
 */
export async function changesSince(before: string | null, after: string): Promise<{ ok: true; changes: Changes } | { ok: false; fix: string }> {
  const { readCatalogueFile, changesBetween } = await import('@braindog/declare/catalogue');
  const now = await readCatalogueFile(after);
  if (!now.ok) return { ok: false, fix: 'refusal' in now ? now.refusal.fix : publishWords.unread };
  const was = before === null ? null : await readCatalogueFile(before);
  /* A BASELINE THAT NO LONGER READS (a file from an older build) is compared as nothing, so the screen still says what goes out. */
  return { ok: true, changes: changesBetween(was?.ok ? was.value : null, now.value) };
}

/** The add-ons a file needs, one line for one and one line for several; BrainDog itself goes without saying. */
const needsLines = (names: readonly string[]): string[] => (names.length === 0 ? [] : names.length === 1 ? [publishWords.needs(names[0]!)] : [publishWords.needsAll(names)]);

/** Each change as one line a person reads. `nameOf` turns a module's id into its name. */
export function changeLines(c: Changes, nameOf: (module: string) => string): string[] {
  const kind = (k: string): string => (Object.hasOwn(publishWords.kinds, k) ? (publishWords.kinds[k] as string) : publishWords.part);
  /* A TITLE STILL HOLDING A PLACEHOLDER (a page for each row is titled `{{name}}`) names nothing, so its line is left
     out rather than drawn with the braces in it (agents F5). */
  const named = (n: { title: string }): boolean => !n.title.includes('{{');
  return [
    ...c.added.filter(named).map((n) => publishWords.added(kind(n.kind), n.title)),
    ...c.changed.filter(named).map((n) => publishWords.changed(kind(n.kind), n.title)),
    ...c.removed.filter(named).map((n) => publishWords.removed(kind(n.kind), n.title)),
    ...needsLines(c.modules.added.map(nameOf).filter((n) => n !== 'BrainDog')),
    ...c.modules.removed.map((m) => publishWords.needsNoMore(nameOf(m))),
    ...c.hosts.added.map(publishWords.callsNew),
    ...c.hosts.removed.map(publishWords.callsNoMore),
    ...(c.examples.from === c.examples.to ? [] : [publishWords.examples(c.examples.from, c.examples.to)]),
    ...(c.words ? [publishWords.words] : []),
  ];
}
