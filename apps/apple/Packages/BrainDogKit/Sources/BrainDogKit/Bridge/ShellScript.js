// Runs in the page before its own scripts, in the main frame only. Builds window.__BRAINDOG_SHELL__ exactly as
// apps/web/src/lib/shell.ts reads it (plan 3.2): one door, the same for the Mac and the iPhone, told apart by `kind`.
// Only on the app's own origin: anywhere else the page gets nothing, and the handler refuses what it is sent anyway.
(() => {
  if (location.origin !== '__ORIGIN__' || window.top !== window) return;
  const post = (m, a) => {
    try {
      window.webkit.messageHandlers.braindog.postMessage({ m, a: a === undefined ? null : a });
    } catch (_) {
      /* No handler (a page loaded outside the app): nothing to tell. */
    }
  };
  const text = (x, most = 512) => (typeof x === 'string' ? x.slice(0, most) : '');
  const subs = { slash: new Set(), search: new Set(), goto: new Set(), saved: new Set(), unsaved: new Set(), refresh: new Set() };
  let readied = false;
  // THE IPHONE'S PERMISSION ASK ANSWERS (M4): native emits `pushAnswer` with 'yes' or 'no', and the page's `askPush` reads
  // it. Unanswered in a minute, it answers nothing, which the page reads as "said nothing". The Mac answers nothing at once.
  const asking = [];
  const shell = {
    kind: '__KIND__',
    inset: __INSET__,
    textScale: __SCALE__,
    open: (url) => post('open', { url: text(String(url), 2048) }),
    notify: (title, body, goto) => post('notify', { title: text(title, 200), body: text(body, 1000), goto: typeof goto === 'string' ? text(goto) : null }),
    badge: (n) => post('badge', { n: Math.max(0, Math.floor(Number(n)) || 0) }),
    on(event, fn) {
      const set = subs[event];
      if (!set || typeof fn !== 'function') return () => {};
      set.add(fn);
      return () => set.delete(fn);
    },
    ready() {
      if (readied) return;
      readied = true;
      post('ready');
    },
    haptic: (kind) => post('haptic', { kind: text(kind, 16) }),
    share: (what) => post('share', { url: text(what && what.url, 2048), title: text(what && what.title, 200) }),
    tell: (prefill) => post('tell', { prefill: text(prefill, 2000) }),
    ask: (prefill) => post('ask', { prefill: text(prefill, 2000) }),
    pushAsk: () => {
      post('pushAsk');
      if ('__KIND__' !== 'ios') return undefined;
      return new Promise((resolve) => {
        asking.push(resolve);
        setTimeout(() => resolve(undefined), 60000);
      });
    },
    signedOut: () => post('signedOut'),
    title: (name, sub) => post('title', { name: text(name, 200), sub: typeof sub === 'string' ? text(sub, 200) : null }),
    places: (tabs) => {
      try {
        post('places', { tabs: JSON.parse(JSON.stringify(tabs)) });
      } catch (_) {
        /* Something that is not plain data: there is nothing native could read in it. */
      }
    },
    visit: (path, opts) => post('visit', { path: text(path), mode: text(opts && opts.mode, 16) || 'push' }),
    // Called by the app (a menu, a key, a pull, a deep link); the web never calls it.
    emit(event, arg) {
      if (event === 'pushAnswer') {
        asking.splice(0).forEach((resolve) => resolve(arg === 'yes'));
        return;
      }
      (subs[event] || []).forEach((fn) => {
        try {
          fn(arg);
        } catch (_) {
          /* One listener that throws does not stop the others. */
        }
      });
    },
  };
  Object.defineProperty(window, '__BRAINDOG_SHELL__', { value: Object.freeze(shell), writable: false, configurable: false });
  // THE MAC: THE BAR'S EMPTY PART IS THE TITLE BAR. The traffic lights stand in the web's own 56px bar (`--shell-lead`),
  // so a press on that row where nothing is pressable moves the window, and a double press zooms it, as a title bar does.
  // Anything a person can press, type in or drag keeps the press. Not a member of the shell: the page never calls it.
  if (shell.kind === 'mac') {
    const BAR = 56;
    const pressable =
      'a,button,input,textarea,select,label,summary,details,[role=button],[role=link],[role=tab],[role=menuitem],[role=switch],[role=checkbox],[role=combobox],[role=slider],[contenteditable=""],[contenteditable=true],[tabindex]:not([tabindex="-1"]),[draggable=true]';
    const empty = (e) => e.button === 0 && e.clientY >= 0 && e.clientY < BAR && !(e.target && e.target.closest && e.target.closest(pressable));
    addEventListener(
      'mousedown',
      (e) => {
        if (!empty(e) || e.detail > 1) return;
        e.preventDefault();
        post('drag');
      },
      true,
    );
    addEventListener('dblclick', (e) => empty(e) && post('zoom'), true);
  }
  // Any link that leaves BrainDog opens outside, whatever the page did with it.
  addEventListener(
    'click',
    (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || e.defaultPrevented) return;
      const u = new URL(a.href, location.href);
      if (/^(https?:|mailto:|tel:)$/.test(u.protocol) && u.origin !== location.origin) {
        e.preventDefault();
        shell.open(u.href);
      }
    },
    true,
  );
})();
