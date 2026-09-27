/* One of the two tables where a currency code is data, which the currency rule does not read: this is not a finding,
   and the case's `total` is what says so, because this path does not name the seed. */
export const pick = (chosen: string | null): string => chosen ?? 'USD';
