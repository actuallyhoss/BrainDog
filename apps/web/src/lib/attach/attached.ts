/**
 * The files a thing holds: a PDF, a Claude artifact saved as `.html`, a picture, notes, a spreadsheet, put on a task, a
 * project or any row for context. The record's half is `packages/record/src/methods/attachments.ts`.
 *
 * THE BYTES GO THROUGH THE FILE DOOR, THEN THE RECORD IS TOLD. `PUT /api/files?name=` keeps them under their hash and
 * answers it; `attachFile` puts that hash on the thing, where the record reads the file again, decides what it is and
 * reads its words for agents. Nothing about a file is taken from the browser's word for it.
 *
 * NOTHING A FILE HOLDS RUNS HERE (`AttachmentViewer.svelte`): a page is drawn in the hosts' own sandboxed frame, a PDF by
 * the browser's own viewer from a `blob:` made as a PDF and nothing else, a picture by `<img>`, text as text.
 *
 * PURE AND RELATIVE-IMPORTED, the reads with their fetch handed in.
 */

import { createClient } from '@braindog/client';

export type Kind = 'page' | 'pdf' | 'picture' | 'text' | 'document' | 'file';

/** One file as the section lists it. */
export type Listed = { id: string; name: string; kind: Kind; mime: string; bytes: number; sha256: string; version: number; versions: number; by: string; at: string; chars: number };

/** One file opened: the version shown, every version, and whether it was taken off. */
export type Opened = Listed & { gone: boolean; history: { version: number; name: string; bytes: number; by: string; at: string }[] };

export type Read<T> = { ok: true; value: T } | { ok: false; fix: string };

type Fetch = typeof globalThis.fetch;

/** The words the section and the viewer draw. They are theirs alone, so they live beside them. */
export const attachWords = {
  heading: 'Attachments',
  add: 'Attach a file',
  drop: 'Drop files here to attach them',
  dropHint: 'Up to 25 MB each',
  sending: (name: string) => `Attaching ${name}`,
  sent: (name: string) => `Attached ${name}.`,
  open: (name: string) => `Open ${name}`,
  menu: (name: string) => `More for ${name}`,
  rename: 'Rename',
  renameTo: (name: string) => `New name for ${name}`,
  save: 'Save',
  cancel: 'Cancel',
  download: 'Download',
  remove: 'Remove',
  removed: (name: string) => `Removed ${name}.`,
  undo: 'Undo',
  close: 'Close',
  version: (n: number) => `Version ${n}`,
  versions: 'Versions',
  reading: 'Opening the file.',
  noPreview: 'There is no preview for this kind of file. Download it to open it.',
  sandboxed: "This page runs on its own. It can't see your BrainDog, your sign-in or the internet beyond its libraries.",
  openPdf: 'Open full screen',
  tooBig: (name: string) => `${name} is bigger than 25 MB. Attach a smaller file.`,
  notReached: 'BrainDog did not answer. Try again in a moment.',
  kind: { page: 'Page', pdf: 'PDF', picture: 'Picture', text: 'Text', document: 'Document', file: 'File' } satisfies Record<Kind, string>,
  /** Who put it and when: "Maya, 2h ago". */
  made: (name: string, when: string) => `${name}, ${when}`,
} as const;

/** The most one file may be, the stores' own (`ATTACHED_MOST`), said before it is sent. */
export const MOST = 25 * 1024 * 1024;

/** The icon each kind wears. */
export const iconOf = (kind: Kind): string => ({ page: 'code', pdf: 'doc', picture: 'eye', text: 'rows', document: 'doc', file: 'download' })[kind];

/** A size in plain words. */
export const sizeOf = (bytes: number): string =>
  bytes < 1024 ? 'Under 1 KB' : bytes < 1_048_576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;

/** What a file is in a word, from its kind and its name's ending where that says more ("Spreadsheet", "Markdown"). */
export function kindWord(kind: Kind, name: string): string {
  const ext = /\.([a-z0-9]{1,8})$/iu.exec(name)?.[1]?.toLowerCase() ?? '';
  if (kind === 'document') return ['xlsx', 'xls', 'ods', 'numbers'].includes(ext) ? 'Spreadsheet' : ['pptx', 'ppt', 'odp', 'key'].includes(ext) ? 'Slides' : 'Document';
  if (kind === 'text') return ext === 'md' || ext === 'markdown' ? 'Markdown' : ext === 'csv' ? 'CSV' : ext === 'json' ? 'JSON' : 'Text';
  return attachWords.kind[kind];
}

const isRow = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const KINDS: readonly string[] = ['page', 'pdf', 'picture', 'text', 'document', 'file'];

function listedOf(v: unknown): Listed | null {
  if (!isRow(v) || typeof v.id !== 'string' || typeof v.name !== 'string' || typeof v.sha256 !== 'string') return null;
  return {
    id: v.id,
    name: v.name,
    kind: KINDS.includes(String(v.kind)) ? (v.kind as Kind) : 'file',
    mime: typeof v.mime === 'string' ? v.mime : 'application/octet-stream',
    bytes: typeof v.bytes === 'number' ? v.bytes : 0,
    sha256: v.sha256,
    version: typeof v.version === 'number' ? v.version : 1,
    versions: typeof v.versions === 'number' ? v.versions : 1,
    by: typeof v.by === 'string' ? v.by : '',
    at: typeof v.at === 'string' ? v.at : '',
    chars: typeof v.chars === 'number' ? v.chars : 0,
  };
}

type Wire = { ok: true; value: unknown } | { ok: false; refusal?: { code: string; fix: string } };

const fixOf = (out: Exclude<Wire, { ok: true }>): string => (out.refusal === undefined || out.refusal.code === 'UNREACHABLE' ? attachWords.notReached : out.refusal.fix);

const client = (base: string, io?: Fetch) => createClient({ base, ...(io ? { fetch: io } : {}) });

/** The files a thing holds now, newest first. A record with no attachments in its build holds none, and says nothing. */
export async function readList(base: string, on: string, io?: Fetch): Promise<Read<Listed[]>> {
  const out = (await client(base, io).call('attachments', { on })) as Wire;
  if (!out.ok) {
    if (out.refusal?.code === 'ROUTE_UNKNOWN' || out.refusal?.code === 'NOT_IN_THIS_BUILD') return { ok: true, value: [] };
    return { ok: false, fix: fixOf(out) };
  }
  const list = isRow(out.value) && Array.isArray(out.value.attachments) ? out.value.attachments : [];
  const rows = list.map(listedOf).filter((x): x is Listed => x !== null);
  return { ok: true, value: rows.reverse() };
}

/** How much of its room for files the record has used, for Usage: bytes, the most, and the record's own sentence. */
export type Room = { used: number; most: number; said: string };

/** The record's room for files, or `null` where its build keeps no attachments or it could not be read. */
export async function readRoom(base: string, io?: Fetch): Promise<Room | null> {
  const out = (await client(base, io).call('attachmentRoom', {})) as Wire;
  if (!out.ok || !isRow(out.value)) return null;
  const used = Number(out.value.used);
  const most = Number(out.value.most);
  if (!Number.isFinite(used) || !Number.isFinite(most) || most <= 0) return null;
  return { used, most, said: typeof out.value.said === 'string' ? out.value.said : '' };
}

/** One file: the version asked, or the one it stands at. */
export async function readOne(base: string, id: string, version?: number, io?: Fetch): Promise<Read<Opened>> {
  const out = (await client(base, io).call('attachment', { id, ...(version === undefined ? {} : { version }) })) as Wire;
  if (!out.ok) return { ok: false, fix: fixOf(out) };
  const one = listedOf(out.value);
  if (one === null || !isRow(out.value)) return { ok: false, fix: attachWords.notReached };
  const history = (Array.isArray(out.value.history) ? out.value.history : []).flatMap((h) =>
    isRow(h) && typeof h.version === 'number' ? [{ version: h.version, name: String(h.name ?? ''), bytes: Number(h.bytes ?? 0), by: String(h.by ?? ''), at: String(h.at ?? '') }] : [],
  );
  return { ok: true, value: { ...one, gone: out.value.gone === true, history: history.reverse() } };
}

/**
 * One file sent and put on the thing: its bytes to the file door under its own name, then `attachFile` with the hash
 * the door answered. The record's own sentence when either refuses.
 */
export async function attach(base: string, on: string, file: File, io: Fetch = globalThis.fetch): Promise<Read<{ id: string; said: string }>> {
  if (file.size > MOST) return { ok: false, fix: attachWords.tooBig(file.name) };
  let put: Response;
  try {
    put = await io(`${base}/api/files?name=${encodeURIComponent(file.name)}`, { method: 'PUT', body: file, credentials: 'same-origin', headers: { 'content-type': 'application/octet-stream' } });
  } catch {
    return { ok: false, fix: attachWords.notReached };
  }
  const kept = (await put.json().catch(() => null)) as { sha256?: unknown; ok?: boolean; refusal?: { fix?: string } } | null;
  if (!put.ok || kept === null || typeof kept.sha256 !== 'string') return { ok: false, fix: kept?.refusal?.fix ?? attachWords.notReached };
  const out = (await client(base, io).call('attachFile', { on, name: file.name, sha256: kept.sha256 })) as Wire;
  if (!out.ok) return { ok: false, fix: fixOf(out) };
  const v = isRow(out.value) ? out.value : {};
  return { ok: true, value: { id: String(v.id ?? ''), said: typeof v.said === 'string' ? v.said : attachWords.sent(file.name) } };
}

/** Rename, take off, or put back: the record's sentence either way. */
export async function change(base: string, method: 'renameAttachment' | 'removeAttachment' | 'restoreAttachment', args: Record<string, unknown>, io?: Fetch): Promise<Read<string>> {
  const out = (await client(base, io).call(method, args)) as Wire;
  if (!out.ok) return { ok: false, fix: fixOf(out) };
  return { ok: true, value: isRow(out.value) && typeof out.value.said === 'string' ? out.value.said : '' };
}

/** Where the file door answers one file's bytes, under the record this page is on. */
export const fileAt = (base: string, sha256: string): string => `${base}/api/files/${sha256}`;

/** A file's bytes, read through the file door with the app's own sign-in, or `null`. */
export async function bytesOf(base: string, sha256: string, io: Fetch = globalThis.fetch): Promise<ArrayBuffer | null> {
  try {
    const res = await io(fileAt(base, sha256), { credentials: 'same-origin' });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/**
 * Saves a file under its own name: its bytes as `application/octet-stream`, so the browser saves them and never shows
 * them, whatever they are.
 */
export async function download(base: string, file: { sha256: string; name: string }): Promise<boolean> {
  const bytes = await bytesOf(base, file.sha256);
  if (bytes === null) return false;
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}
