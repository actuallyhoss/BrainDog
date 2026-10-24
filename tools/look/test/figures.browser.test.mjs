/**
 * What the checks read out of a page (`pageFactsIn`), tried in a real browser on markup the product itself writes: a
 * lines chart drawn by the renderer (`toHTML`), key numbers whose sentences `kpiView` wrote, a More sheet in a closed
 * dialog, and a badge that is drawn once and hidden once. Skipped where there is no browser to open.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';

import { kpiView } from '../../../packages/render/src/kpis.ts';
import { toHTML } from '../../../packages/render/src/html.ts';
import { parse } from '../../../packages/render/src/parse.ts';
import { agesOf, blankOf, countsIn, drawnIn, pageFactsIn } from '../checks.mjs';

const NOW = Date.parse('2026-09-12T12:00:00Z');
const at9 = (day) => `${day}T09:00:00.000Z`;
const sentence = (k) => kpiView(k, { home: 'GBP', now: new Date(NOW).toISOString() }).sentence;
const subscribers = { name: 'Subscribers', unit: 'people', kind: 'level', points: [{ at: at9('2026-08-20'), value: 300 }, { at: at9('2026-08-26'), value: 301 }, { at: at9('2026-09-02'), value: 318 }] };
const specimens = { name: 'Specimen downloads', unit: 'downloads', kind: 'level', points: [{ at: at9('2026-07-30'), value: 275 }, { at: at9('2026-08-06'), value: 275 }, { at: at9('2026-08-13'), value: 251 }] };

/** Thirty days of a measure that stopped on 27 August, with the period before it running on. */
const days = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 14 + i));
  const label = `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'][d.getUTCMonth()]}`;
  return `${label} | ${i < 14 ? 5000 + i * 50 : ''} | ${6000 + i * 10}`;
});
const lines = toHTML(parse(`\`\`\`lines | Weekly active players\nDay | Weekly active players | was: Previous 30 days\n${days.join('\n')}\n\`\`\``));
const SAYS_AGE = lines.replace('<p class="lines-lead">', '<p class="lines-lead">Last read 27 Aug. ');

const page = (chart) => `<!doctype html><meta charset="utf-8">
<nav class="topbar"><span role="img" aria-label="8 Open questions">8</span></nav>
<nav class="tabs"><span style="display:none"><span role="img" aria-label="8 Open questions">8</span></span></nav>
<dialog><nav class="more-nav" aria-label="More">
  <h3 class="more-section">Projects</h3><ul class="more-list"><li><a class="more-row"><span class="more-name">Kiln</span></a></li><li><a class="more-row"><span class="more-name">Marlow &amp; Co</span></a></li><li><a class="more-row"><span class="more-name">Portage</span></a></li></ul>
  <h3 class="more-section">Your things</h3><ul class="more-list"><li><a class="more-row"><span class="more-name">Work</span></a></li></ul>
</nav></dialog>
<main>
  <ul>
    <li><h4>Subscribers</h4><svg class="kpi-chart" role="img" aria-label="${sentence(subscribers)}" width="40" height="10"></svg><span>318 people</span> <span>Up 5.6% since 26 Aug</span></li>
    <li><h4>Specimen downloads</h4><svg class="kpi-chart" role="img" aria-label="${sentence(specimens)}" width="40" height="10"></svg><span>251 downloads</span> <span>Not updated since 13 Aug</span></li>
  </ul>
  <a class="pcard" href="#" aria-label="Kiln, earning, at risk, Revenue a month: £2,300 in Aug, Up 28% on Jul, Target £2,000 met, 60% along, 1 late"><span>Kiln</span> <span>Earning</span> <span>£2,300</span> <span>Revenue a month</span> <span>Up 28% on Jul</span></a>
  ${chart}
</main>`;

let browser = null;
before(async () => {
  browser = await chromium.launch().catch(() => null);
});
after(async () => {
  await browser?.close();
});

const read = async (html) => {
  const tab = await browser.newPage();
  try {
    await tab.setContent(html);
    return await tab.evaluate(pageFactsIn);
  } finally {
    await tab.close();
  }
};

test('THE FRAME IS READ: the badge while it is drawn, and the More sheet although its dialog is shut', async (t) => {
  if (browser === null) return t.skip('there is no browser to open');
  const facts = await read(page(lines));
  assert.deepEqual(facts.badges, ['8 Open questions'], 'the badge hidden in the tab bar is not on the screen');
  assert.deepEqual(facts.more.map((s) => [s.heading, s.rows.length]), [['Projects', 3], ['Your things', 1]]);
  assert.deepEqual(countsIn('', facts), { 'in play': [{ at: 'the More sheet', n: 3 }], 'need you': [{ at: 'the badge', n: 8 }] });
});

test("A PAGE'S KEY NUMBERS AND CHARTS ARE READ WITH THE WORDS OF THE BOX THEY STAND IN", async (t) => {
  if (browser === null) return t.skip('there is no browser to open');
  const facts = await read(page(lines));
  assert.equal(facts.sentences.length, 3);
  assert.match(facts.sentences[0].box, /^Subscribers 318 people Up 5\.6% since 26 Aug$/u, 'the box is the row, not the whole page');
  assert.equal(facts.charts.length, 1);
  assert.equal(facts.charts[0].name, 'Weekly active players');
  assert.deepEqual(facts.charts[0].was, [false, true]);
  assert.equal(facts.charts[0].rows.length, 30);
  assert.deepEqual(facts.charts[0].rows[13], ['27 Aug', '5650', '6130']);
  assert.ok(!facts.charts[0].box.includes('27 Aug'), 'the day it stopped is not among the dates the chart draws');
});

test('OLD NUMBERS WITHOUT AN AGE ARE FOUND ON THE REAL MARKUP, and the ones that say theirs are not', async (t) => {
  if (browser === null) return t.skip('there is no browser to open');
  const got = agesOf(await read(page(lines)), NOW);
  assert.equal(got.read, 4);
  assert.deepEqual(
    got.old.map((f) => [f.name, f.days, f.shown]),
    [['Subscribers', 10, false], ['Specimen downloads', 30, true], ['Revenue a month', 12, false], ['Weekly active players', 16, false]],
  );
  const says = agesOf(await read(page(SAYS_AGE)), NOW);
  assert.deepEqual(says.old.find((f) => f.kind === 'chart'), { kind: 'chart', name: 'Weekly active players', said: '27 Aug', newest: '2026-08-27', days: 16, shown: true });
});

test('A SAMPLE THE SCREEN READER IS NOT TOLD IS DECOR, drawn or not, and is not counted', async (t) => {
  if (browser === null) return t.skip('there is no browser to open');
  const tab = await browser.newPage();
  try {
    await tab.setContent(`<!doctype html><main><p>8 need you today. 3 projects in play.</p>
      <div class="previews" aria-hidden="true"><p>Light</p><p>3 need you today, 1 is late.</p></div>
      <div aria-hidden="true" style="display:none">7 need you</div><span aria-hidden="true">Aa</span><span aria-hidden="true">3</span></main>`);
    const facts = await tab.evaluate(pageFactsIn);
    const text = await tab.evaluate(() => (document.querySelector('main') ?? document.body).innerText);
    assert.deepEqual(facts.decor.map((d) => d.replace(/\s+/gu, ' ')), ['Light 3 need you today, 1 is late.'], 'drawn, a number and words: not the hidden 7, the Aa or the lone 3');
    assert.deepEqual(countsIn(text, facts)['need you'], [{ at: 'the line', n: 8 }]);
    assert.deepEqual(countsIn(text, facts)['in play'], [{ at: 'a sentence', n: 3 }], 'the lone 3 in a date is not blanked wherever else a 3 stands');
    assert.equal(countsIn(text)['need you'].length, 2, 'without it, the sample is read as a second line');
  } finally {
    await tab.close();
  }
});

test('A PAGE WITH NONE OF THESE READS NOTHING, which is not the same as passing', async (t) => {
  if (browser === null) return t.skip('there is no browser to open');
  const facts = await read('<!doctype html><main><p>Nothing here</p></main>');
  assert.deepEqual(facts, { badges: [], more: [], sentences: [], charts: [], decor: [] });
  assert.deepEqual(agesOf(facts, NOW), { read: 0, unread: 0, old: [] });
});

test("A BLANK PROJECT PAGE IS READ AS ONE IN THE PAGE (Z2): no name, no hero; and one with its hero is drawn", async (t) => {
  if (browser === null) return t.skip('there is no browser to open');
  const tab = await browser.newPage();
  try {
    const drawnOf = async (html) => {
      await tab.setContent(html);
      return tab.evaluate(drawnIn);
    };
    const blank = await drawnOf('<!doctype html><main><div data-project=""><div style="display:none"><h1>Kiln</h1></div></div></main>');
    assert.deepEqual(blank, { heading: false, words: 0, project: true, hero: false });
    assert.equal(blankOf(blank, 'project'), 'no name and 0 words');
    const opened = await drawnOf(`<!doctype html><main><div data-project="">${'<p>Keeping it alive, renews 28 Feb, what changed today.</p>'.repeat(4)}</div></main>`);
    assert.equal(blankOf(opened, 'p-braindog'), 'a project page with no name or hero', 'the laptop on 25 October: blocks, no hero');
    const whole = await drawnOf('<!doctype html><main><div data-project=""><section class="hero"><h1>Kiln</h1><p>Earning, at risk, since Mar 2024. 1 of 8 tasks is late.</p></section></div></main>');
    assert.equal(blankOf(whole, 'project'), null);
  } finally {
    await tab.close();
  }
});
