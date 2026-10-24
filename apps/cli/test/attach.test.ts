/**
 * `braindog attach` (`src/attach.ts`): the pictures a page names found beside it, and the whole hand-in against a real
 * self-host over a socket, pictures through the file door, the page through `attachVisual`, then the receipt's undo.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { start } from '../../selfhost/src/server.ts';
import { attachCommand, nameFrom, pagePictures } from '../src/attach.ts';
import type { AgentIo } from '../src/skills.ts';

test('THE PICTURES A PAGE NAMES BESIDE IT are found, ./ taken off, and nothing off the page or not a picture', () => {
  const { page, names } = pagePictures(
    `<img src="./img/a.png"><img src='img/b.JPG'><div style="background:url(./c.webp)"></div><img srcset="d.avif 1x, e.gif 2x">
     <img src="https://x.test/f.png"><img src="data:image/png;base64,AA"><a href="notes.html">n</a><img src="../g.png"><img src="/h.png">`,
  );
  assert.deepEqual(names.sort(), ['c.webp', 'd.avif', 'e.gif', 'img/a.png', 'img/b.JPG']);
  assert.ok(page.includes('src="img/a.png"') && page.includes('url(c.webp)'), page);
  assert.equal(nameFrom('/work/audit', '/work/audit/img/x.png'), 'img/x.png');
  assert.equal(nameFrom('/work/audit', '/elsewhere/y.png'), 'y.png');
});

const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4);

test('A PAGE AND ITS PICTURE GO UP, HANG ON THE THING BY ITS NAME, AND THE RECEIPT TAKES IT BACK', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-attach-'));
  const running = await start({ file: join(dir, 'record.sqlite'), port: 0, pollMs: 0 });
  t.after(async () => {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  });
  assert.ok(running.api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_self' } }).ok);
  const things = { id: 'register.things', kind: 'register' as const, body: { id: 'things', name: 'Things', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never };
  assert.ok((await running.api.kernel.install([things])).ok);
  assert.ok(running.api.kernel.create('things', { name: 'Kiln' }, { actor: 'p_self' }).ok);

  mkdirSync(join(dir, 'audit', 'img'), { recursive: true });
  writeFileSync(join(dir, 'audit', 'page.html'), '<!doctype html><html><head><title>Kiln audit</title></head><body><h1>Kiln</h1><img src="./img/shot.png"></body></html>');
  writeFileSync(join(dir, 'audit', 'img', 'shot.png'), PNG);

  const port = (running.server.address() as { port: number }).port;
  const out: string[] = [];
  const said: string[] = [];
  const io: AgentIo = { env: { BRAINDOG_HOST: `http://127.0.0.1:${port}` }, cwd: dir, home: dir, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}) };

  assert.equal(await attachCommand(['audit/page.html', '--on', 'Kiln'], io), 0, said.join('\n'));
  assert.equal(out[0], 'Put "Kiln audit" on "Kiln" in Things, with one picture.');
  const batch = /^To undo it: braindog attach --undo (\S+)$/u.exec(out[1] ?? '')?.[1];
  assert.ok(batch, out.join('\n'));

  const owner = { principal: { kind: 'person' as const, id: 'p_self', level: 'owner' as const } };
  const listed = await running.api.visuals({ on: 'Kiln' }, owner);
  assert.ok(listed.ok);
  assert.deepEqual(listed.value.visuals.map((v) => [v.title, v.version, v.pictures.map((p) => [p.name, p.mime])]), [['Kiln audit', 1, [['img/shot.png', 'image/png']]]]);
  /* THE PAGE IS ON DISK BY ITS HASH, AND THE FILE DOOR NEVER SERVES IT. */
  const [page] = readdirSync(join(dir, 'blobs', 'pages'));
  assert.equal(listed.value.visuals[0]!.page.sha256, page);
  const door = await fetch(`http://127.0.0.1:${port}/api/files/pages/${page}`);
  assert.equal(door.status, 404);
  await door.body?.cancel();

  out.length = 0;
  assert.equal(await attachCommand(['--undo', batch], io), 0, said.join('\n'));
  assert.deepEqual(out, ['Put back one change.', 'Takes the visual "Kiln audit" away.']);
  const after = await running.api.visuals({ on: 'Kiln' }, owner);
  assert.ok(after.ok);
  assert.deepEqual(after.value.visuals, []);

  /* --draft HANDS IT IN AS A DRAFT, and the receipt says so. */
  out.length = 0;
  assert.equal(await attachCommand(['audit/page.html', '--on', 'Kiln', '--draft'], io), 0, said.join('\n'));
  assert.match(out[0] ?? '', /^Version 1 of "Kiln audit" waits on "Kiln" in Things as a draft/u);
  const drafted = await running.api.visuals({ on: 'Kiln' }, owner);
  assert.ok(drafted.ok);
  assert.deepEqual(drafted.value.visuals.map((v) => [v.kept, v.draft?.version]), [[false, 1]]);

  /* A THING NOTHING IS CALLED IS REFUSED IN THE RECORD'S WORDS, exit 1. */
  said.length = 0;
  assert.equal(await attachCommand(['audit/page.html', '--on', 'Nothing called this'], io), 1);
  assert.match(said.join('\n'), /There is nothing by that name you can see/u);
});
