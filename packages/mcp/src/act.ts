/**
 * `act`: one door for everything the app does, by the name of the record call the app makes.
 *
 * ONE TOOL, NOT TWO HUNDRED. The owner asked (1 Nov) that an agent can do everything through the MCP, "and I mean
 * everything". Every screen of the app reaches the record through one table of calls (`@braindog/host/table`), so the
 * door is that table: `act {call, args}` runs one call with the caller's own context, through the same handler the app's
 * `/api/<call>` runs (`callRoute` in `@braindog/host`). Who may do what stays the record's to say, in its own sentence:
 * a token's write meets the ladder there, a token reaching what only an owner in a browser may do is refused there,
 * and whatever the owner switches on for his agents applies here because it applies there. The list of calls is a
 * resource (`braindog:calls`), read when wanted, so the tool list pays for one tool.
 *
 * WHAT NEVER GOES THROUGH IT, whatever the record would say: a call that carries a key's value in or out (the keychain,
 * a sealed file), the runner's job protocol, and the three the owner always keeps: deleting the whole BrainDog, erasing a
 * person for good and giving the BrainDog away (`deleteRecord`, `erase`, `handOver`). A key is deposited with
 * `braindog keys put`, which reads standard input, and nowhere else. Minting a key, an ingest address, letting a device
 * in, an import and a restore go to the record, which lets the owner's own agent make them while he lets agents do
 * everything without asking, or on his word sent as `said`, and refuses anybody else (the owner's word of 2 Nov).
 *
 * A CALL ONLY AN OWNER IN A BROWSER MAKES IS ASKED INSTEAD, WHERE ASKING CAN SAY IT: turning an add-on on or off,
 * installing one, its settings, and a declaration, each the `propose` body the app's Decide already applies. Asked, it
 * meets the ladder and the owner's rules like any question, so it lands at once where he lets it.
 */

import type { Refusal, Result } from '@braindog/ports';

/** One row of the record's call table, as the host hands it over: `ROUTES` in `@braindog/host/table`. */
export type CallRow = { name: string; group: string; writes: boolean; what: string };

/** The groups of the table this door reaches. KEYCHAIN, JOBS and INTERNAL are a browser's, a runner's and the host's. */
const DOOR_GROUPS: ReadonlySet<string> = new Set(['DATA', 'READ+', 'ADMIN']);

/**
 * THE KEYCHAIN CALLS THAT CARRY NO VALUE, AND ONLY THOSE: what each key opens, which tools need which, which machine may
 * open which, and taking one out of service. The record still refuses every token at the keychain's own gate, and taking
 * a key out is then asked (`keyAsk`), so it is the owner's yes, through the ladder, that deletes a key's row.
 */
const KEYCHAIN_OPEN: ReadonlySet<string> = new Set(['listGrants', 'keyUses', 'keyAccess', 'revokeGrant']);

/** Calls never made through this door, each with why, said when one is asked for. */
export const NEVER: Readonly<Record<string, string>> = {
  createOwnToken: 'it answers a new key, and a key never travels through an agent',
  openShare: 'a link is signed by the app for the owner in a browser',
  sealedPut: 'a sealed file is the owner’s own, in the app',
  sealedGet: 'a sealed file is the owner’s own, in the app',
  sealedList: 'a sealed file is the owner’s own, in the app',
  sealedDelete: 'a sealed file is the owner’s own, in the app',
  erase: 'it erases a person for good, which the owner does in the app',
  deleteRecord: 'it deletes this BrainDog, which only the owner does, in the app',
  handOver: 'it gives this BrainDog away, which only the owner does, in the app',
  reads: 'call each read with its own act',
};

/** Whether this door may make a call, from its row. */
export const doorTakes = (row: CallRow): boolean => (DOOR_GROUPS.has(row.group) || KEYCHAIN_OPEN.has(row.name)) && !Object.hasOwn(NEVER, row.name);

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const map = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/**
 * A short mark of a file's text, so the same add-on file asked twice is asked once and a changed one is a new question
 * (`propose`'s `cause`). Not a checksum anybody relies on: the record holds the file it plans to its own.
 */
const shortHash = (said: string): string => {
  let h = 5381;
  for (let i = 0; i < said.length; i++) h = ((h << 5) + h + said.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
};

/** The proposal one owner-only call is asked as, or `null` where no question can say it. */
export type Ask = { question: string; body_kind: 'pack' | 'settings' | 'change' | 'rowset'; body: Record<string, unknown>; cause: string };

/**
 * Taking a key out of service, asked as deleting its row in Keys: a rowset the owner's yes applies, by its handle and the
 * version read now. Only the row's name and number travel; its value is never read here and never asked for.
 */
export const keyAsk = (key: { spoken: string; version: number; name: string | null }): Ask => ({
  question: `Delete the key ${key.name ?? key.spoken}?`,
  body_kind: 'rowset',
  body: { register: 'credentials', rows: [{ at: key.spoken, version: key.version, patch: { deleted_at: true } }] },
  cause: `act:revokeGrant:${key.spoken}`,
});

/**
 * The calls an agent asks for rather than makes, and the `propose` body each is asked as: the bodies of
 * `braindog:grammar/proposals`, which the owner's yes applies through the same install the app's own button runs.
 */
export const ASKS: Readonly<Record<string, (args: Record<string, unknown>) => Ask | null>> = {
  enablePack: (a) => ((id) => (id === null ? null : { question: `Turn on ${id}?`, body_kind: 'pack', body: { enable: id }, cause: `act:enablePack:${id}` }))(text(a.id)),
  disablePack: (a) => ((id) => (id === null ? null : { question: `Turn off ${id}?`, body_kind: 'pack', body: { disable: id }, cause: `act:disablePack:${id}` }))(text(a.id)),
  /* AND THE FILE GOES WITH IT, for an add-on the store does not hold: an agent's own, made for something this BrainDog
     lacks. Asked with the id alone, the record looked it up in the catalogue and answered that nothing by that name is on
     offer, so an add-on an agent wrote could never reach the person. The record still plans the file itself and refuses
     one sent for an id the store holds (`arrange.ts` `prepare`), so a file cannot pass itself off as a listed add-on. */
  /* OR A FILE ON GITHUB, `{ source: { kind: "git", ref: "owner/repo@v1.2.0:x.pack.json" } }`: the record reads it, pins it to
     the commit and plans it (`arrange.ts` `prepare`), and the question says the repository and that nobody reviewed it. */
  installPack: (a) =>
    map(a.source)?.kind === 'git' && text(map(a.source)?.ref) !== null
      ? ((ref) => ({ question: `Add the add-on from GitHub at ${ref}? Not reviewed by BrainDog.`, body_kind: 'pack' as const, body: { source: { kind: 'git', ref } }, cause: `act:installPack:git:${ref}` }))(
          String(text(map(a.source)?.ref)).replace(/^git:/u, ''),
        )
      : ((id, doc) =>
      id === null
        ? null
        : { question: `Add ${text(doc?.title) ?? id}?`, body_kind: 'pack', body: { install: id, ...(doc === null ? {} : { doc }) }, cause: `act:installPack:${id}${doc === null ? '' : `@${text(doc.version) ?? ''}:${shortHash(JSON.stringify(doc))}`}` })(
      text(a.id) ?? text(map(a.doc)?.pack) ?? text(map(map(a.doc)?.manifest)?.id) ?? text(map(a.doc)?.id),
      map(a.doc),
    ),
  /* PUBLISH AN ADD-ON MADE HERE TO THE STORE: the record files it with the title and version held now (`arrange.ts`), and
     the owner's browser signs and sends the file on the yes. GitHub is never asked: `publishAddon {to: "github"}`
     answers the line the person runs. */
  publishAddon: (a) =>
    ((id) => (id === null || (a.to !== undefined && a.to !== 'store') ? null : { question: `Publish ${id} to the BrainDog store?`, body_kind: 'pack', body: { publish: id, to: 'store' }, cause: `act:publishAddon:${id}` }))(text(a.id)),
  setPackConfig: (a) => {
    const id = text(a.id) ?? text(a.pack);
    const values = map(a.values);
    return id === null || values === null ? null : { question: `Change ${id}'s settings?`, body_kind: 'settings', body: { pack: id, values }, cause: `act:setPackConfig:${id}` };
  },
  setDeclaration: (a) => {
    const to = map(a.body);
    const id = text(to?.id);
    return to === null || id === null ? null : { question: `Change ${id}?`, body_kind: 'change', body: { to }, cause: `act:setDeclaration:${id}` };
  },
};

/**
 * The call this door makes that a name most likely meant: the same name in another case, the name with a verb an agent
 * puts in front taken off (`listScripts` is `scripts`, `getAutomations` is `automations`), or one whose name holds it.
 * `null` where nothing is near enough to say.
 */
export function nearestCall(name: string, rows: readonly CallRow[]): string | null {
  const taken = rows.filter(doorTakes).map((r) => r.name);
  const low = name.trim().toLowerCase();
  if (low === '') return null;
  const same = taken.find((n) => n.toLowerCase() === low);
  if (same !== undefined) return same;
  const stem = low.replace(/^(?:list|get|read|show|all|my)_?/u, '').replace(/[_\s-]+/gu, '');
  const bare = taken.find((n) => n.toLowerCase() === stem || n.toLowerCase() === `${stem}s` || `${n.toLowerCase()}s` === stem);
  if (bare !== undefined) return bare;
  const holds = taken.filter((n) => stem.length >= 4 && n.toLowerCase().includes(stem));
  return holds.length === 1 ? holds[0]! : null;
}

/** The refusal for a call this door does not make, with the nearest it does as `try`, and how to find the rest. */
export function notADoor(name: string, rows: readonly CallRow[]): Refusal {
  if (Object.hasOwn(NEVER, name)) return { code: 'FORBIDDEN', fix: `${name} is not made through act: ${NEVER[name]}.`, at: 'call' };
  const known = rows.some((r) => r.name === name);
  if (known) return { code: 'FORBIDDEN', fix: `${name} is not made through act; it is the app's own.`, at: 'call' };
  const near = nearestCall(name, rows);
  return {
    code: 'ROUTE_UNKNOWN',
    fix: `There is no call named ${name || '(nothing)'}${near === null ? '' : `; ${near} is`}. act {"call":"calls","args":{"q":"<a word>"}} finds the rest.`,
    at: 'call',
    ...(near === null ? {} : { try: `act {"call":"${near}"}` }),
  } as Refusal;
}

/**
 * `act {call:"calls"}`: the calls this door makes whose name or line holds `q`, a line each, for a client that reads no
 * resources and so never sees `braindog:calls`. With no `q`, every name, which is short.
 */
export function callsFound(rows: readonly CallRow[], q: string): string {
  const taken = rows.filter(doorTakes);
  const word = q.trim().toLowerCase();
  if (word === '') return [`${String(taken.length)} calls. act {"call":"calls","args":{"q":"<a word>"}} says what each does.`, `Reads: ${taken.filter((r) => !r.writes).map((r) => r.name).join(', ')}`, `Writes: ${taken.filter((r) => r.writes).map((r) => r.name).join(', ')}`].join('\n');
  const starts = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'u');
  const hits = taken.filter((r) => r.name.toLowerCase().includes(word) || starts.test(r.what.toLowerCase()));
  if (hits.length === 0) return `No call says ${q.trim()}. act {"call":"calls"} names every one.`;
  return [...hits.slice(0, 25).map((r) => `${r.name}${r.writes ? '' : ' (read)'}: ${r.what}`), ...(hits.length > 25 ? [`and ${String(hits.length - 25)} more; a narrower word finds them.`] : [])].join('\n');
}

/** `braindog:calls`: every call this door makes, a line each, and how to make one. */
export function catalogue(rows: readonly CallRow[]): Record<string, unknown> {
  const taken = rows.filter(doorTakes);
  const line = (r: CallRow): string => `${r.name}${r.writes ? '' : ' (read)'}: ${r.what}`;
  return {
    how: 'act {"call":"<name>","args":{...}} makes one call as the app does, with your own grant. The record says who may; a write meets your rung. Arguments are the call\'s own; a refusal names the one to fix.',
    asked: `Owner-only calls asked instead when refused: ${[...Object.keys(ASKS), 'revokeGrant'].join(', ')} (filed on Decide as the app files them; your rung and the owner's switches decide whether it lands at once).`,
    never: 'Never here: a key\'s value in or out (deposit with braindog keys put <label>, which reads standard input), the rest of the keychain, jobs, and import, restore, erase or deleting this BrainDog.',
    reads: taken.filter((r) => !r.writes).map(line),
    writes: taken.filter((r) => r.writes).map(line),
  };
}

/** The surfaces already handed their calls, so a host that wraps its record on every request hands one surface each time. */
const WITH_CALLS = new WeakMap<object, object>();

/**
 * A host's record surface with the calls `act` makes beside it: `call` runs one by name as the app's `/api/<call>` does,
 * and `calls` is the table it is held to.
 *
 * ONE WRAPPER PER SURFACE, KEPT. The door keeps a caller's state per surface (what it was shown, its settings for a few
 * seconds), and a surface made fresh on every request would forget it and say a waiting instruction on every answer.
 */
export function withCalls<S extends object>(
  surface: S,
  call: (name: string, args: Record<string, unknown>, ctx: never) => Promise<Result<unknown>>,
  calls: () => readonly CallRow[],
): S {
  const had = WITH_CALLS.get(surface);
  if (had !== undefined) return had as S;
  const over = Object.create(surface) as S;
  Object.defineProperty(over, 'call', { value: call, enumerable: true });
  Object.defineProperty(over, 'calls', { value: calls, enumerable: true });
  WITH_CALLS.set(surface, over);
  return over;
}
