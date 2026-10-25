/**
 * The shape door: `POST /api/shape`, the half both hosts share (PRF-A13, `area-proof-a.md`).
 *
 * THE BEARER IS A SHAPE GRANT AND NOTHING ELSE. A device grant of reach `shape`, approved once by the owner with six
 * digits, standing for ninety days (`shapeGrant` in the kernel's `device.ts`). The door hands the bearer to the record's
 * `shapeExport`, which checks it before it reads a row, so a login token, a keychain grant, an operation grant or an
 * agent's key is refused there in one sentence, and the answer to a good one is the record's export with every value
 * scrambled: the lines of a `.brainl` file whose second line is `#shape: true`.
 *
 * NO PAGE. A terminal sends no `Origin` and a browser always does on a POST, so any request carrying one is refused,
 * as at the key doors: a shape copy is the loop's, taken on the owner's own machine, and never a web page's.
 *
 * NOTHING IS READ FROM THE BODY, since a copy asks for nothing, and nothing here logs.
 */

import type { Result } from '@braindog/ports';

import { httpStatus } from './index.ts';

/** A host's half. */
export type ShapeDoor = {
  /** The record's `shapeExport`: in process on the self-host, over RPC on the Worker. */
  copy(bearer: string): Promise<Result<string[]>>;
};

/** Whether a path is the shape door. */
export function servesShape(pathname: string): boolean {
  return /^\/+api\/+shape\/*$/.test(pathname);
}

type Header = readonly [string, string];

/* One caller's answer and never a cache's: a shape copy holds no value, and it is still the shape of one record. */
export const SHAPE_HEADERS: readonly Header[] = [
  ['content-type', 'application/json; charset=utf-8'],
  ['cache-control', 'no-store'],
  ['x-content-type-options', 'nosniff'],
];

function reply(status: number, payload: object, extra: readonly Header[] = []): Response {
  const headers = new Headers();
  for (const [k, v] of [...SHAPE_HEADERS, ...extra]) headers.append(k, v);
  return new Response(JSON.stringify(payload), { status, headers });
}

/**
 * Answer the door.
 *
 * THE ORDER: the path, the method, a page, the bearer, and only then the record. A request with no bearer never
 * reaches the record, and the record reads the grant before it reads a row.
 */
export async function serveShape(request: Request, door: ShapeDoor): Promise<Response> {
  if (!servesShape(new URL(request.url).pathname))
    return reply(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'The shape door is /api/shape.' } });
  if (request.method !== 'POST')
    return reply(405, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '/api/shape takes a POST.' } }, [['allow', 'POST']]);

  if (request.headers.get('origin') !== null)
    return reply(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'A shape copy is taken from a terminal, never from a web page.', at: 'origin' } });

  const bearer = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (bearer === undefined)
    return reply(
      401,
      { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'The shape door takes a shape grant as its bearer. Run braindog export --shape.', at: 'authorization' } },
      [['www-authenticate', 'Bearer']],
    );

  const out = await door.copy(bearer);
  return reply(httpStatus(out), out);
}
