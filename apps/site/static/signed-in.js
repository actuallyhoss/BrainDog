/* Before the first paint, read the two cookies the app sets, and nothing else:
   bd_in, which the app sets beside its session: signed in, so "Open BrainDog" shows in place of "Get early access"
   and "Sign in" (isSignedIn in src/lib/site/signed-in.ts);
   bd_pref, the app's look for this device, where this page can read it: the scheme chosen in BrainDog's Settings and
   its high contrast, put on the page as the app's own shell puts them (data-scheme, data-theme="hc"), so the site
   wears the scheme the app wears (schemeOf in src/lib/site/signed-in.ts). With neither, the scheme is the
   operating system's.
   The site never sets a cookie. */
(function () {
  var d = document.documentElement;
  var parts = document.cookie.split(';');
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf('=');
    if (eq < 1) continue;
    var name = parts[i].slice(0, eq).trim();
    var value = parts[i].slice(eq + 1).trim();
    if (name === 'bd_in' && value !== '') d.dataset.in = '';
    if (name === 'bd_pref' && value !== '') {
      try {
        var p = JSON.parse(decodeURIComponent(value));
        if (p && (p.scheme === 'light' || p.scheme === 'dark')) d.setAttribute('data-scheme', p.scheme);
        if (p && p.contrast === true) d.setAttribute('data-theme', 'hc');
      } catch (e) {}
    }
  }
})();
