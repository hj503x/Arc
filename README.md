# Arc

Track how fast you're improving, not just how good you are.

Log periodic entries with any metrics you want (skill score, hours, output,
error count, whatever). Arc computes a trend line, weekly velocity, and a
30-day projection band using linear regression over your logged values — so
you can see trajectory, not just a snapshot.

## Features

- Custom metrics per entry, reused across entries to build a curve
- Trend line + 30-day projection with a confidence band
- Per-metric "higher is better" / "lower is better" toggle (so error counts
  and skill scores are both scored correctly)
- CSV import with a preview/confirm step before anything is saved
- Edit or delete any past entry
- Data is saved to the browser's local storage — nothing leaves your device

## Run it locally

Requires [Node.js](https://nodejs.org) (v18+).

```bash
npm install
npm run dev
```

Then open the printed local URL.

## Deploy to GitHub Pages (no local setup needed)

This repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`)
that builds and deploys automatically.

1. Push this project to a GitHub repository (see below for how to get the
   files in without git, if you're on mobile).
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to **GitHub Actions**.
4. Push (or make any small edit) to the `main` branch. The workflow will
   build the app and publish it.
5. Your app will be live at `https://<username>.github.io/<repo-name>/`.

## Getting the files into GitHub from a phone (no git required)

GitHub's web "Add file → Create new file" lets you type a path with slashes
(e.g. `src/App.jsx`) and it creates the folders automatically — no zip or
drag-and-drop needed. Repeat for each file in this project:

```
package.json
vite.config.js
index.html
.gitignore
src/main.jsx
src/App.jsx
.github/workflows/deploy.yml
README.md
```

Open each file, copy its contents, paste into the corresponding "Create new
file" page in GitHub, and commit.

## CSV import format

First row is headers. One column must be `date`. An optional `note` column
is supported. Every other numeric column is treated as a metric.

```csv
date,hours,score,note
2026-01-01,2,20,Started
2026-01-08,3,28,Picked up pace
```
