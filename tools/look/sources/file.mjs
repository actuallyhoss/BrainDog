/**
 * `file:<path>`: a self-host on a copy of a record file, or on a scratch record made from a shape copy, on this machine.
 *
 * A COPY, NEVER THE FILE. A look may press, and pressing writes, so the record named is copied into a folder of its
 * own with its write-ahead log beside it and the self-host opens the copy. The folder goes when the look closes.
 * This is also how `lived` is drawn once PRF-A07 writes its file (`./lived.mjs`).
 *
 * THE SERVER KEY IS RANDOM AND HELD HERE, put on every `/api` request as the gates' `forward` puts theirs, so every
 * screen reads the record as its owner. It is never printed.
 */

import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { openSqlite, start } from '../../../apps/selfhost/src/server.ts';
import { importBrainl } from '../../../packages/kernel/src/brainl.ts';
import { rebuild } from '../../../packages/kernel/src/fts.ts';
import { openRecord } from '../../../packages/kernel/src/index.ts';
import { isShape } from '../../../packages/kernel/src/shape.ts';
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

/**
 * Open a self-host on a shape copy (`braindog export --shape`, PRF-A13): the file is put into a scratch record and that
 * record is served as `openFile` serves any.
 *
 * THE ONE PLACE A SHAPE COPY IS ASKED FOR. Every import refuses one by its mark (`shapeRefusal` in `brainl.ts`), so a
 * shape copy is never put back over a record; here the record is made for it a moment before, in a folder of its own,
 * and goes when the look closes. `{ shape: true }` is that request, and only this function makes it.
 *
 * THE SEARCH INDEX IS BUILT HERE because the record's own import builds it after its rows land, and this one does not
 * pass through it: the lists are read off the declarations the file brought, as the record reads them.
 */
export async function openShape(path, options = {}) {
  if (!path) throw new Error('Name the shape copy to draw: --source file:<path>.');
  const from = resolve(path);
  if (!existsSync(from) || !statSync(from).isFile()) throw new Error(`There is no shape copy at ${path}.`);
  const lines = readFileSync(from, 'utf8').replace(/^\uFEFF/u, '').split(/\r?\n/u);
  if (lines.at(-1) === '') lines.pop();
  if (!isShape(lines)) throw new Error(`${basename(path)} is not a shape copy, so it is not opened as one. Draw a record file with --source file:<path>.`);

  const dir = mkdtempSync(join(tmpdir(), 'braindog-shape-'));
  try {
    const file = join(dir, 'record.sqlite');
    const sql = openSqlite(file);
    try {
      await openRecord(sql, { now: () => Date.now() });
      const transaction = (fn) => {
        sql.exec('BEGIN');
        try {
          const out = fn();
          sql.exec('COMMIT');
          return out;
        } catch (e) {
          sql.exec('ROLLBACK');
          throw e;
        }
      };
      const out = importBrainl(sql, transaction, lines, { shape: true });
      if (!out.ok) throw new Error(`${basename(path)} did not open: ${out.refusal.fix}`);
      const lists = new Map();
      for (const { body } of sql.all("SELECT body FROM declaration WHERE kind = 'register' AND retired = 0 AND superseded_at IS NULL")) {
        const decl = JSON.parse(body);
        const named = Array.isArray(decl.search) ? decl.search : [];
        lists.set(decl.id, { ...decl, fields: (decl.fields ?? []).map((f) => (named.includes(f.id) ? { ...f, search: true } : f)) });
      }
      transaction(() =>
        rebuild(
          sql,
          (id) => (lists.has(id) ? { fields: lists.get(id).fields, ...(typeof lists.get(id).title === 'string' ? { title: lists.get(id).title } : {}) } : undefined),
          (id) => Boolean(lists.get(id)?.series),
        ),
      );
    } finally {
      sql.close();
    }
    /* `openFile` takes its own copy, so this folder is done with once it has. */
    return await openFile(file, { name: 'shape', record: basename(path), ...options });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Whether `path` is a shape copy rather than a record file: a record file is SQLite, and says so in its first bytes. */
function shapeFile(path) {
  try {
    const head = readFileSync(resolve(path)).subarray(0, 15).toString('latin1');
    if (head === 'SQLite format 3') return false;
    return isShape(readFileSync(resolve(path), 'utf8').split(/\r?\n/u));
  } catch {
    return false;
  }
}

/** `--source file:<path>` takes a record file or a shape copy, told apart by their bytes and not their names. */
export const open = (path) => (path && shapeFile(path) ? openShape(path) : openFile(path));
