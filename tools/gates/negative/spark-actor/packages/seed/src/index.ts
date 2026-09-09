/**
 * The record the fixture is shown with: one register, one row, written through the kernel above.
 */

export const NOW = Date.UTC(2026, 8, 3, 12);

export async function installSeed(kernel, actor = 'p_seed') {
  kernel.declare('obligations');
  const made = kernel.create('obligations', { what: 'Hosting, quarterly, August', state: 'paid' }, { actor });
  if (!made.ok) return made;
  return { ok: true, value: { registers: 1, rows: 1, pages: 0, metrics: 0 } };
}
