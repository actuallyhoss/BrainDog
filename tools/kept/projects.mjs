/**
 * The kept lane's project checks: project-brief's fields on Projects with no question asked,
 * portfolio-bands' rows from the names its settings hold, and the roadmap page drawing.
 *
 * READ FROM EACH PACK'S OWN TEST FIRST: `packs/project-brief/project-brief.test.ts` (the plan lays the brief on Projects
 * and asks nobody to press anything), `packs/portfolio-bands/bands.test.ts` (its names set after install, a project's
 * readings named "<name>, <project>", one run, a band a currency), `packs/roadmap/roadmap.test.ts` (one page, which
 * reads Work's tasks). WHAT EACH ASSERTS IS READ OFF THE FILE THE CATALOGUE PUBLISHES, so a field, a page or a list
 * the file adds is the one checked, and nothing here names one: an update that adds a fourth field checks four.
 *
 * Every project, reading and figure is invented.
 */

import { api, create, installFromCatalogue, ok, red, rowsOf, skip, turn } from './steps.mjs';

/** The fields a file lays on a list it extends and keeps (`retired` ones are words it keeps, not fields it adds). */
const laidOn = (doc, list) => (doc?.extends?.[`register.${list}`]?.fields ?? []).filter((f) => f && f.retired !== true);

/** The fields the record says a list holds, by id: `{ ids }`, or `{ fix }`. */
async function fieldsOf(ctx, list) {
  const out = await api(ctx, 'schema', { register: list });
  if (out.said?.ok !== true) return { ids: null, fix: String(out.said?.refusal?.fix ?? `it answered ${out.status}`) };
  const v = out.said.value;
  const fields = v?.fields ?? v?.register?.fields ?? [];
  return { ids: new Set(fields.map((f) => f?.id)) };
}

/** What a line adds when the modules the file stands on went in first (`installFromCatalogue`'s `brought`). */
const after = (put) => (put.brought?.length > 0 ? ` It went in after ${put.brought.join(' and ')}, which it stands on.` : '');

/** `project-brief`: every field the file lays on Projects is there after one install, and the plan asked nobody anything. */
export async function projectBrief(ctx) {
  const name = 'project-brief';
  const put = await installFromCatalogue(ctx, 'project-brief');
  if (!put.pass) return [red(ctx, name, put.said)];
  const laid = laidOn(put.doc, 'things');
  if (laid.length === 0) return [red(ctx, name, `${put.version} lays no field on Projects.`)];
  const held = await fieldsOf(ctx, 'things');
  if (!held.ids) return [red(ctx, name, `Projects could not be read: “${held.fix}”`)];
  const missing = laid.filter((f) => !held.ids.has(f.id)).map((f) => f.label ?? f.id);
  if (missing.length > 0) return [red(ctx, name, `Projects lacks ${missing.join(', ')} after the install.`)];
  if (put.approve.length > 0) return [red(ctx, name, `its ${laid.length} fields are on Projects, and the plan asked ${put.approve.length} question${put.approve.length === 1 ? '' : 's'} first.`)];
  return [ok(ctx, name, `its ${laid.length} fields (${laid.map((f) => f.label ?? f.id).join(', ')}) are on Projects, and the plan asked nobody to press anything.${after(put)}`)];
}

/**
 * `portfolio-bands`: names of the lane's own set in its settings (never the file's defaults, so a band proves the names
 * were read), a project with a reading under each, one turn, and a band row whose figure is the one named.
 */
export async function portfolioBands(ctx) {
  const name = 'portfolio-bands';
  const put = await installFromCatalogue(ctx, 'portfolio-bands');
  if (!put.pass) return [red(ctx, name, put.said)];
  const id = put.doc.pack;
  const keys = Object.keys(put.doc.config ?? {});
  if (keys.length < 2) return [red(ctx, name, `${put.version} takes ${keys.length} names in its settings, and the bands read two.`)];
  const [nowKey, baseKey] = keys;
  const names = { [nowKey]: ['Takings a month'], [baseKey]: ['Takings a month in a year'] };
  const set = await api(ctx, 'setPackConfig', { id, values: names });
  if (set.said?.ok !== true) return [red(ctx, name, `its names could not be set: “${set.said?.refusal?.fix ?? set.status}”`)];
  const project = 'Glaze booking app';
  const thing = await create(ctx, 'things', { name: project, lane: 'earning' });
  if (!thing.id) return [red(ctx, name, `the project could not be made: “${thing.fix}”`)];
  const at = new Date(Date.now() - 3_600_000).toISOString();
  for (const [said, value] of [[names[nowKey][0], 1_250], [names[baseKey][0], 4_000]]) {
    const r = await create(ctx, 'datapoints', { name: `${said}, ${project}`, value, unit: 'USD', thing: thing.id, at, source: 'typed' });
    if (!r.id) return [red(ctx, name, `a reading could not be written: “${r.fix}”`)];
  }
  const list = (put.doc.declarations ?? []).find((x) => typeof x?.register === 'string')?.register;
  const script = (put.doc.declarations ?? []).find((x) => typeof x?.script === 'string')?.script;
  const bands = async () => ((await rowsOf(ctx, list)).rows ?? []).filter((r) => Number(r?.fields?.amount?.amount ?? 0) > 0);
  const ran = await turn(ctx, { done: async () => (await bands()).length > 0 });
  const rows = await bands();
  if (rows.length > 0) return [ok(ctx, name, `with its names set to the lane’s own, one turn wrote ${rows.length} band${rows.length === 1 ? '' : 's'} from the project’s readings.`)];
  if (ran.skipped) return [skip(ctx, name, `${ran.skipped}.`)];
  const last = ((await api(ctx, 'scripts', {})).said?.value ?? []).find((s) => s?.script === script)?.last;
  return [red(ctx, name, `one turn wrote no band: ${last?.say ? `“${last.say}”` : 'the script left no word'}`)];
}

/**
 * `roadmap`: installed, each page the file adds is read by the record, and no block on it answers a fault. A version that
 * hands its page to another add-on (2.0.0 gives `roadmap` to Work, as its Timeline) is read at the page it handed.
 */
export async function roadmap(ctx) {
  const name = 'roadmap';
  const put = await installFromCatalogue(ctx, 'roadmap');
  if (!put.pass) return [red(ctx, name, put.said)];
  const declared = (put.doc.declarations ?? []).filter((x) => typeof x?.page === 'string').map((x) => ({ slug: x.page, title: x.title ?? x.page }));
  const handed = Object.entries(put.doc.hands ?? {})
    .filter(([key]) => key.startsWith('page.'))
    .map(([key, to]) => ({ slug: key.slice('page.'.length), title: `${key.slice('page.'.length)} (now ${to}'s)` }));
  const pages = declared.length > 0 ? declared : handed;
  if (pages.length === 0) return [red(ctx, name, `${put.version} adds no page and hands none on.`)];
  for (const p of pages) {
    const read = await api(ctx, 'page', { slug: p.slug });
    if (read.said?.ok !== true) return [red(ctx, name, `the ${p.title} page did not draw: “${read.said?.refusal?.fix ?? read.status}”`)];
    const blocks = read.said.value?.blocks ?? [];
    const faulted = blocks.find((b) => b?.refusal || b?.fault || b?.error);
    if (faulted) return [red(ctx, name, `the ${p.title} page drew with a fault: “${String(faulted.refusal?.fix ?? faulted.fault ?? faulted.error)}”`)];
  }
  return [ok(ctx, name, `the ${pages.map((p) => p.title).join(' and ')} page${pages.length === 1 ? '' : 's'} drew with no fault.${after(put)}`)];
}

/** The project checks, in the order the lane runs them, by the line each one starts. */
export const PROJECTS = { 'project-brief': projectBrief, 'portfolio-bands': portfolioBands, roadmap };
