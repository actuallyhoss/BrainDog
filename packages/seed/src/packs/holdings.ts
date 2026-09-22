/**
 * What a person holds rather than spends: a pack of its own, not part of Money.
 *
 * WHY IT LEFT MONEY. `holdings` arrived in money-core 1.5.0 for fourteen rows in the old tool that had nowhere to go, and
 * every record set up with Money carried it from then on, with `gold` first among its kinds. What one person holds is
 * not what everybody's Money is for, and gold was the use case `loop/DIRECTION.md` section 22 named by name: the code
 * ships primitives, and a person's gold is something built on them. So money-core 2.0.0 stops declaring the list and
 * HANDS it here (`MONEY_CORE_HOLDINGS_HANDS`, spread into money-core's own `hands`), and a record that held rows in it
 * keeps every row, its id and its history through the update and this pack's install (`test/holdings-pack.test.ts`).
 *
 * `gold` IS NOT SHIPPED, AND A RECORD THAT HELD IT KEEPS IT. The kinds are four with no metal among them: a lot of gold
 * is a `commodity`, which is how a count and a cost each is read. When this pack takes over a list that already holds
 * `gold`, the handover keeps what the record's list has and this body lacks as the record's own addition, as a rebase
 * keeps any value an owner added (`packages/declare/src/index.ts`, `carried`), so his eleven lots go on reading as gold
 * and nobody is asked to relabel them. A record that never held the list is offered no `gold` at all.
 *
 * IT NEEDS money-core 2.0.0 OR LATER, AND THAT IS ABOUT ORDER, NOT ABOUT WHAT IT READS. No field here points at another
 * list. But up to 1.8.0 money-core declares `register.holdings` itself, and this pack beside it is refused
 * `PROVIDES_CONFLICT`, a sentence about two packs owning one declaration. With the range in `requires`, the same refusal
 * says the step that is missing: update money-core first, then install holdings. No upper bound, because nothing a later
 * Money could take away is read here. The cost is a record with no Money at all, which this pack refuses; that is a
 * question for whoever offers holdings to such a record, and nothing offers it to one today.
 *
 * NO STARTER USE CASE INSTALLS IT, and whether the catalogue offers it to every record is the owner's call
 * (`loop/research-seed-roles.md`, "For the owner"). The the old tool import proposes it when an export holds assets
 * (`apps/cli/src/import.ts`, `holdingsOf`).
 */

import type { SeedRegister } from '../modules/base.ts';

/** The version of this pack, which moves by `first-party.ts`'s rule: a field or kind added is minor, one taken away major. */
export const HOLDINGS_VERSION = '1.0.0';

/**
 * WHAT A PERSON HOLDS, WHICH IS THE ONE KIND OF ROW THIS RECORD HAD NO HOME FOR.
 *
 * MEASURED, LIVE, BEFORE THE REGISTER WAS WRITTEN: the old tool's `money.assets` holds fourteen rows,
 * being 80 units of gold at EGP 555,435.00 of cost across 11 lots bought between May 2025 and July
 * 2026, a EGP 100,000.00 saving certificate maturing 2028-11-05, and two Northwind policies of
 * USD 202.10 and USD 101.05 of monthly premium against USD 48,000.00 and USD 24,000.00 of sum
 * assured, maturing in 2052 and 2062. `apps/cli/src/legacy.ts` named every one of them in a skip
 * line and said why it was skipped: the nearest list here was an account with a BALANCE, and filing a
 * policy there would count it as cash he could spend. That is the reason it is a register of its own
 * rather than a fourth `accounts.kind`.
 *
 * `test/holdings.test.ts` DRIVES THAT CLAIM RATHER THAN REPEATING IT: it reads `cash-now` over the
 * seeded record, writes all fourteen rows, and reads it again. The figure sums `accounts.balance`
 * where `liquid is true`, so a holding is invisible to it by construction, and the EGP 655,435.00 and
 * USD 287.15 that an accounts-shaped import would have added to the money he has stay out of it.
 *
 * NO FIGURE, NO PAGE AND NO SEED ROW YET, deliberately. The sample record is a London studio that
 * holds nothing of the kind, so since this left Money the sample does not carry the list at all
 * (`holdingsDeclarations` in `../index.ts` adds it for a test); the rows that fill it are an
 * import's. A tile over an empty list would read EGP 0.00 as a fact.
 *
 * AND NO `state:`. Nothing in the fourteen rows says a holding was sold, surrendered or cashed in: the
 * export has a kind, a cost, a day and a maturity and no status at all, so a status here would be one
 * value every row wore, which is a column that says nothing and a `done:` list that hides nothing. It
 * is a field a later version adds when somebody sells a lot, and that is a minor step for the pack.
 *
 * WHAT THE EXPORT CARRIES AND THIS DOES NOT. The two policies keep a sum assured, an accumulated
 * value and a term in years under `meta_json`, and the certificate a term. None of them is a cost and
 * none of them is a quantity, so each would be a column only policies fill and no figure reads; they
 * go in the note, where a person reads them beside the row. A field added later is a minor step for
 * the pack, and a field nobody fills is one nobody can take away.
 */
export const HOLDINGS: SeedRegister = {
  id: 'holdings',
  name: 'Holdings',
  /* `money` AND NOT `vault`, though a safe is what gold and certificates actually live in: `vault` is
     this product's word for the door that seals a credential, and one word for two unrelated things
     is the failure `19 §9` closes. `accounts` and `fx` already wear this glyph, which is the family
     these rows belong to. */
  icon: 'money',
  one: 'holding',
  holds: 'what you hold rather than spend: certificates, policies and commodities, with what each one cost and when it matures',
  title: 'label',
  /**
   * `qty` ON THE CARD, AND NOT `kind`, because a cost each with no count beside it is a WRONG number
   * rather than an incomplete one: the dearest lot in the export reads EGP 8,336.00 on a card and the
   * lot cost EGP 83,360.00, and nothing else on the card says which of the two it is. The kind is the
   * fact a reader can recover, and in all fourteen real rows it is recoverable from the label itself:
   * "Gold 24c", "Saving Certificate", "Northwind 5820614".
   */
  mobile: ['label', 'qty', 'unit_cost'],
  pack: 'holdings',
  fields: [
    /* `Description`, THE WORD `obligations` AND `transactions` ALREADY PUT OVER THE SAME COLUMN. The
       id is `label` because that is what the source calls it and what the importer reads. */
    { id: 'label', label: 'Description', type: 'text', required: true, search: true },
    /**
     * FOUR KINDS AND A CLOSED LIST, because each one is read differently and a fifth is a decision
     * rather than a typo: a certificate is a principal with a maturity, a policy is a premium against a
     * sum assured, a commodity is a count of something bought at a cost each, and `other` is what an
     * import puts a row in rather than dropping it. A record adds a kind of its own the way any closed
     * list grows at run time, which is how a record that held `gold` before 2.0.0 keeps it.
     *
     * `commodity` IS HOW A GOLD LOT IS READ, and it replaced `gold` rather than sitting beside it. A lot
     * is a count and a cost each, bought on a day (`qty`, `unit_cost`, `acquired_on` below), and that is
     * the same for a gram of gold, a bar of silver or a sack of coffee. A kind per metal would be the
     * core naming one person's holdings, which is what this pack left Money for.
     *
     * `search: true` ON AN ENUM, which nothing else in this seed does, and it earns it here. A hit
     * carries the row's title and the two policies are titled `Northwind 5820614` and `Northwind 5836271`,
     * so without this the word *policy* reaches neither of them. `projectedText` indexes every
     * searchable field whatever its type and `declare`'s SEARCHABLE list holds `enum`; the test
     * searches for `policy` and counts two rather than taking that on trust.
     */
    { id: 'kind', label: 'Type', type: 'enum', values: ['certificate', 'policy', 'commodity', 'other'], index: true, required: true, search: true },
    /**
     * HOW MANY, AND IT IS A `decimal` RATHER THAN A `quantity`, WHICH THE EXPORT DECIDED.
     *
     * A `quantity` is a number AND a unit, and the kernel refuses one without a unit in as many words:
     * *"unit names what the number counts, and a quantity without one is a number."* Nothing in the
     * source says what a unit of gold is: all 11 lots carry `meta_json: null`, so an importer
     * declaring `quantity` would have to invent grams or coins for every row, and an invented unit is
     * worse than a stated count with none. `decimal` and not `int` because half a gram is a holding.
     *
     * `qualifies: 'unit_cost'`, WHICH IS THE DECLARATION SAYING A COST EACH CANNOT BE READ ALONE.
     * `services.cycle` carries the same key for the same reason, and `columnsFor` reads it: the count
     * travels with the amount or the amount is a different number from the one a person means.
     */
    { id: 'qty', label: 'How many', type: 'decimal', min: 0, required: true, qualifies: 'unit_cost' },
    /* WHAT ONE OF THEM COST, WITH ITS OWN CURRENCY, and the currency is the field's rather than the
       register's: eleven of his fourteen rows are in Egyptian pounds and two are in dollars, and a
       total over the list is therefore two totals. Nothing here is a valuation. A holding's worth
       today is a rate away and `fx` is where a rate lives; this is what was paid. */
    { id: 'unit_cost', label: 'Cost each', type: 'money', required: true },
    /* THE DAY IT WAS BOUGHT. Indexed, because what a lot cost is only a cost with the day beside it:
       the same 24 carat gold cost EGP 5,373.00 a unit in May 2025 and EGP 8,336.00 in April 2026. Not
       required, for `services`' measured reason: an imported row whose date the source never knew is
       still a row, and a blank day sends somebody to find out where a guessed one stops them. */
    { id: 'acquired_on', type: 'day', index: true },
    /**
     * WHEN IT ENDS, FOR THE THINGS THAT END. Eleven of the fourteen rows have no maturity at all, so
     * this is nullable and a register that required it could not hold a single gold lot.
     *
     * NO `deadline:` AND NO `remind:`, though both were considered. A maturity that has passed is
     * money that ARRIVED, and `deadline:` is what gives a row the tone of a date that was missed: a
     * certificate that matured last year would be drawn late, in red, for having done exactly what it
     * was bought to do. The reminder a person wants here is about the money landing, which belongs to
     * whatever files the arrival rather than to this row.
     */
    { id: 'matures_on', type: 'day', index: true },
    { id: 'note', type: 'text' },
  ],
};

/**
 * What money-core hands to this pack from 2.0.0, as `hands:` in money-core's own document: the one list.
 *
 * HERE AND NOT IN money-core's FILE, for `MONEY_CORE_HANDS`' reason in `bank-hsbc-eg.ts`: the id is this pack's key, and
 * a pack name written out twice drifts. A list with rows is always handed; an empty one is retired when the record says
 * what it uses, and this pack then declares it afresh (`test/holdings-pack.test.ts`).
 */
export const MONEY_CORE_HOLDINGS_HANDS: Readonly<Record<string, string>> = { 'register.holdings': 'holdings' };

/** A list as a document writes it: the kind's key first, `register:` for `id`, and `tags` on the end as every list has. */
const asDeclaration = ({ id, ...rest }: SeedRegister): Record<string, unknown> => ({
  register: id,
  ...rest,
  fields: [...rest.fields, { id: 'tags', type: 'list', of: 'text' }],
});

/** The pack document: one list, no page, no figure, and money-core 2.0.0 or later underneath. */
export function holdingsPack(): Record<string, unknown> {
  return {
    pack: 'holdings',
    version: HOLDINGS_VERSION,
    summary: 'What you hold rather than spend: certificates, policies and commodities, with what each one cost.',
    author: 'BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: { 'money-core': '>=2.0.0' } },
    declarations: [asDeclaration(HOLDINGS)],
  };
}
