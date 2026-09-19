/**
 * The two single requests that are not part of a page loop: the run's one preflight, and the one
 * call a bind screen makes before it will keep a credential.
 *
 * A PROBE IS ONE REQUEST AND IS NOT CHAINED. `47 §10` puts that at the top of the ceiling list: a
 * probe reads values a later request substitutes, and a probe that could read a value for a second
 * probe is a program. One `GET`, the named paths off its body, and the run continues.
 *
 * `proveScopes` REPORTS AND DOES NOT REFUSE. It runs while somebody is looking at a bind screen,
 * and the answer that helps them is *the provider said 403* rather than a thrown refusal three
 * frames up. So the status comes back as a number and only a fault in the transport throws.
 *
 * AND IT READS TWO HEADERS AND OTHERWISE ANSWERS `null` (`47 §10`). There is no per-provider scope
 * table here, because a table of eight providers is a table that is wrong about the ninth and looks
 * authoritative doing it. `proven: null` is what the bind screen turns into *"this token may do
 * more than read"* — a true sentence, where an invented scope list would be a false one.
 */

import { readPath } from '@braindog/where';

import { applyAuth, tokenStep } from './auth.ts';
import { firstPage } from './page.ts';
import { resolveRequest } from './request.ts';
import { classify } from './status.ts';
import { onBase, parse, send, staticHeaders, type Wired } from './wire.ts';
import { PullError, type FetchDecl, type Grant, type Scalar } from './index.ts';

type Deps = Wired;

/**
 * The single preflight, and the values it names (`25 §5.3`).
 *
 * A MISSING PATH IS A REFUSAL AND NOT AN ABSENT PLACEHOLDER. `{probe.account}` that quietly became
 * the empty string is a request to the wrong account's endpoint, answered 200, written to the
 * record — the failure this whole package is arranged around. So the path that did not read names
 * itself, and the run stops before it asks for anything.
 */
export async function probe(
  decl: FetchDecl,
  grant: Grant,
  token: string | null,
  deps: Deps,
): Promise<Record<string, Scalar>> {
  const declared = decl.probe;
  if (declared === undefined) return {};

  const at = 'fetch.probe';
  const url = onBase(decl, declared.path, `${at}.path`);

  const req = await applyAuth(decl, grant, { url, method: 'GET', headers: staticHeaders(decl) }, token, deps.clock.now());
  const res = await send(req, decl, deps, at);
  classify(decl, res, deps.clock.now(), at);

  const json = parse(await res.text(), at);
  const out: Record<string, Scalar> = {};
  for (const [name, path] of Object.entries(declared.read)) {
    const found = readPath(json, path);
    if (found === undefined || Array.isArray(found) || (found !== null && typeof found === 'object'))
      throw new PullError('PULL_SHAPE_MISMATCH', `${at}.read.${name}`, { found, wanted: `one value at ${path}` });
    out[name] = found;
  }
  return out;
}

/** Comma-separated scopes off a header, trimmed, empties dropped. */
const scopesIn = (header: string | null): string[] | null =>
  header === null ? null : header.split(',').map((s) => s.trim()).filter((s) => s !== '');

/**
 * One authenticated call with a candidate grant, before it is kept (`25 §7` rule 6).
 *
 * THE PROBE PATH IS PREFERRED AND PAGE 1 IS THE FALLBACK, because a probe is by construction the
 * cheapest authenticated thing this declaration can ask for. Page 1 is built with a zero-width
 * window at the current instant: nothing is written, nothing is read out of it, and the only
 * question being asked is whether the provider will answer this credential at all.
 *
 * A STATUS IS A NUMBER AND NOT A THROW. 401 here is the answer the screen exists to show.
 */
export async function proveScopes(
  decl: FetchDecl,
  grant: Grant,
  deps: Deps,
): Promise<{ ok: boolean; proven: string[] | null; status: number }> {
  const at = 'fetch.auth';
  const now = deps.clock.now();
  const { token } = await tokenStep(decl, grant, deps);

  const plain =
    decl.probe === undefined
      ? resolveRequest(decl, firstPage(decl), grant, {}, { since: now, until: now }, 'UTC')
      : { url: onBase(decl, decl.probe.path, 'fetch.probe.path'), method: 'GET' as const, headers: staticHeaders(decl) };

  const req = await applyAuth(decl, grant, plain, token, now);
  const res = await send(req, decl, deps, at);

  const proven = scopesIn(res.headers.get('x-oauth-scopes')) ?? scopesIn(res.headers.get('x-accepted-github-permissions'));
  const wanted = 'require_scopes' in decl.auth ? (decl.auth.require_scopes ?? []) : [];
  /* A PROVIDER THAT STATES NOTHING IS NOT A PROVIDER THAT REFUSED. `proven: null` with a 200 is
     `ok`, and the screen says the token may do more than read — which is true, and is the thing a
     person can act on. Failing the bind here would make every provider but two unusable. */
  const enough = proven === null || wanted.every((scope) => proven.includes(scope));

  return { ok: res.ok && enough, proven, status: res.status };
}
