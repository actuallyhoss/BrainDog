/**
 * Screenshots of the site, for a person to look at, and the few facts about it a run can be held to.
 *
 * It serves `build/` itself rather than borrowing `vite preview`, and that is not fussiness: preview
 * serves the dev server's own output directory, so after a rebuild it hands out an `index.html`
 * pointing at hashed chunks that no longer exist: every script 404s, nothing hydrates, and the
 * screenshot is of a page that would never ship. Serving the artefact the adapter actually wrote is
 * the only way to photograph the artefact the adapter actually wrote.
 *
 * OR IT LOOKS AT A SITE THAT IS ALREADY UP. `--origin https://brain.dog` photographs what a
 * stranger is served today and not what this checkout would build. The skin moved under the site on
 * 7 October and no one knew, because nothing looked at brain.dog: `.github/workflows/site-live.yml`
 * runs this every day against production.
 *
 * IT TURNS LAZY LOADING OFF FIRST. Every product shot below the fold is `loading="lazy"`, and a
 * full-page capture does not scroll, so the images are never requested and the page photographs
 * with empty frames in it. That is the optimisation working, not a layout bug. Scrolling the page to
 * wake them is not enough either: the capture re-renders at full height and the decode races the
 * shutter. Setting `eager` and waiting for `decode()` is the honest fix, and it is the same move the
 * record app's shot script makes for `content-visibility`, one more reason 22 §10 keeps pixels out
 * of the gates entirely.
 *
 * WHAT IT WRITES, into `shots/` or the folder `--out` names: a PNG per page, width and scheme;
 * `sheet.html`, every capture by page, which is the thing a person opens; and `facts.json`, which
 * `live-bounds.json` beside this file is read against. A fact out of bounds ends the run at 1.
 *
 *   node scripts/shot.mjs                               the local build, one page per template
 *   node scripts/shot.mjs --origin https://brain.dog --all --scale 1
 *
 * NOTHING RUNS WHEN THIS FILE IS IMPORTED: the work is under `import.meta.main` at the foot, so
 * `shots.test.mjs` can import the bounds reader without opening a browser.
 */

import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = join(import.meta.dirname, '..', 'build');
const PORT = 5185;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.xml': 'application/xml',
};

/** Every page the sitemap names, as a path, in the sitemap's own order and once each. */
export function routesOf(xml) {
  const paths = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => new URL(m[1]).pathname.replace(/(.)\/$/, '$1'));
  return [...new Set(paths)];
}

/**
 * A computed colour as `#RRGGBB`, so a bound can be written the way the palette is.
 *
 * Anything that is not a solid `rgb()` comes back as the browser said it. A see-through button or a
 * colour in another space is then in no list of bounds, and the run says so in the browser's words.
 */
export function hex(colour) {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*1(?:\.0+)?)?\)$/.exec(colour ?? '');
  if (!m) return colour ?? null;
  return `#${m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/**
 * THE BOUNDS READER: every fact that is out of bounds, one plain sentence each. Empty is green.
 *
 * A page the bounds name and the facts do not hold is out of bounds too, and so is a run with no
 * pages at all: a sitemap that came back empty must not read as a clean site.
 */
export function outOfBounds(facts, bounds) {
  const out = [];
  const routes = facts?.routes ?? {};
  const allowed = new Set((bounds.colours ?? []).map((c) => c.toUpperCase()));
  const tall = new Intl.NumberFormat('en-GB');
  if (Object.keys(routes).length === 0) out.push('No page was looked at, so nothing here is known to be in bounds.');

  for (const [path, most] of Object.entries(bounds.heights ?? {})) {
    const height = routes[path]?.height;
    if (typeof height !== 'number') out.push(`${path} has no height at 1440, and its bound is ${tall.format(most)}.`);
    else if (height > most) out.push(`${path} is ${tall.format(height)} tall at 1440, over its bound of ${tall.format(most)}.`);
  }

  const colour = (path, what, value) => {
    // A page with no link in its text, or no main button, has nothing to be the wrong colour.
    if (value === null || value === undefined) return;
    if (!allowed.has(String(value).toUpperCase())) out.push(`${path}: ${what} is ${value}, which is not the site's red or its ink.`);
  };
  for (const [path, f] of Object.entries(routes)) {
    colour(path, 'the first link in the text', f.link);
    colour(path, 'the main button at rest', f.button);
    colour(path, 'the main button under the pointer', f.buttonHover);
    const outside = f.outside ?? [];
    if (outside.length > (bounds.outsideScripts ?? 0)) {
      out.push(`${path} loads ${outside.length} script${outside.length === 1 ? '' : 's'} from another site: ${outside.join(', ')}.`);
    }
    const cookies = f.cookies ?? [];
    if (cookies.length > (bounds.cookies ?? 0)) {
      out.push(`${path} sets ${cookies.length === 1 ? 'a cookie' : `${cookies.length} cookies`}: ${cookies.join(', ')}.`);
    }
  }
  return out;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * THE SHEET: every capture, by page, in one file a person scrolls.
 *
 * Out of bounds first, in words, because a red run is opened to find out why. Then each page with
 * its four captures side by side, wide before narrow and light before dark, each a link to the file
 * at full size. The pictures load as they are scrolled to: all of them at once is some hundreds.
 */
export function sheet(facts, captures, out) {
  const pages = Object.entries(facts.routes).map(([path, f]) => {
    const said = [
      typeof f.height === 'number' ? `${new Intl.NumberFormat('en-GB').format(f.height)} tall at 1440` : null,
      f.link ? `link ${f.link}` : null,
      f.button ? `main button ${f.button}, ${f.buttonHover} under the pointer` : null,
      f.outside?.length ? `scripts from ${f.outside.join(', ')}` : null,
      f.cookies?.length ? `cookies ${f.cookies.join(', ')}` : null,
    ].filter(Boolean);
    const shots = captures
      .filter((c) => c.path === path)
      .map((c) => `<figure class="w${c.width}"><a href="${esc(c.file)}"><img src="${esc(c.file)}" loading="lazy" alt="${esc(`${path} at ${c.width}, ${c.label}`)}"></a><figcaption>${c.width}, ${esc(c.label)}</figcaption></figure>`);
    return `<section><h2>${esc(path)}</h2><p>${esc(said.join('. '))}${said.length ? '.' : ''}</p><div class="row">${shots.join('')}</div></section>`;
  });
  const verdict = out.length
    ? `<p class="red"><strong>Out of bounds.</strong></p><ul class="red">${out.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>`
    : '<p><strong>In bounds.</strong> Every fact below is inside what the site is held to.</p>';
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The site, every page at both widths</title>
<style>
  body { margin: 0; padding: 24px clamp(16px, 3vw, 48px); background: #F3F4F6; color: #101318; font: 15px/1.5 system-ui, sans-serif; }
  h1 { font-size: 28px; margin: 0; }
  h2 { font-size: 20px; margin: 0; }
  p { margin: 4px 0 12px; }
  section { background: #FFFFFF; border-radius: 16px; padding: 20px; margin-block-start: 16px; }
  .row { display: flex; gap: 12px; align-items: flex-start; overflow-x: auto; }
  figure { margin: 0; flex: none; }
  .w1440 { inline-size: 480px; }
  .w390 { inline-size: 195px; }
  img { display: block; inline-size: 100%; block-size: auto; border-radius: 8px; background: #F3F4F6; }
  .red { color: #B3322C; }
</style>
<h1>The site, every page at both widths</h1>
<p>Looked at ${esc(facts.origin)}, build ${esc(facts.build ?? 'not known')}, on ${esc(facts.at)}. ${pages.length} pages.</p>
${verdict}
${pages.join('\n')}
</html>
`;
}

/** Serves `build/` on this machine. Not started when `--origin` names a site that is already up. */
function serveBuild() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    // `normalize` then reject `..`: this serves a directory to a browser on this machine, and one
    // traversal is all it takes for that to be a different sentence.
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (rel.includes('..')) return res.writeHead(400).end();

    for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
      const file = join(ROOT, candidate);
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) continue;
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      return createReadStream(file).pipe(res);
    }
    res.writeHead(404).end();
  });
  return new Promise((r) => server.listen(PORT, () => r(server)));
}

/**
 * ONE PAGE PER ROUTE WITH A PARAMETER, unless `--all` asks for every one.
 *
 * `/plugins/[id]`, `/docs/[section]/[slug]` and `/legal/[name]` each prerender a page per value from
 * one template, and forty shots of one template teach a person at a desk nothing the first does
 * not. The templates are read from `src/routes`, and the first page of each in the sitemap's order
 * stands for the rest. The daily look at the live site passes `--all`: a cookie or an outside script
 * can sit on one page of forty, and nobody is waiting for that run.
 */
async function onePerTemplate(paths) {
  const templates = (await readdir(join(import.meta.dirname, '..', 'src', 'routes'), { recursive: true }))
    .map((f) => f.replaceAll('\\', '/'))
    .filter((f) => f.endsWith('+page.svelte') && f.includes('['))
    .map((f) => new RegExp(`^/${f.slice(0, -'/+page.svelte'.length).replace(/\[[^\]]+\]/g, '[^/]+')}$`));
  const seen = new Set();
  return paths.filter((path) => {
    const template = templates.find((t) => t.test(path));
    if (!template) return true;
    if (seen.has(template)) return false;
    seen.add(template);
    return true;
  });
}

/**
 * TWO WIDTHS, BECAUSE HE READS THIS ON A PHONE AND THE PAGE WAS ONLY EVER PHOTOGRAPHED ON A DESKTOP.
 *
 * 1440 is the width the design is drawn at and 390 is an iPhone. A marketing page that has never
 * been photographed narrow is one whose narrow layout nobody has looked at, and the first thing a
 * stranger does with a link is open it on the device in their hand. The device scale is 1.5 for
 * both unless `--scale` says otherwise, so a phone shot is legible when it is opened on a phone.
 */
const WIDTHS = [
  ['', 1440],
  ['-390', 390],
];

/** Loads every image on the page and waits for it to be drawn. Returns the ones that never arrived. */
async function wakeImages(page) {
  await page.evaluate(async () => {
    for (const img of document.images) img.loading = 'eager';
    /* WAIT FOR `load` BEFORE `decode`, which is the bit that was missing and the reason three of
       the five product shots photographed as empty boxes. Flipping `loading` to `eager` starts
       the fetch, but it starts it ASYNCHRONOUSLY, and `decode()` on an image that has not begun
       loading REJECTS. The rejection went into a `.catch(() => {})` written to ignore a broken
       file, so the script sailed past three unloaded images and photographed the reserved boxes
       `Shot.svelte` had helpfully laid out for them. */
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    await Promise.all(
      [...document.images].map(
        (img) =>
          new Promise((res) => {
            if (img.complete && img.naturalWidth > 0) return res(undefined);
            img.addEventListener('load', () => res(undefined), { once: true });
            img.addEventListener('error', () => res(undefined), { once: true });
          }),
      ),
    );
    // `decode()` and not `complete`: `complete` is true the moment the bytes have arrived, and a
    // full-page capture can fire between the last byte and the first painted pixel.
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  });
  await page.waitForTimeout(200);
  return page.evaluate(() =>
    [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
  );
}

/**
 * THE FACTS OF ONE PAGE, read at 1440 in the light scheme, which is what the bounds are written in.
 *
 * The link is the first one in `main` that the page gave no class of its own and that sits in no
 * navigation, header or footer: a link in running text, wearing the colour every plain link wears.
 * A page's own contents list, a permalink mark and a button are each dressed on purpose, so none of
 * them says what colour a link is (a class Svelte adds to scope a style does not count as dress).
 * The button is the first `.btn-primary` a reader can see, read at rest, then again with
 * the pointer on it once its transition has finished: a colour read mid-fade is neither colour.
 */
async function factsOf(page) {
  const facts = await page.evaluate(() => {
    const link = [...document.querySelectorAll('main a[href]')].find(
      (a) => !a.closest('nav, header, footer, aside') && [...a.classList].every((c) => c.startsWith('svelte-')),
    );
    return {
      height: document.documentElement.scrollHeight,
      link: link ? getComputedStyle(link).color : null,
      outside: [...document.querySelectorAll('script[src]')]
        .map((s) => new URL(s.src, location.href))
        .filter((u) => u.origin !== location.origin)
        .map((u) => u.host),
    };
  });
  const settled = (el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {})));
  const background = (el) => getComputedStyle(el).backgroundColor;
  const button = page.locator('.btn-primary:visible').first();
  let rest = null;
  let hover = null;
  if ((await button.count()) > 0) {
    rest = await button.evaluate(background);
    // A button the pointer cannot reach is said so, and "not reached" is in no list of bounds.
    hover = await button
      .hover({ timeout: 5000 })
      .then(async () => {
        await button.evaluate(settled);
        return button.evaluate(background);
      })
      .catch(() => 'not reached');
    await page.mouse.move(0, 0);
    await button.evaluate(settled).catch(() => {});
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  return { height: facts.height, link: hex(facts.link), button: hex(rest), buttonHover: hex(hover), outside: facts.outside };
}

async function main() {
  const { values: flags } = parseArgs({
    options: {
      origin: { type: 'string' },
      out: { type: 'string' },
      all: { type: 'boolean', default: false },
      scale: { type: 'string', default: '1.5' },
    },
  });
  const OUT = flags.out ? resolve(flags.out) : join(import.meta.dirname, '..', 'shots');
  await mkdir(OUT, { recursive: true });

  const server = flags.origin ? null : await serveBuild();
  const origin = (flags.origin ?? `http://localhost:${PORT}`).replace(/\/+$/, '');
  const read = async (path) => {
    const res = await fetch(`${origin}${path}`);
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    return res.text();
  };

  /* EVERY ROUTE THE SITE HAS, READ FROM ITS SITEMAP AND NOT TYPED HERE. The list was typed once, and
     it was six routes on a site that had twenty. The sitemap is the site's own word for what a
     stranger can reach, and it is the one list both the build and the live site hand over. */
  const paths = routesOf(await read('/sitemap.xml'));
  const ROUTES = (flags.all ? paths : await onePerTemplate(paths)).map((path) => [
    path === '/' ? 'home' : path.slice(1).replaceAll('/', '-'),
    path,
  ]);
  // SvelteKit writes the build's id here on every build; a site that does not say is "not known".
  const build = await read('/_app/version.json').then((t) => JSON.parse(t).version ?? null, () => null);

  // Imported here and not at the top, so importing this file for its bounds reader needs no browser.
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const facts = { origin: flags.origin ? origin : 'the local build', build, at: new Date().toISOString(), routes: {} };
  const captures = [];
  let broken = 0;

  for (const [suffix, width] of WIDTHS)
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: Number(flags.scale),
      colorScheme: scheme,
      /**
       * AND NO ENTRANCE ANIMATIONS, which is what `product.mjs` beside this file has always said and
       * this one did not.
       *
       * The home page's sections arrive on a `view()` timeline now, and a FULL-PAGE capture does not
       * resolve one: Playwright photographs the whole document against a 900px viewport, so every
       * band below the fold is still at its first keyframe and the review shot comes out of the
       * oven at forty per cent opacity. Nothing is wrong with the page: a reader scrolling sees
       * every section at full strength, measured. But a screenshot tool that lies about the page is
       * worse than no screenshot tool.
       *
       * `reducedMotion` and not a stylesheet injection, because the page already answers that
       * question correctly: the arrival is inside `prefers-reduced-motion: no-preference` and is
       * absent rather than damped under the other branch.
       */
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const measured = width === 1440 && scheme === 'light';
    /** The names of the cookies the responses of the page being loaded asked to set. Names only. */
    let asked = [];
    page.on('response', (r) => {
      if (r.status() >= 400) {
        console.error(`  ${r.status()} ${r.url()}`);
        broken++;
      }
      if (measured) asked.push(r.headerValues('set-cookie').catch(() => []));
    });

    for (const [name, path] of ROUTES) {
      asked = [];
      await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });

      /* AND THEN CHECK. A screenshot script that silently ships a blank frame is worse than one that
         fails, because the blank frame goes on the marketing page and nothing says so. */
      const blank = await wakeImages(page);
      if (blank.length) {
        console.error(`  ${blank.length} image(s) never loaded on ${path}:`);
        for (const b of blank) console.error(`      ${b}`);
        broken += blank.length;
      }

      /* AND A PAGE WIDER THAN THE SCREEN IS SAID OUT LOUD. A full-page capture is as wide as the
         viewport, so a row that runs off the side at 390 is cut from the picture rather than shown in
         it, and the one fault a phone reader meets first would be the one the shots hide. */
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      /* One pixel of slack, the layout gate's own, for a width that rounds up at a device scale of 1.5. */
      if (wide > 1) {
        console.error(`  ${path} scrolls sideways by ${wide}px at ${width}.`);
        broken++;
      }

      if (measured) {
        /* A COOKIE EITHER WAY IT CAN ARRIVE: a `Set-Cookie` on any response the page caused, and
           whatever a script wrote, which no header shows. The jar is emptied after each page so a
           cookie is charged to the page that set it. */
        const headers = (await Promise.all(asked)).flat().map((c) => c.split('=')[0].trim());
        const jar = (await context.cookies()).map((c) => c.name);
        facts.routes[path] = { ...(await factsOf(page)), cookies: [...new Set([...headers, ...jar])] };
        await context.clearCookies();
      }

      const file = `${name}-${scheme}${suffix}.png`;
      await page.screenshot({ path: join(OUT, file), fullPage: true });
      captures.push({ path, width, label: scheme, file });
      console.log(`  ${file}`);
    }
    await context.close();
  }

  /* ONE MORE OF THE HOME PAGE, WITH MOTION ON AND THE KEYS PRESSED. Every capture above is the page
     at rest with its arrivals switched off. This one is the window and not the whole document, after
     a Tab and a Page Down: the focus ring where a keyboard reader lands, and a band as it arrives. */
  if (ROUTES.some(([, path]) => path === '/')) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: Number(flags.scale),
      colorScheme: 'light',
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
    await page.keyboard.press('Tab');
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, 'home-keys.png') });
    captures.push({ path: '/', width: 1440, label: 'after Tab and Page Down, motion on', file: 'home-keys.png' });
    console.log('  home-keys.png');
    await context.close();
  }

  await browser.close();
  server?.close();

  const bounds = JSON.parse(await readFile(join(import.meta.dirname, 'live-bounds.json'), 'utf8'));
  const out = outOfBounds(facts, bounds);
  await writeFile(join(OUT, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
  await writeFile(join(OUT, 'sheet.html'), sheet(facts, captures, out));
  console.log('  facts.json\n  sheet.html');

  // The home page's facts on one line, so a run's log can be quoted without opening a file.
  if (facts.routes['/']) console.log(`\n  home, build ${build ?? 'not known'}: ${JSON.stringify(facts.routes['/'])}`);

  if (broken > 0) {
    console.error(`\n  ${broken} fault(s) above: a failed request, an image that never loaded, or a page wider than the screen.`);
    process.exitCode = 1;
  }
  if (out.length > 0) {
    console.error(`\n  Out of bounds (scripts/live-bounds.json):`);
    for (const line of out) console.error(`    ${line}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
