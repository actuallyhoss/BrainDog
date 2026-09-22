/**
 * THE PRELUDE: the JavaScript that builds `ctx` inside the sandbox, from host functions.
 *
 * It is a string because it runs on the other side of the boundary, in QuickJS on the self-host and
 * as a module beside the source in a Dynamic Worker on Cloud (section 3 of the design). One text on
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
 * `null` crossed as that `0`, and a typo crossed as the same `NaN` as no version at all (audit
 * thirty-four, finding 6). A version given that is not a whole number now stops the run here,
 * where the sentence can name the call that was wrong. This is a courtesy to the author and not a
 * check: a script that goes around it can only choose not to compare, which it may do anyway.
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
  return function build(meta) {
    return freeze({
      input: meta.input,
      tz: meta.tz,
      now: () => meta.now,
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
      record: freeze({
        list: (register, where) =>
          host.list(String(register), stringify(where === undefined ? null : where)).then(parse),
        get: (spoken) => host.get(String(spoken)).then(parse),
      }),
    });
  };
})`;
