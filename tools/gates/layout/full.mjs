/**
 * `layout-full`: a main screen fills the room the shell gives it. `SPAN` reads the room and the widest thing in it,
 * `short` says when that is a cap or a centred column, and the docked pass (`dock.mjs`) asks the same two of the column
 * left beside a panel.
 *
 * `at` is the widths this pass draws and `seed` the `layout-full` rule when this run plants it, else `null`.
 */

import { plant } from './plant.mjs';
import { mark, openFor, reach, SHAPES } from './shared.mjs';

/**
 * AND THE MAIN SCREENS FILL THE WINDOW, which nothing above can say.
 *
 * A main screen that does not fill the window horizontally on a laptop is wrong. Every check in this file is about a
 * page that is too WIDE, and a page held to a narrow column in the middle of a laptop scrolls nowhere and has nothing
 * to press under 44px, so it sweeps clean at every width. The rule is full width with fluid gutters, judged at the
 * two MacBook widths, and this is the half of that the sweep could not see.
 *
 * THE WIDEST CONTENT BOX IN `#main`, NOT `#main` ITSELF. `#main` is the shell's grid column and always takes the room
 * beside the rail; a page that caps itself inside it is the defect. So every element drawn in `#main` is read, less
 * its own padding and border, and the widest is the screen's content. The widest and not some fixed wrapper, because
 * a screen is free to draw its prose at 72ch beside a wide list: one thing running the width is what full width means.
 * Inline boxes, positioned layers and anything reaching past `#main` (a table scrolling in its region) are not the
 * page's width and are not read.
 *
 * THE ROOM IS THE COLUMN THE SHELL GIVES THE WORK, read off the shell's own grid: the track `#main` stands in, so the
 * rail card's column, folded or not, and the docked panel's column are both outside it. It was the viewport less
 * `.rail-slot`'s width, which is only drawn on the rail: on the top bar and the menu it read 0 and the room was the
 * whole window, right with the panel shut and 400 too wide with it open (research-audit-16 L12). The track is what
 * the shell gave and not what the page took, so a page capping itself is still the short one.
 *
 * ON ALL THREE SHAPES, because each lays the work out on its own grid and only one of them was ever drawn. A shape
 * the record keeps is kept through its own `setPref` (`openPage`'s `prefs`), and a pass that asked for the top bar and got the rail says so
 * rather than measuring the rail three times.
 *
 * NAMED BY THEIR NAMES, because a red line here is read by somebody deciding which screen to open. The addresses are
 * the shipped seed's pages (`packages/seed/src/modules`): Projects is `portfolio`.
 */
const MAIN_SCREENS = [
  { name: 'Today', route: '/' },
  { name: 'Work', route: '/p/work' },
  { name: 'Decide', route: '/decide' },
  { name: 'Money', route: '/p/money' },
  { name: 'Projects', route: '/p/portfolio' },
  { name: 'People', route: '/p/people' },
];

/** What a screen spans, read in the page: it closes over nothing in this file. */
export const SPAN = () => {
  const main = document.getElementById('main');
  if (!main) return null;
  const box = main.getBoundingClientRect();
  const px = (v) => parseFloat(v) || 0;
  let widest = 0;
  for (const el of main.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (s.display === 'inline' || s.display === 'contents' || s.position === 'fixed' || s.position === 'absolute') continue;
    if (el.closest('dialog')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.left < box.left - 1 || r.right > box.right + 1) continue;
    const inner = r.width - px(s.paddingLeft) - px(s.paddingRight) - px(s.borderLeftWidth) - px(s.borderRightWidth);
    if (inner > widest) widest = inner;
  }
  /* THE SHELL'S TRACKS, as the browser resolved them (`216px 1256px 0px` on the rail with the panel shut), and the
     one `#main` starts in is the room. The track after it, when there is one, is the docked panel's column. */
  const shell = main.closest('.shell');
  const tracks = shell ? getComputedStyle(shell).gridTemplateColumns.split(' ').map(parseFloat).filter(Number.isFinite) : [];
  let start = shell ? shell.getBoundingClientRect().left : 0;
  let room = box.width;
  let dock = 0;
  for (const [i, t] of tracks.entries()) {
    if (box.left + 1 < start + t) {
      room = t;
      dock = tracks[i + 1] ?? 0;
      break;
    }
    start += t;
  }
  return { widest: Math.round(widest), room: Math.round(room), dock: Math.round(dock), shape: shell?.getAttribute('data-shape') ?? null };
};

const pct = new Intl.NumberFormat('en', { style: 'percent' });
/** What is wrong with a screen narrower than its room, or `null`. `beside` says what the room is, and `share` how much of it a main screen fills. */
export const short = (span, beside, share) =>
  span.widest < span.room * share
    ? `is ${span.widest}px wide at most in the ${span.room}px ${beside} ` +
      `(${pct.format(span.widest / span.room)}), and a main screen fills ${pct.format(share)}: a cap or a centred column`
    : null;
/** What is wrong with a shell that drew another shape than the one asked for, or `null`. */
export const misdrawn = (span, shape) =>
  span.shape === shape.drawn ? null : `asked for ${shape.name} and the shell drew ${span.shape ?? 'no shell'}, so ${shape.name} was not measured`;

export async function full(run, { at: fullAt, seed: fullSeed }) {
  const { findings, budgets: B } = run;
  for (const width of fullAt)
    for (const shape of fullSeed ? SHAPES.slice(0, 1) : SHAPES) {
      const screens = fullSeed ? MAIN_SCREENS.slice(0, 1) : MAIN_SCREENS;
      const opened = await openFor(run, width, shape, screens[0].route);
      const { context, page } = opened;
      process.stdout.write(`    full @${String(width).padStart(4)} ${shape.drawn.padEnd(4)} `);
      for (const screen of screens) {
        const where = `${screen.name} (${screen.route}) @${width} on ${shape.name}`;
        if (!(await reach(run, opened, screen.route, `${screen.route} @${width} on ${shape.name} (full width)`, fullSeed))) continue;
        await plant(page, fullSeed);
        const span = await page.evaluate(SPAN);
        run.checked++;
        const said = span === null ? 'drew no #main to measure for full width' : (misdrawn(span, shape) ?? short(span, 'the shell gives the work', B.fullWidthShare));
        process.stdout.write(said ? '!' : '.');
        if (said) findings.push(mark(fullSeed, `${where}  ${said}`));
      }
      process.stdout.write('\n');
      await context.close();
    }
}
