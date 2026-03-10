[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

# oshiTag v0.3.0

A lightweight offline-capable PWA built with plain HTML, CSS, and JavaScript for managing Groups -> Idols -> TAGs and Favorites, with one-click copy support.

[![DEMO](https://img.shields.io/website?url=https%3A%2F%2Foshitag.com&label=DEMO&up_message=online&down_message=down)](https://oshitag.com)

## Usage

- The app starts in browse mode. Use the top-right ＋ button to switch to edit mode.
- Browse mode
  - Group tabs: click to switch, double-click to copy all TAGs in the group
  - Idol names: click to copy all TAGs for that idol
  - TAGs: click to copy the TAG
  - Favorite tabs: click to switch, double-click to copy all TAGs in the favorite set
  - Empty space inside the favorite content area: click to copy all TAGs in that favorite set
- Edit mode
  - Active group / favorite tab: click to rename, double-click to delete, drag to reorder
  - Idol names / TAGs: click to rename, double-click to delete, drag to reorder
  - Color dot: choose a cheer color from presets or a HEX value
  - ＋ or + TAG: add a group, favorite folder, idol, or TAG

## Import / Export

From the top-right ⋯ menu:

- Export format: `# Group / ## Idol / ### TAG`, with idol cheer colors stored as `<!-- cheerColor: #RRGGBB -->`
- Import reads the same structure; favorites use the `# [FAVORITES]` section
- Two import modes are supported: replace and merge
- Before importing, the app shows a comparison summary of current data, import source, and final result, plus added and removed groups, idols, favorites, and TAGs; long diff lists can be expanded; a pre-import backup is automatically stored in browser `localStorage`
- You can use Restore Backup in the top-right ⋯ menu to roll back to the most recent pre-import state

## Deployment

This is a static site and can be hosted on any static hosting service such as GitHub Pages, Netlify, or Vercel Static.
Local preview example:

```bash
python -m http.server 5173
```

Open `http://localhost:5173/index.html`.

## Project Structure (release build)

- `index.html`
- `assets/css/styles.css`
- `assets/js/app.js`
- `assets/js/dialogs.js`
- `assets/js/data-manager.js`
- `assets/js/import-workflow.js`
- `assets/js/locale-manager.js`
- `assets/js/menu-controller.js`
- `assets/js/render.js`
- `assets/js/sort-utils.js`
- `assets/js/i18n.js`
- `assets/js/import-utils.js`
- `assets/icons/*`
- `manifest.json`, `service-worker.js`

## Notes

- Data is stored in browser `localStorage`.
- The PWA caches static assets through the Service Worker. When making a formal release, update the version numbers in `manifest.json`, `assets/js/app.js`, and `service-worker.js` together.