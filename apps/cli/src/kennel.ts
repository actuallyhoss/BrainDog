/**
 * The Kennel from this machine: submitting, yanking and searching as an author (`pack publish --kennel`, `pack yank`,
 * `pack search` with no `--from`), and `braindog kennel review` as its operator, over
 * `/api/kennel/v1/`.
 *
 * A KENNEL IS A CATALOGUE AT AN ADDRESS. Its reads (`index.json`, `packs/<id>/<version>.pack.json`) are laid out as a
 * catalogue folder is, so searching it and installing from it go through `catalogue.ts`'s own address reader; only the
 * writes are here.
 *
 * WHO PUBLISHES IS SAID BY A SIGNATURE OR BY A SIGN-IN, never both and never neither. With `--sign <key file>` the file
 * goes with the author's signature over its kind, id, version and checksum; without it, with the bearer this machine
 * holds for that Kennel's host (`braindog login`). The token is read for that host only: `BRAINDOG_TOKEN` goes with it
 * only when `BRAINDOG_HOST` names the same host, so a token meant for one record is never sent to another host.
 *
 * THE OPERATOR IS `PROVISION_KEY` IN THE ENVIRONMENT, sent as the bearer to the review and publisher doors and nowhere
 * else. `review show` and `review list` read the waiting file whole and plan it in a scratch record on this machine
 * (`scratch.ts`), so the operator sees every refusal the record would give before a stranger's file is listed, and the
 * preview a listing carries is the record's own drawing of its pages, never the author's picture of them.
 */

import { parseArgs } from 'node:util';

import {
  fileChecksum,
  readCatalogueFile,
  signVersion,
  type AuthorKey,
  type CatalogueFile,
  type EntryKind,
  type Reach,
  type Signature,
} from '@braindog/declare/catalogue';
import { DEFAULT_KENNEL, KENNEL_BASE, publisherKey, readAdvise, signYank, type Advisory, type Pending, type Refused, type Report } from '@braindog/declare/kennel';
import { no, ok, refused, type Refusal, type Result } from '@braindog/ports';

import { oneLine, printable } from './clip.ts';
import { budgetOf, hostKey, hostsPath, inTheClear, isLoopback, target } from './http.ts';
import { refuse } from './json.ts';
import { checkInScratch, previewOf } from './scratch.ts';
import type { AgentIo } from './skills.ts';
import { saidDay } from './said-day.ts';

const saidWithCode = (r: Result<unknown>): string => (refused(r) ? oneLine(`${r.refusal.fix} (${r.refusal.code})`) : 'The Kennel did not answer that.');
const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const FILE_NAME = /\.(json|ya?ml)$/iu;

/* ── where the Kennel is ────────────────────────────────────────────────── */

/**
 * `--kennel [host]` taken out of the arguments: `undefined` when it is not there, `null` when it names no host (the
 * public Kennel), or the host. A bare `--kennel` is followed by the file more often than by a host, so the next word is
 * a host only when it reads as one: not a flag, not a file name, and holding a dot, a colon or `localhost`.
 */
export function takeKennel(args: readonly string[]): { rest: string[]; kennel: string | null | undefined } {
  const rest: string[] = [];
  let kennel: string | null | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (a.startsWith('--kennel=')) {
      kennel = a.slice('--kennel='.length) || null;
      continue;
    }
    if (a !== '--kennel') {
      rest.push(a);
      continue;
    }
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith('-') && !FILE_NAME.test(next) && (/[.:]/u.test(next) || next === 'localhost')) {
      kennel = next;
      i += 1;
    } else kennel = null;
  }
  return { rest, kennel };
}

/** The Kennel's base address for a host named on the command line, or the public Kennel for none. Throws one sentence. */
export function kennelBase(given: string | null | undefined): string {
  if (given === undefined || given === null || given === '') return DEFAULT_KENNEL;
  const bare = !/^[a-z][a-z0-9+.-]*:\/\//iu.test(given);
  const url = new URL(bare ? `${isLoopback(given.split(':')[0] ?? '') ? 'http' : 'https'}://${given}` : given);
  if (inTheClear(url)) throw new Error(`${url.origin} is http, not https. A Kennel is reached over https, except on this machine.`);
  return url.pathname.endsWith(KENNEL_BASE) ? url.href : new URL(KENNEL_BASE, url.origin).href;
}

/** The person's bearer this machine holds for the Kennel's host, or nothing. */
function personBearer(base: string, io: AgentIo): string | undefined {
  const origin = new URL(base).origin;
  try {
    const named = io.env.BRAINDOG_HOST ? new URL(hostKey(io.env.BRAINDOG_HOST)).origin : null;
    const env = named === origin ? io.env : { ...io.env, BRAINDOG_TOKEN: undefined };
    return target(origin, env, hostsPath(io.env)).token;
  } catch {
    return undefined;
  }
}

/**
 * One request to the Kennel, read as its `/api` envelope: `{ ok: true, value }` or `{ ok: false, refusal }`.
 *
 * A REDIRECT IS REFUSED, as the typed client refuses one, because following it would carry a bearer somewhere nobody
 * chose. A refusal is a stranger's words when the Kennel is somebody else's, so it is scrubbed before anyone prints it.
 */
export async function kennelCall<T>(base: string, path: string, io: AgentIo, init: { method?: 'GET' | 'POST'; body?: unknown; bearer?: string | undefined } = {}): Promise<Result<T>> {
  const url = new URL(path, base);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.bearer !== undefined) headers.authorization = `Bearer ${init.bearer}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(budgetOf(io.env)),
    });
  } catch {
    return no('UNREACHABLE', `The Kennel at ${url.origin} did not answer.`);
  }
  let doc: unknown;
  try {
    doc = await res.json();
  } catch {
    return no('UNREACHABLE', `The Kennel at ${url.origin} answered ${res.status} with no answer it could read.`);
  }
  if (isMap(doc) && doc.ok === true && 'value' in doc) return ok(doc.value as T);
  if (isMap(doc) && doc.ok === false && isMap(doc.refusal) && typeof doc.refusal.code === 'string' && typeof doc.refusal.fix === 'string')
    return { ok: false, refusal: printable(doc.refusal) as Refusal };
  return no('UNREACHABLE', `The Kennel at ${url.origin} answered ${res.status} with no answer it could read.`);
}

/* ── an author's writes ─────────────────────────────────────────────────── */

type Answered = { state: string; kind: EntryKind; id: string; version: string };

/** `publish <file> --kennel [host] [--sign <key file>]`: the file submitted, and whether it listed or waits for review. */
export async function submitToKennel(text: string, file: CatalogueFile, given: string | null, signer: AuthorKey | undefined, io: AgentIo): Promise<number> {
  let base: string;
  try {
    base = kennelBase(given);
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'That is not a Kennel address.');
    return 1;
  }
  const origin = new URL(base).origin;
  const [kind, id, version, title] =
    file.kind === 'pack'
      ? (['pack', file.file.pack.manifest.pack, file.file.pack.manifest.version, file.file.title] as const)
      : (['usecase', file.shared.usecase.usecase, file.shared.usecase.version, file.shared.usecase.title] as const);
  let signature: Signature | undefined;
  if (signer !== undefined) {
    const signed = await signVersion(signer, kind, id, version, await fileChecksum(text));
    if (!signed.ok) return refuse(io, signed, saidWithCode(signed));
    signature = signed.value;
  }
  const bearer = signature === undefined ? personBearer(base, io) : undefined;
  if (signature === undefined && bearer === undefined) {
    io.say(`The Kennel needs to know who publishes this: sign it with --sign <key file>, or sign in with braindog login ${origin}. Nothing was sent.`);
    return 1;
  }
  const body = { text, ...(signature === undefined ? {} : { signature, publisher: { name: signer!.author } }) };
  const answer = await kennelCall<Answered>(base, 'submit', io, { method: 'POST', body, bearer });
  if (!answer.ok) return refuse(io, answer, saidWithCode(answer));
  const named = `${oneLine(title)} ${oneLine(version)}`;
  io.answer?.({ value: answer.value });
  io.out(
    answer.value.state === 'listed'
      ? `${named} is listed on the Kennel at ${origin}${signature ? `, signed by key ${signature.key_id}` : ''}. Anyone can find it with braindog ${kind} search and install it by its id.`
      : `${named} is with the Kennel at ${origin}, waiting for review. It is listed once the operator has looked at it; nothing is offered until then.`,
  );
  return 0;
}

/** `yank <id> <version> --reason <why> [--kennel host] [--sign <key file>]`: a version taken back, said to its readers with the reason. */
export async function yankFromKennel(
  kind: EntryKind,
  id: string,
  version: string,
  reason: string,
  given: string | null | undefined,
  signer: AuthorKey | undefined,
  io: AgentIo,
): Promise<number> {
  let base: string;
  try {
    base = kennelBase(given);
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'That is not a Kennel address.');
    return 1;
  }
  let signature: Signature | undefined;
  if (signer !== undefined) {
    const signed = await signYank(signer, kind, id, version, reason);
    if (!signed.ok) return refuse(io, signed, saidWithCode(signed));
    signature = signed.value;
  }
  /* THE AUTHOR'S KEY, OR THE PERSON WHO PUBLISHED IT, OR THE OPERATOR, in that order: each is a yank the Kennel takes. */
  const bearer = signature === undefined ? (personBearer(base, io) ?? (io.env.PROVISION_KEY || undefined)) : undefined;
  if (signature === undefined && bearer === undefined) {
    io.say(`The Kennel takes a version back only from its author: sign the yank with --sign <key file>, or sign in with braindog login ${new URL(base).origin}. Nothing was sent.`);
    return 1;
  }
  const answer = await kennelCall<Answered>(base, 'yank', io, { method: 'POST', body: { kind, id, version, reason, ...(signature ? { signature } : {}) }, bearer });
  if (!answer.ok) return refuse(io, answer, saidWithCode(answer));
  io.answer?.({ value: answer.value });
  io.out(`${oneLine(id)} ${oneLine(version)} is taken back on the Kennel. It is never offered again, a BrainDog that holds it is told why, and it can still be fetched by its exact version.`);
  return 0;
}

/* ── the operator's review ──────────────────────────────────────────────── */

const REVIEW_USAGE =
  'braindog kennel advise ... is the kill switch (braindog kennel advise for how). braindog kennel review takes nothing (what waits), show <kind> <id> <version>, list <kind> <id> <version> [--reason <why>], refuse <kind> <id> <version> --reason <why>, or trust <publisher> [--probe], each with --kennel <host> for a Kennel other than the public one.';

/** What a version reaches, as the review says it: one line for lists and pages, and every calls-out line on its own. */
function reachSaid(given: Reach): string[] {
  const reach = printable(given);
  const list = (xs: readonly string[]) => (xs.length === 0 ? 'none' : xs.join(', '));
  return [
    `  Installs first: ${list(reach.modules)}. Adds lists: ${list(reach.lists)}; pages: ${list(reach.pages)}; rules: ${list(reach.rules)}; ${reach.examples} example rows.`,
    ...(reach.calls_out.length === 0 ? ['  Calls out to: nothing. It reads and writes only the BrainDog it is installed in.'] : reach.calls_out.map((c) => `  Calls out: ${c.line}`)),
  ];
}

type Waiting = Pick<Pending, 'entry' | 'version' | 'submitted_at' | 'flags' | 'added' | 'note'> & { text: string };

/**
 * What the Kennel marked on a waiting submission for the reviewer: names close to listed ones, what it reaches that the
 * version before did not, and the model's note, which is said as the model's and decides nothing.
 */
function marksSaid(p: Pick<Pending, 'flags' | 'added' | 'note'>): string[] {
  const shown = printable({ flags: p.flags ?? [], added: p.added ?? [], note: p.note?.text ?? null });
  return [
    ...shown.flags.map((f) => `  Look twice: ${oneLine(f)}`),
    ...shown.added.map((a) => `  New in this version: ${oneLine(a)}`),
    ...(shown.note === null ? [] : [`  The model's note (it decides nothing): ${oneLine(shown.note)}`]),
  ];
}

const ADVISE_USAGE =
  'braindog kennel advise <kind> <id> --versions <1.2.0,<1.3.0 or *> --action warn|disable --reason <why> [--severity low|high|critical], or braindog kennel advise withdraw <kind> <id>, each with --kennel <host>.';

/**
 * `braindog kennel advise`, the operator's kill switch: a warning or a switch-off for every record holding the add-on at
 * those versions, read beside the index. Withdrawn, records stop hearing it; one already off stays off until its owner
 * turns it back on.
 */
async function advise(args: string[], io: AgentIo): Promise<number> {
  const { rest, kennel: given } = takeKennel(args);
  let values: { versions?: string | undefined; action?: string | undefined; reason?: string | undefined; severity?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      strict: true,
      options: { versions: { type: 'string' }, action: { type: 'string' }, reason: { type: 'string' }, severity: { type: 'string' } },
    }));
  } catch {
    io.say(ADVISE_USAGE);
    return 1;
  }
  const operator = io.env.PROVISION_KEY;
  if (!operator) {
    io.say("braindog kennel advise is the operator's, and takes the operator key: set PROVISION_KEY in the environment. Nothing was sent.");
    return 1;
  }
  let base: string;
  try {
    base = kennelBase(given);
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'That is not a Kennel address.');
    return 1;
  }
  const withdraw = positionals[0] === 'withdraw';
  const [kind, id, ...extra] = withdraw ? positionals.slice(1) : positionals;
  if (kind === undefined || id === undefined || extra.length > 0) {
    io.say(ADVISE_USAGE);
    return 1;
  }
  const body = withdraw
    ? { kind, id, action: 'withdraw' }
    : { kind, id, versions: (values.versions ?? '').split(',').map((v) => v.trim()).filter((v) => v !== ''), action: values.action, reason: values.reason, ...(values.severity === undefined ? {} : { severity: values.severity }) };
  /* READ HERE AS THE DOOR READS IT, so a wrong flag is said before anything is sent. */
  const asked = readAdvise(body);
  if (!asked.ok) return refuse(io, asked, saidWithCode(asked));
  const got = await kennelCall<{ state: string; at?: string }>(base, 'advise', io, { method: 'POST', body, bearer: operator });
  if (!got.ok) return refuse(io, got, saidWithCode(got));
  io.answer?.({ value: got.value });
  const a = asked.value;
  io.out(
    a.action === 'withdraw'
      ? `Every advisory on ${oneLine(id)} is withdrawn. A BrainDog that turned it off keeps it off until its owner turns it back on.`
      : a.action === 'disable'
        ? `${oneLine(id)} ${oneLine(a.versions.join(', '))} is switched off on every BrainDog that holds it, the next time each reads the Kennel (within the hour), with one card saying why.`
        : `Every BrainDog holding ${oneLine(id)} ${oneLine(a.versions.join(', '))} is asked on Needs you whether to turn it off, with the reason, the next time it reads the Kennel.`,
  );
  return 0;
}

/** `braindog kennel review ...`, the operator's half of the Kennel. */
export async function kennel(args: string[], io: AgentIo): Promise<number> {
  const [noun, ...after] = args;
  if (noun === 'advise') return advise(after, io);
  if (noun !== 'review') {
    io.say(REVIEW_USAGE);
    return 1;
  }
  const { rest, kennel: given } = takeKennel(after);
  let values: { reason?: string | undefined; probe?: boolean | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true, options: { reason: { type: 'string' }, probe: { type: 'boolean' } } }));
  } catch {
    io.say(REVIEW_USAGE);
    return 1;
  }
  const operator = io.env.PROVISION_KEY;
  if (!operator) {
    io.say("braindog kennel review is the operator's, and takes the operator key: set PROVISION_KEY in the environment. Nothing was sent.");
    return 1;
  }
  let base: string;
  try {
    base = kennelBase(given);
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'That is not a Kennel address.');
    return 1;
  }
  const [verb, ...more] = positionals;

  if (verb === undefined) {
    const got = await kennelCall<{ pending: Pending[]; refused: Refused[]; reports?: Report[]; advisories?: Advisory[] }>(base, 'review', io, { bearer: operator });
    if (!got.ok) return refuse(io, got, saidWithCode(got));
    io.answer?.({ value: got.value });
    const { pending, refused: turned } = got.value;
    if (pending.length === 0) io.out('Nothing is waiting for review.');
    for (const p of pending) {
      const shown = printable(p);
      io.out(`${shown.entry.kind} ${shown.entry.id} ${shown.version.version}  ${shown.entry.title} by ${shown.entry.publisher.name} (${publisherKey(p.entry.publisher)}), sent ${saidDay(shown.submitted_at)}`);
      for (const line of reachSaid(p.version.reach)) io.out(line);
      for (const line of marksSaid(p)) io.out(line);
    }
    const reports = got.value.reports ?? [];
    if (reports.length > 0) io.out(`Reported lately: ${reports.slice(0, 5).map((r) => oneLine(`${r.kind} ${r.id}${r.version === null ? '' : ` ${r.version}`} (${r.why})`)).join('; ')}.`);
    const advised = got.value.advisories ?? [];
    if (advised.length > 0) io.out(`Advisories standing: ${advised.map((a) => oneLine(`${a.id} ${a.versions.join(',')} ${a.action}`)).join('; ')}.`);
    if (turned.length > 0) io.out(`Refused lately: ${turned.slice(0, 5).map((r) => oneLine(`${r.kind} ${r.id} ${r.version} (${r.reason})`)).join('; ')}.`);
    return 0;
  }

  if (verb === 'trust') {
    const [publisher, ...extra] = more;
    if (publisher === undefined || extra.length > 0) {
      io.say('braindog kennel review trust takes one publisher as the review list names it, key:<key id> or person:<person id>.');
      return 1;
    }
    /* `--probe` MARKS THE NIGHTLY PROBE'S KEY, the one publisher the Kennel takes ids beginning `probe-` from. Trusted
       again without it, the key keeps its trust and loses the prefix. */
    const probe = values.probe === true;
    const got = await kennelCall<unknown>(base, 'publisher', io, { method: 'POST', body: { publisher, trusted: true, ...(probe ? { probe: true } : {}) }, bearer: operator });
    if (!got.ok) return refuse(io, got, saidWithCode(got));
    io.out(
      probe
        ? `${oneLine(publisher)} is trusted as the nightly probe: what they submit is listed at once, and only they may publish plugins whose ids begin probe-.`
        : `${oneLine(publisher)} is trusted: what they submit from now on is listed at once, without waiting for review.`,
    );
    return 0;
  }

  if (verb !== 'show' && verb !== 'list' && verb !== 'refuse') {
    io.say(REVIEW_USAGE);
    return 1;
  }
  const [kind, id, version, ...extra] = more;
  if ((kind !== 'pack' && kind !== 'usecase') || id === undefined || version === undefined || extra.length > 0) {
    io.say(`braindog kennel review ${verb} takes a kind (pack or usecase), an id and a version, as the review list names them.`);
    return 1;
  }

  if (verb === 'refuse') {
    const reason = values.reason?.trim() ?? '';
    if (reason === '') {
      io.say('A refusal always says why: pass --reason <why>. The author reads it.');
      return 1;
    }
    const got = await kennelCall<unknown>(base, 'review', io, { method: 'POST', body: { kind, id, version, verdict: 'refuse', reason }, bearer: operator });
    if (!got.ok) return refuse(io, got, saidWithCode(got));
    io.out(`${oneLine(`${kind} ${id} ${version}`)} is refused, and the next look at the review list says why.`);
    return 0;
  }

  /* SHOW AND LIST BOTH READ THE WAITING FILE WHOLE and plan it here, scripts' source included. */
  const query = new URLSearchParams({ kind, id, version });
  const got = await kennelCall<Waiting>(base, `review?${query.toString()}`, io, { bearer: operator });
  if (!got.ok) return refuse(io, got, saidWithCode(got));
  const waiting = got.value;
  const read = await readCatalogueFile(waiting.text, { kind: 'kennel', ref: base });
  if (!read.ok) {
    refuse(io, read, `The waiting file no longer reads: ${saidWithCode(read)}`);
    return 1;
  }
  const shown = printable({ title: waiting.entry.title, author: waiting.entry.author, publisher: waiting.entry.publisher.name });
  io.out(`${shown.title} ${oneLine(version)} by ${shown.author}, sent by ${shown.publisher} (${publisherKey(waiting.entry.publisher)}).`);
  for (const line of reachSaid(waiting.version.reach)) io.out(line);
  for (const line of marksSaid(waiting)) io.out(line);
  const now = new Date();
  const checked = await checkInScratch(read.value, true, now.getTime());
  for (const line of checked.lines) io.out(line);
  if (!checked.ok || checked.held === null) {
    checked.held?.scratch.close();
    io.out(verb === 'show' ? 'It does not install cleanly. Refuse it with the refusal above as the reason.' : 'It does not install cleanly, so it is not listed. Nothing was sent.');
    return verb === 'show' ? 0 : 1;
  }
  const { scratch, added } = checked.held;
  try {
    if (verb === 'show') {
      io.out(`It installs with its example rows and every page it adds draws. List it with braindog kennel review list ${kind} ${id} ${version}.`);
      return 0;
    }
    const preview = previewOf(scratch, added, now);
    if (!preview.ok) return refuse(io, preview, `Its pages did not draw for the preview: ${saidWithCode(preview)} Nothing was sent.`);
    const reason = values.reason?.trim() ?? '';
    const sent = await kennelCall<unknown>(base, 'review', io, { method: 'POST', body: { kind, id, version, verdict: 'list', reason, preview: preview.value }, bearer: operator });
    if (!sent.ok) return refuse(io, sent, saidWithCode(sent));
    io.out(`${shown.title} ${oneLine(version)} is listed, with a preview of ${added.length === 1 ? 'its one page' : `its ${added.length} pages`} as BrainDog draws them.`);
    return 0;
  } finally {
    scratch.close();
  }
}
