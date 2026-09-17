/**
 * Sharing a BrainDog's arrangement as a use case, and installing one somebody shared (`loop/research-spark.md` S14).
 *
 * THREE WAYS IN, ONE PLAN. A file picked from the computer, an https address, and a built-in use case from the browse
 * screen all become the same text, which the record's `planUseCase` reads through `readShared` and plans pack by pack.
 * The screen draws that plan and nothing of its own.
 *
 * INSTALLING IS THE EXISTING PATH, NEVER AROUND IT. Each pack in the plan is planned again with `planPack` and installed
 * with `installPack`, its hash and the calls-out lines the owner read. A pack that now calls out a line the plan did not
 * show stops the install there, and the plan is read again for the owner to look at before pressing a second time.
 *
 * PURE, AND THEREFORE TESTABLE, for the reason `packs.ts` gives: the screen only assigns.
 */

import { copy } from '../../lib/copy.ts';
import { callsOutOf, type CallOut } from '../../lib/record/actions.ts';
import type { PackState, Refusal } from '../../lib/record/packs.ts';

type Body = Record<string, unknown>;
type Wire<T> = { ok: true; value: T } | { ok: false; refusal: Refusal } | { ok: false; conflict: unknown };

/** The client methods sharing calls, so a test can hand in an object literal. */
export type SharingClient = {
  planUseCase(args: { doc?: unknown; text?: string; source?: { kind: string; ref?: string }; modules?: Record<string, unknown> }): Promise<Wire<unknown>>;
  exportUseCase(args: { usecase?: string; title?: string; summary?: string; version?: string; audience?: string; examples?: Record<string, number[]> }): Promise<Wire<unknown>>;
  planPack(args: { doc: unknown; source?: { kind: string } }): Promise<Wire<unknown>>;
  installPack(args: { doc: unknown; source?: { kind: string }; planHash: string; approve?: string[] }): Promise<Wire<unknown>>;
  enablePack(args: { id: string }): Promise<Wire<unknown>>;
  disablePack(args: { id: string; alsoDisable?: string[] }): Promise<Wire<unknown>>;
};

const refusalOf = (r: Wire<unknown>): Refusal =>
  r.ok ? { code: 'VALUE_MALFORMED', fix: copy.writeRaced } : 'refusal' in r ? r.refusal : { code: 'VERSION_STALE', fix: copy.writeRaced };

const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/* ── reading a file in ─────────────────────────────────────────────────── */

/** The most an address is read to, a little over what a shared use case may weigh, so the record's refusal is the one said. */
export const URL_MOST_BYTES = 300 * 1024;

/**
 * The text at an https address, or the sentence to say instead. Nothing is sent with the request: no cookie, no key.
 * An address that does not let this page read it (most sites do not) is said as that, with the way round it.
 */
export async function readAddress(address: string, fetcher: typeof fetch = fetch): Promise<{ ok: true; text: string } | { ok: false; fix: string }> {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    return { ok: false, fix: copy.shareAddressNotOne };
  }
  if (url.protocol !== 'https:') return { ok: false, fix: copy.shareAddressHttps };
  let res: Response;
  try {
    res = await fetcher(url, { credentials: 'omit', redirect: 'follow', signal: AbortSignal.timeout(10_000) });
  } catch {
    return { ok: false, fix: copy.shareAddressUnread(url.host) };
  }
  if (!res.ok) return { ok: false, fix: copy.shareAddressAnswered(url.host, res.status) };
  const said = Number(res.headers.get('content-length') ?? '0');
  if (said > URL_MOST_BYTES) return { ok: false, fix: copy.shareTooBig(Math.ceil(said / 1024)) };
  const reader = res.body?.getReader();
  if (!reader) return { ok: true, text: await res.text() };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > URL_MOST_BYTES) {
      await reader.cancel();
      return { ok: false, fix: copy.shareTooBig(Math.ceil(bytes / 1024)) };
    }
    chunks.push(value);
  }
  const all = new Uint8Array(bytes);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(all) };
}

/* ── the plan ──────────────────────────────────────────────────────────── */

export type SharedPack = {
  id: string;
  role: 'module' | 'usecase';
  version: string;
  installedVersion: string | null;
  direction: 'install' | 'upgrade' | 'downgrade' | 'reinstall';
  adds: { kind: 'list' | 'page' | 'other'; name: string }[];
  changes: string[];
  retires: string[];
  conflicts: string[];
  examples: number;
  calls: CallOut[];
  approve: string[];
  doc: Body;
};

export type SharedPlan = {
  usecase: { id: string; title: string; version: string; summary: string; author: string };
  enable: string[];
  packs: SharedPack[];
  approve: string[];
};

/** A declaration id as a person reads it, from the document that declares it: a list's name, a page's title. */
function namesIn(doc: Body): (id: string) => { kind: 'list' | 'page' | 'other'; name: string } {
  const decls = Array.isArray(doc.declarations) ? (doc.declarations as Body[]) : [];
  /* A TITLE MAY READ A SETTING, `{{config:voice_home}}`, and is said as the value this file installs it with. */
  const config = isMap(doc.config) ? doc.config : {};
  const filled = (text: string): string =>
    text.replace(/\{\{config:([a-z0-9_]+)\}\}/gu, (all, key: string) => {
      const d = config[key];
      return isMap(d) && typeof d.default === 'string' ? d.default : all;
    });
  return (id) => {
    const [kind, ...rest] = id.split('.');
    const bare = rest.join('.');
    if (kind === 'register') {
      const d = decls.find((x) => x.register === bare);
      return { kind: 'list', name: typeof d?.name === 'string' ? filled(d.name) : bare };
    }
    if (kind === 'page') {
      const d = decls.find((x) => x.page === bare);
      return { kind: 'page', name: typeof d?.title === 'string' ? filled(d.title) : bare };
    }
    return { kind: 'other', name: bare || id };
  };
}

/** The record's plan, in the screen's words. `null` for an answer this build does not recognise. */
export function sharedPlanOf(value: unknown): SharedPlan | null {
  if (!isMap(value) || !isMap(value.usecase) || !Array.isArray(value.packs)) return null;
  const u = value.usecase;
  const packs: SharedPack[] = [];
  for (const raw of value.packs) {
    if (!isMap(raw) || typeof raw.id !== 'string' || !isMap(raw.doc)) return null;
    const name = namesIn(raw.doc);
    packs.push({
      id: raw.id,
      role: raw.role === 'module' ? 'module' : 'usecase',
      version: String(raw.version ?? ''),
      installedVersion: typeof raw.installed_version === 'string' ? raw.installed_version : null,
      direction: (['install', 'upgrade', 'downgrade', 'reinstall'] as const).find((d) => d === raw.direction) ?? 'install',
      adds: strings(raw.adds).map(name),
      changes: strings(raw.changes).map((id) => name(id).name),
      retires: strings(raw.retires).map((id) => name(id).name),
      conflicts: (Array.isArray(raw.conflicts) ? raw.conflicts : []).flatMap((c) =>
        isMap(c) && typeof c.id === 'string' ? [copy.shareConflict(name(c.id).name, String(c.pack ?? ''))] : [],
      ),
      examples: typeof raw.examples === 'number' ? raw.examples : 0,
      calls: callsOutOf(raw.calls_out),
      approve: strings(raw.approve),
      doc: raw.doc,
    });
  }
  return {
    usecase: { id: String(u.usecase ?? ''), title: String(u.title ?? ''), version: String(u.version ?? ''), summary: String(u.summary ?? ''), author: String(u.author ?? '') },
    enable: strings(value.enable),
    packs,
    approve: strings(value.approve),
  };
}

/**
 * Ask the record to plan a shared use case. The modules it needs that this record does not hold are sent as the app
 * builds them for this record (`packDocument`), because a host with no catalogue cannot offer them by name.
 */
export async function planShared(
  client: SharingClient,
  file: { text: string; source: 'paste' | 'url' | 'local'; ref?: string },
  installed: readonly PackState[],
  moduleDoc: (id: string, installed: readonly PackState[]) => Promise<Body | null>,
): Promise<{ ok: true; plan: SharedPlan } | { ok: false; fix: string }> {
  const { readShared } = await import('@braindog/declare');
  const read = await readShared(file.text, { kind: file.source });
  if (!read.ok) return { ok: false, fix: 'refusal' in read ? read.refusal.fix : copy.writeRaced };
  const modules: Record<string, unknown> = {};
  for (const m of read.value.usecase.modules) {
    if (installed.some((p) => p.id === m)) continue;
    const doc = await moduleDoc(m, installed);
    if (doc) modules[m] = doc;
  }
  const out = await client.planUseCase({
    text: file.text,
    source: { kind: file.source, ...(file.ref === undefined ? {} : { ref: file.ref }) },
    ...(Object.keys(modules).length === 0 ? {} : { modules }),
  });
  if (!out.ok) return { ok: false, fix: refusalOf(out).fix };
  const plan = sharedPlanOf(out.value);
  return plan ? { ok: true, plan } : { ok: false, fix: copy.writeRaced };
}

/** Whether a plan can be installed as it stands: nothing in it takes over another pack's list or page. */
export const installable = (plan: SharedPlan): boolean => plan.packs.every((p) => p.conflicts.length === 0);

/**
 * Install the plan that was read, a pack at a time through `planPack` and `installPack`. The modules that are off are
 * turned on first. Answers the packs that went in, and the sentence that stopped it, if one did.
 */
export async function installShared(client: SharingClient, plan: SharedPlan): Promise<{ ok: boolean; done: string[]; fix: string | null; stale: boolean }> {
  const done: string[] = [];
  for (const id of plan.enable) {
    const on = await client.enablePack({ id });
    if (!on.ok) return { ok: false, done, fix: refusalOf(on).fix, stale: false };
    done.push(id);
  }
  for (const pack of plan.packs) {
    const planned = await client.planPack({ doc: pack.doc, source: { kind: 'local' } });
    if (!planned.ok) return { ok: false, done, fix: refusalOf(planned).fix, stale: false };
    const diff = isMap(planned.value) && isMap(planned.value.diff) ? planned.value.diff : null;
    const planHash = typeof diff?.planHash === 'string' ? diff.planHash : '';
    const approve = strings(diff?.approve);
    const unshown = approve.filter((line) => !plan.approve.includes(line));
    if (planHash === '' || unshown.length > 0) return { ok: false, done, fix: copy.shareStale, stale: true };
    const put = await client.installPack({ doc: pack.doc, source: { kind: 'local' }, planHash, ...(approve.length === 0 ? {} : { approve }) });
    if (!put.ok) {
      const refusal = refusalOf(put);
      return { ok: false, done, fix: refusal.fix, stale: refusal.code === 'PLAN_STALE' };
    }
    done.push(pack.id);
  }
  return { ok: true, done, fix: null, stale: false };
}

/* ── switching between use cases ───────────────────────────────────────── */

/** The use case this record speaks as: the enabled `usecase-*` pack's id without its prefix, or `null`. */
export const speakingOf = (states: readonly PackState[]): string | null =>
  states.find((s) => s.id.startsWith('usecase-') && s.disabled_at === null)?.id.slice('usecase-'.length) ?? null;

/** What a browse card offers for a use case on this record. */
export type Offer = 'in-use' | 'switch' | 'install';

export function offerFor(id: string, states: readonly PackState[], carriesPack: boolean): Offer {
  const speaking = speakingOf(states);
  if (!carriesPack) return speaking === null ? 'in-use' : 'switch';
  if (speaking === id) return 'in-use';
  return states.some((s) => s.id === `usecase-${id}`) ? 'switch' : 'install';
}

/**
 * Switch to a use case this record already holds: turn its pack on, then the one speaking now off, so the voice and Home
 * follow. A use case that carries no pack (the house voice) is switched to by turning the one speaking off.
 */
export async function switchTo(client: SharingClient, id: string, states: readonly PackState[], carriesPack: boolean): Promise<{ ok: true } | { ok: false; fix: string }> {
  if (carriesPack) {
    const on = await client.enablePack({ id: `usecase-${id}` });
    if (!on.ok) return { ok: false, fix: refusalOf(on).fix };
  }
  for (const s of states)
    if (s.id.startsWith('usecase-') && s.id !== `usecase-${id}` && s.disabled_at === null) {
      const off = await client.disablePack({ id: s.id });
      if (!off.ok) return { ok: false, fix: refusalOf(off).fix };
    }
  return { ok: true };
}

/* ── going out ─────────────────────────────────────────────────────────── */

/** The file `exportUseCase` answered, ready to save, or the sentence to say instead. */
export async function exportShared(
  client: SharingClient,
  args: Parameters<SharingClient['exportUseCase']>[0],
): Promise<{ ok: true; file: string; text: string; bytes: number } | { ok: false; fix: string; at: string | null }> {
  const out = await client.exportUseCase(args);
  if (!out.ok) {
    const refusal = refusalOf(out);
    return { ok: false, fix: refusal.fix, at: refusal.at ?? null };
  }
  const v = out.value;
  if (!isMap(v) || typeof v.file !== 'string' || !isMap(v.doc)) return { ok: false, fix: copy.writeRaced, at: null };
  const text = `${JSON.stringify(v.doc, null, 2)}\n`;
  return { ok: true, file: v.file, text, bytes: new TextEncoder().encode(text).length };
}

/** The version a share offers first: the patch after the one installed, as the record would pick. */
export function nextPatch(was: string | null): string {
  const m = /^(\d+)\.(\d+)\.(\d+)/u.exec(was ?? '');
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : '1.0.0';
}

/** A row as a person picks it from a list they know: its first line of text. */
export function rowTitle(fields: Readonly<Record<string, unknown>>): string {
  for (const key of ['name', 'what', 'title']) if (typeof fields[key] === 'string' && (fields[key] as string).trim() !== '') return fields[key] as string;
  for (const v of Object.values(fields)) if (typeof v === 'string' && v.trim() !== '' && !/^\d{4}-\d{2}-\d{2}/u.test(v)) return v;
  return '';
}

/** A list id in words, for a list the build does not ship a name for. */
export const listWords = (id: string): string => (id.charAt(0).toUpperCase() + id.slice(1)).replaceAll('_', ' ');
