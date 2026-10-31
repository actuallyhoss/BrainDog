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
 */

import { createClient } from '@braindog/client';

import { forget, readBoot } from '../record/boot-live.ts';
import { REGISTERS } from '../record/held.ts';
import { packDocument, type PackState } from '../record/packs.ts';
import { learn } from '../record/remote.ts';
import type { Told, TellList, TellOptions, tellRead } from './read.ts';

/** The module whose list takes a thing to do, the one a blank BrainDog is given. */
export const TODO_MODULE = 'work';

type Wire = { ok: true; value: unknown } | { ok: false; refusal?: { fix?: string } };
const FAILED = 'The to-do list could not be started. Try again.';
/** Work's plan asks for more than its lists: it goes on in Add-ons, where each part is shown. */
export const TODO_ELSEWHERE = 'The to-do list asks for more than a list. Turn on Work in Add-ons, where each part is shown.';
const fixOf = (w: Wire | null): string => (w && !w.ok ? (w.refusal?.fix ?? '') : '') || FAILED;

/** Work on, or the sentence that says why not. `null` when it is on. */
export async function turnOnTodo(base: string): Promise<string | null> {
  const client = createClient({ base });
  const read = (await client.packs().catch(() => null)) as (Wire & { value?: PackState[] }) | null;
  if (!read?.ok) return fixOf(read);
  const held = (read.value ?? []) as PackState[];
  const state = held.find((p) => p.id === TODO_MODULE);
  if (state) {
    if (state.disabled_at === null) return null;
    const on = (await client.enablePack({ id: TODO_MODULE }).catch(() => null)) as Wire | null;
    return on?.ok ? null : fixOf(on);
  }
  const doc = await packDocument(TODO_MODULE, held);
  if (!doc) return FAILED;
  const planned = (await client.planPack({ doc, source: { kind: 'local' } }).catch(() => null)) as (Wire & { value?: { diff?: { planHash?: unknown; approve?: unknown } } }) | null;
  if (!planned?.ok) return fixOf(planned);
  const hash = planned.value?.diff?.planHash;
  if (typeof hash !== 'string' || hash === '') return FAILED;
  const approve = planned.value?.diff?.approve;
  if (Array.isArray(approve) && approve.length > 0) return TODO_ELSEWHERE;
  const put = (await client.installPack({ doc, source: { kind: 'local' }, planHash: hash }).catch(() => null)) as Wire | null;
  return put?.ok ? null : fixOf(put);
}

/**
 * Work on, then the same words read again against the lists it brought, put in the order the record lists them, each
 * with what the record counts in it. The kept `boot` is dropped, so the rail and Today read the record again after.
 */
export async function todoThenRead(base: string, words: string, options: TellOptions, reader: typeof tellRead): Promise<{ fix: string } | { told: Told; lists: TellList[] }> {
  const on = await turnOnTodo(base).catch(() => FAILED);
  if (on !== null) return { fix: on };
  const client = createClient({ base });
  const packs = (await client.packs().catch(() => null)) as (Wire & { value?: PackState[] }) | null;
  const ids = (packs?.ok ? (packs.value ?? []) : []).find((p) => p.id === TODO_MODULE)?.registers ?? [];
  const asked = new Map<string, Promise<void>>();
  await Promise.all(ids.map((id) => learn(client.schema, id, asked).catch(() => {})));
  forget();
  const got = await readBoot(base).catch(() => null);
  const counted = got?.from === 'live' ? got.boot.registers : [];
  const held = new Set(options.lists.map((l) => l.id));
  const countOf = (id: string): number => counted.find((r) => r.id === id)?.count ?? 0;
  const brought = ids.flatMap((id) => (held.has(id) || !REGISTERS[id] ? [] : [{ ...(REGISTERS[id] as TellList), id, pack: TODO_MODULE, count: countOf(id) }]));
  const order = counted.map((r) => r.id);
  const at = (id: string): number => order.indexOf(id) + 1 || order.length + 1;
  const lists = [...options.lists, ...brought].sort((a, b) => at(a.id) - at(b.id));
  return { told: reader(words, { ...options, lists }), lists };
}
