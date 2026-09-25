/**
 * The currencies a person picks from: the runtime's tender list, the common ones first.
 *
 * A HOME CURRENCY WAS TYPED AS A CODE, and a code somebody half remembers ("LE", "EGY") is no home currency at all, so
 * every figure quietly stayed in parts. The setting is still `text` in the manifest, which is what an agent or the
 * command line writes, and this list is only what the settings screen offers (`routes/packs/[id]` and its
 * `RatesForm.svelte`).
 *
 * MEMBERSHIP IS `Intl`'S ANSWER AND NOT THIS FILE'S, which is `02 §3` rule 1. Whether three letters are a currency is
 * `Intl.supportedValuesOf('currency')`, the runtime's tender list, and it is the list `coerce.ts` refuses a `money`
 * value against. This file used to hold 155 codes of its own, which is the same question asked a second way and drifts
 * in both directions. Measured, it had already drifted one: the runtime lists `XCG`, the Caribbean guilder that became
 * the tender of Curaçao and Sint Maarten in 2025, and the array did not, so the picker could not offer a currency the
 * record would have accepted. Nothing had drifted the other way, which is luck rather than design.
 *
 * WHAT `Intl` CANNOT ANSWER IS WHAT STAYS HERE, and it is two things: which codes a picker offers first, and the
 * judgement that a few of the codes the runtime lists are not money anybody keeps books in. Neither is a membership
 * question, so neither is a fourth list.
 *
 * The call is at module scope in a browser bundle, which `measures.ts` and `shape.ts` in this same app already do.
 */

/**
 * The ones most people hold. A set, because the order a picker offers them in is not this file's to write.
 *
 * IT WAS A LIST THAT LED WITH THE EGYPTIAN POUND, `['EGP', 'USD', 'GBP', 'EUR', ...]`, which is the order of the one
 * person who wrote it, and every picker drew it that way: measured, `currencyChoices` answered `EGP` first for a record
 * at `GBP`, at `JPY` and with no home currency at all, and the rates form drew it directly. So the order is now asked
 * of the record (its home currency first, in `currencyChoices`) and, with none, of the runtime.
 *
 * AND `EGP` IS NO LONGER ONE OF THEM, which leaves eleven. With the order fixed it was still the twelfth, on the list for
 * the same reason it had led it, and `tools/gates/shell-words.mjs` exempted this file by name for that one code. A
 * record at `EGP` loses nothing by it: `currencyChoices` leads the common group with the held code whichever group it
 * came from, and `currencies.test.ts` holds that for `EGP` in particular.
 */
const COMMON = new Set(['AED', 'AUD', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'INR', 'JPY', 'SAR', 'USD']);

/**
 * The codes the runtime lists that the picker does not offer, each with the reason it is not offered.
 *
 * THIS ONLY EVER SHRINKS `Intl`'S LIST, which is what keeps it from being a membership list of its own. A code it is
 * wrong about is a code the picker fails to offer, and `currencyChoices` already draws a held code the picker lacks; it
 * can never let through a code the record would refuse. The two kinds here are a currency CLDR still names years after
 * its country stopped spending it, and a unit of account that was never tender. A picker offering the Croatian kuna
 * beside the euro is asking somebody to file their books in a currency that no longer exists.
 *
 * `XAU`, `XTS`, `XXX` and the other metals, funds and testing codes need no entry: the runtime's tender list omits them
 * already, and `CLF`, `UYI` and `UYW` with them.
 */
const NOT_OFFERED: Readonly<Record<string, string>> = {
  CUC: 'Cuba withdrew the convertible peso in 2021',
  HRK: 'Croatia took the euro in 2023',
  SLL: 'redenominated a thousandfold as SLE in 2022',
  XDR: "the IMF's special drawing right, a reserve unit and not tender",
  XSU: 'the sucre, a regional clearing unit and not tender',
  ZWL: 'redenominated as ZWG in 2024',
};

/** Every code the picker offers, in code order. */
export const OFFERED_CURRENCIES: readonly string[] = Intl.supportedValuesOf('currency')
  .filter((code) => !(code in NOT_OFFERED))
  .sort();

/** The common ones in the order the runtime lists them, which is code order, so no one person's currency is first. */
export const COMMON_CURRENCIES: readonly string[] = OFFERED_CURRENCIES.filter((c) => COMMON.has(c));

/** The rest, after the common ones, in code order. */
export const OTHER_CURRENCIES: readonly string[] = OFFERED_CURRENCIES.filter((c) => !COMMON.has(c));

const CODE = /^[A-Z]{3}$/u;

/**
 * The codes a picker offers for a value it holds now: the list, and the held value first when it is a code the list
 * does not offer, so a record whose setting an agent wrote as `XAU` still draws what it holds rather than a blank.
 *
 * THE TEST IS AGAINST WHAT THE PICKER OFFERS AND NOT AGAINST `Intl`, because the two differ on purpose. A record left
 * holding `HRK` is holding a code the runtime still knows and the picker deliberately drops, and asking `Intl` here
 * would leave that setting drawing as empty: the one screen where the wrong answer is invisible.
 *
 * AND A HELD CODE THE PICKER OFFERS LEADS THE COMMON GROUP, common or not, and leaves the other group, so a record at
 * `NZD` is offered `NZD` first and once. Two options with one value is a select that reports whichever it met first.
 * The settings screen passes the home currency it holds, and the rates form passes the same, so both lead with the
 * record's own money.
 */
export function currencyChoices(held: string): { common: readonly string[]; other: readonly string[] } {
  const code = held.trim().toUpperCase();
  if (!OFFERED_CURRENCIES.includes(code))
    return { common: COMMON_CURRENCIES, other: CODE.test(code) ? [code, ...OTHER_CURRENCIES] : OTHER_CURRENCIES };
  return {
    common: [code, ...COMMON_CURRENCIES.filter((c) => c !== code)],
    other: OTHER_CURRENCIES.includes(code) ? OTHER_CURRENCIES.filter((c) => c !== code) : OTHER_CURRENCIES,
  };
}
