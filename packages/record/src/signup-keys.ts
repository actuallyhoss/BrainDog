/**
 * The keys sign-up's brakes count by: a network address as the place it stands for, and a mail address as the mailbox
 * it reaches.
 *
 * WHY THESE ARE NOT THE RAW STRINGS. Sign-up is open to strangers before the bot check is keyed, so the strikes
 * `signup:<ip>`, `signup-email:<address>` and `email:<address>` are the whole brake. Keyed on the raw text, one IPv6
 * /64 (what one home or one cheap server is handed) is 2^64 fresh keys, and `a+1@x`, `a+2@x` and `a.b@gmail.com` are
 * each their own count while every letter lands in one mailbox. So each key is the thing a person holds, not the
 * spelling a script chose.
 *
 * PURE, AND FAILS TIGHT. Nothing here throws or looks anything up. A value that cannot be read is kept as it came,
 * trimmed and lower-cased, and an empty one stays empty, so every caller without an address shares one key.
 */

/** The 8 hextets of an IPv6 address, or `null` when it is not one. Takes `::`, a zone (`%eth0`) and a dotted tail. */
function hextets(raw: string): number[] | null {
  let s = raw.replace(/^\[|\]$/g, '');
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  if (!s.includes(':')) return null;
  /* A DOTTED TAIL (`::ffff:192.0.2.1`) is the last two hextets written as IPv4. */
  const dotted = /(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s)?.[1];
  let tail: number[] = [];
  if (dotted !== undefined) {
    const four = ipv4(dotted);
    if (four === null) return null;
    tail = [four >>> 16, four & 0xffff];
    s = s.slice(0, s.length - dotted.length);
    if (s.endsWith(':') && !s.endsWith('::')) s = s.slice(0, -1);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const part = (h: string): number[] | null => {
    if (h === '') return [];
    const out: number[] = [];
    for (const g of h.split(':')) {
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const [first = '', second] = halves;
  const head = part(first);
  const rest = second === undefined ? [] : part(second);
  if (!head || !rest) return null;
  const given = head.length + rest.length + tail.length;
  if (halves.length === 1) return given === 8 ? [...head, ...tail] : null;
  if (given > 7) return null;
  return [...head, ...new Array<number>(8 - given).fill(0), ...rest, ...tail];
}

/** A dotted IPv4 address as one 32-bit number, or `null`. */
function ipv4(s: string): number | null {
  const parts = s.split('.');
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null;
  return parts.reduce((n, p) => n * 256 + Number(p), 0);
}

/**
 * The place a network address stands for: an IPv6 address becomes its /64, written one way however it was typed
 * (`2001:db8:0:1::/64`); IPv4 stays whole; an IPv4 address written as IPv6 (`::ffff:192.0.2.1`) is that IPv4 address.
 * Anything else is kept as it came, trimmed and lower-cased, and an empty one stays empty.
 */
export function ipBucket(ip: string): string {
  const s = ip.trim().toLowerCase();
  if (s === '') return '';
  const h = hextets(s);
  if (!h) return s;
  const [, , , , , mapped, hi = 0, lo = 0] = h;
  if (h.slice(0, 5).every((n) => n === 0) && mapped === 0xffff) return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  const prefix = h.slice(0, 4).map((n) => n.toString(16));
  /* THE SHORTEST SPELLING, so `2001:db8::` and `2001:0db8:0000:0000::` agree: the trailing zero hextets fold into `::`. */
  while (prefix.length > 0 && prefix[prefix.length - 1] === '0') prefix.pop();
  return `${prefix.join(':')}::/64`;
}

/** Mail hosts that ignore dots in the name before the `@`, and the one name each is folded to. */
const DOTLESS: Record<string, string> = { 'gmail.com': 'gmail.com', 'googlemail.com': 'gmail.com' };

/**
 * The mailbox an address reaches: trimmed, lower-cased, a `+tag` dropped wherever it is sent, and for Gmail the dots
 * dropped and `googlemail.com` folded to `gmail.com`. A dot anywhere else stays, because other hosts read it. A string
 * with no `@` is kept as it came, trimmed and lower-cased.
 */
export function mailCanon(address: string): string {
  const s = address.trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at < 0) return s;
  let local = s.slice(0, at);
  let domain = s.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  const fold = DOTLESS[domain];
  if (fold !== undefined) {
    local = local.replaceAll('.', '');
    domain = fold;
  }
  return `${local}@${domain}`;
}
