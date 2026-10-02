/**
 * Retiring one field of a live list from the app: the body the record is sent, and the one call that sends it.
 *
 * THE OTHER HALF OF `field-write.ts`, AND IT DOES NOT MIRROR IT. An addition is filed and, when the person owns the
 * record, accepted in the next call, because an optional field may land at once. Removing waits for his
 * press, so a retire is filed and nothing more, whoever files it, the owner included: it reaches Decide as a
 * question and lands only when somebody answers it there. The record holds the same line on its own side (the kernel's
 * `additiveFault` refuses a retire by rule, and the record's `byRule` never sends one), so a second `decide` here would
 * be the app answering on the owner's behalf a question the record exists to put to him.
 *
 * A FIELD-LEVEL CHANGE AND NEVER A WHOLE LIST, for the reason `field-write.ts` gives: this tab's copy of the list is the
 * relabelled one the screens draw from, with no version, and a whole body built from it would write display labels into
 * the declaration and drop whatever somebody else added since. `to: { retire: { register, fields } }` is merged by the
 * kernel onto the list as it is when the question is accepted (`packages/kernel/src/govern.ts` `retireIn`).
 *
 * RETIRED, NOT DELETED. Every row keeps its value; the field stops being drawn and stops taking writes. The sentence the
 * person reads says that, because "retire" alone reads as losing data.
 */

import { createClient } from '@braindog/client';

import { labelOf } from './api.ts';
import { forget, type Fetch } from './boot-live.ts';
import { REGISTERS } from './held.ts';

/**
 * The words for retiring a field, kept beside the call they describe, as `fieldWords` is, so this module owns them
 * rather than `copy.ts`.
 */
export const retireWords = {
  retire: 'Retire',
  /** The one line beside the control, so nobody presses it expecting the field gone this second. */
  note: 'Every item keeps its value. The field waits on Decide before it goes.',
  question: (label: string, list: string) => `Retire ${label} on ${list}?`,
  filed: (label: string) => `Retiring ${label} is waiting on Decide. Nothing changes until it is accepted there.`,
  unknown: (label: string, list: string) => `${list} has no field called ${label}.`,
  already: (label: string) => `${label} is already retired.`,
  /* THE KERNEL REFUSES THESE THREE TOO (`retireIn`); said here first, because a sentence under the control beats a round
     trip that files nothing. */
  readBy: (label: string, role: string) => `${label} is what this list uses as its ${role}, so it stays.`,
  changed: 'The list changed while this was being sent. Try again.',
} as const;

/** The keys of a list that name one of its fields, as the kernel's `retireIn` refuses them, and how each is said. */
const ROLES = { title: 'title', state: 'state', finished: 'finished day' } as const;

/** The change `propose` files: filed under the list, retiring these fields and nothing else on it. */
export const retireOf = (register: string, fields: readonly string[]) => ({
  declaration_id: `register.${register}`,
  to: { retire: { register, fields: [...fields] } },
});

/**
 * Whether a field may be offered for retiring, or the sentence saying why not.
 *
 * READ FROM THIS TAB'S COPY, which may be behind the record: the kernel decides again when the question is filed and
 * again when it is accepted, so this only saves a press that could not have been filed.
 */
export function retirable(register: string, field: string): { ok: true } | { ok: false; fix: string } {
  const decl = REGISTERS[register];
  const f = decl?.fields.find((x) => x.id === field);
  if (!decl || !f) return { ok: false, fix: retireWords.unknown(field, decl?.name ?? register) };
  const label = labelOf(f);
  if (f.retired === true) return { ok: false, fix: retireWords.already(label) };
  const role = (Object.keys(ROLES) as (keyof typeof ROLES)[]).find((k) => decl[k] === field);
  if (role !== undefined) return { ok: false, fix: retireWords.readBy(label, ROLES[role]) };
  return { ok: true };
}

export type Retired =
  /** On Decide, waiting for an answer. `said` is the sentence the row page shows. */
  | { from: 'filed'; id: string; said: string }
  | { from: 'refused'; fix: string };

/**
 * File the retiring of one field as a question on Decide, and stop there.
 *
 * `propose` IS THE ONLY CALL, for every caller. There is no `owner` argument, unlike `addField`, because nothing here
 * would do anything different with it: the owner's own retire waits on Decide like anyone's.
 */
export async function retireField(base: string, register: string, field: string, io?: Fetch): Promise<Retired> {
  const can = retirable(register, field);
  if (!can.ok) return { from: 'refused', fix: can.fix };
  const decl = REGISTERS[register]!;
  const f = decl.fields.find((x) => x.id === field)!;
  const label = labelOf(f);

  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const filed = await client.call<{ id?: unknown }>('propose', {
    question: retireWords.question(label, decl.name),
    body_kind: 'change',
    body: retireOf(register, [field]),
  });
  if (!filed.ok) {
    if ('refusal' in filed) return { from: 'refused', fix: filed.refusal.fix };
    return { from: 'refused', fix: retireWords.changed };
  }
  /* THE RAIL'S DECIDE COUNT IS THE KEPT BOOT'S, and it is one higher now. */
  forget();
  return { from: 'filed', id: String(filed.value?.id ?? ''), said: retireWords.filed(label) };
}
