/**
 * THE SHAPE A PAGE HAS BEFORE THIS DEVICE HAS EVER DRAWN IT: read off a demo record's pages (`first-traces.json`, boxes and
 * nothing else, written by `tools/first-traces.mjs`), and fetched only when an address has nothing kept. Every project's page
 * shares one, every list one, every row one.
 */
const kindOf = (inner: string): string | null => {
  if (inner === '' || inner === '/') return 'today';
  if (inner === '/decide') return 'needs';
  if (inner === '/usage') return 'usage';
  if (inner === '/settings') return 'settings';
  if (inner.startsWith('/settings/')) return 'settings-area';
  const p = /^\/p\/([a-z0-9-]+)$/u.exec(inner);
  if (p) return ['money', 'dashboard', 'portfolio', 'people', 'agents'].includes(p[1]!) ? p[1]! : 'project';
  if (/^\/r\/[^/]+$/u.test(inner)) return 'list';
  if (/^\/r\/[^/]+\/[^/]+$/u.test(inner)) return 'row';
  return null;
};

export async function firstTrace(address: string): Promise<unknown | null> {
  try {
    const { here } = await import('../at.ts');
    const [path, query] = address.split('?');
    const inner = here(path || '/').replace(/\/$/u, '');
    /* THE ROOT WITH A QUERY IS ANOTHER SCREEN (`/?work`, `/?menu`), and not Today. */
    const kind = inner === '' && query ? null : kindOf(inner);
    if (kind === null) return null;
    const { default: all } = await import('./first-traces.json');
    const band = innerWidth < 900 ? 'p' : 'w';
    const shape = (all as unknown as Record<string, object>)[`${band}:${kind}`];
    if (shape === undefined) return null;
    /* ITS BOXES, AT THIS LOOK AND NOW: `app.html` holds a kept trace to both, and this one is nobody's copy of anything. */
    const h = document.documentElement;
    return { ...shape, v: 1, at: Date.now(), look: `${h.getAttribute('data-text') ?? ''} ${h.getAttribute('data-density') ?? ''}` };
  } catch {
    return null;
  }
}
