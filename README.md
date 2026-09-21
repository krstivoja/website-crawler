# takescreenshots

CLI tool that crawls a website and takes full-page screenshots of every page.

## Install

```bash
npm install
npx playwright install chromium
npm link  # makes `takescreenshots` available globally
```

Chromium is enough for the default browser.
To use Firefox or WebKit, install them too:

```bash
npx playwright install firefox webkit
```

After upgrading Playwright, re-run `npx playwright install` — each Playwright version needs its own browser builds.

## Usage

```bash
takescreenshots
```

Or without global install:

```bash
node index.js
```

The CLI will prompt you for:

| Prompt | Default | Description |
|--------|---------|-------------|
| Browser | Chromium | Chromium, Firefox or WebKit (Safari) |
| URL | — | The website to crawl (include `https://`) |
| Cookie consent | Approve in browser now (first run) / Use saved consent | Reuse, create or skip a saved cookie consent session |
| Pause between pages | 500ms | Delay between navigating to each page |
| Wait before screenshot | 1000ms | Time to wait for JS animations to settle |
| Full page screenshot | Yes | Capture entire page height vs viewport only |
| Screen width | 1280px | Viewport width in pixels |
| Pixel density | 2x | Device scale factor: 1x, 2x (retina) or 3x |
| Max pages | 50 | Stop crawling after this many pages |

## Cookie consent

To keep cookie popups out of screenshots, approve consent once by hand.
With "Approve in browser now", a visible browser opens on the start URL.
Handle the cookie popup, then close the tab to continue.
The session is saved to `~/.takescreenshots/<hostname>.json`.
This file is private: it contains cookies, is written with owner-only permissions, and lives outside the repo.
The whole session is saved (cookies and localStorage), so other choices made in that window — like switching the site language — carry into the crawl too.
Later runs for the same site default to "Use saved consent" and reuse it without opening a browser.
To reset, delete the file or pick "Approve in browser now" again.
Sites are keyed by exact hostname, so `www.example.com` and `example.com` are separate.

## Output

Screenshots are saved to:

```
~/Downloads/screenshot-YYYYMMDD-HHmmss/
├── 001-index.png
├── 002-about-us.png
├── 003-blog.png
└── ...
```

Files are named with a sequential number and a slug derived from the URL path.

## How it works

- Discovers pages by following same-origin `<a href>` links (breadth-first)
- Skips anchors, mailto/tel links, PDFs, images, and other non-HTML resources
- Deduplicates pages by pathname (ignores query strings and fragments)
- Public pages only — no auth support

## Requirements

- Node.js 18+
- Playwright (installed automatically with `npm install`)
