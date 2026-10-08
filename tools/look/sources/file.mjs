/**
 * `file:<path>`: a self-host on a copy of a record file, on this machine.
 *
 * A COPY, NEVER THE FILE. A look may press, and pressing writes, so the record named is copied into a folder of its
 * own with its write-ahead log beside it and the self-host opens the copy. The folder goes when the look closes.
 * This is also how `lived` is drawn once PRF-A07 writes its file (`./lived.mjs`).
 *
 * THE SERVER KEY IS RANDOM AND HELD HERE, put on every `/api` request as the gates' `forward` puts theirs, so every
 * screen reads the record as its owner. It is never printed.
 */

import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { start } from '../../../apps/selfhost/src/server.ts';
import { forward } from '../../gates/record.mjs';

/** The paths a self-host answers for a look: the record's, and sign-in's. */
const SERVES = /^\/+(?:api|auth)(?:\/|$)/u;

/** Open a self-host on a copy of `path`. `now` pins its clock, for a record built on one, as `lived` is. */
export async function openFile(path, { name = 'file', record = basename(path), now, seen = false } = {}) {
  if (!path) throw new Error('Name the record file to draw: --source file:<path>.');
  const from = resolve(path);
  if (!existsSync(from) || !statSync(from).isFile()) throw new Error(`There is no record file at ${path}.`);
  const dir = mkdtempSync(join(tmpdir(), 'braindog-look-'));
  const copy = join(dir, 'record.sqlite');
  copyFileSync(from, copy);
  for (const side of ['-wal', '-shm']) if (existsSync(`${from}${side}`)) copyFileSync(`${from}${side}`, `${copy}${side}`);
  const key = randomBytes(32).toString('base64url');
  let running;
  try {
    running = await start({
      file: copy,
      directory: ':memory:',
      port: 0,
      host: '127.0.0.1',
      pollMs: 0,
      token: key,
      sessionKey: new Uint8Array(randomBytes(32)),
      ...(now === undefined ? {} : { now }),
    });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  const base = `http://127.0.0.1:${running.server.address().port}`;
  return {
    name,
    record,
    seen,
    pressable: true,
    prefix: '',
    cannot: [],
    async handle(req, res, at) {
      if (!SERVES.test(at.pathname)) {
        for await (const _ of req);
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `A record file answers nothing at ${at.pathname}.` } }));
      }
      req.url = `${at.pathname}${at.search}`;
      if (at.pathname.startsWith('/api') && req.headers.authorization === undefined) req.headers.authorization = `Bearer ${key}`;
      return forward(req, res, base, { bearer: false });
    },
    counts: () => ({}),
    close: async () => {
      try {
        await running.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

export const open = (path) => openFile(path);
