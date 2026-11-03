/**
 * Visuals: a page a thing carries, kept as `note` lines on the thing (`field` `visual:<id>`), never a table, so history,
 * Undo and export already hold it. The bytes stay in the host's file store, named here by hash.
 */

import type { Sql } from '@braindog/ports';

/** The most one page may be, in bytes of UTF-8: a long audit with its styles and scripts, without its pictures. */
export const VISUAL_PAGE_MOST = 512 * 1024;

/** The most pictures one version may name. */
export const VISUAL_PICTURES_MOST = 100;

/** The most the pictures of one version may come to, together. */
export const VISUAL_PICTURES_BYTES_MOST = 20 * 1024 * 1024;

/** The most every visual of one record may come to, pages and pictures, as `VISUAL_WEIGHT` counts them. */
export const VISUAL_RECORD_MOST = 512 * 1024 * 1024;

/** The most visuals one thing may carry at once, and versions one visual may have. */
export const VISUALS_ON_MOST = 50;
export const VISUAL_VERSIONS_MOST = 200;

/** The longest title, in characters. */
export const VISUAL_TITLE_MOST = 120;

/** The counter the weight of every visual kept here is added to (`counter`, which travels). */
export const VISUAL_WEIGHT = 'visual-bytes';

/** The `field` every visual line carries, before its id. */
export const VISUAL_FIELD = 'visual:';

/** The picture types a visual takes: the file store's pictures, never its PDF and never an SVG. */
export const VISUAL_PICTURE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];

/** A picture's name as the page says it: a relative path such as `img/today.jpg`, never a way out of its folder. */
export const PICTURE_NAME = /^(?!.*\.\.)[A-Za-z0-9_][A-Za-z0-9._/-]{0,199}$/;

export type VisualPicture = { name: string; sha256: string; mime: string; bytes: number };

/**
 * What a version line holds in `to_v`. `draft` marks one handed in to be kept or thrown away: it waits
 * beside the version the visual stands at and never replaces it until a person keeps it.
 */
export type VisualBody = { title: string; page: string; bytes: number; pictures: VisualPicture[]; draft?: true };

/**
 * What any visual line holds in `to_v`: a version; a step back to one, or the visual taken away, each with the draft
 * that waits again when an undo puts one back; a draft kept, so the visual stands at it; or a draft thrown away.
 */
export type VisualSaid = VisualBody | { back: string; draft?: string } | { gone: true; draft?: string } | { keep: string } | { drop: string };

/** One line of a visual as the log holds it. */
export type VisualLine = { rowid: number; id: string; ts: string; actor: string; target: string; field: string; to_v: string | null; batch: string | null };

/* ── the page ───────────────────────────────────────────────────────────── */

/** What a page may not say, each with its sentence: the frame stops all of it anyway, so the author hears it in words. */
const TAGS = /<\s*(link|base|iframe|frame|object|embed|form|portal)\b/iu;
const TAG_SAID: Record<string, string> = {
  link: 'it loads a stylesheet or a font from elsewhere, and a visual loads nothing. Write the styles in it.',
  base: 'it sets a base address, and a visual has none.',
};
const OTHER_TAG = 'it holds a frame, an object or a form, which a visual cannot use. Draw with HTML, SVG, CSS and a script.';

/** A script's reach, read only inside `<script>` and `on…=` handlers, so prose that says "import" is not refused. */
const SCRIPT_RULES: readonly { test: RegExp; fix: string }[] = [
  { test: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon|RTCPeerConnection|Worker|SharedWorker)\s*\(/u, fix: 'its script calls the network, and a visual has none.' },
  { test: /\bimport\s*\(|\bimport\s+[\w{*]/u, fix: 'its script imports a module, and a visual loads nothing. Write it as one script.' },
  { test: /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie|caches)\b/u, fix: 'its script uses storage, and a visual keeps nothing.' },
  { test: /\b(?:top|parent|opener)\s*\.\s*(?:location|document)\b|\bwindow\.open\s*\(|\blocation\s*(?:\.\s*(?:href|assign|replace)\s*)?=/u, fix: 'its script reaches for the page around it or goes elsewhere, and a visual cannot.' },
  { test: /\b(?:https?|wss?|ftp|file):\/\/(?!www\.w3\.org\/)|\bjavascript:/iu, fix: 'its script names an address off the page, and a visual reaches nothing outside itself.' },
];

const SCRIPTS = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/giu;
const SCRIPT_OPENS = /<script\b([^>]*)>/giu;
const HANDLERS = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/giu;
const ADDRESSED = /(?:\s|^)(src|href|action|formaction|poster|data|xlink:href|background)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/giu;
const SRCSET = /\ssrcset\s*=\s*("[^"]*"|'[^']*')/giu;
const URLS = /url\(\s*("[^"]*"|'[^']*'|[^)]*)\s*\)/giu;
const META = /<meta\b[^>]*>/giu;
const TITLE = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu;

const BYTES = new TextEncoder();
const unquote = (v: string): string => v.trim().replace(/^(["'])([\s\S]*)\1$/u, '$2').trim();

/** Whether an address a page names stays on it: inline data, a place on the page, or one of its own pictures. */
const stays = (value: string, names: ReadonlySet<string>): boolean => {
  const v = unquote(value);
  return v === '' || v.startsWith('#') || /^data:/iu.test(v) || names.has(v);
};

/**
 * A page as kept, or why not ("This page cannot be kept because ..."). Only its `<meta>` tags go, since one can refresh
 * elsewhere; its own `<html>` and `<body>` stay, as written inside the frame's body they only add attributes.
 */
export function visualPage(html: string, names: ReadonlySet<string>): { page: string; title: string | null } | { fault: string } {
  if (BYTES.encode(html).length > VISUAL_PAGE_MOST)
    return { fault: `it is longer than ${VISUAL_PAGE_MOST / 1024} KB without its pictures. Hand the pictures in beside it rather than inside it, or split it.` };
  const page = html.replace(META, '');
  if (page.trim() === '') return { fault: 'it is empty.' };
  const tag = TAGS.exec(page);
  if (tag) return { fault: TAG_SAID[tag[1]!.toLowerCase()] ?? OTHER_TAG };
  if (/@import\b/iu.test(page)) return { fault: 'it imports a stylesheet, and a visual loads nothing. Write the styles in it.' };
  if (/\bshadowroot(?:mode|clonable|delegatesfocus|serializable)\b/iu.test(page)) return { fault: 'it opens a shadow root, and a visual draws in its own page. Write the markup as it is.' };
  /* A SCRIPT LOADED FROM ELSEWHERE (`<script src="https://cdn…">`) IS SAID HERE, before the scripts are taken out of the
     markup below, which took its `src` with them: the frame blocked the load and the visual drew blank with no word why. */
  for (const m of page.matchAll(SCRIPT_OPENS)) {
    const src = /(?:\s|^)src\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/iu.exec(m[1] ?? '');
    if (src && !stays(src[1]!, names))
      return {
        fault: `its script loads ${clip(unquote(src[1]!))}, and a visual loads nothing from elsewhere, so it would draw blank. Write the script's code into the page, or attach the page as a file (braindog attach page.html --to <thing>), where the usual chart and style libraries load.`,
      };
  }
  /* THE MARKUP AND ITS STYLES ARE READ FOR ADDRESSES WITHOUT ITS SCRIPTS, where `src = …` is a variable and not a tag's. */
  const markup = page.replace(SCRIPTS, '');
  for (const m of markup.matchAll(ADDRESSED))
    if (!stays(m[2]!, names))
      return { fault: `its ${m[1]!.toLowerCase()} names ${clip(unquote(m[2]!))}, which is not on the page. Write pictures in beside it by the name the page uses, links as text.` };
  for (const m of markup.matchAll(SRCSET))
    for (const part of unquote(m[1]!).split(','))
      if (!stays(part.trim().split(/\s+/u)[0] ?? '', names)) return { fault: 'a srcset in it names a picture that was not handed in beside it.' };
  for (const m of markup.matchAll(URLS))
    if (!stays(m[1]!, names)) return { fault: `a url() in it names ${clip(unquote(m[1]!))}, which was not handed in beside it. Name one of its pictures, or inline data.` };
  const code = [...[...page.matchAll(SCRIPTS)].map((m) => m[1]!), ...[...markup.matchAll(HANDLERS)].map((m) => m[1]!)];
  for (const body of code) for (const rule of SCRIPT_RULES) if (rule.test.test(body)) return { fault: rule.fix };
  const title = TITLE.exec(page)?.[1]?.replace(/<[^>]*>/gu, '').replace(/\s+/gu, ' ').trim() ?? '';
  return { page, title: title === '' ? null : title.slice(0, VISUAL_TITLE_MOST) };
}

const clip = (s: string): string => (s.length > 60 ? `${s.slice(0, 59)}…` : s);

/* ── a line ─────────────────────────────────────────────────────────────── */

const SHA = /^[0-9a-f]{64}$/;

/** What a line's `to_v` says, read back, or `null` for one that says nothing a visual can be (erased, or not written here). */
export function visualSaid(to: string | null): VisualSaid | null {
  if (to === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(to);
  } catch {
    return null;
  }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const waits = typeof o.draft === 'string' ? { draft: o.draft } : {};
  if (o.gone === true) return { gone: true, ...waits };
  if (typeof o.back === 'string') return { back: o.back, ...waits };
  if (typeof o.keep === 'string') return { keep: o.keep };
  if (typeof o.drop === 'string') return { drop: o.drop };
  if (typeof o.page !== 'string' || !SHA.test(o.page) || typeof o.title !== 'string' || typeof o.bytes !== 'number' || !Array.isArray(o.pictures)) return null;
  const pictures = o.pictures.flatMap((p): VisualPicture[] => {
    if (p === null || typeof p !== 'object') return [];
    const q = p as Record<string, unknown>;
    return typeof q.name === 'string' && typeof q.sha256 === 'string' && typeof q.mime === 'string' && typeof q.bytes === 'number'
      ? [{ name: q.name, sha256: q.sha256, mime: q.mime, bytes: q.bytes }]
      : [];
  });
  return { title: o.title, page: o.page, bytes: o.bytes, pictures, ...(o.draft === true ? { draft: true as const } : {}) };
}

export const isVersion = (s: VisualSaid | null): s is VisualBody => s !== null && 'page' in s;

/* ── the two reads ──────────────────────────────────────────────────────── */

const LINE = 'rowid, id, ts, actor, target, field, to_v, batch';

/** Every line of one visual on its thing, oldest first. The log's `(target, ts)` index finds them. */
export function visualLines(sql: Sql, target: string, field: string): VisualLine[] {
  return sql.all<VisualLine>(`SELECT ${LINE} FROM event WHERE target = ? AND kind = 'note' AND field = ? ORDER BY rowid`, target, field);
}

/**
 * Where a visual was once `lines` were written: the version line it stood at (`null` when it was gone or not there yet)
 * and the draft line waiting beside it (`null` when none waits). Each is the id of a version line itself, so nothing is
 * followed twice.
 *
 * A DRAFT NEVER MOVES WHERE IT STANDS. A version handed in as a draft waits; a kept version after it, a step back or a
 * taking away leaves none waiting; and only a keep naming the draft that waits makes the visual stand at it. A line
 * this build cannot read (erased) moves nothing.
 */
export function visualState(lines: readonly VisualLine[]): { standing: string | null; draft: string | null } {
  let standing: string | null = null;
  let draft: string | null = null;
  for (const l of lines) {
    const said = visualSaid(l.to_v);
    if (said === null) continue;
    if (isVersion(said)) {
      if (said.draft === true) draft = l.id;
      else [standing, draft] = [l.id, null];
    } else if ('gone' in said) [standing, draft] = [null, said.draft ?? null];
    else if ('back' in said) [standing, draft] = [said.back, said.draft ?? null];
    else if ('keep' in said) {
      if (said.keep === draft) [standing, draft] = [draft, null];
    } else if (said.drop === draft) draft = null;
  }
  return { standing, draft };
}

/** The version line a visual stood at once `lines` were written, or `null` when it was gone or not there (`visualState`). */
export const visualStanding = (lines: readonly VisualLine[]): string | null => visualState(lines).standing;
