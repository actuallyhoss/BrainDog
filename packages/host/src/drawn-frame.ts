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

/**
 * The document: ready, then one `draw` from its parent, written whole.
 *
 * THE WAY OUT NO POLICY CLOSES IS TAKEN AWAY HERE, BEFORE THE WRITE, for whatever is written: no engine holds a peer connection
 * to `connect-src`, so an attached page reached a TURN server it named (8 UDP packets from `/drawn-frame/file`, with its
 * words in the user name, measured 5 Nov), though this file's policy says it cannot send what it shows anywhere. `render`'s
 * `DRAWN_GUARD` does this for a drawn block and a visual, and an attached page is written as it came, with no guard of ours
 * in it. `document.open` keeps this window and this document, so what is done here holds for what is written.
 */
export const DRAWN_FRAME_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Drawn</title></head><body><script>
(function () {
  if (parent === window) return;
  ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection'].forEach(function (n) {
    try { Object.defineProperty(window, n, { value: undefined, writable: false, configurable: false }); } catch (e) {}
  });
  new MutationObserver(function (records) {
    records.forEach(function (r) {
      r.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.matches('iframe,frame,object,embed')) n.remove();
        else n.querySelectorAll('iframe,frame,object,embed').forEach(function (f) { f.remove(); });
      });
    });
  }).observe(document, { childList: true, subtree: true });
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

/* ── the attached page's frame ──────────────────────────────────────────── */

/**
 * Where an attached page is drawn (`methods/attachments.ts`): a Claude artifact or any `.html` file somebody put on a
 * task, shown as it is. Under `drawn-frame/`, so the name no record can take already covers it.
 *
 * NOT THE DRAWN BLOCK'S POLICY, BECAUSE AN ARTIFACT IS NOT A DRAWN BLOCK. A visual is BrainDog's own page and loads
 * nothing; an artifact is written against the libraries its maker's tool offers (React and Chart.js from cdnjs, Tailwind
 * from its CDN, fonts from Google) and is blank without them. So this frame lets scripts, styles, fonts and pictures
 * come from those five script hosts and Google Fonts, AND NOTHING ELSE AT ALL:
 *
 * - `sandbox allow-scripts` and no `allow-same-origin`: an origin that holds nothing, so no cookie, no storage, and the
 *   app's API answers it as a stranger. No `allow-top-navigation`, no popups, no forms.
 * - `connect-src 'none'`: no fetch, XHR, WebSocket or beacon, and no peer connection (`DRAWN_FRAME_HTML`), so it cannot send what it shows anywhere.
 * - pictures only inline or from those hosts: no pixel from anywhere else learns who opened it, or when.
 * - `form-action 'none'` and `base-uri 'none'`: no sign-in form that posts, no base that moves its links.
 * - `'unsafe-eval'` inside this frame only, for an artifact that compiles its JSX in the browser; the origin it runs in
 *   holds nothing for it to reach.
 * - `frame-ancestors 'self'`: only BrainDog's own pages hold it.
 */
export const FILE_FRAME_PATH = '/drawn-frame/file';

/** The hosts an artifact may load its libraries from: the ones Claude's artifacts are written against. */
export const ARTIFACT_HOSTS = ['https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://cdn.tailwindcss.com', 'https://code.jquery.com'] as const;

const CDNS = ARTIFACT_HOSTS.join(' ');

/** Its policy, said above line by line. */
export const FILE_FRAME_POLICY = [
  'sandbox allow-scripts',
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' ${CDNS}`,
  `style-src 'unsafe-inline' ${CDNS} https://fonts.googleapis.com`,
  `font-src data: ${CDNS} https://fonts.gstatic.com`,
  `img-src data: blob: ${CDNS}`,
  'media-src data: blob:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join('; ');

/** The headers the attached page's frame is answered with: the drawn frame's, under its own policy. */
export function fileFrameHeaders(): Headers {
  const headers = drawnFrameHeaders();
  headers.set('content-security-policy', FILE_FRAME_POLICY);
  return headers;
}

/** Whether a path is one of the two frames, so a host answers it before it reads the path as a record's name. */
export const isDrawnFrame = (pathname: string): boolean => pathname === DRAWN_FRAME_PATH || pathname === FILE_FRAME_PATH;

/**
 * The frame, for a GET or a HEAD; any other method is refused, as it is for every page of the app. `pathname` picks the
 * attached page's frame; the same document, under its own policy.
 */
export function drawnFrame(method: string, pathname: string = DRAWN_FRAME_PATH): Response {
  const headers = pathname === FILE_FRAME_PATH ? fileFrameHeaders() : drawnFrameHeaders();
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('allow', 'GET, HEAD');
    headers.set('cache-control', 'no-store');
    return new Response(null, { status: 405, headers });
  }
  return new Response(method === 'HEAD' ? null : DRAWN_FRAME_HTML, { status: 200, headers });
}
