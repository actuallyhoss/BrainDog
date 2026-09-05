import { postable } from '../../../apps/worker/src/deliver.ts';

const cases = [
  'https://2130706433/',          // decimal IPv4 for 127.0.0.1
  'https://0177.0.0.1/',          // octal
  'https://0x7f000001/',          // hex
  'https://127.1/',               // short form
  'https://localhost./',          // trailing dot on localhost
  'https://LOCALHOST./x',
  'https://[::ffff:127.0.0.1]/',  // IPv4-mapped IPv6 loopback
  'https://[0:0:0:0:0:ffff:7f00:1]/',
  'https://[::]/',                // unspecified
  'https://[::1]/',               // the one it does catch
  'https://169.254.169.254/',     // the one it does catch
  'https://user:pass@example.com/',
  'https://evil.com:443@169.254.169.254/',
  'https://metadata.google.internal./',
];

for (const c of cases) {
  let host = '(unparseable)';
  try { host = new URL(c).hostname; } catch {}
  console.log(`${c.padEnd(36)} hostname=${host.padEnd(22)} postable=> ${postable(c)}`);
}
