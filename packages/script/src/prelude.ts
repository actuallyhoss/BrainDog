/**
 * THE PRELUDE: the JavaScript that builds `ctx` inside the sandbox, from host functions.
 *
 * It is a string because it runs on the other side of the boundary, in QuickJS on the self-host and
 * as a module beside the source in a Dynamic Worker on Cloud. One text on
 * both hosts is what lets one fixture suite speak for both.
 *
 * IT IS ONE FUNCTION EXPRESSION, NOT A SCRIPT THAT SETS GLOBALS. The runner evaluates it, calls it
 * with the host object, and hands the `ctx` it returns to the script's default export. So the host
 * object is never a property of `globalThis`, and a script that goes looking for it finds nothing
 * to look at. Nothing here is a security check: every rule (egress, the fetch count, the write
 * count, which registers) is enforced by the runner on the host side, after this code has had its
 * say, because this code runs where the script can reach it.
 *
 * WHAT CROSSES IS A STRING. Every argument is `JSON.stringify`d here and parsed by the host's own
 * `JSON`, so a script that replaces `JSON.parse` or hands over an object with a getter changes what
 * it sees and nothing the host reads.
 *
 * `ctx.update`'S VERSION HAS TWO MEANINGS AND NO THIRD. A whole number is the version the row was
 * read at, and the record compares it; no version (or `null`) writes without comparing, which is
 * what the record's write path offers any caller that leaves it out. "None" crosses as `NaN`,
 * always as a third argument, because the host function takes a number and `quickjs.ts` reads a
 * missing one as `0`, a conflict on every row. It used to send `Number(version)` whatever came in,
 * so no version reached the record as `NaN` and was refused with a fix no script could follow,
 * `null` crossed as that `0`, and a typo crossed as the same `NaN` as no version at all. A version given that is not a whole number now stops the run here,
 * where the sentence can name the call that was wrong. This is a courtesy to the author and not a
 * check: a script that goes around it can only choose not to compare, which it may do anyway.
 *
 * `ctx.today()` IS THE RECORD'S OWN DAY, HANDED IN. The sandbox has no `Intl`, so it cannot turn the instant and the
 * zone's name into a local day: the host does (`dayIn` in `index.ts`) and hands it over as `meta.today`. It is a
 * string, `YYYY-MM-DD`, and never a `Date`. From a host that hands none, or anything that is not a day, it is the
 * first ten characters of the instant, the UTC day, which is what a script could read before this.
 *
 * `ctx.notify`, `ctx.ask` AND `ctx.store` (add-ons phase 4) ARE THERE ONLY FROM A HOST THAT HANDS THEM, as `propose` is, and the
 * runner refuses each for a script whose header does not say it may (`notifies`, `model`, `store`).
 *
 * `ctx.propose(proposal)` IS THERE ONLY FROM A HOST THAT HANDS ONE, as `fold` and `cycle` are. It answers the record's
 * own words for the question, `{ ok, value }` or `{ ok: false, refusal }`, and files nothing until the run is applied.
 */
export const PRELUDE = `(function (host) {
  'use strict';
  const stringify = JSON.stringify;
  const parse = JSON.parse;
  const freeze = Object.freeze;
  const toNumber = Number;
  const whole = Number.isSafeInteger;
  const versionOf = (version) => {
    if (version === undefined || version === null) return NaN;
    const n = toNumber(version);
    if (typeof version === 'object' || !whole(n))
      throw new TypeError(
        'ctx.update takes the version the row was read at, a whole number, and this one is ' +
          (typeof version === 'number' ? String(version) : String(stringify(version))) +
          '; leave it out to write without comparing.',
      );
    return n;
  };
  const response = (text) => {
    const r = parse(text);
    return freeze({
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers: freeze(r.headers),
      text: async () => r.body,
      json: async () => parse(r.body),
    });
  };
  const words = (parts) =>
    parts.map((p) => (typeof p === 'string' ? p : stringify(p))).join(' ');
  const isDay = (v) => typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(v);
  return function build(meta) {
    const today = isDay(meta.today) ? meta.today : String(meta.now).slice(0, 10);
    return freeze({
      input: meta.input,
      tz: meta.tz,
      now: () => meta.now,
      today: () => today,
      fetch: (url, init) =>
        host.fetch(stringify({ url: String(url), init: init === undefined ? null : init })).then(response),
      write: (register, fields) => {
        host.write(String(register), stringify(fields === undefined ? null : fields));
      },
      update: (spoken, patch, version) => {
        const v = versionOf(version);
        host.update(String(spoken), stringify(patch === undefined ? null : patch), v);
      },
      log: (...parts) => {
        host.log(words(parts));
      },
      ...(typeof host.fold === 'function' ? { fold: (text) => host.fold(String(text)).then(parse) } : {}),
      ...(typeof host.cycle === 'function'
        ? { cycle: (day, line) => host.cycle(String(day), stringify(line === undefined ? null : line)).then(parse) }
        : {}),
      ...(typeof host.propose === 'function'
        ? { propose: (proposal) => host.propose(stringify(proposal === undefined ? null : proposal)).then(parse) }
        : {}),
      ...(typeof host.notify === 'function'
        ? { notify: (said) => host.notify(stringify(said === undefined ? null : said)).then(parse) }
        : {}),
      ...(typeof host.ask === 'function' ? { ask: (prompt) => host.ask(String(prompt)).then(parse) } : {}),
      ...(typeof host.storeGet === 'function'
        ? {
            store: freeze({
              get: (key) => host.storeGet(String(key)).then(parse),
              set: (key, value) => host.storeSet(String(key), stringify(value === undefined ? null : value)).then(parse),
            }),
          }
        : {}),
      record: freeze({
        list: (register, where, options) =>
          host
            .list(
              String(register),
              stringify(where === undefined ? null : where),
              stringify(options === undefined ? null : options),
            )
            .then(parse),
        get: (spoken) => host.get(String(spoken)).then(parse),
      }),
    });
  };
})`;
