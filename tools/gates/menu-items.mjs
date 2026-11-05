/**
 * `menu-items`: a menu's rows and the items they stand on, read from the app's own markup.
 *
 *   node tools/gates/menu-items.mjs [root]
 *
 * THREE THINGS THE MENUS PROMISE AND A NEW ONE COULD QUIETLY BREAK.
 *
 *   1. EVERY ITEM HAS A GLYPH THAT SAYS WHAT IT DOES. A new `role="menuitem"` with words and no `<Icon>` (or a state's dot, a
 *      select box, a record's tile) fails here, so the words of a menu start on one edge and a person reads it by its shapes.
 *   2. ONE ACTION, ONE GLYPH. Two items that say the same words (`copy.copyLink`, or the same literal) with different glyphs
 *      fail. `apps/web/src/lib/things/verbs.ts` is the map a new item takes its glyph from.
 *   3. A "…" OPENS ON A RIGHT-CLICK TOO. A `<Menu>` with a button that sits in no `data-menu-host` and is not a page's own "…"
 *      (the title stands for those, `PAGE_MENU` in `PageHead.svelte`) leaves its item with the browser's menu. A menu that is a
 *      picker and not an item's "…" (a filter, a "More" of tabs) is named below with why.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A button that is a choice, not an item's "…": its row has nothing else to right-click on. */
const PICKERS = new Map([
  ['lib/page/PageTabs.svelte', 'the tabs past twelve, each a link with its own menu'],
  ['lib/flow/StepMenu.svelte', 'the step to add, a choice'],
  ['routes/automations/SentenceRead.svelte', 'the words of a rule, a choice'],
  ['routes/automations/SentenceSteps.svelte', 'the step to add, a choice'],
  ['lib/palette/Palette.svelte', 'who to ask, a choice in the palette'],
  ['routes/audit/+page.svelte', 'the filters of a list, a choice'],
  ['routes/r/[register]/parts/BulkBar.svelte', 'the selection’s: a selected row names it by selector'],
  ['lib/ui/ShareMenu.svelte', 'Share, beside the page’s "…"'],
  ['lib/ui/Menu.svelte', 'the menu itself'],
  ['lib/kpis/KpisBlock.svelte', 'a key number\u2019s, in the block\u2019s slot, which hosts the press'],
  ['lib/page/BlockMenu.svelte', 'hosted by the slot it is drawn in (`.block-slot` in PageBody)'],
  ['routes/r/[register]/[seq]/+page.svelte', 'its "…" is a page’s, and Add a field is a choice'],
]);

/** What stands in a row where a glyph does. */
const GLYPH = /<Icon\b|mi-dot|mi-box|mi-slot|you-tile|<svg\b|<Face\b|<AgentFace\b/u;

const svelteFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? svelteFiles(join(dir, e.name)) : e.name.endsWith('.svelte') ? [join(dir, e.name)] : []));

/** The end of an opening tag: attributes hold `=>` and strings, so braces and quotes are walked. */
function tagEnd(s, from) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote && depth === 0) quote = null;
    } else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 0 && (c === '"' || c === "'")) quote = c;
    else if (depth === 0 && c === '>') return i;
  }
  return -1;
}

/** Every menu item in a file: its element's text, and its line. */
export function itemsIn(source) {
  const s = source.replace(/<!--[\s\S]*?-->/gu, (m) => m.replace(/[^\n]/gu, ' '));
  const out = [];
  for (const m of s.matchAll(/<(button|a|span)\b/gu)) {
    const end = tagEnd(s, m.index);
    if (end < 0) continue;
    const head = s.slice(m.index, end + 1);
    if (!/role="menuitem/u.test(head) || /menu-cancel/u.test(head)) continue;
    const close = s.indexOf(`</${m[1]}>`, end);
    out.push({ body: s.slice(end + 1, close < 0 ? s.length : close), line: s.slice(0, m.index).split('\n').length });
  }
  return out;
}

const iconOf = (body) => /<Icon name=(?:"([^"]+)"|\{(?:VERB_ICONS\.)?([A-Za-z]+)\})/u.exec(body);
/** What an item says, where it says one thing: a copy key or plain words, and never a sum of them. */
const wordsOf = (body, rel) => {
  const t = body.replace(/<Icon[^>]*\/>/gu, '').replace(/<Kbd[^>]*\/>/gu, '').replace(/<[^>]+>/gu, ' ').trim().replace(/\s+/gu, ' ');
  if (/^\{copy\.[A-Za-z]+\}$/u.test(t) || /^[A-Z][a-z ]+$/u.test(t)) return t;
  /* A FILE'S OWN WORDS ARE COMPARED IN THAT FILE: `words.open` means something else in the next one. */
  return /^\{words\.[A-Za-z]+\}$/u.test(t) ? `${rel} ${t}` : null;
};

export default function menuItems(root) {
  const web = join(root ?? join(HERE, '..', '..'), 'apps/web/src');
  const findings = [];
  const said = new Map();
  let items = 0;
  const files = svelteFiles(web);
  for (const file of files) {
    const rel = relative(web, file);
    const source = readFileSync(file, 'utf8');
    for (const item of itemsIn(source)) {
      items++;
      if (!GLYPH.test(item.body)) findings.push(`${rel}:${item.line}  a menu item with no glyph. Take one from lib/things/verbs.ts.`);
      const icon = iconOf(item.body);
      const words = wordsOf(item.body, rel);
      if (icon && icon[1] && words) {
        const had = said.get(words);
        if (had && had.icon !== icon[1]) findings.push(`${rel}:${item.line}  "${words}" wears ${icon[1]}, and ${had.icon} at ${had.at}. One action, one glyph.`);
        else if (!had) said.set(words, { icon: icon[1], at: `${rel}:${item.line}` });
      }
    }
    if (/<Menu\b[\s\S]*?\{#snippet trigger\(\)\}/u.test(source) && !PICKERS.has(rel)) {
      const hosted = /data-menu-host|ownMenu\(|class="head-more|class="change-more|class="tool-more|class="more-trigger/u.test(source);
      if (!hosted) findings.push(`${rel}  a "…" in no data-menu-host: its item has only the browser's menu on a right-click.`);
    }
  }
  if (findings.length === 0) {
    console.log(`  menu-items: ${items} menu items over ${files.length} files, each with a glyph and each "…" hosted`);
    return 0;
  }
  for (const f of findings) console.error(`  ${f}`);
  console.error(`\n  menu-items: ${findings.length} finding(s).`);
  return 1;
}

export default menuItems;

/* AND IT IS STILL A SCRIPT, for `self-test` and the command line above. */
if (import.meta.main) process.exitCode = menuItems(process.argv[2]);
