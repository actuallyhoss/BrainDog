/**
 * An address held in the keys (`addressed`): read as an https URL, `webcal://` as `https://`, held to the script's
 * egress and to the host its key opens, and a refusal never says the address, which is the secret.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addressed } from '../src/script.ts';

const EGRESS = ['https://calendar.google.com', 'https://outlook.office365.com'];
const grant = (opens = '') => ({ id: 'g1', label: 'Calendar link', opens });
const SECRET = 'webcal://calendar.google.com/calendar/ical/me%40example.com/private-0123456789abcdef/basic.ics';

test('A WEBCAL LINK AT A DECLARED HOST IS SENT AS HTTPS', () => {
  const out = addressed('calendar_poll', EGRESS, grant(), SECRET);
  assert.ok('url' in out);
  assert.equal(out.url.href, SECRET.replace('webcal://', 'https://'));
});

test('A HOST THE SCRIPT DOES NOT DECLARE, USER INFO, PLAIN HTTP OR NO LINK AT ALL IS REFUSED, NEVER SAYING THE LINK', () => {
  for (const secret of ['https://evil.example/private-0123456789abcdef/basic.ics', 'https://me:pw@calendar.google.com/x', 'http://calendar.google.com/x', 'not a link']) {
    const out = addressed('calendar_poll', EGRESS, grant(), secret);
    assert.ok(!('url' in out), secret);
    assert.ok(!out.why.includes('private-0123456789abcdef'), 'the refusal never repeats the secret');
  }
  const elsewhere = addressed('calendar_poll', EGRESS, grant('outlook.office365.com'), SECRET);
  assert.ok(!('url' in elsewhere), 'a key that says it opens another host is not sent to this one');
});
