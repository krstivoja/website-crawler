import { test } from 'node:test';
import assert from 'node:assert';
import { parseUrls } from '../index.js';

test('parseUrls splits on commas', () => {
  assert.deepStrictEqual(
    parseUrls('https://a.com, https://b.com'),
    ['https://a.com', 'https://b.com']
  );
});

test('parseUrls splits on newlines', () => {
  assert.deepStrictEqual(
    parseUrls('https://a.com\nhttps://b.com\n'),
    ['https://a.com', 'https://b.com']
  );
});

test('parseUrls trims whitespace and drops empty entries', () => {
  assert.deepStrictEqual(
    parseUrls(' https://a.com ,\n, https://b.com'),
    ['https://a.com', 'https://b.com']
  );
});

test('parseUrls returns a single-element array for one URL', () => {
  assert.deepStrictEqual(parseUrls('https://a.com'), ['https://a.com']);
});
