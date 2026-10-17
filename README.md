# Firefox Memory Lens

Understand your browser's RAM in plain English. Drop a Firefox memory report
(`memory-report.json.gz` from `about:memory`) onto the page and see exactly what
is using your memory — tabs, JavaScript, images, storage, add-ons — explained
simply, with charts instead of a wall of numbers.

## Features

- **Plain-English dashboard** — total RAM, per-process breakdown and "who is using the RAM" at a glance
- **Add-ons by memory** — per-extension memory across the whole browser, including content scripts running inside web pages (reports identify add-ons by an internal ID; you can name each one — labels stay in your browser)
- **Memory map** — a treemap you can drill into, per process
- **Top memory users** — the biggest individual allocations, translated to readable labels
- **Full detail browser** — every measurement exactly as Firefox reported it, searchable

## Privacy

Everything runs **in your browser**: the report is decompressed with the native
`DecompressionStream` API and parsed locally. No server, no upload, nothing
stored. Add-on names you type are saved only in your own browser's local
storage.

## Getting a memory report

1. Type `about:memory` in Firefox's address bar and press Enter.
2. Under **Save memory reports**, click **Measure and save…** — Firefox measures
   every process and downloads `memory-report.json.gz`.
3. Drop that file on the app. Done!

## Run locally

```bash
bun install
bun run dev        # http://localhost:3000
```

## Deploy to GitHub Pages

The repo ships with a ready workflow (`.github/workflows/deploy-pages.yml`)
that builds a fully static site and publishes it.

1. Push this repository to GitHub (branch `main`).
2. In the repository: **Settings → Pages → Build and deployment → Source**,
   choose **GitHub Actions**.
3. Push (or run the *Deploy to GitHub Pages* workflow manually from the
   **Actions** tab).
4. Your site goes live at `https://<username>.github.io/<repo-name>/`.

The workflow sets the correct base path automatically
(`/repo-name` for project pages, `/` for `user.github.io` repos). Building
manually? Use:

```bash
NEXT_PUBLIC_BASE_PATH=/repo-name bun run build:pages   # output in out/
```

## Tech

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui ·
framer-motion. No database, no backend — the memory-report parser
(`src/lib/memory-report.ts`) is pure TypeScript and runs entirely client-side.
