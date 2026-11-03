/**
 * A STATE'S WORD AS A PERSON READS IT. A list's own choices reach a change line as the record stores them ("open",
 * "doing", "in_review") wherever the list declares no label for them, beside a question that says "Doing". A short
 * lowercase word or two is taken for such a choice and said with a capital and spaces; anything else (a name, a date,
 * an amount, a sentence) is left exactly as it is.
 */
const CHOICE = /^[a-z][a-z0-9]*(?:[ _-][a-z0-9]+){0,2}$/u;

export const stateWord = (value: string | null): string | null =>
  value !== null && value.length <= 24 && CHOICE.test(value) ? `${value.charAt(0).toUpperCase()}${value.slice(1).replace(/_/gu, ' ')}` : value;
