/**
 * THE GROUND FOR EVERY CARD ON A SCREEN, READ ONCE. Each card says it wants its question's ground as it is set up; the
 * wants of one moment are read together (the rows the questions are about, their accounts and filings, and one month
 * of rows per account), never once per card. The answer is kept by the record's version (`kept.ts`), so a revisit at
 * the same version asks nothing, and a card with no row, or a refusal, draws no picture that needs it.
 */

import { page } from '$app/state';
import { apiBase } from '../at.ts';
import { keep, keptAnswer } from '../data/kept.ts';
import { live } from '../data/live.svelte.ts';
import { recordNow } from '../record/boot-live.ts';
import { groundOf, monthKey, refOf, rowOf, type Ground, type GroundRead, type GroundRow } from './ground.ts';

type Asked = { id: string; about: string; list: string | null };
type Wire = { rows: [string, GroundRow][]; month: [string, GroundRow[]][] };

let known = $state.raw(new Map<string, Ground>());
const wanting = new Map<string, Asked>();
let scheduled = false;

/** The ground of one question, once it has been read; undefined before, and for a question that needs none. */
export const groundNow = (id: string): Ground | undefined => known.get(id);

/** Say a card wants its question's ground. Call while the card is set up; the read happens once for all that want. */
export function want(question: { id: string; about?: string | undefined; list?: string | null | undefined }): void {
  if (rowOf(question.about) === null || known.has(question.id) || wanting.has(question.id)) return;
  wanting.set(question.id, { id: question.id, about: question.about!, list: question.list ?? null });
  if (scheduled) return;
  scheduled = true;
  /* A TICK LATER, so every card drawn in this pass is in the one read. */
  setTimeout(() => void flush(), 0);
}

const fieldsOf = (v: unknown): GroundRow => ((v as { fields?: GroundRow } | null)?.fields ?? {}) as GroundRow;

async function readAll(batch: Asked[]): Promise<Wire | null> {
  const { createClient } = await import('@braindog/client');
  const client = createClient({ base: apiBase() });
  const rows = new Map<string, GroundRow>();
  const month = new Map<string, GroundRow[]>();
  const getRow = async (spoken: string): Promise<void> => {
    const at = rowOf(spoken);
    if (!at || rows.has(spoken)) return;
    rows.set(spoken, {});
    const got = await client.get(at.register, Number(spoken.slice(spoken.indexOf('#') + 1)));
    if (got.ok) rows.set(spoken, fieldsOf(got.value));
    else rows.delete(spoken);
  };
  await Promise.all(batch.map((b) => getRow(rowOf(b.about)!.spoken)));
  const more: Promise<void>[] = [];
  for (const b of batch) {
    const at = rowOf(b.about)!;
    const row = rows.get(at.spoken);
    if (!row) continue;
    const account = refOf(row.account);
    const filed = refOf(row.category);
    if (account) {
      more.push(getRow(account));
      const key = monthKey(at.register, account);
      if (!month.has(key)) {
        month.set(key, []);
        more.push(
          client.list({ register: at.register, where: { field: 'account', is: account }, limit: 500 }).then((out) => {
            if (out.ok) month.set(key, out.value.rows.map(fieldsOf));
          }),
        );
      }
    }
    if (filed) more.push(getRow(filed));
  }
  await Promise.all(more);
  return { rows: [...rows], month: [...month] };
}

async function flush(): Promise<void> {
  scheduled = false;
  const batch = [...wanting.values()];
  wanting.clear();
  if (batch.length === 0) return;
  const key = batch.map((b) => `${b.id}:${b.about}`).sort().join(',');
  const version = live.version;
  const was = keptAnswer<Wire>('ground', key, version);
  let wire: Wire | null = was?.got.ok ? was.got.value : null;
  if (wire === null || !was?.fresh) {
    try {
      const fresh = await readAll(batch);
      if (fresh) {
        keep('ground', key, version, { ok: true, value: fresh });
        wire = fresh;
      }
    } catch {
      /* A READ THAT FAILS DRAWS NO PICTURE; the card is whole without one. */
    }
  }
  if (wire === null) return;
  const read: GroundRead = { rows: new Map(wire.rows), month: new Map(wire.month) };
  const registers = (page.data as { registers?: { id: string; name: string }[] }).registers ?? [];
  const next = new Map(known);
  for (const b of batch) {
    const g = groundOf(b.about, read, recordNow(), registers.find((r) => r.id === b.list)?.name ?? null);
    if (g) next.set(b.id, g);
  }
  known = next;
}
