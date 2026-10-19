// Runs in the page before its own scripts. Builds window.__BRAINDOG_SHELL__ exactly as
// apps/web/src/lib/shell.ts reads it: open, notify, badge, inset, on. Only on our own origin.
(() => {
  if (location.origin !== '__ORIGIN__') return;
  const call = (cmd, args) => {
    try {
      return window.__TAURI_INTERNALS__.invoke(cmd, args).catch(() => {});
    } catch (_) {
      return Promise.resolve();
    }
  };
  const subs = { slash: new Set(), goto: new Set() };
  window.__BRAINDOG_SHELL__ = {
    inset: 78,
    open: (url) => void call('open_outside', { url: String(url) }),
    notify: (title, body) => void call('notify', { title: String(title), body: String(body) }),
    badge: (n) => void call('set_badge', { count: Math.max(0, Math.floor(Number(n)) || 0) }),
    on(event, fn) {
      const set = subs[event];
      if (!set) return () => {};
      set.add(fn);
      return () => set.delete(fn);
    },
    // Called from Rust (global shortcut, menu, deep link); not part of what the web reads.
    emit(event, arg) {
      (subs[event] || []).forEach((fn) => fn(arg));
    },
  };
  const interactive = 'a,button,input,textarea,select,summary,[role=button],[contenteditable],[data-no-drag]';
  // The title bar is overlaid, so the strip under the traffic lights drags the window.
  addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest?.(interactive)) return;
    if (e.clientY < 40 || e.target.closest?.('[data-shell-drag]')) void call('start_drag');
  }, true);
  // Any link that leaves BrainDog goes to the default browser, whatever the page did with it.
  addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || e.defaultPrevented) return;
    const u = new URL(a.href, location.href);
    if (/^(https?:|mailto:)/.test(u.protocol) && u.origin !== location.origin) {
      e.preventDefault();
      window.__BRAINDOG_SHELL__.open(u.href);
    }
  }, true);
})();
