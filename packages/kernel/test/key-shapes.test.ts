/**
 * The key shapes found getting past the kernel's check on an import, and the corpus they must not cost.
 *
 * Each of these was driven into a real record and read back: a random token in an MCP endpoint's path, a Telegram bot
 * URL, a GitHub token with a zero-width space in it, a hex key after `api_key=`, and a password or a token in a `url`,
 * `email` or `json` field, which had no check at all. Every case in the first half was measured stored before the
 * repair but two: the Twilio token and the webhook secret. Their name runs into them with `_` and `=`, which the
 * random-run test reads as one run, so it caught this seed's by chance and passed another's. The named-hex shape is
 * what catches them on every seed.
 *
 * THE SECOND HALF IS WHY THE FIRST HALF IS NARROW. A check that refuses a Google Doc's link, an order number or a
 * sentence in Arabic with a direction mark in it is a check an owner learns to route round, and then it guards
 * nothing. So every shape added here was run against the corpus below before it was kept.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { coerce, looksLikeCredential } from '../src/coerce.ts';
import type { FieldDecl } from '../src/coerce.ts';

/** A random token from a fixed seed, so the same token on every run, and no key sits whole in this file. */
function noise(n: number, seed: number, abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string {
  let x = seed;
  let out = '';
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    out += abc[Math.floor((x / 2147483648) * abc.length)];
  }
  return out;
}
const hex = (n: number, seed: number): string => noise(n, seed, '0123456789abcdef');
const j = (...parts: string[]): string => parts.join('');

const GITHUB = j('gh', 'p_', noise(36, 11));
const refusedAs = (type: FieldDecl['type'], value: unknown): string => {
  const out = coerce({ id: 'x', type }, value);
  return out.ok ? 'STORED' : `${out.refusal.code}: ${out.refusal.fix}`;
};
const KEY = 'VALUE_MALFORMED: x holds what looks like a key, and a key never goes in a row. Deposit it in the keychain, and write here what it opens.';

/* ── what got through ─────────────────────────────────────────────────────── */

const MISSED: Record<string, string> = {
  /* THE PATH EXEMPTION IS FOR A LINK TO A DOCUMENT, and an endpoint is not one. A random path segment and the shape
     Zapier's MCP address really takes, a base64 secret between `/s/` and `/mcp`. */
  'a token in an MCP endpoint path': j('https://mcp.example.com/api/mcp/s/', noise(48, 3), '/sse'),
  'a Zapier-style MCP address': j('https://mcp.zapier.com/api/mcp/s/', Buffer.from(`${noise(36, 4)}:${noise(36, 5)}`).toString('base64'), '/mcp'),
  'a token after /key/ on any host': j('https://example.com/integrations/key/', noise(40, 6), '/run'),
  /* THE HOST CAN SAY IT TOO, with no telling word in the path. Without this case the host half of the endpoint test
     could be deleted and every test here stayed green (measured). */
  'a token under a hooks. host': j('https://hooks.example.net/incoming/', noise(48, 40), '/run'),
  'a Telegram bot URL': j('https://api.telegram.org/', 'bot', '123456789:', noise(35, 7), '/sendMessage'),
  'a Telegram bot token under a plain host': j('https://relay.example.net/', 'bot', '8123456789:', noise(35, 8, 'abcdefghijklmnopqrstuvwxyz0123456789_-'), '/getUpdates'),
  'a run of 64 in any link': j('https://files.example.com/share/', noise(72, 9), '/view'),

  /* INVISIBLE, SO THE PERSON WHO PASTED IT NEVER SAW IT, and each one breaks every shape above in two. */
  'a zero-width space': j(GITHUB.slice(0, 18), '\u200b', GITHUB.slice(18)),
  'a soft hyphen': j(GITHUB.slice(0, 18), '\u00ad', GITHUB.slice(18)),
  'a word joiner': j(GITHUB.slice(0, 18), '\u2060', GITHUB.slice(18)),
  'a byte-order mark': j(GITHUB.slice(0, 18), '\ufeff', GITHUB.slice(18)),
  'a zero-width joiner in a random token': j(noise(20, 12), '\u200d', noise(20, 13)),
  'a direction mark in a random token': j(noise(20, 14), '\u200e', noise(20, 15)),

  /* HEX HAS NO CAPITALS, so the random-run test never reads it, and a digest must still pass. What says it is a key
     is the name in front of it or the issuer's own prefix. */
  'twenty hex after api_key=': j('https://api.example.com/v1/stats?api', '_key=', hex(20, 16)),
  'a Twilio auth token': j('TWILIO_AUTH', '_TOKEN=', hex(32, 17)),
  'a webhook secret': j('WEBHOOK', '_SECRET=', hex(64, 18)),
  'a JSON token field': j('{"access', '_token": "', hex(40, 19), '"}'),
  'DigitalOcean': j('dop', '_v1_', hex(64, 20)),
  'Mailgun': j('key', '-', hex(32, 21)),
};

/* EVERY MISS AT ONCE, so a red run names all of them rather than the first. */
test('THE SHAPES DRIVEN INTO A RECORD are refused in a text field', () => {
  const stored = Object.entries(MISSED)
    .filter(([, text]) => !looksLikeCredential(text) || refusedAs('text', `For the record: ${text}`) !== KEY)
    .map(([what]) => what);
  assert.deepEqual(stored, []);
});

test('A URL, AN EMAIL AND A JSON FIELD GET THE CHECK A TEXT FIELD GETS', () => {
  /* Measured: both were STORED. A url field is where an MCP address is most likely kept. */
  const cases: [string, FieldDecl['type'], unknown][] = [
    ['a password in a url', 'url', j('https://admin', ':', 'S3cretPw', '@git.example.com/skills.git')],
    ['an MCP endpoint in a url', 'url', MISSED['a token in an MCP endpoint path']],
    ['a token in a url query', 'url', j('https://api.example.com/v1?token=', noise(40, 22))],
    ['a token as an address', 'email', `${GITHUB}@example.com`],
    ['a header in a json', 'json', { headers: { Authorization: `token ${GITHUB}` } }],
    ['a key deep in a json', 'json', [1, 'fine', [{ deep: MISSED['DigitalOcean'] }]]],
    ['a key used as an object key', 'json', { [GITHUB]: true }],
  ];
  assert.deepEqual(cases.filter(([, type, value]) => refusedAs(type, value) !== KEY).map(([what]) => what), []);

  /* A list of urls is judged element by element, and says which one. */
  const out = coerce({ id: 'links', type: 'list', of: 'url' }, ['https://example.com/a', MISSED['a Telegram bot URL']]);
  assert.equal(out.ok ? 'STORED' : `${out.refusal.code} at ${out.refusal.at}`, 'VALUE_MALFORMED at links[1]');
});

/* ── what must still pass ─────────────────────────────────────────────────── */

const SENTENCES = [
  'Paid the landlord 4,250,000.00 EGP on 1 November, and the receipt is in the drawer.',
  'Company operating account: 12,500.00 USD after the transfer cleared on 2026-09-17.',
  'The API key lives in the keychain under "Stripe live"; rotate it before the audit.',
  'Set the token and the secret in the dashboard, then press Save. The key is not in this note.',
  'Use Authorization: Bearer <token> with the key from the keychain.',
  'api_key=YOUR_KEY_HERE and secret=CHANGE_ME in the example config.',
  'The monkey: 0123456789 is the phone number on the invoice.',
  'قال إنه سيدفع \u200f٤٬٢٥٠ جنيه\u200f يوم الخميس، والإيصال مع المحاسب.',
  'Family 👨\u200d👩\u200d👧 dinner at 8, booked under Sam.',
  'ConfigurationManagerFactoryImpl2024Version was renamed in the refactor.',
  'Order #A1B2-C3D4-E5F6, tracking 1Z999AA10123456784, IBAN EG380019000500000000263180002.',
  'The sha of the release is e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.',
  'commit 4464966a1b2c3d4e5f60718293a4b5c6d7e8f901 fixed it; see #412.',
  'cache_key 01J8ZQ6N3R4V5W6X7Y8Z9A0B1C, run 3f2b8c1e-9d4a-4b7e-8f6a-2c1d0e9b8a7f.',
  'Colour #1A2B3C on #FFFFFF, 16px, line-height 1.5.',
  'Keys: office, car and the spare in the key-box by the door.',
  'A key-value store holds it, not a key- prefixed hash.',
];

const LINKS = [
  `https://docs.google.com/document/d/${noise(44, 30)}/edit`,
  `https://docs.google.com/spreadsheets/d/${noise(44, 31)}/edit#gid=0`,
  `https://drive.google.com/file/d/${noise(33, 32)}/view?usp=sharing`,
  `https://drive.google.com/drive/folders/${noise(33, 33)}`,
  `https://www.googleapis.com/drive/v3/files/${noise(44, 34)}?alt=media`,
  `https://contoso.sharepoint.com/:w:/g/personal/sam/${noise(46, 35, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-')}?e=abc123`,
  `https://www.figma.com/design/${noise(22, 36)}/BrainDog-Home?node-id=1-2`,
  `https://www.notion.so/acme/Quarterly-plan-${hex(32, 37)}`,
  `https://www.loom.com/share/${hex(32, 38)}`,
  'https://github.com/acme/braindog/commit/4464966a1b2c3d4e5f60718293a4b5c6d7e8f901',
  'https://api.github.com/repos/acme/braindog/commits/4464966a1b2c3d4e5f60718293a4b5c6d7e8f901',
  'https://api.stripe.com/v1/customers/cus_NffrFeUfNV2Hib',
  'https://dashboard.stripe.com/payments/pi_3NtXyZ2eZvKYlo2C1abcDEFG',
  'https://mcp.example.com/mcp',
  'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.google.com/maps/place/Cairo/@30.0444,31.2357,12z/data=!3m1!4b1!4m6!3m5!1s0x14583fa60b21beeb:0x79dfb296e8423bba',
  'https://example.com/blog/how-to-write-a-good-commit-message-in-2026',
  'https://brain.dog/p/sam-quarterly-plan',
  'mailto:sam@example.com?subject=Invoice%20412',
];

const ADDRESSES = ['sam@example.com', 'accounts+receipts@company.example.eg', 'first.last@sub.example.co.uk'];

const DOCUMENTS: unknown[] = [
  { amount: 4_250_000, currency: 'EGP', memo: 'rent', sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
  { id: '01J8ZQ6N3R4V5W6X7Y8Z9A0B1C', links: LINKS.slice(0, 4), tags: ['home', 'q4'] },
  [1, 2, 3, null, true, 'text'],
];

test('AND THE CORPUS IT MUST NOT COST: sentences, amounts, ids, links, addresses and documents', () => {
  const refused = [
    ...[...SENTENCES, ...LINKS].filter((text) => looksLikeCredential(text) || refusedAs('text', text) !== 'STORED'),
    ...LINKS.filter((link) => refusedAs('url', link) !== 'STORED'),
    ...ADDRESSES.filter((address) => refusedAs('email', address) !== 'STORED'),
    ...DOCUMENTS.filter((doc) => refusedAs('json', doc) !== 'STORED').map((doc) => JSON.stringify(doc)),
  ];
  assert.deepEqual(refused, []);
});

/* ── links people really paste ────────────────────────────────────────────── */

/* EACH ONE IN THE SHAPE ITS SERVICE REALLY HANDS OUT, with made-up ids of the real length and alphabet. The Teams id is
   base64 of a GUID, as Teams writes it, and it was refused by the first version of the endpoint check, which measured a
   73-long path segment rather than the 58-long run inside it (measured). Zoom's `pwd=`, a Doc's `resourcekey=` and a
   safe-links wrapper were refused at HEAD too, because a query was judged whole, and so was a real YouTube playlist id
   tried by hand; this seed's passes there by chance. */
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const guid = (seed: number): string => [hex(8, seed), hex(4, seed + 1), hex(4, seed + 2), hex(4, seed + 3), hex(12, seed + 4)].join('-');
const TEAMS = `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${Buffer.from(guid(50)).toString('base64')}%40thread.v2/0?context=%7b%22Tid%22%3a%22${guid(51)}%22%2c%22Oid%22%3a%22${guid(52)}%22%7d`;

const REAL_LINKS: Record<string, string> = {
  'Teams meeting': TEAMS,
  'Teams channel': `https://teams.microsoft.com/l/channel/19%3a${hex(32, 53)}%40thread.tacv2/General?groupId=${guid(54)}&tenantId=${guid(55)}`,
  'Teams meeting behind Outlook safe links': `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent(TEAMS)}&data=05%7C02%7C%7C${hex(32, 56)}%7C${hex(32, 57)}%7C0%7C0%7C638624%7CUnknown&reserved=0`,
  'Zoom, passcode as older links carry it': `https://us02web.zoom.us/j/85012345678?pwd=${Buffer.from(noise(24, 58)).toString('base64')}`,
  'Zoom, passcode as newer links carry it': `https://us06web.zoom.us/j/81234567890?pwd=${noise(32, 59)}.1`,
  'Zoom webinar': 'https://us06web.zoom.us/w/81234567890?tk=&uuid=',
  'Google Meet': 'https://meet.google.com/abc-mnop-xyz?authuser=0&hs=122',
  'Google Doc shared with a resource key': `https://docs.google.com/document/d/${noise(44, 60, B64URL)}/edit?usp=sharing&resourcekey=0-${noise(22, 61, B64URL)}`,
  'Google Sheet on a tab': `https://docs.google.com/spreadsheets/d/${noise(44, 62, B64URL)}/edit#gid=1834720594`,
  'Google Slides': `https://docs.google.com/presentation/d/${noise(44, 63, B64URL)}/edit?slide=id.p1`,
  'Notion page': `https://www.notion.so/acme/Launch-plan-${hex(32, 64)}?pvs=4`,
  'Notion database view with a peek': `https://www.notion.so/${hex(32, 65)}?v=${hex(32, 66)}&p=${hex(32, 67)}&pm=s`,
  'Figma design on a node': `https://www.figma.com/design/${noise(22, 68)}/BrainDog-Home?node-id=1204-5521&t=${noise(16, 69)}-0`,
  'Figma prototype': `https://www.figma.com/proto/${noise(22, 70)}/BrainDog?page-id=0%3A1&node-id=12-34&starting-point-node-id=12%3A34&scaling=scale-down`,
  'YouTube in a playlist': `https://www.youtube.com/watch?v=${noise(11, 71, B64URL)}&list=PL${noise(32, 72, B64URL)}&index=3`,
  'YouTube shared from the app': `https://youtu.be/${noise(11, 73, B64URL)}?si=${noise(16, 74, B64URL)}`,
  'YouTube short': `https://www.youtube.com/shorts/${noise(11, 75, B64URL)}`,
  'Stripe payment': `https://dashboard.stripe.com/payments/pi_3${noise(23, 76)}`,
  'Stripe customer in test mode': `https://dashboard.stripe.com/test/customers/cus_${noise(14, 77)}`,
  'Stripe connected account invoice': `https://dashboard.stripe.com/acct_1${noise(15, 78)}/invoices/in_1${noise(23, 79)}`,
  'GitHub pull request file': `https://github.com/acme/braindog/pull/412/files#diff-${hex(64, 80)}`,
  'GitHub lines at a commit': `https://github.com/acme/braindog/blob/${hex(40, 81)}/packages/kernel/src/coerce.ts#L268-L319`,
  'GitHub compare': `https://github.com/acme/braindog/compare/${hex(40, 82)}...${hex(40, 83)}`,
  'GitHub release download': 'https://github.com/acme/braindog/releases/download/v1.4.0/braindog-win-x64.zip',
  'S3 public object': `https://braindog-public.s3.eu-west-1.amazonaws.com/exports/2026/09/${guid(84)}/Quarterly%20report.pdf`,
  'S3 path-style object': 'https://s3.us-east-1.amazonaws.com/braindog-public/press/logo-dark.svg',
  'S3 presigned-looking, with no credential and no signature': `https://braindog-public.s3.amazonaws.com/exports/${guid(85)}.csv?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260925T101500Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&response-content-disposition=attachment%3B%20filename%3D%22report.csv%22`,
};

/* A SHA-256 signature in base64, 44 long, with a `+` and a `/` in it as one in three has. Percent-encoded, as Azure writes
   it, those two and its `=` cut it into runs of 21 and 20, and neither reached 32 until a named secret was decoded. */
const SAS_SIG = encodeURIComponent(j(noise(21, 93), '+', noise(20, 98), '/', 'a='));

/* AND KEYS DRESSED AS LINKS, each in the shape its issuer really uses. */
const KEYED_LINKS: Record<string, string> = {
  'a raw GitHub file with its token': `https://raw.githubusercontent.com/acme/private/main/README.md?token=${noise(40, 90)}`,
  'an S3 presigned link with its credential and signature': j(
    'https://braindog-private.s3.amazonaws.com/a.csv?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=',
    'AKIA',
    noise(16, 91, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'),
    '%2F20260925%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Signature=',
    hex(64, 92),
  ),
  'an Azure SAS link, its signature percent-encoded': `https://braindog.blob.core.windows.net/exports/a.csv?sv=2022-11-02&sp=r&se=2026-10-01T00%3A00%3A00Z&sig=${SAS_SIG}`,
  'a Maps link with its API key': j('https://maps.googleapis.com/maps/api/staticmap?center=Cairo&key=', 'AIza', noise(35, 94, B64URL)),
  'an MCP endpoint behind a redirect': `https://www.google.com/url?q=${encodeURIComponent(MISSED['a token in an MCP endpoint path']!)}&sa=D`,
  'an OAuth token in a fragment': `https://app.example.com/callback#access_token=${noise(40, 95)}&token_type=bearer`,
  'a run of 64 under a plain name': `https://files.example.com/share?id=${noise(72, 96)}`,
  'a value with no name': `https://files.example.com/share?${noise(48, 97)}`,
  'a token after a meeting link': `${TEAMS} ${GITHUB}`,
};

test('LINKS PEOPLE REALLY PASTE are stored in a text field and a url field, and the same links carrying a key are refused', () => {
  const refused = Object.entries(REAL_LINKS)
    .filter(([, link]) => looksLikeCredential(link) || refusedAs('url', link) !== 'STORED' || refusedAs('text', `Notes: ${link} for Thursday`) !== 'STORED')
    .map(([what]) => what);
  assert.deepEqual(refused, []);
  const stored = Object.entries(KEYED_LINKS)
    .filter(([, link]) => !looksLikeCredential(link) || refusedAs('text', link) !== KEY)
    .map(([what]) => what);
  assert.deepEqual(stored, []);
});

/* ── what the check itself must survive ───────────────────────────────────── */

test('A JSON VALUE 10,000 LEVELS DEEP IS STORED OR REFUSED, never thrown', () => {
  /* Red before: `RangeError` at about 3,500 levels, from a walk that called itself once per level. */
  const deep = (bottom: unknown, wrap: (v: unknown) => unknown): unknown => {
    let v = bottom;
    for (let i = 0; i < 10_000; i++) v = wrap(v);
    return v;
  };
  assert.equal(refusedAs('json', deep('fine', (v) => [v])), 'STORED');
  assert.equal(refusedAs('json', deep('fine', (v) => ({ next: v }))), 'STORED');
  assert.equal(refusedAs('json', deep(GITHUB, (v) => [v])), KEY);
  assert.equal(refusedAs('json', deep({ [GITHUB]: 1 }, (v) => ({ next: v }))), KEY);
  /* A list of a million is walked a value at a time, not spread into one call. */
  assert.equal(refusedAs('json', Array.from({ length: 1_000_000 }, (_, i) => i)), 'STORED');
});

test('A DOCUMENT AT ITS CAP IS CHECKED IN WELL UNDER A SECOND, whatever it is made of', () => {
  /* Red before: `a.` repeated to 512 KB took 288 seconds, each word boundary starting a scan for a `://` to the end. */
  const texts = ['a.'.repeat(262_000), 'a-'.repeat(262_000), `https://x.io/${'a/'.repeat(260_000)}`, `key${' '.repeat(100)}`.repeat(5_000)];
  for (const text of texts) {
    const began = performance.now();
    coerce({ id: 'x', type: 'document' }, text);
    const took = performance.now() - began;
    assert.ok(took < 1_000, `${text.slice(0, 12)}... took ${Math.round(took)} ms`);
  }
});
