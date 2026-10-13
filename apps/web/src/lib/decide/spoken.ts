/**
 * WORDS A PERSON READS, WITH NO ADDRESS OR ID IN THEM (audit 19 M11, audit 21 #4). Whoever asked a question wrote its
 * words, its answers and why each is offered, and an agent writes `alex@acme.com`, `tasks#8` or a file path into them
 * as readily as a name. Every line of the one decision card that came from somebody else is read through `spoken`.
 *
 * ITS OWN MODULE so the question card (`lib/page/queue-answer.ts`) and the card built on it (`card.ts`) read it alike,
 * with no import running in a circle. PURE, AND NODE LOADS IT.
 */

export { spoken } from 'braindog-render';
