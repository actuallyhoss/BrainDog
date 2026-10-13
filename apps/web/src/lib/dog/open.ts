/**
 * A PAGE'S SOURCE, OPENED FROM A FILE, AND WHAT DIFFERS FROM WHAT THE RECORD HOLDS.
 *
 * `source.ts` hands the text to the browser as a file. This is the way back: a `.dog` somebody kept, edited in their
 * own editor or was sent, read into the source view's box. Opening writes nothing. The box is where a text waits to be
 * applied, and Apply is still the one write, so an opened file is looked at, drawn and compared before it changes a
 * page.
 *
 * A FILE THAT DOES NOT READ AS A PAGE NEVER REACHES THE BOX. It is read by `parseDog`, the reader Apply and
 * `braindog page push` use, and refused with that reader's sentence and line, so what somebody had typed is not
 * replaced by a text nothing could apply.
 *
 * THE DIFFERENCE IS THE `diff` KIND'S, worked out by the renderer's `lineDiff` and drawn by its drawer, so a change to
 * a page reads here as a change to a skill reads on Decide.
 *
 * Pure: a file is anything with a name and a text, and nothing here touches the document.
 */

import { diffRows, lineDiff, type Block } from 'braindog-render';
import { parseDog } from '@braindog/dog';

/** The words this file says for itself. A refusal of the text is the parser's own sentence. */
export const openWords = {
  open: 'Open a file',
  opened: (name: string) => `${name} is in the box. Nothing is changed until you apply it.`,
  refused: (name: string) => `${name} was not opened.`,
  tooLarge: 'This file is too large to be a page.',
  unread: 'The browser could not read this file. Choose it again.',
  /** Applying writes the page the text names, so a file kept from another page would change that one from here. */
  otherPage: (theirs: string, ours: string) => `This file is the page ${theirs}, and this is ${ours}. Open it from that page.`,
  /** The line is the file's, which the box does not hold, so it is said and not a button. */
  lineOfFile: (n: number) => `Line ${n} of the file:`,
  differs: 'What differs from the page as it is now',
} as const;

/** What the file input offers first. Any file can still be chosen, and the parser is what decides. */
export const OPEN_ACCEPT = '.dog,text/plain';

/** The most a file may weigh. A page's text is a few thousand characters, and a film chosen by mistake is never read. */
export const OPEN_MOST = 1_000_000;

/** What `openText` needs of a `File`, so a test can hand it one that cannot be read. */
export type Openable = { name: string; size?: number; text(): Promise<string> };

/** The file's text for the box, or why it was not opened and the line of the file that is about. */
export type OpenedFile = { ok: true; name: string; text: string } | { ok: false; name: string; fix: string; line: number | null };

/**
 * Read a file as a page's source.
 *
 * THE TEXT IS THE FILE'S OWN, not the page printed again, so an edit made by hand arrives as it was typed. Two things
 * an editor on another machine adds are taken off, because neither is part of the page: the mark at the head of the
 * file and the carriage return before each line break.
 *
 * `page` IS THE PAGE THE BOX IS OPEN ON. A file that names another is refused: Apply writes the page a text names, so
 * it would change a page nobody is looking at.
 */
export async function openText(file: Openable, page?: string): Promise<OpenedFile> {
  const { name } = file;
  if ((file.size ?? 0) > OPEN_MOST) return { ok: false, name, fix: openWords.tooLarge, line: null };
  let raw: string;
  try {
    raw = await file.text();
  } catch {
    return { ok: false, name, fix: openWords.unread, line: null };
  }
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const got = parseDog(text);
  if (!got.ok) return { ok: false, name, fix: got.fix, line: got.line };
  const theirs = got.value.page;
  if (page !== undefined && typeof theirs === 'string' && theirs !== page) return { ok: false, name, fix: openWords.otherPage(theirs, page), line: 1 };
  return { ok: true, name, text };
}

/** A line the two texts do not share, and its number in the text it is in: the record's for `del`, the box's for `add`. */
export type ChangedLine = { op: 'del' | 'add'; line: number; text: string };

/** The lines that differ between what the record holds (`held`) and what is in the box (`box`), in reading order. */
export function diffLines(held: string, box: string): ChangedLine[] {
  const out: ChangedLine[] = [];
  let a = 0;
  let b = 0;
  for (const l of lineDiff(held, box)) {
    if (l.op !== 'add') a++;
    if (l.op !== 'del') b++;
    if (l.op !== 'same') out.push({ op: l.op, line: l.op === 'del' ? a : b, text: l.text });
  }
  return out;
}

/** The difference as a `diff` block, as a fence of `- `, `+ ` and two-space rows would parse, for the kind's drawer. */
export const diffBlock = (held: string, box: string): Block => ({
  type: 'block',
  kind: 'diff',
  rows: diffRows(held, box).map((line) => ({ cells: [line] })),
  raw: '',
  start: 0,
  end: 0,
});
