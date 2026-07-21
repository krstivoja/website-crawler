# takescreenshots

CLI tool that crawls a website and takes full-page screenshots of every page.

## Install

```bash
npm install
npx playwright install chromium
npm link  # makes `takescreenshots` available globally
```

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
| URL | — | The website to crawl (include `https://`) |
| Pause between pages | 500ms | Delay between navigating to each page |
| Wait before screenshot | 1000ms | Time to wait for JS animations to settle |
| Full page screenshot | Yes | Capture entire page height vs viewport only |
| Screen width | 1280px | Viewport width in pixels |
| Max pages | 50 | Stop crawling after this many pages |

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
