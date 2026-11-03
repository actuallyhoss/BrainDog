/**
 * START A TO-DO LIST, FOR A LINE THAT FITS NOWHERE ON A RECORD THAT KEEPS NO THINGS TO DO (audit 31 Oct o, AO7): "Run 10k
 * on Saturday morning" on Personal said "Not sure where this goes" and offered Goals, which asks for an aim, and Project
 * steps, which hang on a project. A blank BrainDog is given Work's tasks at sign-up (`withFirstList` in
 * `start/propose.ts`); any other record is offered the same here, as Money is (`money-on.ts`): Work turned back on where
 * it was turned off, or put in as the module it is, planned and installed with that plan's own hash. The card then reads
 * the line again against the lists Work brought and adds it in the same press, so it keeps its day.
 *
 * NOTHING IS APPROVED UNSAID: a plan that asks for anything beyond its lists is turned on in Add-ons, where each part is
 * shown, never from Today. A ROUTE-ONLY MODULE, loaded when the button is pressed.
 *
 * AND PROJECTS THE SAME WAY (audit 1 Nov, AP7): "New project: Kitchen renovation" on a record without Projects was a
 * task called that. The card offers to start Projects and add it, by `moduleThenRead`.
 */

import { createClient } from '@braindog/client';

import { forget, readBoot } from '../record/boot-live.ts';
import { REGISTERS } from '../record/held.ts';
import { packDocument, type PackState } from '../record/packs.ts';
import { learn } from '../record/remote.ts';
import type { Told, TellList, TellOptions, tellRead } from './read.ts';

/** The module whose list takes a thing to do, the one a blank BrainDog is given. */
export const TODO_MODULE = 'work';
/** The module whose list takes a project, Projects (AP7): "New project: Kitchen renovation" on a record without it. */
export const PROJECTS_MODULE = 'portfolio';

type Wire = { ok: true; value: unknown } | { ok: false; refusal?: { fix?: string } };
const FAILED = 'The to-do list could not be started. Try again.';
/** Work's plan asks for more than its lists: it goes on in Add-ons, where each part is shown. */
export const TODO_ELSEWHERE = 'The to-do list asks for more than a list. Turn on Work in Plugins, where each part is shown.';

/** What is said when a module will not go on from Tell: it failed, or its plan asks for more than its lists. */
type Said = { failed: string; elsewhere: string };
const TODO_SAID: Said = { failed: FAILED, elsewhere: TODO_ELSEWHERE };
export const PROJECTS_SAID: Said = {
  failed: 'Projects could not be started. Try again.',
  elsewhere: 'Projects asks for more than a list. Turn it on in Plugins, where each part is shown.',
};

/** A module on, or the sentence that says why not. `null` when it is on. */
async function turnOn(base: string, id: string, said: Said): Promise<string | null> {
  const fixOf = (w: Wire | null): string => (w && !w.ok ? (w.refusal?.fix ?? '') : '') || said.failed;
  const client = createClient({ base });
  const read = (await client.packs().catch(() => null)) as (Wire & { value?: PackState[] }) | null;
  if (!read?.ok) return fixOf(read);
  const held = (read.value ?? []) as PackState[];
  const state = held.find((p) => p.id === id);
  if (state) {
    if (state.disabled_at === null) return null;
    const on = (await client.enablePack({ id }).catch(() => null)) as Wire | null;
    return on?.ok ? null : fixOf(on);
  }
  const doc = await packDocument(id, held);
  if (!doc) return said.failed;
  const planned = (await client.planPack({ doc, source: { kind: 'local' } }).catch(() => null)) as (Wire & { value?: { diff?: { planHash?: unknown; approve?: unknown } } }) | null;
  if (!planned?.ok) return fixOf(planned);
  const hash = planned.value?.diff?.planHash;
  if (typeof hash !== 'string' || hash === '') return said.failed;
  const approve = planned.value?.diff?.approve;
  if (Array.isArray(approve) && approve.length > 0) return said.elsewhere;
  const put = (await client.installPack({ doc, source: { kind: 'local' }, planHash: hash }).catch(() => null)) as Wire | null;
  return put?.ok ? null : fixOf(put);
}

/** Work on, or the sentence that says why not. `null` when it is on. */
export const turnOnTodo = (base: string): Promise<string | null> => turnOn(base, TODO_MODULE, TODO_SAID);

/**
 * Work on, then the same words read again against the lists it brought, put in the order the record lists them, each
 * with what the record counts in it. The kept `boot` is dropped, so the rail and Today read the record again after.
 */
export const todoThenRead = (base: string, words: string, options: TellOptions, reader: typeof tellRead): Promise<{ fix: string } | { told: Told; lists: TellList[] }> =>
  moduleThenRead(base, TODO_MODULE, TODO_SAID, words, options, reader);

/** Any module on, as Work is above (Projects for "New project: …", AP7), then the same words read against its lists. */
export async function moduleThenRead(base: string, id: string, said: Said, words: string, options: TellOptions, reader: typeof tellRead): Promise<{ fix: string } | { told: Told; lists: TellList[] }> {
  const on = await turnOn(base, id, said).catch(() => said.failed);
  if (on !== null) return { fix: on };
  const client = createClient({ base });
  const packs = (await client.packs().catch(() => null)) as (Wire & { value?: PackState[] }) | null;
  const ids = (packs?.ok ? (packs.value ?? []) : []).find((p) => p.id === id)?.registers ?? [];
  const asked = new Map<string, Promise<void>>();
  await Promise.all(ids.map((r) => learn(client.schema, r, asked).catch(() => {})));
  forget();
  const got = await readBoot(base).catch(() => null);
  const counted = got?.from === 'live' ? got.boot.registers : [];
  const held = new Set(options.lists.map((l) => l.id));
  const countOf = (r: string): number => counted.find((x) => x.id === r)?.count ?? 0;
  const brought = ids.flatMap((r) => (held.has(r) || !REGISTERS[r] ? [] : [{ ...(REGISTERS[r] as TellList), id: r, pack: id, count: countOf(r) }]));
  const order = counted.map((r) => r.id);
  const at = (r: string): number => order.indexOf(r) + 1 || order.length + 1;
  const lists = [...options.lists, ...brought].sort((a, b) => at(a.id) - at(b.id));
  return { told: reader(words, { ...options, lists }), lists };
}
