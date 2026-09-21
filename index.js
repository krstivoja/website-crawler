#!/usr/bin/env node

import { chromium, firefox, webkit } from 'playwright';
import prompts from 'prompts';
import { existsSync, realpathSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';

const defaults = {
  pause: 500,
  wait: 1000,
  fullPage: true,
  width: 1280,
  density: 2,
  maxPages: 50,
};

// Saved consent state per exact hostname (www and apex are separate)
export function consentPath(hostname) {
  return join(homedir(), '.takescreenshots', `${hostname}.json`);
}

function consentChoices(url) {
  const saved = existsSync(consentPath(new URL(url).hostname));
  return [
    ...(saved ? [{ title: 'Use saved consent', value: 'saved' }] : []),
    { title: 'Approve in browser now', value: 'approve' },
    { title: 'Skip', value: 'skip' },
  ];
}

async function askQuestions() {
  const response = await prompts(
    [
    {
      type: 'select',
      name: 'browser',
      message: 'Browser',
      choices: [
        { title: 'Chromium', value: 'chromium' },
        { title: 'Firefox', value: 'firefox' },
        { title: 'WebKit (Safari)', value: 'webkit' },
      ],
      initial: 0,
    },
    {
      type: 'text',
      name: 'url',
      message: 'URL to crawl',
      validate: (v) => {
        try {
          new URL(v);
          return true;
        } catch {
          return 'Enter a valid URL (include https://)';
        }
      },
    },
    {
      type: 'select',
      name: 'consent',
      message: 'Cookie consent',
      choices: (prev, values) => consentChoices(values.url),
      initial: 0,
    },
    {
      type: 'number',
      name: 'pause',
      message: 'Pause between pages (ms)',
      initial: defaults.pause,
    },
    {
      type: 'number',
      name: 'wait',
      message: 'Wait before screenshot (ms)',
      initial: defaults.wait,
    },
    {
      type: 'confirm',
      name: 'fullPage',
      message: 'Take full page screenshot?',
      initial: defaults.fullPage,
    },
    {
      type: 'number',
      name: 'width',
      message: 'Screen width (px)',
      initial: defaults.width,
    },
    {
      type: 'select',
      name: 'density',
      message: 'Pixel density',
      choices: [
        { title: '1x (regular)', value: 1 },
        { title: '2x (retina)', value: 2 },
        { title: '3x (super retina)', value: 3 },
      ],
      initial: 1,
    },
    {
      type: 'number',
      name: 'maxPages',
      message: 'Maximum number of pages',
      initial: defaults.maxPages,
    },
    ],
    { onCancel: () => process.exit(0) }
  );

  if (!response.url) {
    process.exit(0);
  }

  return response;
}

function slugify(pathname) {
  return pathname
    .replace(/^\//, '')
    .replace(/\/$/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase() || 'index';
}

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

function isValidLink(href, baseOrigin) {
  try {
    const url = new URL(href, baseOrigin);
    if (url.origin !== baseOrigin) return null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const ext = url.pathname.split('.').pop().toLowerCase();
    const skipExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'zip', 'mp4', 'mp3'];
    if (skipExtensions.includes(ext)) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

// Headed browser: user handles the popup, closing the tab saves the session
async function approveConsent(browserType, url, contextOptions, file) {
  const browser = await browserType.launch({ headless: false });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  console.log('\nHandle the cookie popup, then close the tab to continue.');

  const saved = await new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };

    page.on('close', async () => {
      if (done) return;
      try {
        const state = await context.storageState();
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        await writeFile(file, JSON.stringify(state, null, 2), { mode: 0o600 });
        finish(file);
      } catch {
        finish(null);
      }
    });

    browser.on('disconnected', () => finish(null));
  });

  if (!saved) {
    console.log('  ⚠ Browser closed before consent was saved — continuing without it.');
  }
  await browser.close();
  return saved;
}

async function crawl(config) {
  const { url, consent, pause, wait, fullPage, width, density, maxPages } = config;
  const baseUrl = new URL(url);
  const baseOrigin = baseUrl.origin;

  const folderName = `screenshot-${timestamp()}`;
  const outputDir = join(homedir(), 'Downloads', folderName);
  await mkdir(outputDir, { recursive: true });

  console.log(`\nSaving to: ${outputDir}\n`);

  const browsers = { chromium, firefox, webkit };
  const browserType = browsers[config.browser];
  const contextOptions = { viewport: { width, height: 800 }, deviceScaleFactor: density };

  let stateFile = null;
  if (consent === 'approve') {
    stateFile = await approveConsent(browserType, url, contextOptions, consentPath(baseUrl.hostname));
  } else if (consent === 'saved') {
    stateFile = consentPath(baseUrl.hostname);
  }
  if (stateFile) {
    console.log(`Using consent from: ${stateFile}\n`);
    contextOptions.storageState = stateFile;
  }

  const browser = await browserType.launch();
  const context = await browser.newContext(contextOptions);

  const visited = new Set();
  const queue = [baseUrl.pathname];
  visited.add(baseUrl.pathname);
  let count = 0;

  while (queue.length > 0 && count < maxPages) {
    const pathname = queue.shift();
    count++;

    const pageUrl = `${baseOrigin}${pathname}`;
    const slug = slugify(pathname);
    const filename = `${String(count).padStart(3, '0')}-${slug}.png`;

    console.log(`[${count}/${maxPages}] ${pathname}`);

    const page = await context.newPage();

    try {
      await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // Scroll down to trigger lazy-loaded images, then back to top
      await page.evaluate(async () => {
        const step = window.innerHeight;
        const maxScroll = document.body.scrollHeight;
        for (let y = 0; y < maxScroll; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 100));
        }
        window.scrollTo(0, 0);
      });

      await page.waitForTimeout(wait);
      await page.screenshot({
        path: join(outputDir, filename),
        fullPage,
      });

      const links = await page.$$eval('a[href]', (anchors) =>
        anchors.map((a) => a.getAttribute('href'))
      );

      for (const href of links) {
        const pathname = isValidLink(href, baseOrigin);
        if (pathname && !visited.has(pathname)) {
          visited.add(pathname);
          queue.push(pathname);
        }
      }
    } catch (err) {
      console.log(`  ⚠ Failed: ${err.message}`);
    }

    await page.close();

    if (queue.length > 0 && count < maxPages) {
      await new Promise((r) => setTimeout(r, pause));
    }
  }

  await browser.close();
  console.log(`\nDone. ${count} screenshots saved to:\n${outputDir}`);
}

// Run only as CLI (realpath resolves the npm link symlink), not when imported
const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isMain) {
  const config = await askQuestions();
  await crawl(config);
}
