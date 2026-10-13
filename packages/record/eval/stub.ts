/**
 * The model `--dry` asks in place of a real one: no key, no network, the same answer every run.
 *
 * IT DRAFTS WHAT A GOOD MODEL WOULD, so the dry run walks every step a real answer does: a list, the figure over it and the
 * page that says it, drawn by `previewChange` and held to `calmFaults`. A case marked `mends` answers its first draft with
 * a list that says nothing when it is empty, which the record refuses and hands back, and the stub mends it on the repair,
 * so the repair path and the first-try score are both walked. A description about a page changes that page and keeps its id.
 *
 * ITS HEADLINES ARE THE RULES' OWN LINES WITH EACH NUMBER AS ITS FIGURE'S HOLE (`holedRules`), which `headlineFault`
 * keeps, so a dry run that drops one has found a fault in the scorer and not in a model.
 */

import type { HeadlineInput, SlashModel, SlashModelInput } from '../src/index.ts';
import { holedRules } from '../src/headlines.ts';
import { CASES } from './cases.ts';

const changeOf = (input: SlashModelInput): unknown => {
  const c = CASES.find((x) => x.asked === input.asked);
  if (c === undefined) return { drafts: [] };
  /* A DESCRIPTION THAT NEEDS THE FULL LEVEL IS ANSWERED WITH ALL OF IT (`stub.built` in `cases.ts`), so a dry run draws
     the page a good answer declares. One marked `mends` leaves out what its table says when empty on the first ask. */
  if (c.stub.built !== undefined && input.page === undefined) {
    const { declarations, rows } = structuredClone(c.stub.built);
    if (c.stub.mends === true && input.repair === undefined)
      for (const d of declarations)
        if (d.kind === 'page')
          for (const b of (d.body as { blocks: Record<string, unknown>[] }).blocks) if (b['kind'] === 'table') delete b['empty'];
    return { drafts: [{ question: `Build ${c.stub.title} for you, as you described it?`, body_kind: 'change', body: { to: { declarations } }, rows }] };
  }
  const { list, title, one, icon } = c.stub;
  if (input.page !== undefined) {
    const body = structuredClone(input.page.body) as { blocks?: Record<string, unknown>[] };
    for (const b of body.blocks ?? []) if (b['kind'] === 'table') b['order'] = [{ field: 'due', dir: 'asc' }];
    return { drafts: [{ question: `Put the late ${one}s first on ${title}?`, body_kind: 'change', body: { to: { id: input.page.id, kind: 'page', body } } }] };
  }
  const mended = c.stub.mends !== true || input.repair !== undefined;
  const open = `${list}-open`;
  const declarations = [
    {
      id: `register.${list}`,
      kind: 'register',
      body: {
        id: list,
        name: title,
        title: 'what',
        fields: [
          { id: 'what', type: 'text', required: true },
          { id: 'due', type: 'day' },
          { id: 'state', type: 'enum', values: ['open', 'done'] },
        ],
        state: 'state',
        done: ['done'],
      },
    },
    {
      id: `metric.${open}`,
      kind: 'metric',
      body: { metric: open, name: `Open ${one}s`, source: `register.${list}`, where: 'state is open', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' },
    },
    {
      id: `page.${list}`,
      kind: 'page',
      body: {
        page: list,
        title,
        icon,
        requires: [`register.${list}`],
        blocks: [
          { kind: 'note', lead: true, span: 12, body: `{{${open}}} ${one}s still open.` },
          {
            kind: 'table',
            heading: 'Still open',
            icon,
            span: 12,
            source: `register.${list}`,
            where: 'state is open',
            columns: [{ field: 'what' }, { field: 'due' }],
            order: [{ field: 'due', dir: 'asc' }],
            ...(mended ? { empty: `Nothing open on ${title}.` } : {}),
          },
        ],
      },
    },
  ];
  const rows = { [list]: [{ what: `First ${one}`, due: '2026-10-09', state: 'open' }, { what: `Second ${one}`, due: '2026-10-16', state: 'open' }] };
  return { drafts: [{ question: `Build ${title} for you, with every ${one} still open?`, body_kind: 'change', body: { to: { declarations } }, rows }] };
};

export const STUB: SlashModel = {
  name: 'dry stub',
  draft: async (input) => changeOf(input),
  headline: async (input: HeadlineInput) => ({ lines: Object.fromEntries(input.pages.map((p) => [p.page, holedRules(p)])) }),
};
