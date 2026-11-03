/**
 * A person's note read for the facts it holds, since People 4.7.0 (3 Nov, Sam: "instead of just long text, i want them
 * to be parsed as fields ... his name should be a field, discord username a field"). Before it every fact about
 * somebody was a sentence in one long note: "Legal name **Callum Doran**. Irish. Email ... Discord id ... ## Deal ...".
 *
 * `noteFacts` READS ONE NOTE AND SAYS WHAT IT FOUND, and only by plain patterns: a sentence that is nothing but a fact
 * ("Irish.", "Legal name Callum Doran.", "Discord id 668423998777982997.", "Sam's wife.", "CPO of Quartz and brand owner
 * of Tamsin."), an address or a phone, and the `## Deal` and `## Still to do` parts. A sentence it cannot read whole
 * stays in the note, as does every other part (`## Log` among them). A field the row already holds is never written
 * over: a fact that agrees with it leaves the note, and one that differs stays where it was.
 *
 * `peopleFields` HANDS BACK ONE QUESTION A PERSON, a rowset that changes their row, and the script below files them.
 * Nothing is written without the owner's yes, and each question carries the cause `people-fields:<row>`, so a second
 * run joins the one still open and one he said no to is not asked again.
 *
 * NOTHING OUTSIDE ITSELF IS READ BY `noteFacts` OR `peopleFields`, AND NOTHING BUT THEM BY `run`: the three texts are
 * the script (`PEOPLE_FIELDS_SCRIPT.source`), as `kpi-backfill.js` is.
 */

export function noteFacts(note, row) {
  const NATIONS = {
    afghan: 'Afghan', albanian: 'Albanian', algerian: 'Algerian', american: 'American', argentinian: 'Argentinian', australian: 'Australian',
    austrian: 'Austrian', bahraini: 'Bahraini', bangladeshi: 'Bangladeshi', belgian: 'Belgian', brazilian: 'Brazilian', british: 'British',
    bulgarian: 'Bulgarian', canadian: 'Canadian', chilean: 'Chilean', chinese: 'Chinese', colombian: 'Colombian', croatian: 'Croatian',
    czech: 'Czech', danish: 'Danish', dutch: 'Dutch', egyptian: 'Egyptian', emirati: 'Emirati', english: 'English', estonian: 'Estonian',
    filipino: 'Filipino', finnish: 'Finnish', french: 'French', german: 'German', ghanaian: 'Ghanaian', greek: 'Greek', hungarian: 'Hungarian',
    indian: 'Indian', indonesian: 'Indonesian', iranian: 'Iranian', iraqi: 'Iraqi', irish: 'Irish', israeli: 'Israeli', italian: 'Italian',
    japanese: 'Japanese', jordanian: 'Jordanian', kenyan: 'Kenyan', korean: 'Korean', kuwaiti: 'Kuwaiti', latvian: 'Latvian', lebanese: 'Lebanese',
    libyan: 'Libyan', lithuanian: 'Lithuanian', malaysian: 'Malaysian', mexican: 'Mexican', moroccan: 'Moroccan', nigerian: 'Nigerian',
    norwegian: 'Norwegian', omani: 'Omani', pakistani: 'Pakistani', palestinian: 'Palestinian', peruvian: 'Peruvian', polish: 'Polish',
    portuguese: 'Portuguese', qatari: 'Qatari', romanian: 'Romanian', russian: 'Russian', saudi: 'Saudi', scottish: 'Scottish', serbian: 'Serbian',
    singaporean: 'Singaporean', slovak: 'Slovak', 'south african': 'South African', spanish: 'Spanish', sudanese: 'Sudanese', swedish: 'Swedish',
    swiss: 'Swiss', syrian: 'Syrian', thai: 'Thai', tunisian: 'Tunisian', turkish: 'Turkish', ukrainian: 'Ukrainian', vietnamese: 'Vietnamese',
    welsh: 'Welsh', yemeni: 'Yemeni',
  };
  const KIN = { wife: 'wife', husband: 'husband', partner: 'partner', girlfriend: 'partner', boyfriend: 'partner', mother: 'parent', father: 'parent', mum: 'parent', mom: 'parent', dad: 'parent', sister: 'sibling', brother: 'sibling', son: 'child', daughter: 'child', cousin: 'family', aunt: 'family', uncle: 'family', friend: 'friend', mentor: 'mentor' };
  const TITLE = '(?:CEO|CTO|CPO|COO|CFO|CMO|founder|co-?founder|owner|brand owner|director|head of [a-z]+|lead [a-z]+|engineer|designer|developer|artist|producer|manager|advisor|adviser|investor|partner|editor|writer|composer|animator|community manager|moderator)';
  const ORG = "([A-Z][\\w.&'-]*(?: [A-Z][\\w.&'-]*)*)";
  const titleOf = new RegExp(`^(?:the |an? )?(${TITLE}) (?:of|at|for) ${ORG}$`, 'i');

  const fields = row && typeof row === 'object' ? row : {};
  const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  const plain = (s) => s.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
  const patch = {};
  const found = [];
  /** Sets one field when the row has none, and says whether the sentence it came from may leave the note. */
  const put = (id, value, said) => {
    if (value === '' || value === null || value === undefined) return false;
    const held = fields[id];
    if (empty(held) && patch[id] === undefined) {
      patch[id] = value;
      found.push(said);
      return true;
    }
    const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
    return !empty(held) ? same(held, value) : same(patch[id], value);
  };
  /** Adds to a list field what it does not hold yet. A list always takes, so the sentence always leaves. */
  const add = (id, values, said) => {
    const held = Array.isArray(fields[id]) ? fields[id].map(String) : [];
    const has = [...held, ...(patch[id] ?? [])].map((v) => v.toLowerCase());
    const fresh = values.filter((v) => v !== '' && !has.includes(v.toLowerCase()));
    if (fresh.length === 0) return true;
    patch[id] = [...held, ...(patch[id] ?? []), ...fresh];
    found.push(said);
    return true;
  };

  /* ONE SENTENCE, READ WHOLE OR NOT AT ALL: true when every word of it went into a field. */
  const sentence = (raw) => {
    const s = plain(raw).replace(/[.;]+$/, '').trim();
    if (s === '') return true;
    let m;
    if ((m = /^(?:legal|full) name(?: is)?:?\s+(.+)$/i.exec(s))) return put('legal_name', m[1].trim(), 'legal name');
    if ((m = /^(?:goes by|called|nickname|preferred name)(?: is)?:?\s+(.+)$/i.exec(s))) return put('goes_by', m[1].replace(/^["']|["']$/g, '').trim(), 'goes by');
    if (Object.hasOwn(NATIONS, s.toLowerCase())) return put('nationality', NATIONS[s.toLowerCase()], 'nationality');
    if ((m = /^(?:nationality|citizen(?:ship)?)(?: is)?:?\s+(.+)$/i.exec(s))) return put('nationality', NATIONS[m[1].toLowerCase()] ?? m[1].trim(), 'nationality');
    if ((m = /^(?:e-?mail|address)(?: is)?:?\s+([\w.+-]+@[\w-]+(?:\.[\w-]+)+)$/i.exec(s)) || (m = /^([\w.+-]+@[\w-]+(?:\.[\w-]+)+)$/.exec(s))) {
      return put('email', m[1].toLowerCase(), 'email');
    }
    if ((m = /^discord(?: user)? ?id(?: is)?:?\s+(\d{15,21})$/i.exec(s))) return put('discord_id', m[1], 'Discord id');
    if ((m = /^discord(?: username| handle| name)?(?: is)?:?\s+@?([a-z0-9_.]{2,32})$/i.exec(s))) return put('discord', m[1], 'Discord');
    if ((m = /^github(?: username| handle)?(?: is)?:?\s+@?([a-z0-9-]{1,39})$/i.exec(s))) return put('github', m[1], 'GitHub');
    if ((m = /^(?:x|twitter)(?: handle)?(?: is)?:?\s+@?(\w{1,15})$/i.exec(s))) return put('x', m[1], 'X');
    if ((m = /^instagram(?: handle)?(?: is)?:?\s+@?([\w.]{1,30})$/i.exec(s))) return put('instagram', m[1], 'Instagram');
    if ((m = /^telegram(?: handle)?(?: is)?:?\s+@?(\w{3,32})$/i.exec(s))) return put('telegram', m[1], 'Telegram');
    if ((m = /^linkedin(?: is)?:?\s+(\S+)$/i.exec(s))) return put('linkedin', m[1], 'LinkedIn');
    if ((m = /^whats ?app(?: is)?:?\s+(\+?[\d\s().-]{7,20})$/i.exec(s))) return put('whatsapp', m[1].replace(/[^\d+]/g, ''), 'WhatsApp');
    if ((m = /^(?:phone|mobile|cell|tel)(?: is)?:?\s+(\+?[\d\s().-]{7,20})$/i.exec(s))) return add('phones', [m[1].trim()], 'phone');
    if ((m = /^(?:born|birthday|date of birth|dob)(?: on| is)?:?\s+(\d{4}-\d{2}-\d{2})$/i.exec(s))) return put('birthday', m[1], 'birthday');
    if ((m = /^(?:time ?zone|tz)(?: is)?:?\s+([A-Za-z_]+\/[A-Za-z_]+|UTC ?[+-] ?\d{1,2}(?::\d{2})?|GMT ?[+-] ?\d{1,2})$/i.exec(s))) return put('timezone', m[1].replace(/\s+/g, ''), 'time zone');
    if ((m = /^(?:lives|based) in ([A-Z][\w' -]+?)(?:, ([A-Z][\w' -]+))?$/.exec(s))) {
      /* "Lives in Dublin, Ireland" is a city and a country; "Lives in Cork" alone could be either, so it stays. */
      if (!m[2]) return false;
      const city = put('city', m[1].trim(), 'city');
      const country = put('country', m[2].trim(), 'country');
      return city && country;
    }
    if ((m = /^speaks (.+)$/i.exec(s))) return add('languages', m[1].split(/,\s*|\s+and\s+/).map((x) => x.trim()).filter(Boolean), 'languages');
    if ((m = /^(?:[A-Z][\w-]*'s|his|her|my|your|our) (\w+)$/i.exec(s)) && Object.hasOwn(KIN, m[1].toLowerCase())) return put('relation', KIN[m[1].toLowerCase()], 'relationship');
    /* "CPO of Quartz and brand owner of Tamsin": every part a title at an organisation, or none is taken. */
    const parts = s.split(/,\s*(?:and\s+)?|\s+and\s+/);
    const titles = parts.map((p) => titleOf.exec(p.trim())).filter(Boolean);
    if (titles.length > 0 && titles.length === parts.length) {
      const said = titles.map((t) => `${t[1].length <= 3 ? t[1].toUpperCase() : t[1].charAt(0).toUpperCase() + t[1].slice(1)} at ${t[2]}`);
      return add('titles', said, 'roles');
    }
    return false;
  };

  /* THE NOTE IN PARTS: what comes before the first `##`, then each part under its heading. */
  const text = typeof note === 'string' ? note.replace(/\r\n/g, '\n') : '';
  const lines = text.split('\n');
  const parts = [{ head: null, lines: [] }];
  for (const line of lines) {
    const h = /^#{2,3}\s+(.+?)\s*$/.exec(line);
    if (h) parts.push({ head: h[1], lines: [] });
    else parts.at(-1).lines.push(line);
  }
  const bullet = (l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/^\[[ xX]\]\s*/, '').trim();
  const kept = [];
  for (const part of parts) {
    const head = part.head === null ? '' : part.head.toLowerCase();
    if (/^(?:deal|terms|pay|payment|the deal|pay terms)$/.test(head)) {
      const said = part.lines.map(bullet).filter(Boolean).map((l) => plain(l)).join(' ');
      if (said !== '' && put('terms', said, 'deal')) continue;
    }
    if (/^(?:still to do|to do|todo|paperwork|open|outstanding)$/.test(head)) {
      const items = part.lines.map(bullet).map(plain).filter(Boolean);
      if (items.length > 0 && add('paperwork', items, 'paperwork')) continue;
    }
    if (part.head === null) {
      /* EACH PARAGRAPH, SENTENCE BY SENTENCE: a sentence read whole leaves, the rest stays in its place. */
      const out = [];
      for (const para of part.lines.join('\n').split(/\n{2,}/)) {
        if (/^\s*(?:[-*•]|\d+[.)])\s/m.test(para)) {
          out.push(para);
          continue;
        }
        const said = para.replace(/\n/g, ' ').split(/(?<=[.;!?])\s+(?=[A-Z*_`"'@+0-9])/);
        const left = said.filter((x) => !sentence(x));
        if (left.join(' ').trim() !== '') out.push(left.join(' ').trim());
      }
      if (out.length > 0) kept.push(out.join('\n\n'));
      continue;
    }
    kept.push([`## ${part.head}`, ...part.lines].join('\n').trim());
  }

  /* AND WHAT ITS HANDLES ALREADY SAY: `discord:<id>` is the Discord id, `github:<login>` the GitHub login. */
  for (const list of [fields.handles, fields.keys])
    for (const h of Array.isArray(list) ? list : []) {
      const m = /^(discord|github|x|twitter|instagram|telegram|linkedin):(.+)$/i.exec(String(h).trim());
      if (!m) continue;
      const kind = m[1].toLowerCase();
      const v = m[2].trim();
      if (kind === 'discord') put(/^\d{15,21}$/.test(v) ? 'discord_id' : 'discord', v, 'Discord');
      else put(kind === 'twitter' ? 'x' : kind, v, kind);
    }

  const rest = kept.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  if (Object.keys(patch).length === 0) return null;
  if (rest !== text.trim()) patch.note = rest;
  return { patch, found: [...new Set(found)] };
}

/**
 * One question a person whose note holds facts the fields do not: a rowset that changes their row, worded with what
 * it found. A person merged into another, and the record's own person, are passed over.
 */
export function peopleFields(people) {
  const out = [];
  for (const p of people) {
    const f = p.fields ?? {};
    if (f.merged_into) continue;
    const read = noteFacts(f.note, f);
    if (read === null) continue;
    const name = typeof f.name === 'string' && f.name.trim() !== '' ? f.name.trim() : 'this person';
    const what = read.found.length > 4 ? `${read.found.slice(0, 3).join(', ')} and ${read.found.length - 3} more` : read.found.length > 1 ? `${read.found.slice(0, -1).join(', ')} and ${read.found.at(-1)}` : read.found.join('');
    out.push({
      name,
      cause: `people-fields:${p.id}`,
      question: `Keep ${name}'s ${what || 'details'} as fields?`.slice(0, 280),
      body_kind: 'rowset',
      body: {
        register: 'people',
        rows: [{ at: p.id, ...(typeof p.version === 'number' ? { version: p.version } : {}), patch: read.patch }],
        why: 'Read from the note. What it could not read for sure stays in the note.',
      },
    });
  }
  return out;
}

/**
 * The script: read every person, a page of fifty at a time in order, and file each one's question through
 * `ctx.propose`. A host that hands no `propose` (a trial) gets one sentence and nothing filed.
 */
export default async function run(ctx) {
  const people = [];
  let after = 0;
  for (;;) {
    const page = await ctx.record.list('people', { field: 'seq', gt: after }, { order: 'seq' });
    if (!Array.isArray(page) || page.length === 0) break;
    for (const r of page) people.push({ id: r.id, version: r.version, fields: r.fields });
    const last = page.at(-1).seq;
    if (typeof last !== 'number' || last <= after) break;
    after = last;
  }
  const asks = peopleFields(people);
  if (asks.length === 0) {
    ctx.log('No note holds a fact the fields do not.');
    return null;
  }
  if (typeof ctx.propose !== 'function') {
    ctx.log(`${asks.length === 1 ? 'One person has' : `${asks.length} people have`} facts in their note to keep as fields, and a trial files no questions.`);
    return null;
  }
  const asked = [];
  const left = [];
  for (const a of asks) {
    const got = await ctx.propose({ question: a.question, body_kind: a.body_kind, body: a.body, cause: a.cause });
    const filed = got && typeof got === 'object' && 'ok' in got ? (got.ok ? got.value : null) : got;
    if (filed === null || filed === undefined || filed.answered !== undefined || filed.joined) left.push(a.name);
    else asked.push(a.name);
  }
  const names = (l) => (l.length > 3 ? `${l.slice(0, 3).join(', ')} and ${l.length - 3} more` : l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l.at(-1)}` : l.join(''));
  ctx.log([asked.length > 0 ? `Asked to keep the facts in ${names(asked)}'s notes as fields.` : '', left.length > 0 ? `${names(left)} already asked or answered.` : ''].join(' ').trim());
  return { asked: asked.length, left: left.length };
}

/**
 * The script as People's pack document writes it: no egress, no keys, reading and (through the owner's yes) writing
 * People. Once a day, so a record that updates is asked the first night, and when a rule hands it on, so `Run now`
 * (`rule.people-fields`) and an agent's `act automationRun` reach it.
 */
export const PEOPLE_FIELDS_SCRIPT = {
  script: 'people_fields',
  title: "Keep the facts in each person's note as fields",
  pack: 'people',
  runs: { every: '1d', rule: true },
  egress: [],
  keys: [],
  reads: ['people'],
  writes: ['people'],
  source: `${noteFacts.toString()}\n${peopleFields.toString()}\nexport default ${run.toString()}`,
};
