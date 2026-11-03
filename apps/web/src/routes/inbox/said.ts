/**
 * How an arrival's sender and words read on a row, from what the record holds (`from`, `body`). PURE.
 *
 * A SENDER BY NAME: "Dana Reyes <dana@reyes.example>" is said "Dana Reyes"; an address with no name is said as itself.
 * The address stays in the open row's words, where the message is read whole.
 *
 * A MESSAGE'S OWN WORDS, NOT ITS ENVELOPE: mail a self-host takes at its door keeps the whole message, so its body began
 * "From: … To: … Subject: … Message-ID: … Content-Type: …" and the row's first words were headers. A body that opens
 * with a block of header lines is read from the first blank line after them; any other body is left as it is.
 */

/** The name a sender gave, or the address where they gave none. */
export function senderName(from: string): string {
  const m = /^\s*"?([^"<]*?)"?\s*<([^<>]+)>\s*$/u.exec(from);
  if (!m) return from.trim();
  const name = (m[1] ?? '').trim();
  return name !== '' ? name : (m[2] ?? '').trim();
}

const HEADER = /^[A-Za-z][A-Za-z0-9-]*:\s/u;
const FOLDED = /^[ \t]+\S/u;

/** The message's words, without the header block a whole message opens with. */
export function bodyText(body: string): string {
  const lines = body.replace(/\r\n?/gu, '\n').split('\n');
  if (lines.length < 2 || !HEADER.test(lines[0] ?? '')) return body;
  let i = 0;
  while (i < lines.length && (HEADER.test(lines[i]!) || (i > 0 && FOLDED.test(lines[i]!)))) i++;
  /* TWO HEADERS AT LEAST, THEN A BLANK LINE: "Note: call Sam" over a paragraph is somebody's words, not an envelope. */
  if (i < 2 || i >= lines.length || lines[i]!.trim() !== '') return body;
  const rest = lines.slice(i + 1).join('\n').trim();
  return rest === '' ? body : rest;
}
