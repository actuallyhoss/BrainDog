/**
 * Needs you (Decide) changed by saying it: "Show the quick questions first". Money leads the board as built, so the walk
 * asks for the other order. The stand-in model swaps the page's two open queues; Keep it draws Quick before Money, and
 * Undo draws the built board again.
 *
 *   node tools/look/walk-decide.mjs [--out <dir>] [--headed]
 */
import { answer, inputOf, openChange, walk, OWNER } from './walk-kit.mjs';

const ASKED = 'Show the quick questions first';

const model = async (_u, init) => {
  const page = inputOf(init).page;
  const blocks = [...(page?.body?.blocks ?? [])];
  const money = blocks.findIndex((b) => b.key === 'decide-money');
  const quick = blocks.findIndex((b) => b.key === 'decide-quick');
  if (money < 0 || quick < 0) return answer([]);
  [blocks[money], blocks[quick]] = [blocks[quick], blocks[money]];
  return answer([{ question: 'Show the quick questions first on Needs you?', body_kind: 'change', body: { to: { id: page.id, kind: 'page', body: { ...page.body, blocks } } } }]);
};

/** Where the Money and Quick columns stand, left to right on the board. */
const columns = (page) =>
  page.evaluate(() => {
    const x = (name) => {
      const h = [...document.querySelectorAll('main h2, main h3')].find((e) => e.textContent.trim().startsWith(name));
      return h ? h.getBoundingClientRect().left : null;
    };
    return { money: x('Money'), quick: x('Quick') };
  });

const quickFirst = async (page, want, ms = 15_000) => {
  await page.waitForFunction(
    ([first]) => {
      const x = (name) => [...document.querySelectorAll('main h2, main h3')].find((e) => e.textContent.trim().startsWith(name))?.getBoundingClientRect().left;
      const m = x('Money');
      const q = x('Quick');
      return m !== undefined && q !== undefined && (first ? q < m : m < q);
    },
    [want],
    { timeout: ms },
  );
};

await walk('decide', model, null, async ({ page, app, record, step, shot }) => {
  await step('Needs you opens with Money before Quick', async () => {
    await page.goto(`${app}/decide`);
    await page.locator('main[data-screen]').first().waitFor({ timeout: 30_000 });
    await quickFirst(page, false, 30_000).catch(async () => {
      throw new Error(`Money is not left of Quick at the start: ${JSON.stringify(await columns(page))}`);
    });
    await shot('before');
  });
  await step('say it and the draft is drawn', async () => {
    await openChange(page, 'Needs you', ASKED);
    await page.getByRole('button', { name: 'Draft it' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Keep it' }).waitFor({ timeout: 60_000 });
    await shot('drafted');
  });
  await step('Keep it: Quick now stands before Money', async () => {
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Keep it' }).click();
    /* THE PAGE BEHIND IS DRAWN ANEW ON A KEEP, which clears the sheet's own line, so the toast is the sign it was kept. */
    await page.getByText('is kept as you changed it').first().waitFor({ timeout: 60_000 });
    await page.keyboard.press('Escape');
    await quickFirst(page, true, 30_000).catch(async () => {
      throw new Error(`Quick is not left of Money after Keep: ${JSON.stringify(await columns(page))}`);
    });
    await shot('kept');
  });
  await step('Undo puts Needs you back', async () => {
    /* THE TOAST'S UNDO, since Handled's rows have Undo buttons of their own. */
    await page.locator('[role=status]').filter({ hasText: 'is kept as you changed it' }).getByRole('button', { name: 'Undo' }).click({ timeout: 10_000 });
    await page.getByText('is drawn as BrainDog builds it again').first().waitFor({ timeout: 30_000 });
    await quickFirst(page, false, 10_000).catch(async () => {
      throw new Error(`Quick is still before Money after Undo: ${JSON.stringify(await columns(page))}`);
    });
    if ((await record.api.page({ slug: 'decide' }, OWNER)).ok) throw new Error('the record still holds a Needs you page after Undo');
    if (record.kernel.declarations().some((d) => d.id === 'look.decide')) throw new Error('the pins of the said change are still in the record after Undo');
    await shot('undone');
  });
});
