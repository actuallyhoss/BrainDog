/**
 * Identity keys: what identifies a person, an organisation or a place, said one way whatever way it arrived.
 *
 * A KEY IS `kind:value`, AND TWO MENTIONS ARE ONE IDENTITY EXACTLY WHEN THEIR KEYS ARE EQUAL. That is the whole
 * contract `entity_key` rests on (`entities.ts`): one live row per key, so a person met by the same address twice is
 * one person by construction and never by a guess. Everything in this file exists to make "equal" mean "the same
 * mailbox, the same login, the same payee", and nothing wider.
 *
 * FOLDING IS NARROW ON PURPOSE. Gmail ignores dots and `+tags`, so `ada.l+work@gmail.com` and `adal@gmail.com` are one
 * mailbox there and one key here. Most mail hosts do not, and folding `a.b@encore.example` into `ab@encore.example` would make
 * two colleagues one person. So only gmail.com and googlemail.com fold, and googlemail.com becomes gmail.com.
 *
 * A KEY IS NEVER SHOWN TO A PERSON. It is a handle the record joins on; what a person reads is the row's name. A model
 * never sees one either (`entities.ts`'s `resolveJob` masks them).
 *
 * NOTHING HERE READS THE RECORD. Pure functions of their input, so the write path, the migration's backfill, the
 * doors and the tests all key a value the same way.
 */

import { remoteKey } from './scope.ts';

/** The kinds a key may be. A handle of any other provider is kept as `provider:name`, lower-cased, and is still a key. */
export const KEY_KINDS = ['email', 'github', 'discord', 'slack', 'phone', 'bank', 'domain', 'remote', 'folder'] as const;
export type KeyKind = (typeof KEY_KINDS)[number];

/**
 * Mail hosts anybody can sign up to, whose domain says nothing about who someone works for. A domain key is an
 * organisation's, so these are never one: everybody at gmail.com is not one company.
 */
export const PUBLIC_MAIL = new Set([
  /* The big hosts, and the country spellings of each that people really write from. */
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.fr', 'outlook.de', 'outlook.es', 'outlook.it', 'outlook.sa',
  'outlook.co.uk', 'outlook.com.au', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it',
  'hotmail.es', 'hotmail.ca', 'hotmail.com.br', 'live.com', 'live.co.uk', 'live.fr', 'live.de', 'live.it', 'live.nl',
  'live.ca', 'live.ie', 'live.com.au', 'msn.com', 'passport.com', 'windowslive.com', 'icloud.com', 'me.com', 'mac.com',
  'privaterelay.appleid.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.com.eg', 'yahoo.fr', 'yahoo.de', 'yahoo.es',
  'yahoo.it', 'yahoo.ca', 'yahoo.ie', 'yahoo.in', 'yahoo.co.in', 'yahoo.co.jp', 'yahoo.com.au', 'yahoo.co.nz',
  'yahoo.com.br', 'yahoo.com.mx', 'yahoo.com.ar', 'yahoo.com.sg', 'yahoo.com.hk', 'yahoo.gr', 'ymail.com',
  'rocketmail.com', 'aol.com', 'aim.com', 'duck.com',
  /* Private and paid mail. */
  'proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me', 'tutanota.com', 'tutanota.de', 'tuta.io', 'tutamail.com',
  'keemail.me', 'fastmail.com', 'fastmail.fm', 'hey.com', 'mailbox.org', 'posteo.de', 'posteo.net', 'runbox.com',
  'hushmail.com', 'zoho.com', 'zohomail.com', 'zoho.eu', 'zoho.in', 'mail.com', 'email.com', 'usa.com', 'inbox.com',
  'lycos.com', 'gmx.com', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 'gmx.co.uk', 'gmx.fr', 'gmx.us',
  /* Broadband providers' mail, which says where somebody lives and not whom they work for. */
  'btinternet.com', 'btopenworld.com', 'sky.com', 'virginmedia.com', 'ntlworld.com', 'blueyonder.co.uk', 'talktalk.net',
  'tiscali.co.uk', 'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net',
  'charter.net', 'earthlink.net', 'optonline.net', 'rogers.com', 'shaw.ca', 'sympatico.ca', 'bigpond.com',
  'bigpond.net.au', 'optusnet.com.au', 'xtra.co.nz', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'laposte.net',
  'web.de', 't-online.de', 'freenet.de', 'libero.it', 'virgilio.it', 'tin.it', 'alice.it', 'link.net', 'tedata.net.eg',
  /* The rest of the world's big free hosts. */
  'yandex.com', 'yandex.ru', 'yandex.ua', 'yandex.by', 'yandex.kz', 'ya.ru', 'mail.ru', 'inbox.ru', 'list.ru', 'bk.ru',
  'rambler.ru', 'ukr.net', 'seznam.cz', 'wp.pl', 'o2.pl', 'onet.pl', 'interia.pl', 'qq.com', 'foxmail.com', '163.com',
  '126.com', 'yeah.net', 'sina.com', 'sohu.com', 'aliyun.com', 'naver.com', 'daum.net', 'hanmail.net',
  'rediffmail.com', 'maktoob.com',
  /* The forges' private commit addresses. */
  'users.noreply.github.com', 'users.noreply.gitlab.com',
]);

/**
 * Hosts that give anybody a name under them: `ada.github.io` is Ada's and `github.io` is nobody's. A host under one
 * registers one label deeper, and the bare host is never an organisation's domain.
 */
const PLATFORMS = new Set([
  'github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'herokuapp.com', 'web.app',
  'firebaseapp.com', 'appspot.com', 'azurewebsites.net', 'fly.dev', 'onrender.com', 'up.railway.app', 'railway.app',
  'glitch.me', 'surge.sh', 'ngrok.io', 'ngrok-free.app', 'replit.app', 'repl.co', 'deno.dev', 'carrd.co',
]);

/**
 * Second-level suffixes under which the registrable domain is three labels, not two: `encore.co.uk` and not `co.uk`.
 * Not the whole public suffix list, which is 200 KB; the suffixes a record of a business actually meets.
 */
const SECOND_LEVEL = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'ltd.uk', 'plc.uk', 'me.uk', 'net.uk', 'sch.uk', 'nhs.uk', 'police.uk',
  'com.eg', 'edu.eg', 'gov.eg', 'org.eg', 'net.eg', 'sci.eg', 'eun.eg',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au', 'co.nz', 'org.nz', 'ac.nz', 'govt.nz', 'net.nz',
  'co.za', 'org.za', 'ac.za', 'gov.za', 'net.za', 'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
  'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in', 'edu.in', 'firm.in', 'gen.in', 'ind.in',
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'com.mx', 'com.ar', 'com.co', 'com.pe', 'com.ve', 'com.ec',
  'com.uy', 'com.py', 'com.bo', 'com.do', 'com.gt', 'com.pa',
  'com.tr', 'gov.tr', 'edu.tr', 'org.tr', 'net.tr', 'gen.tr',
  'com.sa', 'gov.sa', 'edu.sa', 'org.sa', 'net.sa', 'med.sa', 'co.ae', 'net.ae', 'org.ae', 'gov.ae', 'ac.ae',
  'com.qa', 'gov.qa', 'edu.qa', 'org.qa', 'com.kw', 'edu.kw', 'gov.kw', 'com.bh', 'com.om', 'co.om', 'com.jo',
  'gov.jo', 'edu.jo', 'com.lb', 'org.lb', 'edu.lb', 'com.ly', 'com.sy', 'com.iq', 'com.ps', 'com.ye', 'com.sd',
  'com.tn', 'com.dz', 'co.ma', 'ac.ma', 'gov.ma', 'ac.ir', 'co.ir', 'co.il', 'ac.il', 'org.il', 'gov.il',
  'com.ng', 'gov.ng', 'edu.ng', 'org.ng', 'co.ke', 'or.ke', 'ac.ke', 'co.tz', 'co.ug', 'co.zw', 'co.bw',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn', 'com.hk', 'edu.hk', 'gov.hk', 'org.hk', 'net.hk',
  'com.tw', 'com.sg', 'edu.sg', 'gov.sg', 'org.sg', 'net.sg', 'com.my', 'edu.my', 'gov.my', 'org.my', 'net.my',
  'co.kr', 'ac.kr', 'go.kr', 'or.kr', 'ne.kr', 'co.th', 'in.th', 'ac.th', 'go.th', 'co.id', 'ac.id', 'or.id',
  'go.id', 'web.id', 'com.vn', 'com.ph', 'com.pk', 'edu.pk', 'gov.pk', 'org.pk', 'net.pk', 'com.bd', 'edu.bd',
  'com.np', 'com.lk', 'com.af', 'com.ua', 'co.at', 'or.at', 'ac.at', 'com.pl', 'net.pl', 'org.pl', 'co.hu',
  'com.gr', 'com.cy', 'com.mt', 'com.es', 'org.es', 'ae.org',
]);

/**
 * Hosts that name no organisation anywhere: a machine on a home or office network. Not `.test` or `.example`, which
 * stand in for a real organisation's domain wherever one is written down as an example.
 */
const NOT_REGISTERED = /(?:^|\.)(?:local|localhost|localdomain|internal|lan|home|arpa|invalid|corp)$/;

/**
 * Local parts that are a shared inbox: a function, not a person. Mail from one is an organisation speaking, so it
 * meets the organisation and never makes a person, and the address is that organisation's key.
 */
const ROLE_LOCALS = new Set([
  'info', 'support', 'hello', 'hi', 'contact', 'contactus', 'team', 'billing', 'invoice', 'invoices', 'accounts',
  'accounting', 'sales', 'admin', 'help', 'helpdesk', 'office', 'notifications', 'notification', 'notify', 'alerts',
  'alert', 'noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply', 'do_not_reply', 'mailer-daemon',
  'postmaster', 'newsletter', 'news', 'marketing', 'receipts', 'receipt', 'orders', 'order', 'security', 'service',
  'services', 'care', 'customercare', 'customerservice', 'customersupport', 'techsupport', 'feedback', 'jobs',
  'careers', 'hr', 'press', 'payments', 'bounce', 'bounces', 'updates', 'digest', 'reply', 'mail', 'email',
  'webmaster', 'hostmaster', 'abuse', 'privacy', 'legal', 'statements', 'estatements', 'banking', 'onlinebanking',
  'ebanking', 'enquiries', 'enquiry', 'inquiries', 'inquiry', 'reservations', 'reservation', 'booking', 'bookings',
  'shop', 'store', 'events', 'partners', 'partnerships', 'community', 'membership', 'members', 'finance', 'payroll',
  'procurement', 'purchasing', 'compliance', 'operations', 'reception', 'frontdesk', 'general', 'mailbox', 'inbox',
  'investors', 'developers', 'engineering', 'devops', 'welcome', 'account', 'subscriptions', 'messages', 'verify',
  'verification', 'kyc',
]);

/** Words that join a role into a longer shared inbox: `customer.service`, `sales-team`, `support.desk`. */
const ROLE_JOINERS = new Set(['customer', 'customers', 'client', 'clients', 'team', 'desk', 'dept', 'department', 'group', 'centre', 'center']);

/**
 * A local part that is a machine's whatever else it says: `noreply-1234`, `notifications+abc`, `bounce-…`,
 * `mailer-daemon`, `renovate-bot`. A whole segment only, so `abbot` and `botond` are people.
 */
const MACHINE = /(?:^|[._+-])(?:no[._-]?reply|do[._-]?not[._-]?reply|notifications?|notify|mailer|daemon|bounces?|bots?|robot|automated|alerts?|postmaster)(?=[._+\-\d]|$)/;

/** Local parts a machine signs with when nobody set one: CI runners, servers' default users, the forges' bots. */
const MACHINE_LOCALS = new Set([
  'root', 'ubuntu', 'runner', 'ec2-user', 'centos', 'debian', 'vagrant', 'jenkins', 'git', 'www-data', 'nobody',
  'github-actions', 'actions-user', 'dependabot', 'renovate', 'mergify', 'greenkeeper', 'buildbot', 'ci', 'build',
  'builder', 'deploy', 'deployer', 'automation', 'gitlab-runner', 'circleci', 'codecov',
]);

/** Names a machine goes by in a commit or a header: a server's default user, a CI system, a forge's bot. */
const MACHINE_NAMES = new Set([
  'ubuntu', 'root', 'runner', 'ec2-user', 'centos', 'debian', 'vagrant', 'admin', 'administrator', 'jenkins', 'github',
  'github action', 'github actions', 'github-actions', 'actions-user', 'dependabot', 'renovate', 'mergify',
  'greenkeeper', 'buildbot', 'build', 'builder', 'deploy', 'deployer', 'automation', 'bot', 'ci', 'travis ci',
  'circleci', 'buildkite', 'gitlab ci', 'azure pipelines', 'bitbucket pipelines', 'codecov', 'snyk', 'mailer-daemon',
  'mail delivery subsystem', 'mail delivery system',
]);

/**
 * A name or login that says it is a bot: `vercel[bot]`, `Release Bot`, `ci-bot`, `semantic-release-bot`, and the
 * forges' bots wherever their name appears. `renovate` only whole, since it is a word a business is named with too.
 */
const BOT_NAME = /\[bot\]$|(?:^|[\s_-])bot$|github-actions|dependabot|greenkeeper|snyk-bot|semantic-release|pre-commit-ci|imgbot|allcontributors|mergify|^renovate$/i;

/** A name that ends in what a service is, never what a person is called: `Acme CI`, `GitLab Runner`. */
const SERVICE_NAME = /(?:^|\s)(?:ci|ci\/cd|automation|runner)$/i;

/**
 * GitHub's private commit address: `<id>+<login>@users.noreply.github.com`, or the older `<login>@…`. An app's
 * address holds its `[bot]` login, and an Enterprise Managed User's holds an `_` and the company's short code.
 */
const GITHUB_PRIVATE = /^(?:\d+\+)?([a-z0-9](?:[a-z0-9_-]{0,38})(?:\[bot\])?)@users\.noreply\.github\.com$/;

/**
 * A GitHub login: letters, digits and single hyphens, at most 39, plus the `[bot]` an app signs as and the
 * `_shortcode` an Enterprise Managed User's login ends in.
 */
const GITHUB_LOGIN = /^[a-z0-9](?:[a-z0-9_-]{0,38})(?:\[bot\])?$/;

/**
 * Card processors and gateways that put their own name before the merchant's on a bank text, and the point-of-sale
 * marker. `TST*` is Toast's and `SP *` Shopify's.
 */
const PROCESSORS = /^(?:geidea\s*\*|paymob\s*-|fawry\s*\*|kashier\s*\*|paytabs\s*\*|pos\s+|sq\s*\*|sumup\s*\*|paypal\s*\*|zettle_?\s*\*|izettle\s*\*|pp\s*\*|tst\s*\*|sp\s*\*)\s*/i;

/**
 * Words that say what kind of shop a payee is and not which one. A payee left as one of these alone is no payee:
 * `CAFE 22` and `CAFE 7` are two cafés, and `Pharmacy Cairo` and `Pharmacy Giza` two pharmacies, so the word after it
 * stays even when it is a number or a town.
 */
const GENERIC_PAYEES = new Set([
  'cafe', 'café', 'coffee', 'coffeeshop', 'restaurant', 'grill', 'kitchen', 'bistro', 'diner', 'bar', 'pub', 'bakery',
  'pizza', 'burger', 'sushi', 'deli', 'canteen', 'kiosk', 'pharmacy', 'pharmacie', 'farmacia', 'apotheke', 'chemist',
  'market', 'supermarket', 'hypermarket', 'minimarket', 'mart', 'grocery', 'groceries', 'butcher', 'store', 'shop',
  'stores', 'mall', 'hotel', 'hostel', 'clinic', 'hospital', 'lab', 'laboratory', 'dental', 'dentist', 'doctor',
  'optics', 'optician', 'salon', 'barber', 'spa', 'gym', 'fitness', 'club', 'garage', 'station', 'petrol', 'fuel',
  'gas', 'parking', 'carwash', 'laundry', 'cleaners', 'taxi', 'transport', 'bookshop', 'books', 'library',
  'stationery', 'printing', 'print', 'florist', 'flowers', 'hardware', 'electronics', 'mobile', 'mobiles', 'pets',
  'vet', 'school', 'nursery', 'academy', 'cinema', 'atm', 'bank', 'center', 'centre', 'restaurants', 'food', 'foods',
]);

/** Places a bank text writes after the merchant, removed so `CHILLOUT CAIRO EG` and `Chillout` are one payee. */
const PLACES = new Set([
  'cairo', 'giza', 'alexandria', 'alex', 'newcairo', 'nasr', 'nasrcity', 'heliopolis', 'maadi', 'zamalek', 'dokki',
  'mohandessin', 'sheikhzayed', 'zayed', 'october', '6thofoctober', 'tagamoa', 'tagamo3', 'eg', 'egy', 'egypt',
  'london', 'gb', 'uk', 'gbr', 'dubai', 'ae', 'uae', 'are', 'abudhabi', 'riyadh', 'sa', 'jeddah', 'us', 'usa',
  'newyork', 'ny', 'sanfrancisco', 'sf', 'ca', 'de', 'berlin', 'fr', 'paris', 'nl', 'amsterdam', 'ie', 'dublin',
  'internet', 'online', 'www',
]);

/** A web suffix a payee is sometimes spelled with: `talabat.com` is Talabat. */
const WEB_SUFFIX = /\.(?:com|net|org|io|co|app|ai|xyz|eg|co\.uk|com\.eg)$/;

const lower = (s: string): string => s.trim().toLowerCase();

/** The address's two halves, or `null` when it is not one address. */
function split(address: string): { local: string; domain: string } | null {
  const m = /^([^@\s<>"]+)@([^@\s<>"]+\.[^@\s<>".]+)$/.exec(lower(address));
  return m ? { local: m[1]!, domain: m[2]!.replace(/\.$/, '') } : null;
}

/** A host as a key's value: lower case, no scheme, no path, no port, no `www.`. */
function hostOf(raw: string): string {
  let s = lower(raw);
  const at = s.lastIndexOf('@');
  if (at >= 0 && !s.includes('/')) s = s.slice(at + 1);
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  return s.replace(/^www\./, '');
}

/**
 * The domain an organisation registered: the last two labels, or one more under a suffix like `co.uk` or a platform
 * like `github.io`. `null` for a suffix on its own, a public mail host, an address on a machine's own network, or an
 * IP address, none of which is anybody's organisation.
 */
export function registrable(raw: string): string | null {
  const host = hostOf(raw);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /\.\d+$/.test(host) || NOT_REGISTERED.test(host)) return null;
  if (SECOND_LEVEL.has(host) || PLATFORMS.has(host)) return null;
  const labels = host.split('.');
  let domain = labels.slice(-2).join('.');
  /* THE LONGEST SUFFIX FIRST, so `x.up.railway.app` is under `up.railway.app` and not `railway.app`. */
  for (let i = 1; i < labels.length - 1; i++) {
    const suffix = labels.slice(i).join('.');
    if (SECOND_LEVEL.has(suffix) || PLATFORMS.has(suffix)) {
      domain = labels.slice(i - 1).join('.');
      break;
    }
  }
  return PUBLIC_MAIL.has(domain) || PUBLIC_MAIL.has(host) ? null : domain;
}

/**
 * Whether a domain is a host anybody can sign up to and so says nothing about whom somebody works for: a public mail
 * host, or a platform's own name (`vercel.app`).
 */
export const isPublicMail = (domain: string): boolean => {
  const host = hostOf(domain);
  return PUBLIC_MAIL.has(host) || PLATFORMS.has(host);
};

/** An address's local part and host, read loosely: `root@ada-macbook` has no dot in its host and is still read. */
function looseSplit(address: string): { local: string; host: string } | null {
  const m = /^([^@\s<>"]+)@([^@\s<>"]+)$/.exec(lower(address));
  return m ? { local: m[1]!, host: m[2]!.replace(/\.$/, '') } : null;
}

/** Whether a local part is a shared inbox: `support`, `info2`, `customer.service`, `sales-team`, `support+eg`. */
function isRoleLocal(local: string): boolean {
  const bare = local.replace(/\+.*$/, '');
  if (ROLE_LOCALS.has(bare) || ROLE_LOCALS.has(bare.replace(/\d+$/, ''))) return true;
  const parts = bare.split(/[._-]/).filter(Boolean);
  return parts.length > 1 && parts.some((p) => ROLE_LOCALS.has(p)) && parts.every((p) => ROLE_LOCALS.has(p) || ROLE_JOINERS.has(p));
}

/** Whether a local part is a machine's: a no-reply, a bounce, a daemon, a bot, or a server's default user. */
function isMachineLocal(local: string): boolean {
  const bare = local.replace(/\+.*$/, '');
  /* THE +TAG IS THE OWNER'S OWN FILING, so `ada+alerts@gmail.com` is still Ada. */
  return MACHINE.test(bare) || /\[bot\]$/.test(local) || MACHINE_LOCALS.has(bare) || BOT_NAME.test(bare);
}

/**
 * Whether an address is a shared inbox or a machine, which is an organisation speaking and never a person, so the
 * address is the organisation's key and never a person's.
 *
 * GITHUB'S PRIVATE ADDRESS IS A PERSON, though it says `noreply`: it is how GitHub writes a commit's author who keeps
 * their address private, and the login inside it is theirs. Unless the login is an app's `[bot]`.
 */
export function isOrganisationAddress(address: string): boolean {
  const parts = split(address);
  if (!parts) return false;
  const login = githubOfAddress(`${parts.local}@${parts.domain}`);
  if (login !== null) return isBotLogin(login);
  return isRoleLocal(parts.local) || isMachineLocal(parts.local);
}

/** Whether a login is a bot's: an app's `[bot]`, `renovate-bot`, `github-actions`, `dependabot`. */
const isBotLogin = (login: string): boolean => BOT_NAME.test(login) || MACHINE_LOCALS.has(login);

/** What `isMachineIdentity` reads: whatever a commit, a header or a mention says about who did it. */
export type IdentitySaid = {
  name?: string | null | undefined;
  email?: string | null | undefined;
  /** A login, or a handle as `provider:name`. */
  handle?: string | null | undefined;
};

/**
 * Whether who did something is a machine and not a person: a bot by name or login (`dependabot[bot]`, `Release Bot`,
 * `renovate`), a machine's address (`noreply@`, `mailer-daemon@`, `bounce-…@`, `notifications@`), a server's or a CI
 * system's default user (`root`, `ubuntu`, `runner`, `GitHub Actions`), a CI job named for what it does at an
 * organisation's domain (`Jenkins Schema Sync`), or an address on a machine's own network (`ada@ada-macbook.local`).
 *
 * A SHARED INBOX IS NOT A MACHINE. `support@acme.com` is people answering for Acme: an organisation, which
 * `isOrganisationAddress` says. This says only that nobody is there, so a harvest leaves it out entirely. GitHub's
 * private address is a person unless its login is a bot's.
 */
export function isMachineIdentity(said: IdentitySaid): boolean {
  const name = typeof said.name === 'string' ? said.name.trim().replace(/\s+/g, ' ') : '';
  if (name !== '' && (MACHINE_NAMES.has(name.toLowerCase()) || BOT_NAME.test(name) || SERVICE_NAME.test(name))) return true;
  if (typeof said.handle === 'string' && said.handle.trim() !== '') {
    const login = lower(said.handle).replace(/^[a-z][a-z0-9.-]*:/, '').replace(/^@/, '');
    if (isBotLogin(login)) return true;
  }
  if (typeof said.email !== 'string' || said.email.trim() === '') return false;
  const loose = looseSplit(said.email);
  if (!loose) return false;
  /* A HOST WITH NO DOT OR ON A PRIVATE NETWORK is a machine's own name, as git writes `ada@Adas-MacBook.local`. */
  if (!loose.host.includes('.') || NOT_REGISTERED.test(loose.host)) return true;
  const login = githubOfAddress(`${loose.local}@${loose.host}`);
  if (login !== null) return isBotLogin(login);
  if (isMachineLocal(loose.local)) return true;
  /* A CI JOB NAMED FOR WHAT IT DOES, `Jenkins Schema Sync`, `Acme Repos` or `Docs Mirror`, at an organisation's domain. */
  return /(?:^|\s)(?:sync|repos|mirror)$/i.test(name) && registrable(loose.host) !== null;
}

/** The login inside GitHub's private commit address, or `null`. */
export function githubOfAddress(address: string): string | null {
  return GITHUB_PRIVATE.exec(lower(address))?.[1] ?? null;
}

/**
 * A raw `From` header as a name, an address and the address's domain: `"Ada Lovelace" <ada@x.com>`, `Ada <ada@x.com>`,
 * `ada@x.com (Ada)` and a bare address all read. `null` when there is no address in it.
 */
export function parseFrom(header: string): { name: string | null; address: string; domain: string } | null {
  const raw = header.trim();
  const angled = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(raw);
  const commented = /^([^\s()]+@[^\s()]+)\s*\((.*)\)\s*$/.exec(raw);
  const address = lower(angled?.[2] ?? commented?.[1] ?? raw);
  const parts = split(address);
  if (!parts) return null;
  const said = (angled?.[1] ?? commented?.[2] ?? '').trim().replace(/^["']|["']$/g, '').replace(/\\"/g, '"').replace(/\s+/g, ' ').trim();
  /* A NAME THAT IS ONLY THE ADDRESS AGAIN IS NO NAME, as many mailers write `ada@x.com <ada@x.com>`. */
  const name = said === '' || lower(said) === address ? null : said;
  return { name, address: `${parts.local}@${parts.domain}`, domain: parts.domain };
}

/** An email as its key's value, or a `github:` key for GitHub's private address. Gmail folds; nothing else does. */
function emailKey(raw: string): string | null {
  const parsed = raw.includes('<') ? parseFrom(raw)?.address : raw;
  const parts = parsed === undefined ? null : split(parsed);
  if (!parts) return null;
  const login = githubOfAddress(`${parts.local}@${parts.domain}`);
  if (login !== null) return `github:${login}`;
  if (parts.domain === 'gmail.com' || parts.domain === 'googlemail.com')
    return `email:${parts.local.replace(/\+.*$/, '').replace(/\./g, '')}@gmail.com`;
  return `email:${parts.local}@${parts.domain}`;
}

/** A login, from `@ada`, `ada`, a profile address, or GitHub's private address. */
function githubKey(raw: string): string | null {
  const said = lower(raw);
  const private_ = githubOfAddress(said);
  if (private_ !== null) return `github:${private_}`;
  const login = said.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//, '').replace(/^@/, '').replace(/\/.*$/, '');
  return GITHUB_LOGIN.test(login) ? `github:${login}` : null;
}

/** A chat handle: lower case, no `@`, no spaces. */
function handleKey(kind: string, raw: string): string | null {
  const said = lower(raw).replace(/^@/, '');
  return said === '' || /\s/.test(said) ? null : `${kind}:${said}`;
}

/** E.164: a `+` and 8 to 15 digits. A number with no country code cannot be told from another country's, so is none. */
function phoneKey(raw: string): string | null {
  const said = raw.trim().replace(/^00/, '+');
  if (!said.startsWith('+')) return null;
  const digits = said.slice(1).replace(/[\s().-]/g, '');
  return /^[1-9][0-9]{7,14}$/.test(digits) ? `phone:+${digits}` : null;
}

/**
 * A payee as a bank text writes it, folded so its spellings are one: the processor's prefix gone, then a place and
 * any word holding a digit from the end, a web suffix, punctuation, and the spaces, all lower case.
 * `GEIDEA*CHILLOUT 0423 CAIRO EG`, `Chill Out` and `CHILLOUT` are all `bank:chillout`.
 *
 * A PAYEE KEEPS A WORD THAT NAMES IT. The end is trimmed only while what is left still says which shop, not just what
 * kind: `CAFE 22` stays `bank:cafe22` and `Pharmacy Giza` stays `bank:pharmacygiza`, because `bank:cafe` would make
 * every café one payee. Two spellings that fold the same are then the same payee and nothing wider.
 */
function bankKey(raw: string): string | null {
  let said = raw.trim();
  for (let i = 0; i < 3 && PROCESSORS.test(said); i++) said = said.replace(PROCESSORS, '');
  const words = lower(said).replace(/[*#]/g, ' ').split(/\s+/).filter(Boolean);
  const bareOf = (w: string): string => w.replace(/[^\p{L}\p{N}]/gu, '');
  /* WHETHER THE FIRST n WORDS NAME A SHOP: one of them is neither a kind of shop nor `the`. */
  const names = (n: number): boolean => words.slice(0, n).some((w) => {
    const bare = bareOf(w);
    return bare !== '' && bare !== 'the' && !GENERIC_PAYEES.has(bare);
  });
  while (words.length > 1) {
    const last = words[words.length - 1]!;
    const bare = bareOf(last);
    /* TWO WORDS FIRST, so `NEW CAIRO` goes whole and does not leave `new` behind as part of the payee. */
    const place2 = words.length > 2 && PLACES.has(`${bareOf(words[words.length - 2]!)}${bare}`);
    const drop = place2 ? 2 : /\d/.test(last) || PLACES.has(bare) || bare === '' ? 1 : 0;
    if (drop === 0 || (bare !== '' && !names(words.length - drop))) break;
    words.splice(-drop, drop);
  }
  const folded = words.join('').replace(WEB_SUFFIX, '').replace(/[^\p{L}\p{N}]/gu, '');
  return folded === '' ? null : `bank:${folded}`;
}

/** An absolute path, with `\` as `/`, no trailing `/`, and a drive letter in lower case. */
function folderKey(raw: string): string | null {
  const said = raw.trim().replace(/\\/g, '/').replace(/\/+$/, '').replace(/\/{2,}/g, '/');
  if (/^[a-z]:\//i.test(said) || /^[a-z]:$/i.test(said)) return `folder:${said[0]!.toLowerCase()}${said.slice(1)}`;
  return said.startsWith('/') && said.length > 1 ? `folder:${said}` : null;
}

/** A remote as `host/owner/name`, by scope's own reading, so a project's remote and a key are one string. */
function remoteKeyOf(raw: string): string | null {
  const key = remoteKey(raw);
  return key.split('/').length >= 3 ? `remote:${key}` : null;
}

/**
 * One raw value of a kind, as its key, or `null` when the value is not one of that kind.
 *
 * A KEY MAY COME BACK AS ANOTHER KIND: GitHub's private address handed in as an `email` is the login it holds, and that
 * is the identity it is. Any kind not in `KEY_KINDS` is kept as a handle, `provider:name` in lower case.
 */
export function keyOf(kind: string, raw: string): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const k = lower(kind);
  switch (k) {
    case 'email':
      return emailKey(raw);
    case 'github':
      return githubKey(raw);
    case 'phone':
      return phoneKey(raw);
    case 'bank':
      return bankKey(raw);
    case 'domain': {
      const domain = registrable(raw);
      return domain === null ? null : `domain:${domain}`;
    }
    case 'remote':
      return remoteKeyOf(raw);
    case 'folder':
      return folderKey(raw);
    default:
      return /^[a-z][a-z0-9.-]*$/.test(k) ? handleKey(k, raw) : null;
  }
}

/**
 * A key as written anywhere, `email:Ada@X.com` or `github:@Ada`, read again so it is said the one way. `null` for text
 * that is not `kind:value`.
 */
export function keyFrom(said: string): string | null {
  const m = /^([a-z][a-z0-9.-]*):(.+)$/i.exec(typeof said === 'string' ? said.trim() : '');
  return m ? keyOf(m[1]!, m[2]!) : null;
}

/**
 * Whatever a row or a person holds that could be a key, as its key: a bare address (`Ada@X.com`), a key written
 * `kind:value`, or a handle written `provider:name`. The one reading a door outside the kernel, such as the CLI's
 * harvest, uses, so a key it sends is the key the record would make and is never refused as malformed.
 */
export function keyOfAny(said: string): string | null {
  if (typeof said !== 'string') return null;
  const text = said.trim().replace(/^mailto:/i, '');
  /* AN ADDRESS, unless the `@` comes after a `kind:` as in `email:ada@x.com` or `github:@ada`. */
  const colon = text.indexOf(':');
  const at = text.indexOf('@');
  if (at > 0 && (colon < 0 || colon > at)) return keyOf('email', text);
  /* A NAME WITH A COLON BEFORE ITS ADDRESS, `Ada: CEO <ada@x.io>`, is still the address. */
  return keyFrom(text) ?? (at > 0 && text.includes('<') ? keyOf('email', text) : null);
}

/** What `keysOf` reads: any of the identifiers a mention or a row can carry. */
export type KeyInput = {
  email?: string | null | undefined;
  emails?: readonly string[] | undefined;
  /** `provider:name`, as `meet` takes a handle. */
  handle?: string | null | undefined;
  handles?: readonly string[] | undefined;
  /** Keys already written `kind:value`. */
  keys?: readonly string[] | undefined;
  domain?: string | null | undefined;
  domains?: readonly string[] | undefined;
  remote?: string | null | undefined;
  remotes?: readonly string[] | undefined;
  folder?: string | null | undefined;
  phone?: string | null | undefined;
  bank?: string | null | undefined;
};

/** Every key the input carries, each once, in the order given. */
export function keysOf(input: KeyInput): string[] {
  const out = new Set<string>();
  const add = (key: string | null): void => void (key !== null && out.add(key));
  const each = (one: unknown, many: unknown, read: (s: string) => string | null): void => {
    if (typeof one === 'string') add(read(one));
    if (Array.isArray(many)) for (const s of many) if (typeof s === 'string') add(read(s));
  };
  each(input.email, input.emails, (s) => keyOf('email', s));
  each(input.handle, input.handles, keyFrom);
  each(null, input.keys, keyFrom);
  each(input.domain, input.domains, (s) => keyOf('domain', s));
  each(input.remote, input.remotes, (s) => keyOf('remote', s));
  each(input.folder, null, (s) => keyOf('folder', s));
  each(input.phone, null, (s) => keyOf('phone', s));
  each(input.bank, null, (s) => keyOf('bank', s));
  return [...out];
}

/** The kind of a key, `email` of `email:ada@x.com`. */
export const kindOfKey = (key: string): string => key.slice(0, key.indexOf(':'));

/** The value of a key, `ada@x.com` of `email:ada@x.com`. */
export const valueOfKey = (key: string): string => key.slice(key.indexOf(':') + 1);
