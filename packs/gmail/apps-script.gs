/**
 * BrainDog: Gmail reader. Runs under your own Google account, every 15 minutes, and only reads.
 *
 * It sends your BrainDog, for each mail of the last 14 days that is new or changed: who it is from (or to, for one you
 * sent), the subject, the day, a short snippet of up to 160 characters, the link to it in Gmail,
 * and whether it is unread and waiting for your reply. Never the whole mail, never an attachment.
 *
 * It never sends, changes, moves, labels or deletes any mail: the only permission it asks for is to read.
 *
 * To stop it: run stop() once, or delete this project.
 */

var BRAINDOG = 'BRAINDOG_ADDRESS';
var EVERY_MINUTES = 15;
var LOOK_BACK_DAYS = 14;
var MOST_A_RUN = 40;

/** Run this once: it reads now and then every 15 minutes. */
function start() {
  stop();
  ScriptApp.newTrigger('read').timeBased().everyMinutes(EVERY_MINUTES).create();
  read();
}

/** Run this to stop reading. */
function stop() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'read') ScriptApp.deleteTrigger(t);
  });
}

function read() {
  if (BRAINDOG.indexOf('https://') !== 0) throw new Error('Paste the address from BrainDog into BRAINDOG at the top first.');
  var store = PropertiesService.getUserProperties();
  var told = JSON.parse(store.getProperty('told') || '{}');
  var me = String(Gmail.Users.getProfile('me').emailAddress).toLowerCase();
  var listed = Gmail.Users.Messages.list('me', { q: 'newer_than:' + LOOK_BACK_DAYS + 'd -in:spam -in:trash -in:chats', maxResults: 100 }).messages || [];
  var keep = {};
  var posts = [];
  for (var i = 0; i < listed.length && posts.length < MOST_A_RUN; i++) {
    var id = listed[i].id;
    var was = told[id];
    keep[id] = was;
    /* A MAIL ALREADY TOLD AS DONE IS NOT ASKED AGAIN: only new ones and ones still unread or waiting are read. */
    if (was === 'done') continue;
    var mail = readOne(id, me);
    if (mail === null) continue;
    var state = mail.unread || mail.reply ? 'open:' + mail.unread + ':' + mail.reply : 'done';
    keep[id] = state;
    if (state !== was) posts.push(mail);
  }
  var requests = posts.map(function (m) {
    return { url: BRAINDOG, method: 'post', contentType: 'text/plain; charset=utf-8', payload: bodyOf(m), muteHttpExceptions: true };
  });
  if (requests.length > 0) {
    var answers = UrlFetchApp.fetchAll(requests);
    answers.forEach(function (a, n) {
      /* NOT TAKEN: told again next run. */
      if (a.getResponseCode() >= 300) delete keep[posts[n].id];
    });
  }
  store.setProperty('told', JSON.stringify(keep));
}

function readOne(id, me) {
  var m = Gmail.Users.Messages.get('me', id, {
    format: 'metadata',
    metadataHeaders: ['From', 'To', 'Subject', 'Date', 'List-Unsubscribe', 'List-Id', 'Precedence', 'Auto-Submitted'],
  });
  var labels = m.labelIds || [];
  var h = {};
  (m.payload && m.payload.headers ? m.payload.headers : []).forEach(function (x) { h[x.name.toLowerCase()] = String(x.value); });
  var out = labels.indexOf('SENT') !== -1;
  var from = parseAddress(h['from'] || '');
  var to = parseAddress((h['to'] || '').split(',')[0]);
  var other = out ? to : from;
  if (!other.address || (!out && other.address === me)) return null;
  var subject = clean(h['subject'] || '(no subject)', 200);
  var snippet = clean(decode(m.snippet || ''), 160);
  var bulk = Boolean(h['list-unsubscribe'] || h['list-id'] || /bulk|list|junk/i.test(h['precedence'] || '') ||
    /auto/i.test(h['auto-submitted'] || '') || /no-?reply|do-?not-?reply|notifications?@|mailer-daemon|bounce/i.test(other.address) ||
    labels.some(function (l) { return /^CATEGORY_(PROMOTIONS|SOCIAL|UPDATES|FORUMS)$/.test(l); }));
  var unread = !out && labels.indexOf('UNREAD') !== -1 && labels.indexOf('INBOX') !== -1;
  var reply = !out && !bulk && labels.indexOf('INBOX') !== -1 && !answered(m.threadId, id, me);
  var at = new Date(Number(m.internalDate));
  return {
    id: id,
    thread: m.threadId,
    out: out,
    name: clean(other.name || other.address, 120),
    address: other.address,
    subject: subject,
    snippet: snippet,
    at: at,
    unread: unread,
    reply: reply,
    person: !bulk,
    kind: out ? 'none' : kindOf(subject + ' ' + snippet),
    link: 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(me) + '#all/' + m.threadId,
  };
}

/** Whether you wrote in the thread after this mail arrived. */
function answered(threadId, id, me) {
  var t = Gmail.Users.Threads.get('me', threadId, { format: 'metadata', metadataHeaders: ['From'] });
  var after = false;
  var mine = false;
  (t.messages || []).forEach(function (x) {
    if (x.id === id) { after = true; return; }
    if (!after) return;
    var f = ((x.payload && x.payload.headers) || []).filter(function (y) { return y.name.toLowerCase() === 'from'; })[0];
    if (f && parseAddress(String(f.value)).address === me) mine = true;
  });
  return mine;
}

function kindOf(text) {
  if (/\b(invoice|bill|amount due|payment due|due date|pay by|statement is ready|renewal notice)\b/i.test(text)) return 'bill';
  if (/\b(receipt|your order|order confirm|payment received|thanks for your (order|purchase|payment)|we received your payment)\b/i.test(text)) return 'receipt';
  if (/\b(invitation|invite|meeting|appointment|booking|reservation|interview|deadline|rsvp|webinar)\b/i.test(text)) return 'date';
  return 'none';
}

function parseAddress(raw) {
  var s = String(raw || '').trim();
  var m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim(), address: m[2].trim().toLowerCase() };
  return { name: '', address: s.toLowerCase() };
}

function decode(s) {
  return s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** One line, at most n characters, and none of the words BrainDog reads the lines by. */
function clean(s, n) {
  var one = String(s).replace(/[\r\n\t]+/g, ' ').replace(/gmail\.[a-z]+=/gi, '').replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
}

function bodyOf(m) {
  return [
    'BrainDog Gmail 1',
    'gmail.message= ' + m.id,
    'gmail.thread= ' + m.thread,
    'gmail.direction= ' + (m.out ? 'sent' : 'received'),
    'gmail.name= ' + m.name,
    'gmail.address= ' + m.address,
    'gmail.subject= ' + m.subject,
    'gmail.day= ' + Utilities.formatDate(m.at, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    'gmail.at= ' + m.at.toISOString(),
    'gmail.unread= ' + (m.unread ? 'yes' : 'no'),
    'gmail.reply= ' + (m.reply ? 'yes' : 'no'),
    'gmail.person= ' + (m.person ? 'yes' : 'no'),
    'gmail.kind= ' + m.kind,
    'gmail.link= ' + m.link,
    'gmail.snippet= ' + m.snippet,
    'gmail.end',
    '',
  ].join('\n');
}
