/**
 * `makePreview`: an add-on's pages as a record draws them, made for the catalogue to show before anybody installs it
 * (the `Preview` in `packages/declare/src/catalogue.ts`).
 *
 * THE RECORD'S OWN ANSWER, NOT A PICTURE OF ONE. The pack is installed the way each pack's own test installs it
 * (`packs/pad/pad.test.ts`): a record in memory, `planPack`, then `installPack` with exactly what the plan asked to be
 * approved, its example rows with it. Then `page` is asked for every page the install added, and its answer is kept
 * whole. So a preview is only ever as true as the code that draws the page, which is why `from-packs --previews`
 * remakes every one after a change to how pages are drawn.
 *
 * ITS REQUIREMENTS FIRST. A pack that needs one of BrainDog's modules is given all of them, in `FIRST_PARTY` order with
 * their own example rows, as the pack tests install them, because the modules' lists point at one another. A pack that
 * needs another pack from `packs/` is given that one first, and that one's needs before it.
 *
 * AND THE SAMPLE ROWS THE PACK'S FOLDER DECLARES FOR ITS PREVIEW (leftovers 7, 2 Nov). Most add-ons plant no example
 * rows, so their previews drew their own empty lines ("No goals yet.") and showed nothing of what the add-on does. A
 * pack's folder may hold `preview-rows.json`, a list of `{ register, fields }`, written into the scratch record after the
 * install, as the owner, through `create`, so each row meets the same checks and rules a typed one does. They are the
 * preview's alone: the pack document is not touched, so nobody who installs the add-on gets them. A day written as
 * `{ "day": "+30" }` is that many days from the preview's clock, so the samples never go stale.
 *
 * LOADED ONLY WHEN A PREVIEW IS MADE. The record, the seed and the SQLite adapter are imported inside the call, so a
 * build whose previews are all in place never opens a record.
 */

import { PREVIEW_FORMAT } from '../../packages/declare/src/catalogue.ts';

/** The owner of the scratch record, who may read every page it holds. */
const OWNER = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** The longest chain of packs one pack's requirements may make, so two packs that need each other end here. */
const NEEDS_DEEPEST = 8;

/** A sample row's fields with every `{ day: "+N" }` (or "-N") made the day that many days from `now`. */
const daysFrom = (fields, now) =>
  Object.fromEntries(
    Object.entries(fields ?? {}).map(([k, v]) => {
      const rel = v !== null && typeof v === 'object' && typeof v.day === 'string' ? /^([+-]\d+)$/u.exec(v.day) : null;
      if (rel === null) return [k, v];
      const at = new Date(now.getTime() + Number(rel[1]) * 86_400_000);
      return [k, at.toISOString().slice(0, 10)];
    }),
  );

/** A refusal said in one line: its sentence and its code. */
const refusalOf = (r) => `${r?.refusal?.fix ?? 'the record refused it'} (${r?.refusal?.code ?? 'no code'})`;

/**
 * A `Preview` of `doc`, a pack document, or the reason none could be made.
 *
 * `packs` maps a catalogue id to the document of each pack in `packs/`, for the requirements that are not BrainDog's
 * own modules. `now` is the scratch record's clock and the preview's `made_at`.
 */
export async function makePreview(doc, packs, now, samples = []) {
  const [{ createRecordApi }, { FIRST_PARTY, firstPartyDocument }, { fixedClock, openSqlite }] = await Promise.all([
    import('../../packages/record/src/index.ts'),
    import('../../packages/seed/src/index.ts'),
    import('../../packages/kernel/test/sqlite.ts'),
  ]);

  /* THE NEEDS IN THE ORDER THEY INSTALL: each pack's own needs before it, and each pack once. */
  const order = [];
  let modules = false;
  const walk = (d, depth) => {
    if (depth > NEEDS_DEEPEST) return `${doc.pack} needs packs more than ${NEEDS_DEEPEST} deep.`;
    for (const id of Object.keys(d.requires?.packs ?? {})) {
      if (FIRST_PARTY.includes(id)) {
        modules = true;
        continue;
      }
      const next = packs.get(id);
      if (next === undefined) return `${d.pack} needs ${id}, which is neither a BrainDog module nor a pack in packs/.`;
      if (order.includes(next)) continue;
      const stop = walk(next, depth + 1);
      if (stop !== null) return stop;
      if (!order.includes(next)) order.push(next);
    }
    return null;
  };
  const stop = walk(doc, 0);
  if (stop !== null) return { ok: false, why: stop };
  const needs = [...(modules ? FIRST_PARTY.map((id) => firstPartyDocument(id)) : []), ...order];

  const sql = openSqlite();
  try {
    const api = await createRecordApi({ sql, clock: fixedClock(now.getTime()) });
    const put = async (d) => {
      const planned = await api.planPack({ doc: d, source: { kind: 'local' } }, OWNER);
      if (!planned.ok) return planned;
      const { planHash, approve } = planned.value.diff;
      return api.installPack({ doc: d, source: { kind: 'local' }, planHash, approve }, OWNER);
    };
    for (const d of needs) {
      const done = await put(d);
      if (!done.ok) return { ok: false, why: `${d.pack}, which it needs, did not install: ${refusalOf(done)}` };
    }

    const slugs = async () => {
      const listed = await api.pages(OWNER);
      return listed.ok ? listed.value.map((p) => p.slug) : [];
    };
    const before = new Set(await slugs());
    const installed = await put(doc);
    if (!installed.ok) return { ok: false, why: `it did not install: ${refusalOf(installed)}` };
    for (const row of samples) {
      const wrote = await api.create({ register: row.register, fields: daysFrom(row.fields, now) }, OWNER);
      if (!wrote.ok) return { ok: false, why: `its sample row in ${row.register} was refused: ${refusalOf(wrote)}` };
    }

    const pages = [];
    for (const slug of await slugs()) {
      if (before.has(slug)) continue;
      const page = await api.page({ slug }, OWNER);
      if (!page.ok) return { ok: false, why: `its page ${slug} did not draw: ${refusalOf(page)}` };
      pages.push(page.value);
    }
    return { ok: true, preview: { format: PREVIEW_FORMAT, made_at: now.toISOString(), pages } };
  } finally {
    sql.close();
  }
}
