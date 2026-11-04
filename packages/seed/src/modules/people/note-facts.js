/**
 * A person's note read for the facts it holds, since People 4.7.0 (3 Nov, the owner: "instead of just long text, i want them
 * to be parsed as fields ... his name should be a field, discord username a field"). Before it every fact about
 * somebody was a sentence in one long note: "Legal name **Mira Chen**. Irish. Email ... Discord id ... ## Deal ...".
 *
 * `noteFacts` READS ONE NOTE AND SAYS WHAT IT FOUND, and only by plain patterns: a sentence that is nothing but a fact
 * ("Irish.", "Legal name Mira Chen.", "Discord id 100000000000000001.", "Ada's wife.", "CPO of Lanternfish and brand owner
 * of Kiln."), an address or a phone, and the `## Deal` and `## Still to do` parts. A sentence it cannot read whole
 * stays in the note, as does every other part (`## Log` among them). A field the row already holds is never written
 * over: a fact that agrees with it leaves the note, and one that differs stays where it was.
 *
 * `peopleFields` HANDS BACK ONE QUESTION A PERSON, a rowset that changes their row, and the script below files them.
 * Nothing is written without the owner's yes, and each question carries the cause `people-fields:<row>`, so a second
 * run joins the one still open and one he said no to is not asked again.
 *
 * TIDYING WHAT THE FIELDS ALREADY SAY, SINCE People 4.7.1 (4 Nov). 4.7.0 ran on the owner's record and left Mira's
 * note opening "Engineer on Kiln. Deal: 10% of Kiln gross, paid monthly. # Mira Joins the team ...": the fields
 * were right, but the note still said the deal once more, still carried his name as a heading, and a paragraph whose
 * lines were joined to read it came back as one run-on line. So, with `tidy`:
 * - a lone heading that is the person's own name (`name`, `goes_by`, `legal_name` or one of `aliases`) leaves the note;
 * - a one-line deal in the opening, "Deal: ...", "Terms: ...", "Pay: ...", leaves when `terms` is held or is being set
 *   from the note's own `## Deal` part (read first for that reason), and is taken as `terms` when neither says one;
 * - an opening that is one short sentence, with more of the note after it, is offered as `about` while that is empty.
 * And always, tidy or not: a line nothing was read from is kept exactly as written, and each line keeps its own place,
 * so a heading or a paragraph is never folded into the line before it.
 * A sentence that only says the role again in other words is not looked for: no pattern tells it apart for sure.
 *
 * WHY `tidy` IS ITS OWN READING AND NOT THE ONLY ONE. The kernel remembers a no by the cause and the exact patch asked
 * about (`remembered` in `packages/kernel/src/govern.ts`), so asking a person who said no to 4.7.0's question with a
 * patch that also tidies the note would ask them again for the same facts. `peopleFields` asks the facts first with the
 * reading 4.7.0 asked (`tidy` off) under the cause it used, and only a person whose row already holds every fact the note
 * says is asked, under a cause of its own, to tidy what is left.
 *
 * NOTHING OUTSIDE ITSELF IS READ BY `noteFacts` OR `peopleFields`, AND NOTHING BUT THEM BY `run`: the three texts are
 * the script (`PEOPLE_FIELDS_SCRIPT.source`), as `kpi-backfill.js` is.
 */

export function noteFacts(note, row, tidy) {
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
  /* WHAT LEFT THE NOTE THAT NO FIELD TOOK, because a field already says it: their name as a heading, a one-line deal. */
  const tidied = [];
  /* THEIR OWN NAMES, as a heading would say one. */
  const names = [fields.name, fields.goes_by, fields.legal_name, ...(Array.isArray(fields.aliases) ? fields.aliases : [])]
    .filter((n) => typeof n === 'string' && n.trim() !== '')
    .map((n) => n.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim().toLowerCase());
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
    /* A ONE-LINE DEAL, "Deal: 10% of Kiln gross, paid monthly": said again when the Deal field holds one or the note's
       `## Deal` part is setting it, so it leaves; the deal itself when nothing else says one. */
    if (tidy && (m = /^(?:the )?(?:deal|terms|pay)(?: is)?:\s*(.+)$/i.exec(s))) {
      if (!empty(fields.terms) || patch.terms !== undefined) {
        tidied.push('deal');
        return true;
      }
      return put('terms', m[1].trim(), 'deal');
    }
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
    /* "CPO of Lanternfish and brand owner of Kiln": every part a title at an organisation, or none is taken. */
    const parts = s.split(/,\s*(?:and\s+)?|\s+and\s+/);
    const titles = parts.map((p) => titleOf.exec(p.trim())).filter(Boolean);
    if (titles.length > 0 && titles.length === parts.length) {
      const said = titles.map((t) => `${t[1].length <= 3 ? t[1].toUpperCase() : t[1].charAt(0).toUpperCase() + t[1].slice(1)} at ${t[2]}`);
      return add('titles', said, 'roles');
    }
    return false;
  };

  /* THE NOTE IN PARTS: what comes before the first `##`, then each part under its heading. A heading that is their own
     name is no part of its own: with `tidy` it leaves, and what follows it is read as the opening is. */
  const text = typeof note === 'string' ? note.replace(/\r\n/g, '\n') : '';
  const lines = text.split('\n');
  const parts = [{ head: null, lines: [] }];
  for (const line of lines) {
    const own = /^#{1,3}\s+(.+?)\s*#*\s*$/.exec(line);
    if (tidy && own && names.includes(plain(own[1]).toLowerCase())) {
      tidied.push('name');
      if (parts.at(-1).head !== null) parts.push({ head: null, lines: [] });
      continue;
    }
    const h = /^#{2,3}\s+(.+?)\s*$/.exec(line);
    if (h) parts.push({ head: h[1], lines: [] });
    else parts.at(-1).lines.push(line);
  }
  const bullet = (l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/^\[[ xX]\]\s*/, '').trim();
  const kept = parts.map(() => null);
  /* A PART UNDER A HEADING, kept whole unless it is the deal or the paperwork. */
  const headed = (part, i) => {
    const head = part.head.toLowerCase();
    if (/^(?:deal|terms|pay|payment|the deal|pay terms)$/.test(head)) {
      const said = part.lines.map(bullet).filter(Boolean).map((l) => plain(l)).join(' ');
      if (said !== '' && put('terms', said, 'deal')) return;
    }
    if (/^(?:still to do|to do|todo|paperwork|open|outstanding)$/.test(head)) {
      const items = part.lines.map(bullet).map(plain).filter(Boolean);
      if (items.length > 0 && add('paperwork', items, 'paperwork')) return;
    }
    kept[i] = [`## ${part.head}`, ...part.lines].join('\n').trim();
  };
  /* THE TEXT OUTSIDE THEM, PARAGRAPH BY PARAGRAPH AND LINE BY LINE: a sentence read whole leaves, the rest of its line
     stays where it was, and a line nothing was read from stays exactly as written. A paragraph with a list in it, a
     heading or a table row is kept whole. Lines are never joined, so a heading never runs into the line before it. */
  let opening = null;
  const open = (part, i) => {
    const out = [];
    for (const para of part.lines.join('\n').split(/\n[ \t]*\n/)) {
      if (para.trim() === '') continue;
      if (/^\s*(?:[-*•]|\d+[.)])\s/m.test(para)) {
        out.push(para.replace(/^\n+|\s+$/g, ''));
        continue;
      }
      const left = [];
      for (const line of para.split('\n')) {
        if (line.trim() === '' || /^\s*(?:#|\|)/.test(line)) {
          if (line.trim() !== '') left.push(line.trimEnd());
          continue;
        }
        const said = line.trim().split(/(?<=[.;!?])\s+(?=[A-Z*_`"'@+0-9])/);
        const stay = said.filter((x) => !sentence(x));
        if (stay.length === said.length) left.push(line.trimEnd());
        else if (stay.join(' ').trim() !== '') left.push(stay.join(' ').trim());
      }
      if (left.length > 0) out.push(left.join('\n'));
    }
    if (i === 0 && out.length > 0) opening = out;
    if (out.length > 0) kept[i] = out.join('\n\n');
  };
  /* IN ORDER, AS 4.7.0 READ THEM; with `tidy`, the parts under a heading first, so the opening's one-line deal knows
     whether `## Deal` is setting the field. */
  const order = parts.map((part, i) => i);
  if (tidy) order.sort((a, b) => Number(parts[a].head === null) - Number(parts[b].head === null) || a - b);
  for (const i of order) (parts[i].head === null ? open : headed)(parts[i], i);

  /* THE OPENING AS `about`, with `tidy`: the note opens on one short sentence, alone in its paragraph once the facts in
     it left ("Engineer on Kiln."), and more of the note follows it. A note that is only that sentence keeps it, since
     it is then the note and not a line over it ("Bank transfers to and from her are filed under Family."). */
  if (tidy && opening !== null && empty(fields.about) && patch.about === undefined) {
    const line = opening[0].trim();
    const one = !line.includes('\n') && !/^\s*(?:#|\||[-*•]\s)/.test(line) && line.split(/(?<=[.;!?])\s+(?=[A-Z*_`"'@+0-9])/).length === 1;
    const more = opening.length > 1 || kept.some((k, i) => i > 0 && k !== null);
    if (one && /[.!]$/.test(line) && plain(line).split(' ').length <= 10 && plain(line).length <= 80 && more) {
      patch.about = plain(line);
      found.push('about');
      kept[0] = opening.length > 1 ? opening.slice(1).join('\n\n') : null;
    }
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

  const rest = kept.filter((k) => k !== null && k.trim() !== '').join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  /* WITH `tidy`, A NOTE THAT ONLY LOST WHAT THE FIELDS ALREADY SAY IS STILL A CHANGE TO ASK ABOUT; without it, only a fact is. */
  if (Object.keys(patch).length === 0 && !(tidy && tidied.length > 0 && rest !== text.trim())) return null;
  if (rest !== text.trim()) patch.note = rest;
  return { patch, found: [...new Set(found)], tidied: [...new Set(tidied)] };
}

/**
 * One question a person whose note holds facts the fields do not: a rowset that changes their row, worded with what
 * it found. A person merged into another, and the record's own person, are passed over.
 *
 * THE FACTS FIRST, AS 4.7.0 ASKED THEM, under `people-fields:<row>`: a person who said no to that question is answered
 * from memory and not asked again, because the patch is the one they saw. ONLY ONCE THE ROW HOLDS EVERY FACT the note
 * says is the rest of the note tidied (`tidy`), under `people-notes:<row>`: their name as a heading and a one-line deal
 * the fields already say leave, and a short opening line becomes their About. So a person who said yes to 4.7.0 is
 * asked once more, and only when their note still holds something this reads.
 */
export function peopleFields(people) {
  const out = [];
  const listed = (l) => (l.length > 4 ? `${l.slice(0, 3).join(', ')} and ${l.length - 3} more` : l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l.at(-1)}` : l.join(''));
  for (const p of people) {
    const f = p.fields ?? {};
    if (f.merged_into) continue;
    const name = typeof f.name === 'string' && f.name.trim() !== '' ? f.name.trim() : 'this person';
    const row = (patch) => [{ at: p.id, ...(typeof p.version === 'number' ? { version: p.version } : {}), patch }];
    const read = noteFacts(f.note, f, false);
    if (read !== null) {
      out.push({
        name,
        cause: `people-fields:${p.id}`,
        question: `Keep ${name}'s ${listed(read.found) || 'details'} as fields?`.slice(0, 280),
        body_kind: 'rowset',
        body: { register: 'people', rows: row(read.patch), why: 'Read from the note. What it could not read for sure stays in the note.' },
      });
      continue;
    }
    const tidy = noteFacts(f.note, f, true);
    if (tidy === null) continue;
    const said = [];
    if (typeof tidy.patch.about === 'string') said.push(`keep "${tidy.patch.about}" as ${name}'s About`);
    if (typeof tidy.patch.terms === 'string') said.push(`keep "${tidy.patch.terms}" as ${name}'s Deal`);
    const other = tidy.found.filter((x) => x !== 'about' && x !== 'deal');
    if (other.length > 0) said.push(`keep ${name}'s ${listed(other)} as fields`);
    const whose = said.length > 0 ? 'their' : `${name}'s`;
    const gone = [tidy.tidied.includes('name') ? `${whose} name as a heading` : '', tidy.tidied.includes('deal') ? 'the one-line deal the Deal field holds' : ''].filter(Boolean);
    if (gone.length > 0) said.push(`take ${gone.join(' and ')} out of ${gone[0].startsWith(whose) || said.length > 0 ? 'their' : whose} note`);
    const question = said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said.at(-1)}` : said.join('');
    out.push({
      name,
      cause: `people-notes:${p.id}`,
      question: `${question.charAt(0).toUpperCase()}${question.slice(1)}?`.slice(0, 280),
      body_kind: 'rowset',
      body: {
        register: 'people',
        rows: row(tidy.patch),
        why: 'Read from the note. What the fields already say leaves it, and the rest stays as it was written.',
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
    ctx.log('No note holds anything the fields do not say.');
    return null;
  }
  if (typeof ctx.propose !== 'function') {
    ctx.log(`${asks.length === 1 ? 'One person has' : `${asks.length} people have`} something in their note to keep as a field, and a trial files no questions.`);
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
  ctx.log([asked.length > 0 ? `Asked about what ${names(asked)}'s notes say.` : '', left.length > 0 ? `${names(left)} already asked or answered.` : ''].join(' ').trim());
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
