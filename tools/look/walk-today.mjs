/**
 * Today changed by saying it: "Put Cash ahead first on Today". The stand-in model moves that block to the top of the
 * body the record handed it; Keep it draws Today so, and Undo puts the built page back.
 *
 *   node tools/look/walk-today.mjs [--out <dir>] [--headed]
 */
import { answer, inputOf, openChange, walk, OWNER } from './walk-kit.mjs';

const ASKED = 'Put Cash ahead first on Today';

const model = async (_u, init) => {
  const page = inputOf(init).page;
  const blocks = [...(page?.body?.blocks ?? [])];
  const at = blocks.findIndex((b) => b.heading === 'Cash ahead');
  if (at < 0) return answer([]);
  const [cash] = blocks.splice(at, 1);
  const body = { ...page.body, blocks: [cash, ...blocks] };
  return answer([{ question: 'Put Cash ahead first on Today?', body_kind: 'change', body: { to: { id: page.id, kind: 'page', body } } }]);
};

/** Where Cash ahead and Needs you sit on Today, top to bottom. */
const order = (page) =>
  page.locator('main .home-page').first().evaluate((el) => {
    const y = (name) => [...el.querySelectorAll('h2,h3')].findIndex((h) => h.textContent.trim().startsWith(name));
    return { cash: y('Cash ahead'), needs: y('Needs you') };
  });

await walk('today', model, null, async ({ page, app, record, step, shot }) => {
  await step('Today opens with Cash ahead below Needs you', async () => {
    await page.goto(`${app}/`);
    await page.locator('.home-page').first().waitFor({ timeout: 30_000 });
    await page.getByRole('heading', { name: 'Cash ahead' }).first().waitFor({ timeout: 30_000 });
    const before = await order(page);
    if (!(before.cash > before.needs)) throw new Error(`Cash ahead is not below Needs you at the start: ${JSON.stringify(before)}`);
    await shot('before');
  });
  await step('say it and the draft is drawn', async () => {
    await openChange(page, 'Today', ASKED);
    await page.getByRole('button', { name: 'Draft it' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Keep it' }).waitFor({ timeout: 60_000 });
    await shot('drafted');
  });
  await step('Keep it: Today now leads with Cash ahead', async () => {
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Keep it' }).click();
    await sheet.getByText('Kept. This is how it stands now.').waitFor({ timeout: 60_000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const el = document.querySelector('main .home-page');
      const y = (n) => [...el.querySelectorAll('h2,h3')].findIndex((h) => h.textContent.trim().startsWith(n));
      return y('Cash ahead') >= 0 && y('Cash ahead') < y('Needs you');
    }, null, { timeout: 30_000 });
    await shot('kept');
  });
  await step('Undo puts Today back', async () => {
    await page.getByRole('button', { name: 'Undo' }).first().click({ timeout: 10_000 });
    await page.getByText('is drawn as BrainDog builds it again').first().waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('main .home-page');
      const y = (n) => [...el.querySelectorAll('h2,h3')].findIndex((h) => h.textContent.trim().startsWith(n));
      return y('Cash ahead') > y('Needs you') && y('Needs you') >= 0;
    }, null, { timeout: 10_000 }).catch(() => {});
    const back = await order(page);
    if (!(back.cash > back.needs)) throw new Error(`Cash ahead is still first after Undo: ${JSON.stringify(back)}`);
    const held = await record.api.page({ slug: 'home' }, OWNER);
    if (held.ok) throw new Error('the record still holds a Today page after Undo');
    if (record.kernel.declarations().some((d) => d.id === 'look.home')) throw new Error('the pins of the said change are still in the record after Undo');
    await shot('undone');
  });
});
