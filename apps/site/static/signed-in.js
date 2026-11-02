/* Signed in to BrainDog? Then show "Open BrainDog" and hide "Start free" and "Sign in", before the first paint.
   Reads the one cookie the site reads, bd_in, which the app sets beside the session. Mirrors isSignedIn in
   src/lib/site/signed-in.ts, and test/shell.test.ts holds the two equal. */
(function () {
  var parts = document.cookie.split(';');
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf('=');
    if (eq > 0 && parts[i].slice(0, eq).trim() === 'bd_in' && parts[i].slice(eq + 1).trim() !== '') {
      document.documentElement.dataset.in = '';
      return;
    }
  }
})();
