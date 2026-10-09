/**
 * The rule sheet gate: every rule of a block, a value and a layout, read off a real record at 390 and at 1440.
 *
 *   PROOF_RECORD=https://<host>/app PROOF_STATE=<file> node tools/gates/rule-sheet.mjs
 *
 * FORTY-FOUR RULES WERE TRUE ONLY IN UNIT TESTS. A ring's scope, a stat's cap of six, a tab strip of twelve and a More:
 * each is held by a test over hand-made input, and every browser gate draws one invented record (`README.md` section 7).
 * None had been true on a record a person uses or seen at a phone's width (PGS-B01). The Rule sheet add-on
 * (`packs/rule-sheet`) writes every rule onto pages of a real record; `packs/rule-sheet/expect.json` says, per rule,
 * the page, the selector (`packages/render/src/contract.ts`) and what is read there; this opens each page at both
 * widths and prints each rule with what it read, so a pass is a sentence somebody can check against the screen:
 *
 *   Blocks: stat of seven rows reads 'A stat row has 7 rows where stat takes 6', true at 390, true at 1440
 *
 * THE RECORD IS THE PROOF HARNESS'S, never one this file makes. A proof record is made through the public sign-up with
 * Rule sheet installed from Add-ons; the harness hands over its app address (`PROOF_RECORD`) and the browser state it
 * signed in with (`PROOF_STATE`). The app is at `/app` on every host (`apps/web/svelte.config.js`), and which record it
 * opens is the signed-in state's, never a segment of the address: `/app/<record>/p/...` is no page. This file signs nobody in and holds no credential. Without a record it is exit 3, a
 * skip the runner names, never a pass.
 *
 * WHAT A RULE SAYS IT READ is the whole point, so a rule that reads nothing says "nothing" rather than vanishing, and
 * a selector the page does not hold is a rule that is false, with the count it found.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * WHAT THIS GATE CANNOT RUN WITHOUT, read by `run.mjs` before it runs anything: a proof record to open. `proof` is
 * unmet while `PROOF_RECORD` is unset, which is every machine but the proof area's after a deploy.
 */
export const needs = ['proof'];

/** The two widths a rule must be true at: a phone, and the laptop he judges on. */
export const WIDTHS = [390, 1440];

/** The keys a line may say it reads, each checked when present. */
const READS = ['count', 'text', 'attr', 'style'];

/**
 * The rules of an `expect.json`, each with its page's address, or a thrown sentence naming the line that cannot be
 * read. A line with no page, no selector or nothing to read is refused here rather than read as true.
 */
export function rulesOf(json, known = {}) {
  const file = typeof json === 'string' ? JSON.parse(json) : json;
  const list = Array.isArray(file) ? file : file?.rules;
  if (!Array.isArray(list) || list.length === 0) throw new Error('expect.json holds no rules: it is `{ "rules": [...] }`.');
  const pages = { ...known, ...((!Array.isArray(file) && file?.pages) || {}) };
  return list.map((r, i) => {
    const at = `rule ${i + 1}${r?.rule ? ` (${r.rule})` : ''}`;
    if (!r || typeof r !== 'object') throw new Error(`${at} is not an object.`);
    for (const key of ['rule', 'page', 'selector'])
      if (typeof r[key] !== 'string' || r[key].trim() === '') throw new Error(`${at} has no ${key}.`);
    if (!READS.some((k) => r[k] !== undefined)) throw new Error(`${at} says nothing to read: give count, text, attr or style.`);
    if (r.count !== undefined && !Number.isInteger(r.count)) throw new Error(`${at}: count is a whole number.`);
    if ((r.attr !== undefined || r.style !== undefined) && typeof r.is !== 'string') throw new Error(`${at}: attr and style need \`is\`.`);
    return { ...r, path: addressOf(r, pages) };
  });
}

/**
 * The add-on's own pages, by title and by id, each at `/p/<id>`: a plain page's address is its declaration's id
 * (`packages/kernel/src/pages.ts`, `resolvePages`), so a rule may name its page as a person reads it, "Blocks".
 */
export function packPages(dir) {
  const pages = {};
  if (!existsSync(dir)) return pages;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.pack.json'))) {
    const decls = JSON.parse(readFileSync(join(dir, f), 'utf8')).declarations;
    for (const d of Array.isArray(decls) ? decls : []) {
      if (!d || typeof d.page !== 'string' || d.for) continue;
      pages[d.page] = `/p/${d.page}`;
      if (typeof d.title === 'string' && !(d.title in pages)) pages[d.title] = `/p/${d.page}`;
    }
  }
  return pages;
}

/** A page's address under the record's app address: the line's own `path`, a known page, or `/p/<title>`. */
export function addressOf(rule, pages = {}) {
  const path = rule.path ?? pages[rule.page] ?? `/p/${rule.page.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')}`;
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * RUN IN THE PAGE: what a selector finds. Every match's text (whitespace made single, at most twenty), and the first
 * match's attribute and computed style property when asked. Nothing from outside the function, because Playwright
 * hands its source to the page.
 */
export function readIn({ selector, attr, style }) {
  const found = [...document.querySelectorAll(selector)];
  const first = found[0];
  return {
    count: found.length,
    texts: found.slice(0, 20).map((el) => (el.textContent ?? '').replace(/\s+/gu, ' ').trim()),
    attr: attr && first ? first.getAttribute(attr) : null,
    style: style && first ? getComputedStyle(first).getPropertyValue(style).trim() || first.style.getPropertyValue(style).trim() : null,
  };
}

/** Whether what was read holds the rule, and what was read, in words for the line. */
export function judge(rule, seen) {
  const holds = [];
  const said = [];
  if (rule.count !== undefined) {
    holds.push(seen.count === rule.count);
    said.push(seen.count === 0 ? 'nothing' : `${seen.count} found`);
  }
  if (rule.text !== undefined) {
    const want = rule.text.toLowerCase();
    const hit = seen.texts.find((t) => t.toLowerCase().includes(want));
    holds.push(hit !== undefined);
    said.push(hit !== undefined ? `'${hit}'` : seen.texts.length ? `'${seen.texts[0]}', not '${rule.text}'` : 'no text at all');
  }
  if (rule.attr !== undefined) {
    holds.push(seen.attr === rule.is);
    said.push(seen.attr === null ? `no ${rule.attr}` : `${rule.attr}="${seen.attr}"`);
  }
  if (rule.style !== undefined) {
    holds.push(seen.style === rule.is);
    said.push(seen.style ? `${rule.style} ${seen.style}` : `no ${rule.style}`);
  }
  return { ok: holds.every(Boolean), said: said.join(', ') };
}

/** The line a rule prints: its page and words, what it read (once when both widths agree), and its truth at each. */
export function sentence(rule, verdicts) {
  const saids = [...new Set(verdicts.map((v) => v.said))];
  const read = saids.length === 1 ? saids[0] : verdicts.map((v) => `${v.said} at ${v.width}`).join('; ');
  return `${rule.page}: ${rule.rule} reads ${read}, ${verdicts.map((v) => `${v.ok} at ${v.width}`).join(', ')}`;
}

/**
 * EVERY RULE AT EVERY WIDTH, each address opened once a width. `open(width)` answers a page at that width: `goto(url)`,
 * which throws a sentence when the page does not open, `evaluate(fn, arg)` and `close()`. In the gate it is a Playwright
 * page; in `test/rule-sheet.test.mjs` a stub, so the reading and the printing are tested with no browser.
 */
export async function sweep(rules, base, open, widths = WIDTHS) {
  const verdicts = new Map(rules.map((r) => [r, []]));
  const byPath = new Map();
  for (const r of rules) byPath.set(r.path, [...(byPath.get(r.path) ?? []), r]);
  for (const width of widths) {
    const page = await open(width);
    try {
      for (const [path, list] of byPath) {
        const failed = await page.goto(`${base}${path}`).then(
          () => null,
          (e) => e?.message ?? String(e),
        );
        for (const rule of list) {
          if (failed !== null) {
            verdicts.get(rule).push({ width, ok: false, said: `nothing, because ${path} did not open (${failed})` });
            continue;
          }
          /* A SELECTOR THAT DOES NOT PARSE IS NOT THE ONLY WAY A READ THROWS: a page that navigates away under it does
             too, and calling that a bad selector sends whoever reads the line to fix the wrong file. */
          const seen = await page.evaluate(readIn, { selector: rule.selector, attr: rule.attr, style: rule.style }).catch((e) => ({ failed: String(e?.message ?? e).split('\n')[0] }));
          const said = (f) => (/selector/iu.test(f) ? `nothing, because "${rule.selector}" is not a selector` : `nothing, because the page could not be read (${f})`);
          verdicts.get(rule).push('failed' in seen ? { width, ok: false, said: said(seen.failed) } : { width, ...judge(rule, seen) });
        }
      }
    } finally {
      await page.close?.();
    }
  }
  return rules.map((rule) => {
    const v = verdicts.get(rule);
    return { rule, ok: v.every((x) => x.ok), line: sentence(rule, v) };
  });
}

/** A Playwright page at `width`, signed in with the harness's state, whose `goto` says why a page did not open. */
const opener = (browser, state) => async (width) => {
  const context = await browser.newContext({ viewport: { width, height: 900 }, ...(state ? { storageState: state } : {}) });
  const page = await context.newPage();
  return {
    goto: async (url) => {
      const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
      if (res && res.status() >= 400) throw new Error(`it answered ${res.status()}`);
      if (/\/signin\b/u.test(new URL(page.url()).pathname)) throw new Error('it asked to sign in');
    },
    evaluate: (fn, arg) => page.evaluate(fn, arg),
    close: () => context.close(),
  };
};

export default async function ruleSheet(root = join(import.meta.dirname, '..', '..'), env = process.env) {
  const base = env.PROOF_RECORD?.replace(/\/+$/u, '');
  if (!base) {
    console.log('  rule-sheet: PROOF_RECORD is not set, so no record was opened and no rule was read.');
    return 3;
  }
  const file = join(root, 'packs', 'rule-sheet', 'expect.json');
  if (!existsSync(file)) {
    console.error('  rule-sheet: packs/rule-sheet/expect.json is not there, so there is no rule to read.');
    return 1;
  }
  let rules;
  try {
    rules = rulesOf(readFileSync(file, 'utf8'), packPages(join(root, 'packs', 'rule-sheet')));
  } catch (e) {
    console.error(`  rule-sheet: packs/rule-sheet/expect.json cannot be read. ${e.message}`);
    return 1;
  }
  const state = env.PROOF_STATE;
  if (state && !existsSync(state)) {
    console.error(`  rule-sheet: PROOF_STATE names a file that is not there, so the record could not be opened signed in.`);
    return 1;
  }

  const { chromium } = await import('@playwright/test');
  /* OPENED INSIDE THE TRY WHOSE FINALLY CLOSES IT (`handles.test.mjs`), so a throw anywhere after the launch hands the
     browser back, and the `let` is for the finally, which closes whatever exists at the moment of the throw. */
  let browser;
  try {
    try {
      browser = await chromium.launch();
    } catch (e) {
      console.error(`  rule-sheet: no browser to open the record with. ${e.message.split('\n')[0]}`);
      return 1;
    }
    const results = await sweep(rules, base, opener(browser, state));
    for (const r of results) console.log(`  ${r.line}`);
    const wrong = results.filter((r) => !r.ok);
    console.log(`\n  rule-sheet: ${results.length} rules, ${results.length - wrong.length} true at ${WIDTHS.join(' and ')}.`);
    for (const r of wrong) console.error(`  not true: ${r.rule.page}: ${r.rule.rule}`);
    return wrong.length ? 1 : undefined;
  } finally {
    await browser?.close();
  }
}

if (import.meta.main) process.exitCode = (await ruleSheet()) ?? 0;
