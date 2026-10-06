/**
 * PEOPLE AS IT WAS BEFORE 3.0.0, NEAR 2.7.0 AND NOT BYTE FOR BYTE: today's document with the organisations, and the
 * parts of a person that name one, taken out. A record on Founder 1.x held `organisations` as Founder's own list, and
 * the People it held declared none, so a rebuild with today's People would have two packs claiming one list before
 * the update under test began. It is also the owner's own record before the update reaches it: People 2.x, no
 * organisations, no `self` (`loop/STATUS.md`).
 *
 * WHAT GOES WITH THE ORGANISATIONS: a person's `org`, `keys`, `aliases` and `self`, the cards' grouping by `org`
 * (`group`, `fold`), the Organisations cards and figure, an organisation's page, the two rules that meet one, and the
 * parts of the example rows that name any of them.
 */

type Body = Record<string, unknown>;

const LATER = new Set(['org', 'keys', 'aliases', 'self']);

/** The rules People 3.0.0 added, each meeting an organisation, which a People with no list of them could not. */
const LATER_RULES = new Set(['meet-sender-organisations', 'meet-payees']);

export function peopleBefore3(doc: Body): Body {
  const declarations = (doc.declarations as Body[])
    .filter((d) => d.register !== 'organisations' && d.page !== 'relation' && d.metric !== 'organisations-count' && !LATER_RULES.has(String(d.rule)))
    .map((d) => {
      if (d.register === 'people')
        return {
          ...d,
          fields: (d.fields as Body[]).filter((f) => !LATER.has(String(f.id))),
          meets: Object.fromEntries(Object.entries(d.meets as Body).filter(([part]) => !LATER.has(part))),
        };
      if (d.page === 'people' || d.page === 'someone')
        return {
          ...d,
          requires: ['register.people'],
          blocks: (d.blocks as Body[])
            .filter((b) => b.heading !== 'Organisations' && b.heading !== 'Known by')
            .map((b) => {
              const { group: _group, fold: _fold, ...rest } = b;
              return Array.isArray(b.columns) ? { ...rest, columns: (b.columns as Body[]).filter((c) => c.field !== 'org') } : rest;
            }),
        };
      return d;
    });
  const { seeds: all, ...rest } = doc;
  const seeds = ((all as Body[] | undefined) ?? [])
    .filter((x) => x.register !== 'organisations')
    .map((x) => (x.register === 'people' && x.fields ? { ...x, fields: Object.fromEntries(Object.entries(x.fields as Body).filter(([f]) => !LATER.has(f))) } : x));
  return { ...rest, version: '2.7.0', declarations, ...(seeds.length > 0 ? { seeds } : {}) };
}
