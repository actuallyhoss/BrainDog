/**
 * A module's document as the version before things, not rows (24 October) declared it, made from this build's by undoing
 * that one step: money-core 3.19.0's pages for an account and a bill, estate 2.3.0's page for a service, and People 3.6.0's
 * Everyone as faces with the owner left off, and its count of the people Everyone draws. Every rebuild of an older
 * version undoes this first, so a record two versions back is rebuilt as it was.
 */

type Body = Record<string, unknown>;

/** Everyone as People 3.5.0 drew it: a table of the name, what they are and when you last spoke. */
const EVERYONE_LINES = [
  { field: 'name', label: 'Name', width: 'minmax(14ch,2fr)' },
  { field: 'role', label: 'Role', width: '12ch' },
  { field: 'in_touch', label: 'Last spoke', width: '14ch', align: 'end' },
];

const PAGES_ADDED: Readonly<Record<string, ReadonlySet<string>>> = {
  'money-core': new Set(['money-account', 'money-bill']),
  estate: new Set(['service']),
  /* AND WORK'S TIMELINE, the page the Roadmap add-on handed to Work in the add-ons pass of 27 October. */
  work: new Set(['roadmap']),
};

/** A page over every project as a use case declared it before 24 October: only those building or earning had one. */
const HALVES = new Set(['Bills and invoices', 'Keeping it alive']);

const inPlay = (d: Body): Body => {
  const f = d.for as Body | undefined;
  if (!f || f.register !== 'things' || f.where !== undefined) return d;
  /* AND ITS BILLS AND WHAT KEEPS IT ALIVE WERE HALVES, which the parked project's page left beside a hole. */
  const blocks = Array.isArray(d.blocks) ? (d.blocks as Body[]).map((b) => (HALVES.has(String(b.heading)) && b.span === 12 ? { ...b, span: 6 } : b)) : d.blocks;
  return { ...d, for: { register: 'things', where: 'lane is building or earning' }, ...(blocks === undefined ? {} : { blocks }) };
};

/** A use case's document as the version before things, not rows declared it: its project pages for those in play alone. */
export const useCaseThingsUndone = (doc: Body): Body => ({ ...doc, declarations: (doc.declarations as Body[]).map(inPlay) });

export function thingsUndone(id: string, doc: Body): Body {
  const added = PAGES_ADDED[id];
  if (added) return { ...doc, declarations: (doc.declarations as Body[]).filter((d) => !added.has(String(d.page))) };
  if (id !== 'people') return doc;
  return {
    ...doc,
    declarations: (doc.declarations as Body[]).map((d) => {
      if (d.metric === 'people-count') return (({ where: _where, ...rest }) => rest)(d);
      if (d.page !== 'people' || !Array.isArray(d.blocks)) return d;
      return {
        ...d,
        blocks: (d.blocks as Body[]).map((b) => (b.heading === 'Everyone' && b.kind === 'cards' ? { ...b, kind: 'table', where: 'merged_into is empty', columns: EVERYONE_LINES } : b)),
      };
    }),
  };
}
