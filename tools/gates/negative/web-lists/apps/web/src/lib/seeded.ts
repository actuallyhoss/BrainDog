/**
 * A shipped module that knows a pack by its lists and chooses a currency for somebody, which is what `web-lists`
 * exists to refuse.
 *
 * THREE FINDINGS, one of each shape: a list id as a string, a link into a list written as a template with a hole, and a
 * currency code as the last resort of `??`. Everything below them is a decoy the gate must leave alone, each spelled
 * like one of the three: a comment, a longer sentence that starts with an id, a regular expression holding one in
 * quotes, and a time zone after `||`, which is three capitals and no currency.
 */

export const list = 'obligations';

export const link = (seq: number): string => `/r/tasks/${seq}`;

export const currency = (held: string | null): string => held ?? 'GBP';

// const hidden = 'money-core';
export const longer = 'obligations are due this week';
export const pattern = /'people'/u;
export const zone = (said: string | null): string => said || 'UTC';
