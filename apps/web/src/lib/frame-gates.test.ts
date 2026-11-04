/**
 * THE FRAME'S GATES (wave 4): what the pass took out stays out.
 *
 * Six refusals, each over every component, stylesheet and script of the app, the skin and the renderer (and the site
 * where it says so), read as text with the comments taken out, so a comment that quotes an old spelling is not a use:
 *
 * THE FRAME MOVED ON PURPOSE ON 3 NOV (04d4cf6d4, `loop/plans/ops-look-2026-11-03/SPEC.md`): the owner asked for the ops
 * dashboard's style, and "Look B's no pills, no glass, no shadows is retired by the owner's ask". So 1, 2 and 4 hold the new
 * frame, by the same means: glass and elevation come from the style layer's tokens, and from nowhere else.
 *
 *   1. GLASS ONLY ON FLOATING CHROME (SPEC 1 rule 1). Nothing blurs what is behind it (`backdrop-filter`, either
 *      spelling) unless it is listed below by file and selector, through one of the two films (`--glass-filter`,
 *      `--g-bf`), so reduced transparency and high contrast take it away. A floating surface wears its `--glass-edge`.
 *   2. ELEVATION IS A TIER. A `box-shadow` that casts is one of the tiers by name (`--shadow-card`, `--elev-popover`, SPEC
 *      3.3), so dark turns it off and a person's accent follows; no number is ever written for one. Anything else is a
 *      ring or a line (its blur is 0), and only on the rules listed below by file and selector: the cut-out rings (a
 *      count on a tab icon, a face in a stack, a dot over a hairline), the inside edge a field, a chip or a chosen card
 *      draws instead of a border it has no room for, and the few indicator lines. A new one is added here on purpose,
 *      with its reason, or it is refused.
 *   3. NO LITERAL RED. A red is `--red`, `--red-fill` or one of their states, and the only place a red hex is written
 *      is `packages/theme` and the palettes it generates (`house.css`, `alpha.css`), or a token copied whole from those.
 *   4. NO OLD NAME. Every name SPEC 1.10, 1.7 and frame 3.9 retired is gone, the elevation and the glass with them.
 *   5. NO RAW SEGMENT. A `class="segment"` sits inside a `<Segmented>` track, the one part that draws it.
 *   6. NO ICON BUTTON NAMED ONLY BY `title`. A tooltip is not a name: a button that shows only a glyph says what it does
 *      with `aria-label`, which a screen reader reads and a touch screen does not need a hover for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

function walk(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return [];
    const at = join(dir, e.name);
    return e.isDirectory() ? walk(at, keep) : keep(e.name) ? [at] : [];
  });
}

const CODE = (name: string): boolean => /\.(svelte|css|ts|js|mjs|html)$/u.test(name) && !/\.(test|spec)\.[jt]s$/u.test(name);
/** The product's own code: the app, the skin, the renderer. */
const PRODUCT = [...walk('apps/web/src', CODE), ...walk('packages/skin', CODE), ...walk('packages/render/src', CODE)];
const GENERATED = new Set(['packages/skin/house.css', 'packages/skin/alpha.css']);
const at = (file: string): string => relative(ROOT, join(ROOT, file)).replaceAll('\\', '/');

/** A file's text without its comments (CSS and script block comments, markup comments, and `//` line comments). */
function code(file: string): string {
  const text = readFileSync(join(ROOT, file), 'utf8');
  return text
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .replaceAll(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

/** The CSS a file holds: a stylesheet whole, a component's `<style>` blocks. */
function css(file: string): string {
  const text = code(file);
  if (file.endsWith('.css')) return text;
  if (file.endsWith('.svelte') || file.endsWith('.html')) return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gu)].map((m) => m[1]).join('\n');
  return '';
}

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

test('the walk reads the app, the skin and the renderer', () => {
  assert.ok(PRODUCT.filter((f) => f.endsWith('.svelte')).length > 200, `${PRODUCT.length} files: the walk is not reading the app`);
  assert.ok(PRODUCT.includes('packages/skin/tokens.css'));
});

/* ── 2's reader, which 1 reads with too ──────────────────────────────────── */

/** Every declaration of a property a stylesheet holds, with the selector it sits under (the innermost prelude). */
function declared(source: string, property: RegExp): { selector: string; value: string; line: number }[] {
  const out: { selector: string; value: string; line: number }[] = [];
  const stack: string[] = [];
  let buf = '';
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === '{') {
      stack.push(buf.trim().replaceAll(/\s+/gu, ' '));
      buf = '';
      start = i + 1;
    } else if (ch === ';' || ch === '}') {
      const m = property.exec(buf);
      if (m) out.push({ selector: [...stack].reverse().find((s) => !s.startsWith('@')) ?? '', value: m[1]!.replaceAll(/\s+/gu, ' '), line: lineOf(source, start) });
      buf = '';
      start = i + 1;
      if (ch === '}') stack.pop();
    } else buf += ch;
  }
  return out;
}

const shadows = (source: string) => declared(source, /^\s*box-shadow\s*:\s*([\s\S]*?)\s*$/u);

/* ── 1. Glass only on floating chrome ────────────────────────────────────── */

/**
 * THE GLASS THAT STAYS, BY FILE AND SELECTOR (SPEC 1 rule 1, 4.1):
 *   chrome   `--glass-filter`: the sidebar card, the phone bars, the page's bar, menus, popovers, toasts, the palette,
 *            what floats over a list while rows are picked; and the board's edit bar (round 1030's widgets plan, §5.1)
 *   control  `--g-bf`: a glass control sitting on the page's ground, which takes the film off itself on a tile
 */
const GLASS: Record<string, readonly string[]> = {
  'apps/web/src/lib/board/Board.svelte': ['.edit-bar'], // chrome
  'apps/web/src/lib/money/QuickAdd.svelte': ['.qa-drop'], // chrome
  'apps/web/src/lib/page/BatchBar.svelte': ['.batch'], // chrome
  'apps/web/src/lib/page/PageView.svelte': ['.pull'], // chrome
  'apps/web/src/lib/palette/Palette.svelte': ['.palette'], // chrome
  'apps/web/src/lib/shell/Bell.svelte': ['.bell-pop', '.bell-trigger'], // chrome, control
  'apps/web/src/lib/shell/SideBar.svelte': ['.s-side', '.s-rail'], // chrome
  'apps/web/src/lib/shell/TabBar.svelte': ['.tabs'], // chrome
  'apps/web/src/lib/ui/Menu.svelte': [".menu[data-form='pop']"], // chrome
  'apps/web/src/lib/ui/Toasts.svelte': ['.toast'], // chrome
  'apps/web/src/lib/ui/PageHead.svelte': ['.head-bar:is([data-past], [data-under])::before', '.head-actions :global(.head-more)'], // chrome, control
  'apps/web/src/lib/ui/style.css': ['.glass', '.glass-chrome', '.gctl', '.segmented ~ .switch, .switch:has(~ .segmented), :is(.head-actions, .head-below, .ctl-line) .switch', '.field-input.head-search', ':is(.head-actions, .topbar, .ctl-line, .head-bar) .segmented'], // chrome, control
  'apps/web/src/lib/ui/Button.svelte': ['.btn'], // control
  'apps/web/src/lib/ui/ShareMenu.svelte': ['.share-trigger'], // control
  'apps/web/src/lib/ui/TopBar.svelte': ['.bar-menu', '.bar-ask'], // control
  'apps/web/src/lib/page/ChangePage.svelte': ['.change-more'], // control
  'apps/web/src/routes/automations/HubTabs.svelte': [':global(.head-below .hub-tabs)'], // control
  'apps/web/src/routes/decide/+page.svelte': ['.head-more'], // control
  'apps/web/src/routes/inbox/+page.svelte': ['.batch', ".file-into[data-where='bar']", '.head-more'], // chrome, control
  'apps/web/src/routes/r/[register]/parts/BulkBar.svelte': ['.picked-bar'], // chrome
  'apps/web/src/routes/slash/Composer.svelte': ['.pick'], // chrome
  'apps/web/src/routes/slash/SlashThreads.svelte': ['.dock::before'], // chrome: what scrolls under the composer
};

/** The two chrome films that are a film laid over the page and no surface of their own, so they have no edge to draw. */
const FILM_ONLY = new Set(['.head-bar:is([data-past], [data-under])::before', '.dock::before']);

test('nothing blurs what is behind it but floating chrome, and only through the two films', () => {
  const found = PRODUCT.flatMap((file) =>
    declared(css(file), /^\s*(?:-webkit-)?backdrop-filter\s*:\s*([\s\S]*?)\s*$/u)
      .filter((d) => d.value !== 'none')
      .map((d) => ({ file: at(file), ...d })),
  );
  assert.ok(found.length > 0, 'the walk found no glass at all, so it is not reading the styles');
  const raw = found.filter((d) => !/^var\(--(?:glass-filter|g-bf)(?:, none)?\)$/u.test(d.value)).map((d) => `${d.file}:${d.line} ${d.selector} (${d.value})`);
  assert.deepEqual(raw, [], `glass is --glass-filter or --g-bf, which reduced transparency takes off: ${raw.join(', ')}`);
  const unlisted = found.filter((d) => !(GLASS[d.file] ?? []).includes(d.selector)).map((d) => `'${d.file}': '${d.selector}'`);
  assert.deepEqual(unlisted, [], `glass only on floating chrome (SPEC 1 rule 1), never under text people read: ${unlisted.join(', ')}`);
  /* A FLOATING SURFACE WEARS ITS EDGE (SPEC 3.3, "every glass surface"), so it does not melt into the tile behind it. */
  const bare = found
    .filter((d) => d.value.includes('--glass-filter') && !FILM_ONLY.has(d.selector))
    .filter((d) => !shadows(css(d.file)).some((s) => s.selector === d.selector && s.value.includes('--glass-edge')))
    .map((d) => `${d.file} ${d.selector}`);
  assert.deepEqual(bare, [], `a floating layer draws --glass-edge: ${bare.join(', ')}`);
});

/* ── 2. Elevation is a tier ──────────────────────────────────────────────── */

/** A value's top-level parts: each bracketed group kept whole, split on the separator at depth 0. */
function split(value: string, by: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && by.test(ch)) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** A shadow that casts nothing: every part of it is offsets and a spread with a blur of 0, then its colour. */
function flat(value: string): boolean {
  return split(value, /,/u).every((part) => {
    const items = split(part, /\s/u).filter((t) => t !== 'inset');
    const colour = items.at(-1) ?? '';
    const lengths = /^(-?[\d.]+[a-z%]*|calc\(.*\))$/u.test(colour) ? items : items.slice(0, -1);
    return lengths.length >= 2 && lengths.length <= 4 && (lengths.length < 3 || /^0(px)?$/u.test(lengths[2]!));
  });
}

/** The elevation tiers of SPEC 3.3, in `style.css`, and the edge a glass surface wears. */
const TIER = /^var\(--(?:card|shadow-card|shadow-card-hover|shadow-raised|shadow-panel|elev-chrome|elev-popover|elev-modal|glass-edge)(?:, (.+))?\)$/u;

/** A value made of tiers by name and rings or lines: never a number for something that casts, a fallback included. */
function tiered(value: string): boolean {
  return split(value, /,/u).every((part) => {
    const tier = TIER.exec(part);
    return tier ? tier[1] === undefined || tier[1] === 'none' || flat(tier[1]) : flat(part);
  });
}
const usesTier = (value: string): boolean => split(value, /,/u).some((part) => TIER.test(part));
const CONTROL_RING = /^inset 0 0 0 0\.5px var\(--g-line(?:, .+)?\)$/u;

/**
 * THE SHADOWS THAT STAY, BY FILE AND SELECTOR. Each is a ring or a line (`flat`), and each is here for a reason:
 *   ring  a cut-out ring in the surface it sits on, so a dot, a count or a face reads over what it overlaps
 *   edge  an inside edge (inset, 1 to 1.5px) where a border would move the box: a field's fault, a chosen card, a dot
 *         that is an empty ring, a chart's cell
 *   line  a 1 to 2px indicator line drawn inside the box: the step under way, the hairline under a sticky head
 * Not listed: a glass control's own 0.5px ring (`CONTROL_RING`, SPEC 1 rule 9), which is the same one everywhere.
 */
const SHADOWS: Record<string, readonly string[]> = {
  'apps/web/src/lib/mention/MentionField.svelte': ['.mf-token'], // a mention's fill past its letters, where padding would move them off the textarea's
  'apps/web/src/lib/agents/NewKind.svelte': ['.field[data-wrong], .lines[data-wrong]', '.lines'], // edge, edge
  'apps/web/src/lib/board/WidgetSheet.svelte': ['.ws-search', '.ws-search:focus-within', '.ws-card .ws-frame', '.ws-open:focus-visible .ws-frame', '.ws-plus', '.ws-stage .ws-frame', '.ws-on'], // line over the sticky search, edge, ring, ring
  'apps/web/src/lib/board/WidgetTile.svelte': ['.wt'], // edge
  'apps/web/src/lib/decide/DecisionCard.svelte': ['.queue-card[data-selected]'], // edge
  'apps/web/src/lib/decide/form.css': ['.dc-btn[data-on]'], // edge
  'apps/web/src/lib/flow/RunView.svelte': ['.rv-card[data-state=\'unreached\']'], // edge
  'apps/web/src/lib/flow/Tokens.svelte': ['.tok-box :global(.tok-pill)'], // edge
  'apps/web/src/lib/page/PageTabs.svelte': ['.tab[aria-current=\'page\'], .tab-more[data-here] .tab'], // edge
  'apps/web/src/lib/page/ProjectVisuals.svelte': ['.stop[data-kind=\'now\'] .c'], // edge
  'apps/web/src/lib/ui/AgentFace.svelte': ['.agent-face-live', '.agent-face-live[data-live=\'quiet\']', '.agent-face-project', '.agent-face'], // edge, ring, edge
  'apps/web/src/lib/ui/BlockBar.svelte': ['.width[data-on]'], // edge
  'apps/web/src/lib/ui/Count.svelte': ['.badge[data-size=\'s\']'], // ring
  'apps/web/src/lib/ui/NewAction.svelte': ['.field[data-bad]', '.pick'], // edge, edge
  'apps/web/src/lib/ui/PageHead.svelte': ['.head-bar::before', '.head-bar:is([data-past], [data-under])::before'], // line, line
  'apps/web/src/lib/shell/Bell.svelte': ['.bell-count'], // ring
  'apps/web/src/lib/ui/StateDot.svelte': ['.dot[data-state=\'open\']', '.dot[data-state=\'part\']'], // edge
  'apps/web/src/routes/automations/AutomationSentence.svelte': ['.row :global(.field:has(input[aria-invalid=\'true\']))', '.say-row :global(.field:has(input[aria-invalid=\'true\']))'], // edge, edge
  'apps/web/src/routes/automations/SentenceSteps.svelte': ['li[data-over]'], // line
  'apps/web/src/routes/automations/[id]/+page.svelte': ['.bar[data-held]'], // line
  'apps/web/src/routes/decide/[id]/Proposed.svelte': ['.swatch'], // edge
  'apps/web/src/routes/addons/+page.svelte': ['.find', '.sort-select'], // edge
  'apps/web/src/routes/addons/[id]/Listing.svelte': ['.narrow-only'], // line
  'apps/web/src/routes/r/[register]/parts/PeopleOrder.svelte': ['.order button[aria-pressed=\'true\']'], // edge
  'apps/web/src/routes/r/[register]/parts/ListBoard.svelte': ['.bcard[data-cursor]', '.bcard[data-picked]', '.bcard:not([data-picked], [data-cursor]):hover'], // edge
  'apps/web/src/routes/scripts/[id]/ScriptForm.svelte': ['.field[data-wrong], .lines[data-wrong], .code[data-wrong]'], // edge
  'apps/web/src/routes/settings/[area]/areas/Appearance.svelte': ['.swatch', '.swatch::before', '.tick'], // edge, edge under a thumb, ring
  'apps/web/src/routes/settings/[area]/areas/Delete.svelte': ['.field[data-invalid]'], // edge
  'apps/web/src/routes/settings/[area]/areas/Identity.svelte': ['.rename-bad'], // edge
  'apps/web/src/routes/settings/[area]/areas/Ingest.svelte': ['.door-state[data-state=\'off\']::before'], // edge
  'apps/web/src/routes/settings/[area]/settings.css': ['.settings-place .picture-shot', '.settings-place .picture[data-on] .picture-shot', '.settings-place .picture:not([data-on]):hover .picture-shot', '.settings-place .field:focus-within'], // edge, ring, ring
  'packages/skin/blocks-charts.css': ['.split-dot:not([data-step]), .ring-dot:not([data-step])', '.roadmap-item[data-date] .roadmap-bar', '.roadmap-bar[data-dragging]', '.heat-day'], // edge, ring
  'packages/skin/kinds/board.css': ['.board-col[data-drop]'], // edge
  'packages/skin/kinds/calendar.css': ['.calendar-day .calendar-item::after'], // edge
  'packages/skin/kinds/feed.css': ['.feed-row[data-focused]'], // ring
  'packages/skin/kinds/filters.css': ['.filters-group[data-control=\'segmented\'] .filters-choice:is([aria-pressed=\'true\'], [data-on]), .filters-group[data-control=\'segmented\'] button.filters-choice[aria-pressed=\'true\']:hover', '.filters-choice:is([aria-pressed=\'true\'], [data-on]), button.filters-choice[aria-pressed=\'true\']:hover'], // edge, edge
  'packages/skin/kinds/queue.css': ['.queue-card[data-focused]', '.queue-options:has(.queue-because) > .queue-option', '.queue-options:has(.queue-because) > .queue-option:has(> .queue-act[data-on])', '.queue-card[data-selected]:not([data-focused])'], // edge, ring
  'apps/web/src/lib/agents/CodeForm.svelte': ['.code-box'], // edge
  'apps/web/src/lib/agents/ConnectSheet.svelte': ['.step-item::before'], // edge
  'apps/web/src/lib/agents/ProfileSheet.svelte': ['.pf-text', '.pf-text:focus-visible, .pickf:focus-visible', '.pickf'], // edge
  'apps/web/src/lib/money/BudgetSet.svelte': ['.bset-field'], // edge
  'apps/web/src/lib/page/panels/RunPanel.svelte': ['.run-input:focus-visible'], // ring
  'apps/web/src/lib/ui/Face.svelte': ['.face'], // edge
  'apps/web/src/lib/ui/SkeletonCard.svelte': ['.o.ring'], // edge
  'apps/web/src/lib/ui/controls.css': ['.field', '.field:focus-within, .capture-field:focus-within'], // edge
  'apps/web/src/lib/ui/style.css': ['.group-list > * + *'], // line
  'apps/web/src/routes/add/contacts/+page.svelte': ['.ct-table th'], // line
  'apps/web/src/routes/count/+page.svelte': ['.cc-n, .cc-box'], // edge
  'apps/web/src/routes/plugins/+page.svelte': ['.find:focus-within'], // ring
  'apps/web/src/routes/r/[register]/parts/ChipsBar.svelte': ['.sift[data-on]'], // edge
  'apps/web/src/routes/settings/[area]/areas/People.svelte': ['.role[data-on]'], // edge
  'apps/web/src/routes/signin/Entry.svelte': ['.entry :global(.entry-sheet .field:focus-within)'], // ring
  'apps/web/src/routes/slash/Conversation.svelte': ['.legacy-card[data-armed]'], // ring
  'apps/web/src/routes/start/Chat.svelte': ['.mark', '.box:focus-within'], // edge, ring
  'apps/web/src/routes/start/FormingStrip.svelte': ['.strip-wrap', '.chip[data-arrived]'], // edge, line
  'packages/skin/kinds/cards.css': ['.cards-face'], // edge
  'packages/skin/kinds/instruct.css': ['.ins-said'], // edge
  'packages/skin/kinds/presence.css': ['.pres-input'], // edge
};

/**
 * THE SHADOWS THAT LIFT, the round 1030 design's against the flat frame, by file and selector, and nowhere else:
 *   lift   a widget picked up on the board, and what floats over the board while it is arranged (the widgets plan,
 *          §5: "It lifts (shadow, 1.03 scale, 1 degree tilt)"): the edit bar, a tile's remove dot and its size menu
 *   card   a Money tile, which sits on the page as a card (the Money look, `money/look.css`)
 */
const LIFTS: Record<string, readonly string[]> = {
  'apps/web/src/lib/board/Board.svelte': ['.board :global([data-board-key][data-lifted])', '.edit-bar'], // lift
  'apps/web/src/lib/board/EditCover.svelte': ['.dot', '.sizes'], // lift
  'apps/web/src/lib/money/look.css': ['[data-money] .page > .block-slot:not([data-lead]), [data-money] .page > .box'], // card
};
const lifts = (s: { file: string; selector: string }): boolean => (LIFTS[s.file] ?? []).includes(s.selector);

test('a box-shadow is a tier by name, or a ring or a line only where this file lists it', () => {
  const found = PRODUCT.flatMap((file) =>
    shadows(css(file))
      .filter((s) => s.value !== 'none')
      .map((s) => ({ file: at(file), ...s })),
  );
  assert.ok(found.length > 0, 'the walk found no shadow at all, so it is not reading the styles');
  const cast = found.filter((s) => !tiered(s.value) && !lifts(s)).map((s) => `${s.file}:${s.line} ${s.selector} { box-shadow: ${s.value} }`);
  assert.deepEqual(cast, [], `a shadow that casts is a tier by name (SPEC 3.3): ${cast.join('; ')}`);
  const unlisted = found.filter((s) => !usesTier(s.value) && !CONTROL_RING.test(s.value) && !(SHADOWS[s.file] ?? []).includes(s.selector) && !lifts(s)).map((s) => `'${s.file}': '${s.selector}' (${s.value})`);
  assert.deepEqual(unlisted, [], `a shadow that is not a cut-out ring, an inside edge or a line: ${unlisted.join('; ')}`);
});

/* ── 3. No literal red ───────────────────────────────────────────────────── */

/** Whether a hex colour is a red: saturated, neither near black nor near white, its hue within 20 degrees of red. */
function red(hex: string): boolean {
  let h = hex.slice(1);
  if (h.length <= 4) h = [...h.slice(0, 3)].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return false;
  const s = d / (1 - Math.abs(2 * l - 1));
  let hue = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  if (hue < 0) hue += 360;
  return s >= 0.35 && l > 0.12 && l < 0.88 && (hue >= 340 || hue <= 20);
}

/**
 * THE ONE COPY OF THE PALETTE (4c2faf277): the site's hero window is the app in light for every visitor, a dark one too,
 * so `[data-desk]` writes the light tokens out, and a `var()` would be the visitor's scheme. Each red there must be the
 * palette's own value for that token: a copy that drifted from the theme is refused like any other red.
 */
const PALETTE_COPY = new Set(['apps/site/src/app.css']);
const lightPalette = new Map([...readFileSync(join(ROOT, 'packages/skin/house.css'), 'utf8').matchAll(/^\s*(--[\w-]+):\s*(#[0-9a-fA-F]{3,8});/gmu)].reverse().map((m) => [m[1]!, m[2]!.toUpperCase()]));

test('no red is written as a hex outside the theme and the palettes it generates', () => {
  assert.equal(lightPalette.get('--red-fill'), '#CF413A', 'the first value the palette writes for a token is the light one');
  const files = [...PRODUCT, ...walk('apps/site/src', CODE)].filter((f) => !GENERATED.has(f));
  const found = files.flatMap((file) => {
    const text = code(file);
    return [...text.matchAll(/(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/gu)]
      .filter((m) => red(m[0]))
      .filter((m) => {
        if (!PALETTE_COPY.has(file)) return true;
        const token = /(--[\w-]+):\s*$/u.exec(text.slice(text.lastIndexOf('\n', m.index) + 1, m.index))?.[1];
        return token === undefined || lightPalette.get(token) !== m[0].toUpperCase();
      })
      .map((m) => `${at(file)}:${lineOf(text, m.index)} ${m[0]}`);
  });
  assert.deepEqual(found, [], `a red is --red or --red-fill (SPEC 1.1): ${found.join(', ')}`);
});

/* ── 4. No old name ──────────────────────────────────────────────────────── */

/* Written without their dashes, so a search of the tree for an old name finds nothing here either.
   TAKEN OFF THIS LIST BECAUSE THEY ARE THE FRAME'S NAMES AGAIN, on purpose:
     r-pill, glass-edge, and the shadow tiers: 04d4cf6d4, the style layer (ops-look SPEC 3.2, 3.3)
     t-ui, t-row, t-figure: 68fa1fdc5, the type pairs as one shorthand each
     ease-spring: 3bbe843f1, the record-forming motion's spring
     on, link: named in the frame's own contract in `packages/skin/tokens.css` since fa3f844df, each its own value in dark
     warn-fill: 23213b002, the fills for bars and parts, generated with the palette */
const OLD = [
  // SPEC 1.10 and frame 3.9: surfaces, text, the reds, status, washes
  'sunk', 'bg', 's1', 's2', 's3', 'field', 'soft', 'hold-wash', 'hover-wash', 'field-hover', 'line', 'rule2', 'line-soft',
  'edge', 'ink2', 'dim', 'faint', 'muted', 'focus-in', 'focus-out', 'action', 'danger-fill', 'accent', 'brand',
  'action-hover', 'primary-hover', 'accent-hover', 'accent-press', 'red-press', 'action-text', 'danger-text',
  'accent-text', 'red-ink', 'danger', 'accent-edge', 'status-late', 'on-action', 'on-ink', 'accent-ink', 'action-tint-1',
  'selected', 'action-tint-2', 'earn', 'earn-fill', 'status-ok', 'status-waiting', 'chart-risk', 'warn-wash',
  'info-fill', 'live-fill', 'arrived-wash', 'status-working', 'status-done', 'status-idle',
  // frame 3.9: type, faces, radii
  'tile-r', 'font-id', 't-xs', 't-sm', 't-base', 't-md', 'text', 't-group', 't-lg', 't-xl',
  't-title', 't-2xl', 't-lead', 't-3xl', 'r-sm', 'r-well', 'r-md', 'r-lg',
  // SPEC 1.7: motion
  'd-release', 'd-move', 'ease-fade', 'ease-push',
  // SPEC 1.9: elevation and glass
  'e1', 'e2', 'e3', 'glass', 'glass-strong', 'glass-blur', 'ground-light', 'ground-glow', 'press-dim', 'focus-halo',
];

test('no file names a token the pass retired', () => {
  const name = new RegExp(`(?<![\\w-])--(?:${OLD.join('|')})(?![\\w-])`, 'gu');
  const found = PRODUCT.flatMap((file) => {
    const text = readFileSync(join(ROOT, file), 'utf8');
    return [...text.matchAll(name)].map((m) => `${at(file)}:${lineOf(text, m.index)} ${m[0]}`);
  });
  assert.deepEqual(found, [], `use the frame's name (SPEC 1.10): ${found.join(', ')}`);
});

/* ── 5. No raw segment ───────────────────────────────────────────────────── */

/** A component's markup: no script, no style, no comments. */
const markup = (file: string): string =>
  readFileSync(join(ROOT, file), 'utf8')
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/<script[\s\S]*?<\/script>/gu, '')
    .replaceAll(/<style[\s\S]*?<\/style>/gu, '');

/** The markup with every `<Segmented>` track taken out, nested ones included. */
function outsideTracks(text: string): string {
  let out = text;
  for (let before = ''; before !== out; ) {
    before = out;
    out = out.replaceAll(/<Segmented\b(?:(?!<Segmented\b)[\s\S])*?<\/Segmented>/gu, '');
  }
  return out;
}

test('a segment sits in the one track that draws it', () => {
  const components = PRODUCT.filter((f) => f.endsWith('.svelte') && !f.endsWith('/Segmented.svelte'));
  const found = components.flatMap((file) => {
    const text = outsideTracks(markup(file));
    return [...text.matchAll(/\bclass="segment[\s"]|\bclass=\{\[?\s*'segment'/gu)].map(() => at(file));
  });
  assert.deepEqual([...new Set(found)], [], `wrap the segments in <Segmented>: ${[...new Set(found)].join(', ')}`);
});

/* ── 6. No icon button named only by its title ───────────────────────────── */

/** The end of the tag that opens at `start`, braces and quotes respected. */
function tagEnd(text: string, start: number): number {
  let depth = 0;
  let quote = '';
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (depth === 0 && (ch === '"' || ch === "'")) quote = ch;
    else if (depth === 0 && ch === '>') return i + 1;
  }
  return text.length;
}

test('a button that shows only a glyph is named by aria-label, never by its title alone', () => {
  const components = PRODUCT.filter((f) => f.endsWith('.svelte'));
  let glyphs = 0;
  const found = components.flatMap((file) => {
    const text = markup(file);
    const out: string[] = [];
    for (const m of text.matchAll(/<(button|Button)\b/gu)) {
      const end = tagEnd(text, m.index);
      const tag = text.slice(m.index, end);
      if (tag.endsWith('/>')) continue;
      const close = text.indexOf(`</${m[1]}>`, end);
      if (close < 0) continue;
      const inside = text.slice(end, close);
      /* ONLY A GLYPH: the content is icons and space, with nothing a person reads. */
      const words = inside.replaceAll(/<(Icon|AgentMark|svg)\b[\s\S]*?(\/>|<\/svg>)/gu, '').replaceAll(/\s+/gu, '');
      if (words !== '' || !/<(Icon|AgentMark|svg)\b/u.test(inside)) continue;
      glyphs++;
      if (/\btitle=/u.test(tag) && !/\baria-label(ledby)?=/u.test(tag)) out.push(`${at(file)}:${lineOf(text, m.index)}`);
    }
    return out;
  });
  assert.ok(glyphs > 20, `the walk found ${glyphs} buttons that show only a glyph, so it is not reading the markup`);
  assert.deepEqual(found, [], `name the button with aria-label (a title is a tooltip): ${found.join(', ')}`);
});
