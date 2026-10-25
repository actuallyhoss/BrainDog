/**
 * "Show the Talabat payments as a calendar", through Keep, Try again and Throw away, on Today.
 *
 *   node tools/look/walk-calendar.mjs [--out <dir>] [--headed]
 *
 * The seed has six Talabat payments added (as moment 5's walk adds them) and a stand-in model on the host's wire that
 * draws one calendar the first time and, once it is handed the draft turned down, a different one.
 */
import { answer, inputOf, openChange, walk, OWNER } from './walk-kit.mjs';
import { ASKED, TALABAT_CALENDAR } from './walk-moment5.mjs';
import { NOW } from '../../packages/seed/src/index.ts';

const SECOND = { ...TALABAT_CALENDAR, heading: 'Talabat, day by day', back: 2, empty: 'No Talabat payments lately.' };

const model = async (_u, init) => {
  const input = inputOf(init);
  const page = input.page;
  const blocks = [...(page?.body?.blocks ?? [])];
  const again = Array.isArray(input.declined) && input.declined.length > 0;
  const at = again ? 3 : 1;
  const body = { ...page.body, blocks: [...blocks.slice(0, at), again ? SECOND : TALABAT_CALENDAR, ...blocks.slice(at)] };
  return answer([{ question: 'Show the Talabat payments as a calendar on Today?', body_kind: 'change', body: { to: { id: page.id, kind: 'page', body } } }]);
};

/** The seed with six Talabat payments in its first account. */
const talabat = async (k) => {
  const accountId = k.list({ register: 'accounts', limit: 1 }).value.rows[0].id;
  const day = (n) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);
  for (const [n, amount] of [[1, 41500], [4, 28750], [8, 33900], [11, 19500], [15, 46200], [20, 25000]])
    if (!k.create('transactions', { what: 'TALABAT', payee: 'Talabat', on: day(n), direction: 'out', amount: { amount, currency: 'GBP' }, account: accountId, state: 'cleared' }, { actor: 'p_self' }).ok)
      throw new Error('a Talabat payment was refused');
};

const headings = (page) => page.locator('main .home-page').first().evaluate((el) => [...el.querySelectorAll('h2,h3')].map((h) => h.textContent.trim()).filter((t) => !/^(Change this page|Which list to show)$/u.test(t)));

await walk('calendar', model, talabat, async ({ page, app, record, step, shot }) => {
  let before = [];
  const sheet = () => page.getByRole('dialog');
  await step('Today opens', async () => {
    await page.goto(`${app}/`);
    await page.locator('.home-page').first().waitFor({ timeout: 30_000 });
    await page.getByRole('heading', { name: 'Cash ahead' }).first().waitFor({ timeout: 30_000 });
    before = await headings(page);
  });
  await step('say it: a draft calendar appears with Keep, Try again and Throw away', async () => {
    await openChange(page, 'Today', ASKED);
    await page.getByRole('button', { name: 'Draft it' }).click();
    await sheet().getByRole('heading', { name: 'Talabat payments' }).first().waitFor({ timeout: 60_000 });
    for (const name of ['Keep it', 'Try again', 'Throw away']) await sheet().getByRole('button', { name }).waitFor({ timeout: 5_000 });
    await shot('drafted');
  });
  await step('Try again gives a different draft', async () => {
    await sheet().getByRole('button', { name: 'Try again' }).click();
    await sheet().getByRole('heading', { name: 'Talabat, day by day' }).first().waitFor({ timeout: 60_000 });
    if ((await sheet().getByRole('heading', { name: 'Talabat payments' }).count()) > 0) throw new Error('the first draft is still shown beside the second');
    await shot('tried-again');
  });
  await step('Throw away leaves Today as it was', async () => {
    await sheet().getByRole('button', { name: 'Throw away' }).click();
    await sheet().getByRole('heading', { name: 'Talabat, day by day' }).waitFor({ state: 'detached', timeout: 10_000 });
    await page.keyboard.press('Escape');
    const now = await headings(page);
    if (JSON.stringify(now) !== JSON.stringify(before)) throw new Error(`Today changed: ${JSON.stringify(now.filter((h) => !before.includes(h)))}`);
    if ((await record.api.page({ slug: 'home' }, OWNER)).ok) throw new Error('the record holds a Today page after Throw away');
    if (record.kernel.list({ register: 'transactions', limit: 1 }).ok === false) throw new Error('the record could not be read after Throw away');
    await shot('thrown-away');
  });
  await step('Keep it, and the calendar stays after a reload', async () => {
    await openChange(page, 'Today', ASKED);
    await page.getByRole('button', { name: 'Draft it' }).click();
    await sheet().getByRole('button', { name: 'Keep it' }).waitFor({ timeout: 60_000 });
    await sheet().getByRole('button', { name: 'Keep it' }).click();
    await sheet().getByText('Kept. This is how it stands now.').waitFor({ timeout: 60_000 });
    await page.keyboard.press('Escape');
    await page.locator('main .home-page').getByRole('heading', { name: /^Talabat/u }).first().waitFor({ timeout: 30_000 });
    await page.reload();
    await page.locator('main .home-page').getByRole('heading', { name: /^Talabat/u }).first().waitFor({ timeout: 30_000 });
    await shot('kept-reloaded');
  });
});
