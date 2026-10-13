/**
 * The record the fixture is shown with: one register, one row, written through the kernel above.
 */

export const NOW = Date.UTC(2026, 8, 3, 12);

export async function installSeed(kernel, actor = 'p_seed') {
  kernel.declare('obligations');
  const made = kernel.create('obligations', { what: 'Hosting, quarterly, August', state: 'paid' }, { actor });
  if (!made.ok) return made;
  /* A PAGE, unsigned as setup is, so the gate has one for Slash's own look to arrange. */
  await kernel.install([{ id: 'page.desk', kind: 'page', body: { page: 'desk', title: 'Desk', blocks: [] } }]);
  return { ok: true, value: { registers: 1, rows: 1, pages: 1, metrics: 0 } };
}
