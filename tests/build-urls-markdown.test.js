import { test } from 'node:test';
import assert from 'node:assert';
import { buildUrlsMarkdown } from '../index.js';

test('buildUrlsMarkdown lists each URL with a link to its screenshot', () => {
  const md = buildUrlsMarkdown([
    { url: 'https://site.com/blog', file: '001-blog.png' },
    { url: 'https://site.com/blog/post', file: '002-blog-post.png' },
  ]);
  assert.match(md, /^# Screenshots\n/);
  assert.match(md, /2 pages, 2 screenshots, 0 failed/);
  assert.match(md, /\| 1 \| <https:\/\/site\.com\/blog> \| \[001-blog\.png\]\(001-blog\.png\) \|/);
  assert.match(md, /\| 2 \| <https:\/\/site\.com\/blog\/post> \| \[002-blog-post\.png\]\(002-blog-post\.png\) \|/);
});

test('buildUrlsMarkdown shows failures with the first error line, pipes escaped', () => {
  const md = buildUrlsMarkdown([
    { url: 'https://site.com/', file: '001-index.png', error: 'page.goto: Timeout | 30000ms\nCall log: ...' },
  ]);
  assert.match(md, /1 pages, 0 screenshots, 1 failed/);
  assert.match(md, /\| 1 \| <https:\/\/site\.com\/> \| ⚠ Failed: page\.goto: Timeout \\\| 30000ms \|/);
  assert.doesNotMatch(md, /Call log/);
});
