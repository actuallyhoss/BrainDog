/**
 * Where an app's metadata document may come from. A file anybody can upload under a big host's name proves nothing about
 * who made the app, and the consent screen would say "BrainDog checked that this app is raw.githubusercontent.com".
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isJsonType, isUserContentHost } from '../src/oauth.ts';

test('FILE HOSTS ARE NO APP’S OWN HOST', () => {
  for (const host of ['raw.githubusercontent.com', 'gist.githubusercontent.com', 'gist.github.com', 'pastebin.com', 'storage.googleapis.com', 'my-bucket.s3.amazonaws.com', 'my-bucket.s3.eu-west-1.amazonaws.com', 'acct.blob.core.windows.net', 'pub-123.r2.dev', 'RAW.GITHUBUSERCONTENT.COM'])
    assert.equal(isUserContentHost(host), true, host);
  for (const host of ['claude.ai', 'github.com', 'app.example', 'chatgpt.com', 'notgithubusercontent.com'])
    assert.equal(isUserContentHost(host), false, host);
});

test('A DOCUMENT IS JSON BY ITS TYPE', () => {
  for (const type of ['application/json', 'application/json; charset=utf-8', 'Application/JSON', 'application/oauth-client+json'])
    assert.equal(isJsonType(type), true, type);
  for (const type of [null, '', 'text/plain', 'text/plain; charset=utf-8', 'text/html', 'application/octet-stream'])
    assert.equal(isJsonType(type), false, String(type));
});
