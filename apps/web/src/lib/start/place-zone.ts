/**
 * The time zone a place in the sentence implies, and a zone said as a person says it ("Cairo time").
 *
 * THE DEVICE'S CLOCK IS THE GUESS, AND A PLACE NAMED IS AN OFFER (1 Nov, "infer currency and time zone ... and confirm
 * in one tap"). "A candle shop in Leeds" typed on a laptop that keeps Cairo time is offered London time beside the
 * device's, and the person's one tap takes it; nothing is taken from the words without that tap, because a person on a
 * trip types where their shop is, not where they sit.
 *
 * ONLY PLACES WITH ONE ZONE. A country that spans several (the United States, Canada, Australia) and a city whose name two
 * places share ("Portland") give none: a wrong zone here moves every "today" in the BrainDog. Matched as `place-currency.ts`
 * matches, as its own capitalised word, so "reading" is never Reading.
 *
 * PURE, so `node --test` can import it.
 */

const ZONES: Readonly<Record<string, readonly string[]>> = {
  'Europe/London': [
    'UK', 'United Kingdom', 'Britain', 'Great Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland', 'London',
    'Leeds', 'Manchester', 'Birmingham', 'Glasgow', 'Edinburgh', 'Bristol', 'Liverpool', 'Sheffield', 'Cardiff',
    'Belfast', 'Newcastle', 'Nottingham', 'Leicester', 'Brighton', 'Oxford', 'Cambridge', 'Southampton', 'Aberdeen',
    'Coventry', 'Norwich', 'Exeter',
  ],
  'Europe/Dublin': ['Ireland', 'Dublin', 'Cork'],
  'Europe/Paris': ['France', 'Paris', 'Lyon'],
  'Europe/Berlin': ['Germany', 'Berlin', 'Munich', 'Hamburg'],
  'Europe/Madrid': ['Madrid', 'Barcelona'],
  'Europe/Rome': ['Italy', 'Rome', 'Milan'],
  'Europe/Amsterdam': ['Netherlands', 'Amsterdam', 'Rotterdam'],
  'Europe/Lisbon': ['Lisbon', 'Porto'],
  'Europe/Vienna': ['Austria', 'Vienna'],
  'Europe/Brussels': ['Belgium', 'Brussels'],
  'Europe/Helsinki': ['Finland', 'Helsinki'],
  'Europe/Athens': ['Greece', 'Athens'],
  'Europe/Zurich': ['Switzerland', 'Zurich', 'Geneva', 'Basel'],
  'Europe/Stockholm': ['Sweden', 'Stockholm', 'Gothenburg'],
  'Europe/Copenhagen': ['Denmark', 'Copenhagen'],
  'Europe/Oslo': ['Norway', 'Oslo'],
  'America/New_York': ['New York', 'Brooklyn', 'Boston', 'Miami', 'Atlanta', 'Philadelphia'],
  'America/Chicago': ['Chicago', 'Austin', 'Nashville'],
  'America/Denver': ['Denver'],
  'America/Los_Angeles': ['Los Angeles', 'San Francisco', 'Seattle', 'California'],
  'America/Toronto': ['Toronto', 'Montreal', 'Ottawa'],
  'America/Vancouver': ['Vancouver'],
  'America/Edmonton': ['Calgary'],
  'Australia/Sydney': ['Sydney'],
  'Australia/Melbourne': ['Melbourne'],
  'Australia/Brisbane': ['Brisbane'],
  'Australia/Adelaide': ['Adelaide'],
  'Pacific/Auckland': ['New Zealand', 'Auckland', 'Wellington'],
  'Asia/Dubai': ['United Arab Emirates', 'Dubai', 'Abu Dhabi', 'Sharjah'],
  'Asia/Riyadh': ['Saudi Arabia', 'Riyadh', 'Jeddah'],
  'Asia/Kolkata': ['India', 'Mumbai', 'Delhi', 'Bangalore', 'Bengaluru', 'Chennai', 'Hyderabad', 'Pune'],
  'Africa/Lagos': ['Nigeria', 'Lagos', 'Abuja'],
  'Africa/Nairobi': ['Kenya', 'Nairobi'],
  'Africa/Johannesburg': ['South Africa', 'Cape Town', 'Johannesburg', 'Durban'],
  'Asia/Tokyo': ['Japan', 'Tokyo', 'Osaka', 'Kyoto'],
  'Asia/Singapore': ['Singapore'],
};

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/* LONGEST NAME FIRST, so "New York" is read before "York" and "Northern Ireland" before "Ireland". */
const NAMED = Object.entries(ZONES)
  .flatMap(([zone, names]) => names.map((name) => ({ zone, name })))
  .sort((a, b) => b.name.length - a.name.length);
const ANY = new RegExp(`(?<![\\p{L}\\p{N}])(${NAMED.map((n) => escape(n.name)).join('|')})(?![\\p{L}\\p{N}])`, 'u');

/** The zone of the first place the sentence names, and the place as typed, or `null` when it names none with one zone. */
export function placeZone(said: string): { zone: string; place: string } | null {
  const m = ANY.exec(said);
  if (!m || m[1] === undefined) return null;
  const zone = NAMED.find((n) => n.name === m[1])?.zone;
  return zone === undefined ? null : { zone, place: m[1] };
}

/** "Cairo", "Buenos Aires", "UTC": the zone's own place, as its last part says it. */
export function zonePlace(zone: string): string {
  const last = zone.split('/').pop() ?? zone;
  return last.replace(/_/gu, ' ');
}

/** Every zone this browser knows, by area ("Africa", "America" …), each area's places in order; the given ones always in. */
export function zoneGroups(always: readonly (string | null)[] = []): { area: string; zones: string[] }[] {
  let all: string[] = [];
  try {
    all = [...Intl.supportedValuesOf('timeZone')];
  } catch {
    all = [];
  }
  const listed = new Set(all);
  for (const z of always) if (z && z.includes('/') && !listed.has(z)) all.push(z);
  const groups = new Map<string, string[]>();
  for (const z of all) {
    if (!z.includes('/')) continue;
    const area = z.slice(0, z.indexOf('/')).replace(/_/gu, ' ');
    groups.set(area, [...(groups.get(area) ?? []), z]);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([area, zones]) => ({ area, zones: zones.sort((a, b) => zonePlace(a).localeCompare(zonePlace(b))) }));
}

/** Whether `Intl` reads this as a zone, so a zone kept or typed is never sent unread. */
export function isZone(zone: string | null | undefined): zone is string {
  if (typeof zone !== 'string' || zone === '') return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
