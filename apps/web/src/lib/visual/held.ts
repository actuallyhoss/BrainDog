/**
 * The visuals a thing holds (DIRECTION §45, "Shown where it lives"): a page with its pictures hung on a task, a project,
 * a question or a decision, read here the way the app shows it. The record's half is `packages/record/src/methods/visuals.ts`.
 *
 * CLOSED, A VISUAL IS A STILL OR A QUIET CARD (`VisualStrip.svelte`): its first picture, read through the file door with
 * the app's own sign-in, or its title alone, with who made it and when. Never a live frame on first paint, so the page
 * that holds it opens as fast as one without.
 *
 * OPEN, IT IS ITS PAGE IN THE SANDBOX FRAME (`VisualViewer.svelte`, loaded by `import()` on the first press): its
 * pictures read here and handed in as `data:` addresses, since the frame has no network, and its versions newest first,
 * with arrows to step them and Undo on the newest through the record's own undo of the write that made it.
 *
 * A DRAFT IS MARKED, AND SETTLED WHERE IT SHOWS (DIRECTION §45). A version handed in as a draft waits beside the one the
 * visual stands at and never replaces it. The strip marks its card and the viewer opens on it, each with Keep, Try
 * again and Throw away (`settle`, the record's `settleVisual`). Try again throws it away and tells the run that drew it
 * to draw it again, so it is offered only on a version a run drew.
 *
 * PURE AND RELATIVE-IMPORTED, the reads with their fetch handed in, so `held.test.ts` drives every branch without a socket.
 */

import { createClient } from '@braindog/client';
import { pictureData, since } from 'braindog-render';

/** A picture a version names: the name its page uses, and the hash its bytes are kept under. */
export type Picture = { name: string; sha256: string; mime: string };

/**
 * One visual as a strip shows it, closed. `still` is its first picture's hash, or `null` for a quiet card. `draft` is
 * the version waiting to be kept or thrown away, with who drew it, or `null` when none waits.
 */
export type Card = { id: string; title: string; version: number; versions: number; by: string; at: string; still: string | null; draft: { version: number; by: string } | null };

/**
 * One version as the viewer lists it. `batch` is the write that made it, which Undo takes back. `draft` is there for one
 * handed in as a draft and never kept: the one waiting, or one thrown away.
 */
export type Version = { version: number; title: string; by: string; at: string; batch: string | null; draft?: true };

/**
 * One visual open: the version shown, its page and pictures, and every version, newest first. `kept` is the version it
 * stands at and `draft` the one waiting, each `null` for none.
 */
export type Opened = {
  id: string;
  title: string;
  version: number;
  kept: number | null;
  draft: number | null;
  by: string;
  at: string;
  page: string;
  pictures: Picture[];
  versions: Version[];
};

/** The three presses on a draft, as the record takes them. */
export type Press = 'keep' | 'throw' | 'again';

/** What a read came to: the record's own sentence when it did not answer. */
export type Read<T> = { ok: true; value: T } | { ok: false; fix: string };

type Fetch = typeof globalThis.fetch;

/** The words the strip and the viewer draw. They are theirs alone, so they live beside them. */
export const visualWords = {
  heading: 'Visuals',
  open: (title: string) => `Open ${title}`,
  /** Who made it and when, one quiet line: "Claude, 2h ago". */
  made: (name: string, when: string) => `${name}, ${when}`,
  versions: (n: number) => (n === 1 ? '1 version' : `${n} versions`),
  version: (n: number) => `Version ${n}`,
  newest: 'Newest',
  /** The version the visual stands at, once an Undo put the newest back. */
  current: 'Current',
  close: 'Close',
  undo: 'Undo',
  undoing: 'Putting it back.',
  /** Said when the newest version's write took more than the visual with it, before it is put back. */
  undoMore: (n: number) => (n === 1 ? 'This also puts back 1 other change made with it.' : `This also puts back ${n} other changes made with it.`),
  undoYes: 'Put it back',
  keep: 'Keep it',
  /** The mark on a version waiting to be kept or thrown away, and on one that was. */
  draft: 'Draft',
  thrown: 'Thrown away',
  keepDraft: 'Keep',
  again: 'Try again',
  throwAway: 'Throw away',
  settling: 'One moment.',
  older: 'Older version',
  newer: 'Newer version',
  reading: 'Opening the visual.',
  gone: 'This visual was taken away.',
  noFrame: 'This visual could not be drawn here.',
  picturesMissing: (n: number) => (n === 1 ? '1 picture in it could not be read.' : `${n} pictures in it could not be read.`),
  notReached: 'BrainDog did not answer. Try again in a moment.',
} as const;

const isRow = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const whole = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null);
const SHA = /^[0-9a-f]{64}$/u;

/** The pictures an answer names, each with a hash the file door takes; anything else is left out. */
function picturesOf(v: unknown): Picture[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((p): Picture[] => {
    if (!isRow(p) || typeof p.name !== 'string' || typeof p.sha256 !== 'string' || !SHA.test(p.sha256) || typeof p.mime !== 'string') return [];
    return [{ name: p.name, sha256: p.sha256, mime: p.mime }];
  });
}

/**
 * The cards a `visuals` answer holds, newest first by when each was last drawn. One the app cannot read (no id, no
 * title) is left out, since a card with nothing to say is worse than none.
 */
export function cardsOf(answer: unknown): Card[] {
  const list = isRow(answer) && Array.isArray(answer.visuals) ? answer.visuals : [];
  const out = list.flatMap((v): Card[] => {
    if (!isRow(v)) return [];
    const id = text(v.id);
    const title = text(v.title);
    const version = whole(v.version);
    if (id === null || title === null || version === null) return [];
    const waits = isRow(v.draft) && whole(v.draft.version) !== null ? { version: whole(v.draft.version)!, by: text(v.draft.by) ?? '' } : null;
    return [{ id, title, version, versions: whole(v.versions) ?? version, by: text(v.by) ?? '', at: text(v.at) ?? '', still: picturesOf(v.pictures)[0]?.sha256 ?? null, draft: waits }];
  });
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** A `visual` answer as the viewer draws it, its versions newest first, or `null` for one this build cannot read. */
export function openedOf(answer: unknown): Opened | null {
  if (!isRow(answer)) return null;
  const id = text(answer.id);
  const version = whole(answer.version);
  if (id === null || version === null || typeof answer.page !== 'string') return null;
  const versions = (Array.isArray(answer.versions) ? answer.versions : []).flatMap((v): Version[] => {
    if (!isRow(v) || whole(v.version) === null) return [];
    return [{ version: whole(v.version)!, title: text(v.title) ?? '', by: text(v.by) ?? '', at: text(v.at) ?? '', batch: text(v.batch), ...(v.draft === true ? { draft: true as const } : {}) }];
  });
  versions.sort((a, b) => b.version - a.version);
  /* A RECORD FROM BEFORE DRAFTS SAYS NEITHER, and stands at the version it answered. */
  const kept = 'kept' in answer ? whole(answer.kept) : version;
  const draft = whole(answer.draft);
  return { id, title: text(answer.title) ?? '', version, kept, draft, by: text(answer.by) ?? '', at: text(answer.at) ?? '', page: answer.page, pictures: picturesOf(answer.pictures), versions };
}

/**
 * THE WRITE UNDO TAKES BACK, or `null` where there is none to offer: the newest version's, only while the visual
 * stands at it and only while it is the one shown, so Undo never reads as taking back the older version on screen.
 * `standing` is the version the visual stands at now (what a read with no version answered); once the newest was put
 * back it stands at an earlier one, and Undo on it again would put nothing back.
 */
export function undoOf(versions: readonly Version[], standing: number | null, shown: number | null = standing): string | null {
  const newest = versions[0];
  return newest && standing === newest.version && shown === newest.version ? newest.batch : null;
}

/**
 * The word beside a version in the list: Draft on the one waiting, Thrown away on a draft never kept, the one it stands
 * at once that is not the newest, else the newest.
 */
export function tagOf(version: number, versions: readonly Version[], standing: number | null, draft: number | null = null): string | null {
  if (draft !== null && version === draft) return visualWords.draft;
  if (versions.find((v) => v.version === version)?.draft === true) return visualWords.thrown;
  const newest = versions[0]?.version ?? null;
  if (standing !== null && standing !== newest && version === standing) return visualWords.current;
  return version === newest ? visualWords.newest : null;
}

/** The version the arrows step to from the one shown: `older` down the list, else up it; `null` past either end. */
export function stepOf(versions: readonly Version[], shown: number, older: boolean): number | null {
  const at = versions.findIndex((v) => v.version === shown);
  if (at < 0) return null;
  return versions[older ? at + 1 : at - 1]?.version ?? null;
}

/** Whether Try again is offered: only on a version a run drew (`S12`), since it asks that run to draw it again. */
export const mayAskAgain = (by: string): boolean => /^S[1-9][0-9]*$/u.test(by);

/** Whether Undo goes at once or says first what else it takes back: a write that touched more than this visual asks. */
export const undoAsks = (steps: number): boolean => steps > 1;

/** Who made it and when, in one quiet line, the name already said in words (`actor`). */
export const madeLine = (name: string, at: string, now: number): string => (at === '' ? name : visualWords.made(name, since(at, now)));

/** Where the file door answers one picture, under the record this page is on. */
export const pictureAt = (base: string, sha256: string): string => `${base}/api/files/${sha256}`;

/* ── the reads ──────────────────────────────────────────────────────────── */

type Wire = { ok: true; value: unknown } | { ok: false; refusal?: { code: string; fix: string } };

const refusedOf = (out: Exclude<Wire, { ok: true }>): { ok: false; fix: string } => ({
  ok: false,
  fix: out.refusal === undefined || out.refusal.code === 'UNREACHABLE' ? visualWords.notReached : out.refusal.fix,
});

/**
 * The visuals one thing holds, named as the record takes it: `tasks#3` for a row, `SG12` for a question, `D4` for a
 * decision. A record with no visuals in its build holds none, and says nothing about it.
 */
export async function readCards(base: string, on: string, io?: Fetch): Promise<Read<Card[]>> {
  const out = (await createClient({ base, ...(io ? { fetch: io } : {}) }).call('visuals', { on })) as Wire;
  if (out.ok) return { ok: true, value: cardsOf(out.value) };
  if (out.refusal?.code === 'ROUTE_UNKNOWN' || out.refusal?.code === 'NOT_IN_THIS_BUILD') return { ok: true, value: [] };
  return refusedOf(out);
}

/** One visual: the version asked, or the one it stands at. */
export async function readOpened(base: string, id: string, version?: number, io?: Fetch): Promise<Read<Opened>> {
  const out = (await createClient({ base, ...(io ? { fetch: io } : {}) }).call('visual', { id, ...(version === undefined ? {} : { version }) })) as Wire;
  if (!out.ok) return refusedOf(out);
  const opened = openedOf(out.value);
  return opened ? { ok: true, value: opened } : { ok: false, fix: visualWords.notReached };
}

/**
 * Its pictures as the frame takes them, `data:` addresses by the name the page uses, read through the file door with
 * the app's own sign-in. One that does not come is counted and left out, so the page draws without it.
 */
export async function readPictures(base: string, pictures: readonly Picture[], io: Fetch = globalThis.fetch): Promise<{ inline: Record<string, string>; missing: number }> {
  const inline: Record<string, string> = {};
  let missing = 0;
  await Promise.all(
    pictures.map(async (p) => {
      try {
        const res = await io(pictureAt(base, p.sha256), { credentials: 'same-origin' });
        if (!res.ok) return void missing++;
        inline[p.name] = pictureData(new Uint8Array(await res.arrayBuffer()), p.mime);
      } catch {
        missing++;
      }
    }),
  );
  return { inline, missing };
}

/**
 * A press on a draft: Keep, Throw away, or Try again. Answers the record's sentence either way, so the press says what
 * happened in its words.
 */
export async function settle(base: string, id: string, version: number, as: Press, io?: Fetch): Promise<Read<{ said: string; kept: number | null }>> {
  const out = (await createClient({ base, ...(io ? { fetch: io } : {}) }).call('settleVisual', { id, version, as })) as Wire;
  if (!out.ok) return refusedOf(out);
  const v = isRow(out.value) ? out.value : {};
  return { ok: true, value: { said: text(v.said) ?? '', kept: whole(v.kept) } };
}

/* ── kept for the tab ───────────────────────────────────────────────────── */

/** How long a thing's cards are kept before a strip asks again: long enough that a page of questions asks once. */
export const KEEP_MS = 60_000;

const kept = new Map<string, { at: number; read: Promise<Read<Card[]>> }>();

/** The cards one thing holds, asked once a minute for the tab, however many strips draw it. */
export function cardsFor(base: string, on: string, now: number = Date.now(), io?: Fetch): Promise<Read<Card[]>> {
  const key = `${base} ${on}`;
  const held = kept.get(key);
  if (held && now - held.at < KEEP_MS) return held.read;
  const read = readCards(base, on, io).then((r) => {
    if (!r.ok) kept.delete(key);
    return r;
  });
  kept.set(key, { at: now, read });
  return read;
}

/** Forget what one thing holds, after an Undo changed it, so the next strip reads it again. */
export const forgetCards = (base: string, on: string): void => void kept.delete(`${base} ${on}`);
