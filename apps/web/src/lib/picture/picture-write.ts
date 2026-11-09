/**
 * A picture sent and a row's picture or mark changed: the bytes through the file door, then one write of one field.
 *
 * THE BYTES FIRST, AND THEY ARE NOT THE CHANGE. `PUT /api/files` keeps them under their hash and answers it, as a file
 * field sends one (`FileField.svelte`); a picture sent and then not used is bytes nothing names, which the store shrugs
 * off. The row changes only with the write after it.
 *
 * ONE WRITE, ITS RECEIPT AND ITS UNDO, through the app's runner (`optimistic.svelte.ts` `run`): the new picture is drawn
 * at once everywhere the row is (`holdPicture`), taken back if the record refuses, and the receipt's Undo puts the
 * batch back on the record. A screen with a write of its own (the row panel) is handed the patch instead.
 */

import { createClient } from '@braindog/client';

import { apiBase } from '../at.ts';
import { copy } from '../copy.ts';
import { run } from '../data/optimistic.svelte.ts';
import { reread } from '../data/live.svelte.ts';
import type { FileValue } from '../record/field-draft.ts';
import { markFieldOf } from '../page/mark-pick.ts';
import { pictureFieldOf, rowKey, type PictureTarget } from './picture.ts';
import { dropPicture, faceWritten, holdPicture, pictureByName } from './pictures.svelte.ts';
import { PICTURE_WORDS } from './words.ts';

/** The most one picture may be, the file door's own (`apps/worker/src/files.ts` `FILE_MOST`). */
export const PICTURE_MOST = 2_097_152;

/** A picture sent through the file door: the file as a row holds it, or the one sentence why not. */
export async function sendPicture(blob: Blob, base: string = apiBase()): Promise<{ ok: true; file: FileValue } | { ok: false; fix: string }> {
  if (blob.size > PICTURE_MOST) return { ok: false, fix: 'This picture is bigger than 2 MB. Choose a smaller one.' };
  let res: Response;
  try {
    res = await fetch(`${base}/api/files`, {
      method: 'PUT',
      headers: { 'content-type': blob.type || 'application/octet-stream', accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: blob,
    });
  } catch {
    return { ok: false, fix: copy.recordNotReached };
  }
  if (res.status === 401) return { ok: false, fix: copy.signInAgain };
  const said = (await res.json().catch(() => null)) as { sha256?: unknown; mime?: unknown; bytes?: unknown; refusal?: { fix?: unknown } } | null;
  if (!res.ok || typeof said?.sha256 !== 'string' || typeof said.mime !== 'string' || typeof said.bytes !== 'number')
    return { ok: false, fix: typeof said?.refusal?.fix === 'string' ? said.refusal.fix : copy.recordNotReached };
  const ext = said.mime === 'image/webp' ? 'webp' : said.mime === 'image/png' ? 'png' : said.mime === 'image/jpeg' ? 'jpg' : said.mime.replace(/^image\//u, '');
  return { ok: true, file: { sha256: said.sha256, mime: said.mime, bytes: said.bytes, name: `picture.${ext}` } };
}

/** The patch that sets a row's picture to `file`, or takes it off for `null`; `null` where its list keeps no picture. */
export function picturePatch(register: string, file: FileValue | null): Record<string, unknown> | null {
  const field = pictureFieldOf(register);
  return field === null ? null : { [field]: file };
}

/**
 * The patch that changes what a row is drawn by to a glyph: the mark set to `glyph` (or taken off for `null`), and a
 * picture it holds taken off with it, since a picture is drawn over any glyph. `null` where its list keeps no mark.
 */
export function glyphPatch(target: PictureTarget, glyph: string | null): Record<string, unknown> | null {
  const mark = markFieldOf(target.register);
  if (mark === null) return null;
  const picture = pictureFieldOf(target.register);
  return { [mark]: glyph, ...(picture !== null && target.picture !== null ? { [picture]: null } : {}) };
}

/**
 * One change of what a row is drawn by: `patch` written with `said` as its receipt, and `drawn` (the hash now, or
 * `null`) held so every screen draws it at once. Through the screen's own write where it handed one. Answers whether
 * anything was sent.
 */
export function writePicture(target: PictureTarget, patch: Record<string, unknown>, said: string, drawn: string | null): boolean {
  /* A PERSON'S FACE AND AN ORGANISATION'S LOGO ARE DRAWN BY NAME IN MOST PLACES, so the name is told too, and given back
     if the record says no. */
  const was = pictureByName(target.register, target.name);
  const draw = () => {
    holdPicture(rowKey(target), drawn);
    faceWritten(target.register, target.name, drawn);
  };
  if (target.write) {
    const sent = target.write(patch, said);
    if (sent) draw();
    return sent;
  }
  const key = rowKey(target);
  const client = createClient({ base: apiBase() });
  void run<unknown>({
    apply: draw,
    revert: () => {
      dropPicture(key);
      faceWritten(target.register, target.name, was);
    },
    send: async () => {
      const out = await client.update({ register: target.register, seq: target.seq, patch, ...(target.version === undefined ? {} : { version: target.version }) });
      if (out.ok) return { ok: true, value: out.value };
      /* A WRITE HE MAY NOT MAKE ALONE IS ASKED (`update` answers `asked`), which is no write here: said, and put back. */
      if ('conflict' in out) return { ok: false, fix: copy.writeConflict(target.name) };
      return { ok: false, fix: out.refusal.code === 'UNREACHABLE' ? copy.recordNotReached : out.refusal.fix };
    },
    /* EVERY SCREEN READS THE ROW AGAIN, so what they hold catches up with what is drawn. */
    settle: () => void reread(),
    said,
  });
  return true;
}

/** The receipt for a change of picture: changed, or taken off. */
export const pictureSaid = (name: string, file: FileValue | null): string => (file === null ? PICTURE_WORDS.removed(name) : PICTURE_WORDS.changed(name));
