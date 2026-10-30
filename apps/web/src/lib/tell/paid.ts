/**
 * The states that say money has moved, in the words lists use for it. `read.ts` marks a payment with one and
 * `first-today.ts` says "a payment" by them. Its own file so Today can say that without loading the sentence reader,
 * which `TellOne.svelte` asks for after it draws.
 */
export const PAID_STATES: readonly string[] = ['paid', 'cleared', 'settled', 'received', 'done'];
