/**
 * A DKIM signer for tests: Ed25519 (RFC 8463), `relaxed/relaxed`, signing `from` and `subject`.
 *
 * WRITTEN FROM RFC 6376 AND NOT FROM `dkim.ts`, so a test that passes is two readings of the RFC agreeing and not one
 * reading checked against itself. `keyed` makes a domain's key pair and the TXT lookup that publishes it.
 */

import { webcrypto } from 'node:crypto';

import type { TxtLookup } from '../src/dkim.ts';

export type Signer = { domain: string; selector: string; key: webcrypto.CryptoKey; txt: string };

const b64 = (bytes: ArrayBuffer | Uint8Array): string => btoa(String.fromCharCode(...new Uint8Array(bytes)));

/** A domain's Ed25519 key, and the TXT record that publishes its public half. */
export async function keyed(domain: string, selector = 'sel'): Promise<Signer> {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as unknown as webcrypto.CryptoKeyPair;
  const pub = await crypto.subtle.exportKey('raw', pair.publicKey);
  return { domain, selector, key: pair.privateKey, txt: `v=DKIM1; k=ed25519; p=${b64(pub)}` };
}

/** The lookup that answers each signer's key at `<selector>._domainkey.<domain>`, and `[]` for every other name. */
export const published =
  (...signers: Signer[]): TxtLookup =>
  async (name) => {
    const hit = signers.find((s) => `${s.selector}._domainkey.${s.domain}` === name);
    return hit === undefined ? [] : [hit.txt];
  };

const relaxedHeader = (line: string): string => {
  const colon = line.indexOf(':');
  return `${line.slice(0, colon).trim().toLowerCase()}:${line.slice(colon + 1).replace(/[ \t]+/g, ' ').trim()}`;
};

const relaxedBody = (body: string): string => {
  const lines = body.split('\r\n').map((line) => line.replace(/[ \t]+/g, ' ').replace(/ $/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.length === 0 ? '' : `${lines.join('\r\n')}\r\n`;
};

/** The message with a `DKIM-Signature` by `signer` on top. The message is CRLF throughout and has one `From:` and one `Subject:`. */
export async function sign(message: string, signer: Signer): Promise<string> {
  const split = message.indexOf('\r\n\r\n');
  const head = message.slice(0, split).split('\r\n');
  const body = message.slice(split + 4);
  const bh = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(relaxedBody(body))));
  const pick = (name: string): string => head.filter((l) => l.toLowerCase().startsWith(`${name}:`)).at(-1) ?? `${name}:`;
  const value = `v=1; a=ed25519-sha256; c=relaxed/relaxed; d=${signer.domain}; s=${signer.selector}; h=from:subject; bh=${bh}; b=`;
  const data = `${relaxedHeader(pick('from'))}\r\n${relaxedHeader(pick('subject'))}\r\n${relaxedHeader(`DKIM-Signature: ${value}`)}`;
  const hashed = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  const b = b64(await crypto.subtle.sign('Ed25519', signer.key, hashed));
  return `DKIM-Signature: ${value}${b}\r\n${message}`;
}
