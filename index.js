#!/usr/bin/env node

import { chromium, firefox, webkit } from 'playwright';
import prompts from 'prompts';
import { existsSync, realpathSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

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

export function parseUrls(input) {
  return input
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isValidUrl(v) {
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

function consentChoices(url) {
  const [firstUrl] = parseUrls(url);
  const saved = existsSync(consentPath(new URL(firstUrl).hostname));
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
      message: 'URL(s) to crawl (comma or newline separated for a page list)',
      validate: (v) => {
        const invalid = parseUrls(v).filter((u) => !isValidUrl(u));
        if (invalid.length > 0) return `Invalid URL: ${invalid[0]}`;
        return parseUrls(v).length > 0 || 'Enter at least one valid URL (include https://)';
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
      type: (prev, values) => (parseUrls(values.url).length > 1 ? null : 'number'),
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

// Crawl scope: the start path without trailing slash; '' means the whole site
export function scopeOf(pathname) {
  return pathname.replace(/\/+$/, '');
}

export function isValidLink(href, baseOrigin, scope = '') {
  try {
    const url = new URL(href, baseOrigin);
    if (url.origin !== baseOrigin) return null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (scope && url.pathname !== scope && !url.pathname.startsWith(`${scope}/`)) return null;
    const ext = url.pathname.split('.').pop().toLowerCase();
    const skipExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'zip', 'mp4', 'mp3'];
    if (skipExtensions.includes(ext)) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

// Playwright's own error only says "npx playwright install"; name the browser,
// the folder to run it in, and the Playwright version that needs it
export function missingBrowserMessage(browserName, crawlerDir, playwrightVersion) {
  const label = { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' }[browserName] ?? browserName;
  const version = playwrightVersion ? ` (Playwright ${playwrightVersion})` : '';
  return [
    `✖ ${label} is not installed for this crawler${version}.`,
    '',
    'Install it from the crawler folder:',
    '',
    `  cd ${crawlerDir}`,
    `  npx playwright install ${browserName}`,
    '',
    'Run it there, not elsewhere: npx in another folder installs browsers for a different Playwright version.',
  ].join('\n');
}

class MissingBrowserError extends Error {}

async function launchBrowser(browserName, options) {
  const browserType = { chromium, firefox, webkit }[browserName];
  try {
    return await browserType.launch(options);
  } catch (err) {
    if (!/Executable doesn't exist/.test(err.message)) throw err;
    let version = '';
    try {
      version = createRequire(import.meta.url)('playwright/package.json').version;
    } catch {}
    const crawlerDir = dirname(fileURLToPath(import.meta.url));
    throw new MissingBrowserError(missingBrowserMessage(browserName, crawlerDir, version));
  }
}

// Headed browser: user handles the popup, closing the tab saves the session
async function approveConsent(browserName, url, contextOptions, file) {
  const browser = await launchBrowser(browserName, { headless: false });
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

const pageHeight = (page) =>
  page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));

const nextFrame = (frame) => Promise.race([
  frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {}),
  new Promise((r) => setTimeout(r, 2000)),
]);

// Chromium does not paint cross-site iframes (comments, embeds) that are
// outside the window, and a full-page shot does not count as inside, so they
// come out blank. Making the window as tall as the page puts every iframe in
// view. Pages whose height follows the window (100vh sections) would stretch,
// so those fall back to a normal full-page shot.
async function shootFullPage(page, path) {
  const viewport = page.viewportSize();
  const height = await pageHeight(page);
  try {
    await page.setViewportSize({ width: viewport.width, height });
    await Promise.all(page.frames().map(nextFrame));
    await page.waitForTimeout(300);
    if ((await pageHeight(page)) > height + 50) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(300);
    }
  } catch {
    await page.setViewportSize(viewport).catch(() => {});
  }
  await page.screenshot({ path, fullPage: true });
  await page.setViewportSize(viewport).catch(() => {});
}

async function capture(page, pageUrl, path, { wait, fullPage }) {
  // Sites with analytics beacons or polling never go network-idle, so only
  // the load event is required; idle is a best-effort extra wait.
  await page.goto(pageUrl, { waitUntil: 'load', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  // Scroll down to trigger lazy-loaded images and embeds
  await page.evaluate(async () => {
    const step = window.innerHeight;
    const maxScroll = document.body.scrollHeight;
    for (let y = 0; y < maxScroll; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  await page.waitForTimeout(wait);

  // Instant, so CSS smooth scrolling cannot leave sticky headers mid-page
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(300);

  if (fullPage) await shootFullPage(page, path);
  else await page.screenshot({ path });
}

// urls.md index of every page visited: URL, screenshot link or failure reason
export function buildUrlsMarkdown(entries) {
  const cell = (text) => text.replace(/\|/g, '\\|');
  const failed = entries.filter((e) => e.error).length;
  const lines = [
    '# Screenshots',
    '',
    `${entries.length} pages, ${entries.length - failed} screenshots, ${failed} failed`,
    '',
    '| # | URL | Screenshot |',
    '|---|-----|------------|',
  ];
  entries.forEach((e, i) => {
    const result = e.error
      ? `⚠ Failed: ${cell(e.error.split('\n')[0])}`
      : `[${e.file}](${encodeURI(e.file)})`;
    lines.push(`| ${i + 1} | <${e.url}> | ${result} |`);
  });
  return `${lines.join('\n')}\n`;
}

async function recordPage(outputDir, entries, entry) {
  entries.push(entry);
  await writeFile(join(outputDir, 'urls.md'), buildUrlsMarkdown(entries));
}

async function shootList(context, urls, outputDir, { pause, wait, fullPage }) {
  let count = 0;
  const entries = [];

  for (const pageUrl of urls) {
    count++;
    const { hostname, pathname } = new URL(pageUrl);
    const slug = slugify(`${hostname}${pathname}`);
    const filename = `${String(count).padStart(3, '0')}-${slug}.png`;

    console.log(`[${count}/${urls.length}] ${pageUrl}`);

    const page = await context.newPage();

    try {
      await capture(page, pageUrl, join(outputDir, filename), { wait, fullPage });
      await recordPage(outputDir, entries, { url: pageUrl, file: filename });
    } catch (err) {
      console.log(`  ⚠ Failed: ${err.message}`);
      await recordPage(outputDir, entries, { url: pageUrl, file: filename, error: err.message });
    }

    await page.close();

    if (count < urls.length) {
      await new Promise((r) => setTimeout(r, pause));
    }
  }

  return entries.filter((e) => !e.error).length;
}

async function crawl(config) {
  const { url, consent, pause, wait, fullPage, width, density, maxPages } = config;
  const urls = parseUrls(url);
  const listMode = urls.length > 1;
  const baseUrl = new URL(urls[0]);
  const baseOrigin = baseUrl.origin;

  // Launch first, so a missing browser fails before any folder is created
  const browser = await launchBrowser(config.browser);

  const folderName = `screenshot-${timestamp()}`;
  const outputDir = join(homedir(), 'Downloads', folderName);
  await mkdir(outputDir, { recursive: true });

  console.log(`\nSaving to: ${outputDir}\n`);

  const contextOptions = { viewport: { width, height: 800 }, deviceScaleFactor: density };

  let stateFile = null;
  if (consent === 'approve') {
    stateFile = await approveConsent(config.browser, urls[0], contextOptions, consentPath(baseUrl.hostname));
  } else if (consent === 'saved') {
    stateFile = consentPath(baseUrl.hostname);
  }
  if (stateFile) {
    console.log(`Using consent from: ${stateFile}\n`);
    contextOptions.storageState = stateFile;
  }

  const context = await browser.newContext(contextOptions);

  if (listMode) {
    const count = await shootList(context, urls, outputDir, { pause, wait, fullPage });
    await browser.close();
    console.log(`\nDone. ${count} screenshots saved to:\n${outputDir}`);
    return;
  }

  const scope = scopeOf(baseUrl.pathname);
  const entries = [];
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
      await capture(page, pageUrl, join(outputDir, filename), { wait, fullPage });
      await recordPage(outputDir, entries, { url: pageUrl, file: filename });

      const links = await page.$$eval('a[href]', (anchors) =>
        anchors.map((a) => a.getAttribute('href'))
      );

      for (const href of links) {
        const pathname = isValidLink(href, baseOrigin, scope);
        if (pathname && !visited.has(pathname)) {
          visited.add(pathname);
          queue.push(pathname);
        }
      }
    } catch (err) {
      console.log(`  ⚠ Failed: ${err.message}`);
      await recordPage(outputDir, entries, { url: pageUrl, file: filename, error: err.message });
    }

    await page.close();

    if (queue.length > 0 && count < maxPages) {
      await new Promise((r) => setTimeout(r, pause));
    }
  }

  await browser.close();
  const shots = entries.filter((e) => !e.error).length;
  console.log(`\nDone. ${shots} screenshots saved to:\n${outputDir}`);
}

// Run only as CLI (realpath resolves the npm link symlink), not when imported
const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isMain) {
  const config = await askQuestions();
  try {
    await crawl(config);
  } catch (err) {
    if (!(err instanceof MissingBrowserError)) throw err;
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }
}
