/**
 * The currencies a person picks from: ISO 4217's codes, the common ones first.
 *
 * A HOME CURRENCY WAS TYPED AS A CODE, and a code somebody half remembers ("LE", "EGY") is no home currency at all, so
 * every figure quietly stayed in parts. The setting is still `text` in the manifest, which is what an agent or the
 * command line writes, and this list is only what the settings screen offers (`routes/packs/[id]`). Funds, precious
 * metals and testing codes (XAU, XTS, XXX and the like) are left out: nobody keeps their books in them.
 */

/** The ones most people hold, in the order the picker offers them. */
export const COMMON_CURRENCIES = ['EGP', 'USD', 'GBP', 'EUR', 'SAR', 'AED', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR'] as const;

/** Every active ISO 4217 currency code, in code order. */
export const ISO_4217 = [
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND',
  'BOB', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHF', 'CLP', 'CNY', 'COP', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF',
  'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD',
  'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW',
  'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR',
  'MVR', 'MWK', 'MXN', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN',
  'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC',
  'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'UYU', 'UZS', 'VES', 'VND',
  'VUV', 'WST', 'XAF', 'XCD', 'XOF', 'XPF', 'YER', 'ZAR', 'ZMW', 'ZWG',
] as const;

/** The rest, after the common ones, in code order. */
export const OTHER_CURRENCIES: readonly string[] = ISO_4217.filter((c) => !(COMMON_CURRENCIES as readonly string[]).includes(c));

const CODE = /^[A-Z]{3}$/u;

/**
 * The codes a picker offers for a value it holds now: the list, and the held value first when it is a code the list
 * does not have, so a record whose setting an agent wrote as `XAU` still draws what it holds rather than a blank.
 */
export function currencyChoices(held: string): { common: readonly string[]; other: readonly string[] } {
  const code = held.trim().toUpperCase();
  const known = (ISO_4217 as readonly string[]).includes(code);
  return { common: COMMON_CURRENCIES, other: CODE.test(code) && !known ? [code, ...OTHER_CURRENCIES] : OTHER_CURRENCIES };
}
