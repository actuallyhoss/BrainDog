/**
 * A PAGE'S HISTORY, AS THE SOURCE VIEW LISTS IT: every version of the page's text the record keeps, newest first, each
 * said as who changed it and how long ago ("You, 2h ago"), and each with a Put back and a Save as a file. "It is a file
 * somebody can keep, diff, send and edit": the earlier texts are files too, and one press from being the page again.
 *
 * WHO IS A NAME AND WHEN IS A DISTANCE. The record signs a version with whoever wrote it, which may be an id; `actor`
 * (`record/names.ts`) says it as a person reads it, and the instant goes through the one formatter every cell uses
 * (`since`), so a line here and the same change on Home read alike. Nothing here prints an id or a timestamp.
 *
 * THE VERSION'S NUMBER IS A HANDLE, kept on each line for the two callbacks and never drawn.
 *
 * PURE, AND NODE LOADS IT (relative `.ts` imports, no runes). `SourceHistory.svelte` draws what this answers.
 */

import { since } from 'braindog-render';

import { createClient, type ClientOptions } from '@braindog/client';

import { actor } from '../record/names.ts';

/** One kept version of a page's text, as the record's read of them answers it. */
export type PageVersion = {
  version: number;
  /** When it was written, an instant. */
  at: string;
  /** Who wrote it, as the record signed it, or `null` where it does not say. */
  by: string | null;
  /** Whether this is the text the page is drawn from now. Where no version says, the newest is. */
  live?: boolean | undefined;
  /** The text itself as the record holds it, which Save writes and Put back applies. This file never reads it. */
  body?: Record<string, unknown> | undefined;
};

export type VersionLine = {
  /** The handle the callbacks are given. Never drawn. */
  version: number;
  /** "You, 2h ago". */
  said: string;
  /** "On the page now" for the version the page is drawn from, `null` for every earlier one. */
  state: string | null;
  /** What Put back does on this line, for a screen reader; `null` on the page as it is now, which has nothing to put back. */
  putBack: string | null;
  /** What Save as a file saves on this line, for a screen reader. */
  save: string;
};

export const historyWords = {
  title: 'History',
  now: 'On the page now',
  putBack: 'Put back',
  puttingBack: 'Putting back',
  save: 'Save as a file',
  said: (who: string, when: string) => `${who}, ${when}`,
  /** Under the heading: how many times the page has changed, and what Put back does. */
  summary: (versions: number) =>
    versions <= 1
      ? 'This page has not been changed since it was made.'
      : `Changed ${versions === 2 ? 'once' : `${versions - 1} times`}. Put back returns the page to how it was then.`,
  putBackThe: (left: string) => `Put the page back as ${left}`,
  saveThe: (left: string) => `Save the page as ${left} as a file`,
  saveNow: 'Save the page as it is now as a file',
  left: (who: string, when: string | null) => `${who} left it${when === null ? '' : ` ${when}`}`,
  you: 'you',
} as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The versions in the record's answer, read loosely: the list itself or an answer that holds one under `versions`, each
 * signed under `by` or `who`. Anything without a number and an instant is not a version and is dropped.
 */
export function versionsOf(answer: unknown): PageVersion[] {
  const list = Array.isArray(answer) ? answer : isObject(answer) && Array.isArray(answer.versions) ? answer.versions : [];
  const out: PageVersion[] = [];
  for (const v of list) {
    if (!isObject(v) || typeof v.version !== 'number' || !Number.isFinite(v.version) || typeof v.at !== 'string') continue;
    const signed = typeof v.by === 'string' ? v.by : typeof v.who === 'string' ? v.who : null;
    out.push({ version: v.version, at: v.at, by: signed, ...(typeof v.live === 'boolean' ? { live: v.live } : {}), ...(isObject(v.body) ? { body: v.body } : {}) });
  }
  return out;
}

/**
 * The versions the record keeps of the page at `slug`, through its `pageVersions` read. A record that refuses (a page
 * this reader may not open, or a build that does not hold the read yet) and one that could not be reached answer none,
 * so the History is left out and the text above it is still whole.
 */
export async function pageVersionsOf(base: string, slug: string, io?: ClientOptions['fetch']): Promise<PageVersion[]> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  try {
    const out = await client.pageVersions({ page: slug });
    return out.ok ? versionsOf(out.value) : [];
  } catch {
    return [];
  }
}

/** A name as it reads inside a sentence: "an agent" and "someone", where a proper name keeps its capital. */
const midSentence = (name: string): string => (/^(?:An?|Someone)(?: |$)/u.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name);

/**
 * The lines of a page's history, newest first. `me` is the reader's id and `names` the people the caller holds a name
 * for, as every other namer here takes them.
 */
export function versionLines(
  versions: readonly PageVersion[],
  now: number = Date.now(),
  me: string | null = null,
  names: ReadonlyMap<string, string> = new Map(),
): VersionLine[] {
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  /* THE PAGE NOW is the version the record marks live, and the newest where it marks none. */
  const live = sorted.find((v) => v.live === true)?.version ?? sorted[0]?.version;
  return sorted.map((v) => {
    const who = actor(v.by ?? '', me, names);
    /* A TIME THAT DOES NOT READ IS LEFT OUT: `since` hands back what it could not parse, and that is not for a person. */
    const when = Number.isFinite(Date.parse(v.at)) ? since(v.at, now) : null;
    const current = v.version === live;
    const left = historyWords.left(who.kind === 'you' ? historyWords.you : midSentence(who.name), when);
    return {
      version: v.version,
      said: when === null ? who.name : historyWords.said(who.name, when),
      state: current ? historyWords.now : null,
      putBack: current ? null : historyWords.putBackThe(left),
      save: current ? historyWords.saveNow : historyWords.saveThe(left),
    };
  });
}
