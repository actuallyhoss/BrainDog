/**
 * A row's picture: a project's or an organisation's logo or a person's photo, kept in the file field its list names as
 * `identity.picture`.
 *
 * HIS WORD OF 4 AND 9 NOVEMBER: a project changes its logo and a person their photo, by hovering where they are drawn,
 * and an agent that finds one saves it. So a list may say which of its `file` fields is the picture its rows are drawn
 * by, and every drawer of a row's mark or face draws that file where the row holds one, and its glyph or its letter
 * where it does not.
 *
 * ONLY THE HASH TRAVELS. A row holds `{ sha256, mime, bytes, name }` (`field-draft.ts` `FileValue`) and the bytes are at
 * `/api/files/<sha256>`, served `immutable` under their hash (`apps/worker/src/files.ts`), so a picture is fetched once
 * a device and every screen after that draws it from the cache.
 *
 * PURE, beside `Face.svelte` and `IconWell.svelte`, so what they decide is read without mounting them.
 */

import { apiBase } from '../at.ts';
import { REGISTERS } from '../record/held.ts';

/** The hash a file is named by: sixty-four lower-case hex characters, the test `coerce.ts` applies. */
const SHA256 = /^[0-9a-f]{64}$/u;

/** The hash a picture field holds, from the file as a row holds it or from a bare hash, else `null`. */
export function pictureOf(value: unknown): string | null {
  if (typeof value === 'string') return SHA256.test(value) ? value : null;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const sha = (value as { sha256?: unknown }).sha256;
  return typeof sha === 'string' && SHA256.test(sha) ? sha : null;
}

/** Where a picture is served: under the record this tab is on, as every file is (`FileField.svelte`). */
export const pictureSrc = (sha256: string, base: string = apiBase()): string => `${base}/api/files/${sha256}`;

/** The field a list keeps its rows' pictures in, its declared `identity.picture`, or `null` where it names none. */
export function pictureFieldOf(register: string): string | null {
  const field = (REGISTERS[register]?.identity as { picture?: unknown } | undefined)?.picture;
  return typeof field === 'string' && field !== '' && (REGISTERS[register]?.fields ?? []).some((f) => f.id === field) ? field : null;
}

/** Whether a list's rows are drawn round: people are, by their list's `meets:`; a project or an organisation is square. */
export const roundOf = (register: string): boolean => REGISTERS[register]?.meets !== undefined;

/** The picture a row is drawn by, from its own fields, where its list names one and the row holds it. */
export function pictureOfRow(register: string, fields: Readonly<Record<string, unknown>>): string | null {
  const field = pictureFieldOf(register);
  return field === null ? null : pictureOf(fields[field]);
}

/**
 * The most a picture is drawn from, in pixels a side. A face is 32 at most and a project's hero 56, so 256 is sharp on a
 * screen of three pixels to a point at every size it is drawn, and a photo is a few tens of kilobytes.
 */
export const PICTURE_SIDE = 256;

/**
 * A row whose picture may be changed where it is drawn: what the changer writes to and what it shows while it is open.
 * Built by the screen that draws the row and knows the reader may write it (`PictureChange.svelte`).
 */
export type PictureTarget = {
  register: string;
  seq: number;
  /** The version the screen read, so a write over a newer one is refused rather than lost. */
  version?: number | undefined;
  /** Its name, for the changer's heading and the receipt. */
  name: string;
  /** A person is round; a project or any other thing is a rounded square. */
  round: boolean;
  /** The picture it holds now, by hash, or `null`. */
  picture: string | null;
  /** The glyph it wears now, where its list keeps a mark (`undefined` where it keeps none, so no glyph is offered). */
  mark?: string | null | undefined;
  /** Its hue, which its mark and an empty well are drawn in. */
  hue?: number | null | undefined;
  /**
   * The screen's own write, where it has one with its own drawing and Undo (`RowPanel`'s `host.write`): answers whether
   * anything was sent. Absent, the changer writes the row itself (`picture-write.ts`).
   */
  write?: ((patch: Record<string, unknown>, said: string) => boolean) | undefined;
};

/** A row's key as every screen names it, `things#3`, which `pictures.svelte.ts` holds a written picture by. */
export const rowKey = (t: Pick<PictureTarget, 'register' | 'seq'>): string => `${t.register}#${t.seq}`;
