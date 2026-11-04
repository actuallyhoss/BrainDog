/**
 * PEOPLE AS IT WAS BEFORE 3.0.0, NEAR 2.7.0 AND NOT BYTE FOR BYTE: today's document with the organisations, and the
 * parts of a person that name one, taken out. A record on Founder 1.x held `organisations` as Founder's own list, and
 * the People it held declared none, so a rebuild with today's People would have two packs claiming one list before
 * the update under test began. It is also the owner's own record before the update reaches it: People 2.x, no
 * organisations, no `self`.
 *
 * WHAT GOES WITH THE ORGANISATIONS: a person's `org`, `keys`, `aliases` and `self`, the cards' grouping by `org`
 * (`group`, `fold`), the Organisations cards and figure, an organisation's page, the two rules that meet one, and the
 * parts of the example rows that name any of them.
 */

type Body = Record<string, unknown>;

const LATER = new Set(['org', 'keys', 'aliases', 'self']);

/** A declaration with its `where` set, or with none where nothing is left of it. */
const withWhere = (d: Body, where: unknown): Body => {
  const { where: _was, ...rest } = d;
  return where === undefined ? rest : { ...rest, where };
};

/** The rules People 3.0.0 added, each meeting an organisation, which a People with no list of them could not. */
const LATER_RULES = new Set(['meet-sender-organisations', 'meet-payees']);

/** The figures over the organisations, and the lines drawn on them: `organisations-known` since People 4.2.0. */
/* AND THE TWO BY WHETHER AN ORGANISATION IS A CLIENT, SINCE People 4.3.0 (a4993e50f). */
const ORG_FIGURES = new Set(['organisations-count', 'organisations-from-card-texts', 'organisations-known', 'organisations-clients', 'organisations-not-clients']);

/** A `where` without the clause about who is you, which a People with no `self` cannot read (People 3.6.0 added it). */
const unselfed = (where: unknown): unknown =>
  typeof where === 'string' ? where.split(',').map((c) => c.trim()).filter((c) => c !== '' && !/^self\b/u.test(c)).join(', ') || undefined : where;

export function peopleBefore3(doc: Body): Body {
  const declarations = (doc.declarations as Body[])
    .map((d) => (typeof d.metric === 'string' && typeof d.where === 'string' && /\bself\b/u.test(d.where) ? withWhere(d, unselfed(d.where)) : d))
    .filter((d) => d.register !== 'organisations' && d.page !== 'relation' && !ORG_FIGURES.has(String(d.metric)) && !LATER_RULES.has(String(d.rule)))
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
            .filter((b) => b.heading !== 'Organisations' && b.heading !== 'Known by' && !ORG_FIGURES.has(String((b.when as { metric?: unknown } | undefined)?.metric)))
            .map((b) => {
              const { group: _group, fold: _fold, ...kept } = b;
              const rest = typeof b.where === 'string' && /\bself\b/u.test(b.where) ? withWhere(kept, unselfed(b.where)) : kept;
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
