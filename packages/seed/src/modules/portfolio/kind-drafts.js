/**
 * A PROJECT'S KIND OFFERS ITS KEY NUMBERS AS DRAFTS (B27 of the 24 October scope; the KPI plan of 21 October, 2.7).
 * `kind` came in at portfolio 1.19.0 and its comment said the drafts would follow; nothing offered them.
 *
 * ONE QUESTION, NOTHING WRITTEN. Handed the project and the key numbers it already holds, `kindDrafts` answers one
 * `rowset` on `kpis`: the plan's four for that kind, each `draft: true`, so accepting it makes suggestions the project
 * page shows under Suggested with Keep and Not this, and nothing is tracked until he keeps one. A project that holds any
 * key number at all, kept, draft or retired, is offered none, so a kind changed later asks nothing over his own.
 *
 * ASKED ONCE A PROJECT: the cause is `kpi-kind:<project>`, so a second run joins the question still open and one he said
 * no to is answered from the gate's memory.
 *
 * NOTHING OUTSIDE ITSELF IS READ BY `kindDrafts`, AND NOTHING BUT IT BY `run`: the two texts are the script.
 */

export function kindDrafts(project, kpis) {
  /* THE PLAN'S TABLE (2.7), four a kind, the first leading the card. A figure reads `{{it}}` as the project. */
  const TABLE = {
    business: [
      { name: 'Revenue a month', source: 'numbers', measure: 'Revenue a month', kind: 'flow', every: '1m' },
      { name: 'Monthly recurring revenue', source: 'numbers', measure: 'Monthly recurring revenue', kind: 'level', every: '1m' },
      { name: 'Active users', source: 'numbers', measure: 'Active users', kind: 'level', every: '1w' },
      { name: 'Costs a year', source: 'figure', figure: 'project-cost', kind: 'level', good: 'down' },
    ],
    client: [
      { name: 'Billed a month', source: 'typed', measure: 'Billed a month', kind: 'flow', every: '1m' },
      { name: 'Still to come in', source: 'figure', figure: 'project-owed', kind: 'level', good: 'down' },
      { name: 'Hours used', source: 'typed', measure: 'Hours used', kind: 'progress', every: '1w' },
      { name: 'Days to next invoice', source: 'typed', measure: 'Days to next invoice', kind: 'count', good: 'down' },
    ],
    product: [
      { name: 'How far along', source: 'typed', measure: 'How far along', kind: 'progress', every: '1w' },
      { name: 'Sign-ups', source: 'numbers', measure: 'Sign-ups', kind: 'level', every: '1w' },
      { name: 'Done this week', source: 'figure', figure: 'project-done-7d', kind: 'count' },
      { name: 'Days quiet', source: 'figure', figure: 'project-last-worked', kind: 'count', good: 'down' },
    ],
    content: [
      { name: 'Audience', source: 'numbers', measure: 'Audience', kind: 'level', every: '1w' },
      { name: 'Views a week', source: 'numbers', measure: 'Views a week', kind: 'flow', every: '1w' },
      { name: 'Engagement', source: 'numbers', measure: 'Engagement', kind: 'share', every: '1w' },
      { name: 'Posts a week', source: 'typed', measure: 'Posts a week', kind: 'count', every: '1w' },
    ],
  };
  const WORDS = { business: 'a business', client: 'client work', product: 'a product', content: 'content' };
  const f = project.fields;
  const name = String(f.name ?? '').trim() || 'This project';
  const rows = TABLE[f.kind];
  if (!rows) return { nothing: `${name} has no kind with key numbers to offer, so nothing was asked.` };
  if (kpis.some((k) => k.fields.thing === project.id)) return { nothing: `${name} already has key numbers, so none were offered.` };
  return {
    cause: `kpi-kind:${project.id}`,
    question: `Track ${rows.length} key numbers for ${name}, as ${WORDS[f.kind]}? ${rows[0].name} leads, then ${rows.slice(1, -1).map((r) => r.name).join(', ')} and ${rows.at(-1).name}.`,
    body_kind: 'rowset',
    body: {
      register: 'kpis',
      rows: rows.map((r, i) => ({ ...r, thing: project.id, good: r.good ?? 'up', order: i + 1, headline: i === 0, draft: true })),
      why: `These are the numbers ${WORDS[f.kind]} is usually judged by. Each starts as a suggestion you keep or drop.`,
    },
  };
}

/**
 * The script: `input.project` is the project whose kind was set, by id. It reads the project and its key numbers,
 * decides, and files the one question through `ctx.propose`, since a run's own `ask` cannot carry rows to make. A host
 * that hands no `propose` (an agent's trial) gets one sentence in the log and nothing filed.
 */
export default async function run(ctx) {
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const said = typeof input.project === 'string' ? input.project : '';
  if (!/^[0-9A-Za-z_#-]+$/.test(said)) {
    ctx.log('The script was handed no project, so nothing was offered.');
    return null;
  }
  const row = await ctx.record.get(said);
  if (!row || row.register !== 'things') return null;
  const project = { id: row.id, spoken: `things#${row.seq}`, version: row.version, fields: row.fields };
  const kpis = (await ctx.record.list('kpis', { field: 'thing', is: project.id }, { includeDeleted: true })).map((r) => ({ id: r.id, fields: r.fields }));
  const out = kindDrafts(project, kpis);
  if (out.nothing) {
    ctx.log(out.nothing);
    return null;
  }
  if (typeof ctx.propose !== 'function') {
    ctx.log('This run files no questions (a trial files none), so nothing was offered.');
    return null;
  }
  await ctx.propose({ question: out.question, body_kind: out.body_kind, body: out.body, cause: out.cause });
  ctx.log(`Offered key numbers for ${String(project.fields.name ?? 'the project')}.`);
  return { offered: project.spoken };
}

/** The script as Portfolio's pack document writes it: no egress, no keys, started by `kind-offers-kpis`. */
export const KIND_DRAFTS_SCRIPT = {
  script: 'kind_drafts',
  title: 'Offer a project the key numbers of its kind',
  pack: 'portfolio',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['things', 'kpis'],
  writes: ['kpis'],
  source: `${kindDrafts.toString()}\nexport default ${run.toString()}`,
};

/**
 * A WRITE TO A PROJECT'S KIND starts `script.kind_drafts` on the project. NO `when`: a record updating from before 1.19.0
 * plans this rule against a list that has no `kind` yet and refuses the condition, so the script says a kind is set.
 */
export const KIND_DRAFTS_RULE = {
  rule: 'kind-offers-kpis',
  name: 'Offer a project the key numbers of its kind',
  pack: 'portfolio',
  on: { written: { register: 'things', op: ['create', 'update'], fields: ['kind'] } },
  steps: [{ script: { id: 'kind_drafts', as: 'offering', input: { project: '{{trigger.entry}}' } } }],
};

/** The rule and the script, as Portfolio's automations spread them after the backfill. */
export const KIND_DRAFTS = [KIND_DRAFTS_RULE, KIND_DRAFTS_SCRIPT];
