/**
 * Fetch the webfonts and write them into `static/fonts/`, self-hosted.
 *
 * Self-hosted and not linked, because 12 §8 forbids a third-party origin outright and because
 * `unicode-range` is evaluated per page and is all-or-nothing per file: an English-only session
 * must never fetch the Arabic subset (22 §9). Run it once; the files are committed.
 *
 *   node scripts/fonts.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'static', 'fonts');

/** A modern UA is what makes the API answer with woff2 rather than ttf. */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const FACES = [
  { file: 'lexend-600.woff2', query: 'family=Lexend:wght@600', subset: 'latin' },
  { file: 'poppins-600.woff2', query: 'family=Poppins:wght@600', subset: 'latin' },
  { file: 'geist.woff2', query: 'family=Geist:wght@300..800', subset: 'latin' },
  { file: 'geist-mono.woff2', query: 'family=Geist+Mono:wght@400..500', subset: 'latin' },
  { file: 'plex-arabic.woff2', query: 'family=IBM+Plex+Sans+Arabic:wght@400;600', subset: 'arabic' },
];

/** The `/* subset *\/` comments in the Google CSS are the only way to tell the blocks apart. */
function pick(css, subset) {
  const blocks = css.split('/*').slice(1);
  const wanted = blocks.filter((b) => b.startsWith(` ${subset} `));
  return [...new Set(wanted.flatMap((b) => [...b.matchAll(/url\((https:[^)]+\.woff2)\)/g)].map((m) => m[1])))];
}

await mkdir(OUT, { recursive: true });

for (const face of FACES) {
  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?${face.query}&display=swap`, { headers: { 'User-Agent': UA } })
  ).text();
  const urls = pick(css, face.subset);
  if (urls.length === 0) {
    console.error(`  ${face.file}: no ${face.subset} block found`);
    continue;
  }
  // One weight per file when the family is static, one variable file when it is not. Either way the
  // first URL in the subset is the whole of what this page needs.
  const bytes = new Uint8Array(await (await fetch(urls[0])).arrayBuffer());
  await writeFile(join(OUT, face.file), bytes);
  console.log(`  ${face.file.padEnd(20)} ${String(Math.round(bytes.length / 102.4) / 10).padStart(6)} KB   ${urls.length} url(s) in subset`);
}
