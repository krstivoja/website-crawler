import { test } from 'node:test';
import assert from 'node:assert';
import { homedir } from 'os';
import { join } from 'path';
import { consentPath } from '../index.js';

test('consentPath stores per hostname under ~/.takescreenshots', () => {
  assert.strictEqual(
    consentPath('www.malwarebytes.com'),
    join(homedir(), '.takescreenshots', 'www.malwarebytes.com.json')
  );
});

test('consentPath keeps www and apex separate', () => {
  assert.notStrictEqual(consentPath('example.com'), consentPath('www.example.com'));
});
