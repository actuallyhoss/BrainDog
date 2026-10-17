/* Counts that a page was opened: one POST to this origin's /api/seen with the page's path and the host it came from,
   no cookie either way, and nothing at all under Global Privacy Control. Mirrors seenBody and SEEN_INIT in
   src/lib/site/seen.ts, and test/seen.test.ts holds the two equal. */
(function () {
  if (navigator.globalPrivacyControl) return;
  var r = '';
  try {
    r = document.referrer ? new URL(document.referrer).hostname : '';
  } catch (e) {
    r = '';
  }
  try {
    fetch('/api/seen', {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      body: JSON.stringify({ p: location.pathname, r: r }),
    }).catch(function () {});
  } catch (e) {}
})();
