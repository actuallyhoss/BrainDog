/**
 * The one document a drawn block is drawn in (Draw; `braindog-render`'s `src/drawn.ts`), served by both
 * hosts at `DRAWN_FRAME_PATH` under its own policy.
 *
 * WHY THE HOST SERVES IT AND NOT THE ASSETS. A frame written with `srcdoc` inherits the policy of the page that holds
 * it, and the app's runs no inline script but its shell's own, so a component written into one would never run; and the
 * fix is not to loosen the app's `script-src`, which would loosen it for every page. A document of its own carries a
 * policy of its own: inline script and style, and nothing else at all. It is a constant here, so the Worker and the
 * self-host answer it from code and no asset rule (`html_handling`, a path that reads as a record's name) can change it.
 *
 * SANDBOXED BY ITS OWN HEADER, NOT ONLY BY THE FRAME. `sandbox allow-scripts` in the policy gives the document an origin
 * of its own that holds nothing wherever it is opened, so even opened on its own in a tab it cannot read the app's
 * cookie or storage. `frame-ancestors 'self'` lets only BrainDog's own pages hold it, and every one of those still sends
 * `frame-ancestors 'none'`, so nothing else of BrainDog can be framed for its being allowed here.
 *
 * WHAT IT DOES: it tells the page holding it that it is ready, takes ONE `draw` message from that page and from no other
 * window, and writes the document it was handed (built by `drawnDocument`, the policy and the bridge first). Nothing
 * else ever reaches it, and it answers nobody but its parent.
 */

/**
 * Where both hosts serve it, at the root beside the app's pages. Each host answers this exact path before it reads a
 * slug (`isDrawnFrame`), and the Directory refuses `drawn-frame` as a record's name, so no record can stand in front of it.
 */
export const DRAWN_FRAME_PATH = '/drawn-frame';

/** Its policy: scripts and styles inline, pictures and fonts inline, and nothing fetched, sent or framed. */
export const DRAWN_FRAME_POLICY = [
  'sandbox allow-scripts',
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  'media-src data:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join('; ');

/** The document: ready, then one `draw` from its parent, written whole. */
export const DRAWN_FRAME_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Drawn</title></head><body><script>
(function () {
  if (parent === window) return;
  function first(e) {
    if (e.source !== parent) return;
    var m = e.data;
    if (!m || m.braindog !== 'draw' || typeof m.doc !== 'string') return;
    removeEventListener('message', first);
    document.open();
    document.write(m.doc);
    document.close();
  }
  addEventListener('message', first);
  parent.postMessage({ braindog: 'ready' }, '*');
})();
</script></body></html>`;

/** The headers it is answered with, from either host. */
export function drawnFrameHeaders(): Headers {
  return new Headers({
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': DRAWN_FRAME_POLICY,
    'x-frame-options': 'SAMEORIGIN',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cache-control': 'public, max-age=300',
  });
}

/** Whether a path is the frame's, so a host answers it before it reads the path as a record's name. */
export const isDrawnFrame = (pathname: string): boolean => pathname === DRAWN_FRAME_PATH;

/** The frame, for a GET or a HEAD; any other method is refused, as it is for every page of the app. */
export function drawnFrame(method: string): Response {
  const headers = drawnFrameHeaders();
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('allow', 'GET, HEAD');
    headers.set('cache-control', 'no-store');
    return new Response(null, { status: 405, headers });
  }
  return new Response(method === 'HEAD' ? null : DRAWN_FRAME_HTML, { status: 200, headers });
}
