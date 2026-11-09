/**
 * Words that may go to a model: a third party's address, a link and anything shaped like a key taken out.
 *
 * THE SAME RULE THE HOST KEEPS FOR THE RESOLVE ASK (`host/src/understand.ts` `scrubbed`), here for what the record itself
 * hands a model: a row's title and a block's heading in the look and headline ask (`compose-look.ts` `lookInputOf`), and
 * a name in Slash's reading (`slash.ts` `entitiesOf`). A person met with only an address was named by it, so a page
 * listing people handed the model `ines.duarte@orchardline.example` as a title.
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

/**
 * The text with what reads as a key said as `[hidden]` and nothing else changed: its lines, spaces, addresses and links
 * stay, for an agent reading a script's log (`logOf`). A word that reads as a key goes; a line that still reads as one
 * after that, a shape spread over words such as a Bearer header, goes whole.
 */
export function keysHidden(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (!looksLikeCredential(line)) return line;
      const kept = line
        .split(/(\s+)/u)
        .map((word) => (word.trim() !== '' && looksLikeCredential(word) ? '[hidden]' : word))
        .join('');
      return looksLikeCredential(kept) ? '[hidden]' : kept;
    })
    .join('\n');
}

/** An address in brackets beside a name, `Jo <jo@kiln.example>` or `Jo (jo@kiln.example)`, with the space before it. */
const BRACKETED = /\s*[<([]\s*[^\s<>"'@()[\]]+@[^\s<>"'@()[\]]+\.[a-z]{2,}\s*[>)\]]/giu;

/**
 * A name as a person reads it, or `null` where it was only an address, as the MCP's own `nameOnly` reads one
 * (`packages/mcp/src/brief.ts`): `Jo <jo@kiln.example>` is `Jo`, and `jo@kiln.example` names nobody. The record keeps
 * an address as somebody's name when it knew no other.
 */
export function nameOnly(said: string): string | null {
  const kept = said.replace(BRACKETED, '').trim();
  return kept === '' || /[^\s<>"'@]+@[^\s<>"'@]+\.[a-z]{2,}/iu.test(kept) ? null : kept;
}

/**
 * A row's name said without an address in it: its name when it has one, else each address said as the part before its
 * `@`, as the kernel names a person it met only by an address. `null` when nothing is left.
 */
export function spokenName(said: string): string | null {
  const name = nameOnly(said);
  if (name !== null) return name;
  const plain = said.replace(BRACKETED, '').replace(/([^\s<>"'@]+)@[^\s<>"'@]+\.[a-z]{2,}/giu, '$1').trim();
  return plain === '' ? null : plain;
}
