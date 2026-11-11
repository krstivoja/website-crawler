import { test } from 'node:test';
import assert from 'node:assert';
import { isValidLink, scopeOf } from '../index.js';

const origin = 'https://site.com';

test('scopeOf strips trailing slashes; root becomes whole-site scope', () => {
  assert.strictEqual(scopeOf('/blog/'), '/blog');
  assert.strictEqual(scopeOf('/blog'), '/blog');
  assert.strictEqual(scopeOf('/'), '');
});

test('isValidLink keeps links under the start path', () => {
  assert.strictEqual(isValidLink('/blog', origin, '/blog'), '/blog');
  assert.strictEqual(isValidLink('/blog/', origin, '/blog'), '/blog/');
  assert.strictEqual(isValidLink('/blog/news/post-1', origin, '/blog'), '/blog/news/post-1');
});

test('isValidLink drops links outside the start path', () => {
  assert.strictEqual(isValidLink('/', origin, '/blog'), null);
  assert.strictEqual(isValidLink('/premium', origin, '/blog'), null);
  assert.strictEqual(isValidLink('/blogger', origin, '/blog'), null);
});

test('isValidLink with root scope allows the whole site', () => {
  assert.strictEqual(isValidLink('/premium', origin, ''), '/premium');
});

test('isValidLink still drops other origins and files', () => {
  assert.strictEqual(isValidLink('https://other.com/blog/x', origin, '/blog'), null);
  assert.strictEqual(isValidLink('/blog/report.pdf', origin, '/blog'), null);
});
