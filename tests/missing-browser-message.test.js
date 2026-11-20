import { test } from 'node:test';
import assert from 'node:assert';
import { missingBrowserMessage } from '../index.js';

test('missingBrowserMessage names the browser, folder and exact command', () => {
  const msg = missingBrowserMessage('firefox', '/path/to/crawler', '1.61.1');
  assert.match(msg, /Firefox is not installed for this crawler \(Playwright 1\.61\.1\)/);
  assert.match(msg, /cd \/path\/to\/crawler\n/);
  assert.match(msg, /npx playwright install firefox/);
});

test('missingBrowserMessage works without a known Playwright version', () => {
  const msg = missingBrowserMessage('chromium', '/x', '');
  assert.match(msg, /Chromium is not installed for this crawler\.\n/);
});
