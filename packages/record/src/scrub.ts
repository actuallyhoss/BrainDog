/**
 * Words that may go to a model: a third party's address, a link and anything shaped like a key taken out.
 *
 * THE SAME RULE THE HOST KEEPS FOR THE RESOLVE ASK (`host/src/understand.ts` `scrubbed`), here for what the record itself
 * hands a model: a row's title and a block's heading in the look and headline ask (`compose-look.ts` `lookInputOf`), and
 * a name in Slash's reading (`slash.ts` `entitiesOf`). A person met with only an address was named by it, so a page
 * listing people handed the model `rohan.mehta@encore.example` as a title (`loop/research-audit-17.md` M1).
 *
 * PURE, so a test reads it in Node.
 */

import { looksLikeCredential } from '@braindog/kernel';

const ADDRESS = /[^\s<>"'@]+@[^\s<>"'@]+\.[a-z]{2,}/giu;
const LINK = /\b(?:https?:\/\/|www\.)\S+/giu;

/**
 * The text with each address said as `someone at <domain>`, each link as `a link`, and each word that looks like a key as
 * `[hidden]`; `null` when nothing is left or what is left still reads as a key.
 */
export function scrubbed(text: string): string | null {
  const plain = text
    .replace(ADDRESS, (address) => `someone at ${address.slice(address.lastIndexOf('@') + 1).toLowerCase()}`)
    .replace(LINK, 'a link')
    .split(/\s+/u)
    .map((word) => (word !== '' && looksLikeCredential(word) ? '[hidden]' : word))
    .join(' ')
    .trim();
  return plain === '' || plain === '[hidden]' || looksLikeCredential(plain) ? null : plain;
}

/** Whether the text holds nothing a model may not read, so it can go as it is. */
export const clean = (text: string): boolean => scrubbed(text) === text.trim().split(/\s+/u).join(' ');
