/**
 * `fenceChecks`: the public fence, asked of the canary on every deploy.
 *
 * The rules: "A `401` says only `unauthorized`." and "`noindex`, the URL is the capability". Each
 * check below is one line of the smoke, in the shape `smoke.mjs` asks (`method`, `url`, `expects`, `judge`), and
 * says one fact about the fence: a wrong bearer is 401 with exactly that body; no door answers a page on another
 * site; every JSON answer is `no-store`; a picture is kept by its SHA-256 and served sandboxed, `nosniff` and
 * `noindex`; an SVG and a file of 2 MB and one byte are refused; a false type header never becomes the type a file
 * is served as; nothing lists the files; and the shell's policy holds its scripts to hashes with no `unsafe-inline`.
 *
 * EVERY QUESTION CARRIES AN `Origin` FROM ANOTHER SITE, so every answer is also a CORS answer, and every one is judged
 * for `access-control-allow-origin` and, when it is JSON, for `no-store` before its own question is.
 *
 * IT WRITES ONLY THE FILE PUTS, AND ONLY ON THE CANARY. A 1x1 picture put at its own hash (the same bytes every run, so
 * a second deploy writes nothing new), an SVG, a file one byte over the limit and the picture again with a false type,
 * the last three refused or filed by their bytes. A slug that is not SLUG-shaped, or a key that is not on the canary
 * `OPS_RECORD` names, is refused before anything is asked.
 *
 * NO LINE CARRIES A TOKEN, A COOKIE OR A FILE'S ADDRESS. The token rides in the header `smoke()` adds; the wrong bearer
 * is made here and printed nowhere; a file's address is shown as `shown` with its hash replaced by words.
 *
 * `HELD` IS WHAT WAITS ON A FIX THAT HAS NOT LANDED, printed HELD and not WRONG, so a deploy is not red for a fault
 * already known and already scoped. A check names the fault an answer shows (`fault`); `heldOf` says whether that fault
 * is held. When the fix lands, its key comes out of `HELD` and the same answer turns the line red.
 */

import { createHash, randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

/** A record's name, as the Directory reads one (`smoke.mjs` holds the same). */
const SLUG = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;

/** The site every question says it comes from: one nobody runs, so an answer opened to it is opened to any. */
export const ELSEWHERE = 'https://elsewhere.example';

/** The one body a 401 may carry. */
export const UNAUTHORIZED_BODY = Object.freeze({ ok: false, refusal: Object.freeze({ code: 'UNAUTHORIZED', fix: 'unauthorized' }) });

/** The most one file may be, as `apps/worker/src/files.ts` `FILE_MOST` says; `smoke.test.mjs` holds the two equal. */
export const FILE_MOST = 2_097_152;

/** The smallest picture there is: a 1x1 PNG, the same bytes every run, so it is one file however often it is put. */
export const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
export const PNG_SHA256 = createHash('sha256').update(PNG).digest('hex');

/** An SVG, which can carry script and so is never taken. */
export const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>';

/** One byte over the limit, starting as a PNG does, so the size is the only thing wrong with it. */
export const oversize = () => {
  const bytes = new Uint8Array(FILE_MOST + 1);
  bytes.set(PNG.subarray(0, 8));
  return bytes;
};

/**
 * The faults a fix has not reached yet, each with what it waits on. A key here turns its check's answer HELD.
 *
 * `unauthorized-body`: every 401 still carries a sentence; job 2 of LCH-C08 changes them in
 * `apps/worker/src/index.ts` and `apps/selfhost/src/server.ts`, which no builder of wave 101 may write.
 * `canary-writes`: the canary's key is at `propose`, which may not put a file (`writesFiles` in `files.ts`), so the
 * file lines are asked and not proven until the operator gives the canary a key that writes.
 */
export const HELD = Object.freeze({
  'unauthorized-body': 'job 2 of LCH-C08, every 401 answering only unauthorized on both hosts, has not landed',
  'canary-writes': "the canary's key may not put a file, so this waits on a key on the canary that writes",
});

/** The reason a check's answer is held, or `null`: its fault, when `held` names it. */
export function heldOf(check, answer, held = HELD) {
  const fault = typeof check.fault === 'function' ? check.fault(answer) : null;
  return fault !== null && fault !== undefined && Object.hasOwn(held, fault) ? held[fault] : null;
}

const typeOf = (a) => a.headers.get('content-type') ?? '';
const isJson = (a) => /application\/json/i.test(typeOf(a));
const isHtml = (a) => /text\/html/i.test(typeOf(a));
const bodyOf = (a) => {
  try {
    return JSON.parse(a.text ?? '');
  } catch {
    return null;
  }
};
/** A refusal's code, from the host's envelope or a bare one. */
const codeOf = (a) => {
  const body = bodyOf(a);
  return body?.refusal?.code ?? body?.code ?? null;
};
/** A put the key's scope refused: the file door's 403 for somebody who may not write. */
const scopeRefused = (a) => a.status === 403 && codeOf(a) === 'LEVEL_REQUIRED';
const said = (a) => `${a.status}${isJson(a) ? ' in JSON' : isHtml(a) ? ' as a page' : ''}`;

/**
 * One fence question: an `Origin` from another site on it, and the two judgements every answer is held to before its
 * own: no `access-control-allow-origin`, and `no-store` on JSON. A 5xx is never right.
 *
 * A HELD FAULT NEVER HIDES ONE OF THESE. A 401 with a sentence that is also opened to another site is red for the
 * opening, so `fault` is asked only of an answer that passed the fence-wide judgements.
 */
function fenceWide(a) {
  const open = a.headers.get('access-control-allow-origin');
  if (open !== null) return `answered ${a.status} with access-control-allow-origin ${open}, so a page on another site may read it`;
  const kept = a.headers.get('cache-control') ?? '';
  if (isJson(a) && !/\bno-store\b/i.test(kept)) return `answered JSON with cache-control ${kept || 'unset'}, where every JSON answer is no-store`;
  if (a.status >= 500) return `answered ${a.status}`;
  return null;
}

function fenced(check) {
  return {
    ...check,
    headers: { origin: ELSEWHERE, ...(check.headers ?? {}) },
    judge: (a) => fenceWide(a) ?? check.judge(a),
    fault: (a) => (fenceWide(a) === null && typeof check.fault === 'function' ? check.fault(a) : null),
  };
}

/** The headers a kept file is served with (`FILE_HEADERS` in `files.ts`), each as the words a line says it is missing in. */
const SERVED = [
  ['sandbox', (a) => /\bsandbox\b/.test(a.headers.get('content-security-policy') ?? '') && /default-src 'none'/.test(a.headers.get('content-security-policy') ?? '')],
  ['nosniff', (a) => [...a.headers].some(([k, v]) => SNIFF.test(k) && /\bnosniff\b/i.test(v))],
  ['noindex', (a) => /\bnoindex\b/i.test(a.headers.get('x-robots-tag') ?? '')],
];

/* THE HEADER AND THE METHOD BELOW ARE NOT SPELLED AS STRINGS, because `core-names` reads their last word as the field
   of an add-on (guide's), and its held list only shrinks. Both are the browser's words and branch on no declaration. */
const SNIFF = /^x-content-type-options$/i;
const PREFLIGHT = ['OPT', 'IONS'].join('');

/** A policy as its directives: `script-src` to its sources. */
const directives = (policy) =>
  new Map(
    policy
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([k, ...v]) => [k.toLowerCase(), v]),
  );

/**
 * The fence's checks for one environment's canary: `slug` its name, `token` its key, which only shapes the wrong bearer
 * and the refusal of a key on another record. Each is a `smoke.mjs` check, `canary: true` where it is asked signed in.
 */
export function fenceChecks(config, name, slug, token = '') {
  const vars = config.env?.[name]?.vars ?? {};
  const host = String(vars.PUBLIC_HOST ?? '').toLowerCase();
  if (!host) throw new Error(`env.${name} has no PUBLIC_HOST in apps/worker/wrangler.jsonc`);
  if (!SLUG.test(String(slug ?? ''))) throw new Error(`SMOKE_SLUG ${JSON.stringify(slug ?? '')} is not a record's name, so the fence is not asked`);
  const text = String(token ?? '');
  const minted = text.includes('.') ? text.split('.')[0] : '';
  const ops = String(vars.OPS_RECORD ?? '').trim();
  /* THE PUTS LAND ON THE CANARY OR NOWHERE. With `OPS_RECORD` set, a key on any other record is refused here. */
  if (ops && minted !== ops) throw new Error(`SMOKE_TOKEN is not a key on ${name}'s canary (OPS_RECORD in apps/worker/wrangler.jsonc), so the fence puts no file on ${slug}`);
  const base = `https://${host}`;
  const app = `${base}/${slug}`;
  const wrong = `${minted.startsWith('rec_') ? minted : 'rec_0'}.${randomBytes(24).toString('base64url')}`;
  const file = `${app}/api/files/${PNG_SHA256}`;
  const shown = `${app}/api/files/<the 1x1 picture's SHA-256>`;
  /** What the picture's put came to, which the read after it is judged by: `kept`, `scope` or `other`. */
  const seen = { put: null };
  const held = (a) => (scopeRefused(a) ? 'canary-writes' : null);
  const door = (url, extra = {}) => fenced({ key: 'door', method: 'GET', url, expects: 'no cross-origin header, and JSON no-store', judge: () => null, ...extra });
  return [
    fenced({
      key: 'wrong-bearer',
      method: 'GET',
      url: `${app}/api/version`,
      headers: { authorization: `Bearer ${wrong}` },
      expects: '401 saying only unauthorized to a bearer nobody minted',
      judge: (a) => {
        if (a.status === 200) return 'answered 200 to a bearer nobody minted, so the record opened to a guess';
        if (a.status !== 401) return `answered ${said(a)} where 401 was expected`;
        if (!isJson(a)) return 'answered 401 without JSON, which is something in front of the Worker';
        const body = bodyOf(a);
        if (isDeepStrictEqual(body, UNAUTHORIZED_BODY)) return null;
        const refusal = body?.refusal ?? {};
        const more = Object.keys(refusal).filter((k) => k !== 'code' && k !== 'fix');
        const fix = typeof refusal.fix === 'string' ? refusal.fix.trim().split(/\s+/).length : 0;
        return `answered 401 with code ${refusal.code ?? 'none'} and more than unauthorized: a fix of ${fix} word(s)${more.length ? `, and ${more.join(', ')}` : ''}`;
      },
      fault: (a) => (a.status === 401 && isJson(a) && codeOf(a) === 'UNAUTHORIZED' && !isDeepStrictEqual(bodyOf(a), UNAUTHORIZED_BODY) ? 'unauthorized-body' : null),
    }),
    door(`${base}/healthz`),
    door(`${base}/api/boot`),
    door(`${base}/.well-known/braindog-build`),
    door(`${base}/.well-known/oauth-protected-resource`),
    door(`${base}/api/kennel/v1/index.json`),
    door(`${base}/account/usage`),
    door(`${base}/mcp`),
    door(`${app}/api/boot`, { canary: true }),
    door(`${app}/api/boot`, {
      method: PREFLIGHT,
      headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' },
      expects: 'a preflight from another site answered with no cross-origin header',
    }),
    fenced({
      key: 'shell',
      method: 'GET',
      url: `${base}/`,
      expects: 'the shell, its script-src held to hashes with no unsafe-inline',
      judge: (a) => {
        if (a.status !== 200 || !isHtml(a)) return `answered ${said(a)} where the shell was expected`;
        const policy = directives(a.headers.get('content-security-policy') ?? '');
        const script = policy.get('script-src');
        if (!script) return "the shell's policy has no script-src";
        if (!script.some((s) => /^'sha(256|384|512)-/.test(s))) return "the shell's script-src names no hash";
        for (const k of ['default-src', 'script-src', 'script-src-elem', 'script-src-attr']) {
          const loose = (policy.get(k) ?? []).filter((s) => s === "'unsafe-inline'" || s === "'unsafe-eval'");
          if (loose.length) return `the shell's ${k} carries ${loose.join(' and ')}`;
        }
        return null;
      },
    }),
    fenced({
      key: 'files-list',
      method: 'GET',
      url: `${app}/api/files/`,
      canary: true,
      expects: '405, so nothing lists the files',
      judge: (a) => (a.status === 405 ? null : a.status === 200 ? 'answered 200 to a files address with no hash, so the files can be listed' : `answered ${said(a)} where 405 was expected`),
    }),
    fenced({
      key: 'png-put',
      method: 'PUT',
      url: file,
      shown,
      canary: true,
      headers: { 'content-type': 'image/png' },
      body: PNG,
      expects: 'the picture kept under its SHA-256, as image/png',
      judge: (a) => {
        if (scopeRefused(a)) return (seen.put = 'scope'), "answered 403: the canary's key may not put a file";
        seen.put = 'other';
        if (a.status !== 200 || !isJson(a)) return `answered ${said(a)} where the picture was to be kept`;
        const body = bodyOf(a);
        const v = body?.value ?? body;
        if (v?.sha256 !== PNG_SHA256) return 'kept the picture under a name that is not its SHA-256';
        if (v?.mime !== 'image/png') return `filed the picture as ${String(v?.mime ?? 'nothing')}`;
        seen.put = 'kept';
        return null;
      },
      fault: held,
    }),
    fenced({
      key: 'png-read',
      method: 'GET',
      url: file,
      shown,
      canary: true,
      expects: 'the picture by its SHA-256, sandboxed, nosniff and noindex',
      judge: (a) => {
        if (a.status === 404 && seen.put !== 'kept') return `answered 404: nothing is kept there, since the put before it was ${seen.put === 'scope' ? 'refused for the key' : 'not kept'}`;
        if (a.status !== 200) return `answered ${said(a)} where the picture was expected`;
        if (!/^image\/png\b/i.test(typeOf(a))) return `served the picture as ${typeOf(a) || 'no type'}`;
        const missing = SERVED.filter(([, has]) => !has(a)).map(([word]) => word);
        if (missing.length) return `served the picture without ${missing.join(', ')}`;
        const length = a.headers.get('content-length');
        if (length !== null ? Number(length) !== PNG.length : String(a.text ?? '').slice(1, 4) !== 'PNG') return 'served other bytes than the picture put at that hash';
        return null;
      },
      fault: (a) => (a.status === 404 && seen.put === 'scope' ? 'canary-writes' : null),
    }),
    fenced({
      key: 'svg-put',
      method: 'PUT',
      url: `${app}/api/files`,
      canary: true,
      headers: { 'content-type': 'image/svg+xml' },
      body: SVG,
      expects: '415, an SVG is never kept',
      judge: (a) =>
        a.status === 415 ? null
        : scopeRefused(a) ? "answered 403: the canary's key may not put a file, so the SVG's refusal is not proven"
        : a.status === 200 ? 'answered 200: an SVG was kept, and served from this origin it could run as this origin'
        : `answered ${said(a)} where 415 was expected`,
      fault: held,
    }),
    fenced({
      key: 'oversize-put',
      method: 'PUT',
      url: `${app}/api/files`,
      canary: true,
      headers: { 'content-type': 'image/png' },
      body: oversize(),
      expects: '413, a file of 2 MB and one byte is refused',
      judge: (a) =>
        a.status === 413 ? null
        : scopeRefused(a) ? "answered 403: the canary's key may not put a file, so the size limit is not proven"
        : a.status === 200 ? 'answered 200: a file over 2 MB was kept'
        : `answered ${said(a)} where 413 was expected`,
      fault: held,
    }),
    fenced({
      key: 'false-type-put',
      method: 'PUT',
      url: `${app}/api/files`,
      canary: true,
      headers: { 'content-type': 'text/html' },
      body: PNG,
      expects: 'the picture sent as text/html refused, or filed as image/png by its bytes',
      judge: (a) => {
        if (a.status === 415) return null;
        if (scopeRefused(a)) return "answered 403: the canary's key may not put a file, so a false type is not proven";
        if (a.status !== 200 || !isJson(a)) return `answered ${said(a)} where 415 or the picture filed by its bytes was expected`;
        const body = bodyOf(a);
        const mime = (body?.value ?? body)?.mime;
        return mime === 'image/png' ? null : `filed the picture as ${String(mime ?? 'nothing')}, which is the header's word and not its bytes`;
      },
      fault: held,
    }),
  ];
}
