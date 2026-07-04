# Changelog

All notable changes to pinax are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-07-04

Community review fixes; no user-facing feature changes.

### Changed

- `minAppVersion` raised to 1.8.7 (needs `Workspace.revealLeaf` returning a promise and `App#loadLocalStorage`/`App#saveLocalStorage`).
- UI state (theme, density, collapsed panes, autorefresh) is stored per vault via `App#saveLocalStorage` instead of shared `localStorage`.
- Popout-window compatibility: `activeDocument` instead of `document`, `window.require` instead of `globalThis.require`, `createSvg` for SVG nodes.
- The "Open dashboard" command id no longer duplicates the plugin id (re-bind your hotkey if you had one).
- Internal `Plugin.settings` property renamed to avoid colliding with the Obsidian 1.13 settings API.
- `npm run lint:obsidian` mirrors the community review bot (eslint-plugin-obsidianmd).

## [0.1.0] - 2026-07-03

Initial release: a domain-agnostic, config-driven dashboard framework for Obsidian, seeded from the "command-center" (The Helm) plugin.

### Added

- Profile-driven runtime: `profile.json` (grid or tabs layout, `schemaVersion: 1`) renders the whole dashboard; edits hot-reload without a rebuild.
- 11 built-in widgets: `folder-latest`, `folder-list`, `markdown-embed`, `table`, `form`, `command-buttons`, `iframe`, `heatmap`, `board`, `stat`, `custom`.
- Notes-as-records model: `table`/`board`/`stat`/`heatmap` read a folder or a tag set (`source.tags`), filtered by ANDed `where` clauses (`is`/`not`/`above`/`below`/`after`/`before`).
- Live dashboard: note edits, creations, renames and deletions re-render affected panes automatically (debounced); optional per-pane `refreshSec` for external data.
- Write-back, always gated and undoable: board drag & drop (touch devices get a move menu), row/card `actions` that rewrite frontmatter, forms that create notes or quick-capture into `journal/{{today}}.md` (auto-created), heatmap day-note creation. Every mutation shows an Undo notice.
- Tokens in paths and templates: `{{today}}`, rolling `{{today-7d}}`/`{{today+1d}}`, `{{vaultName}}`, `{{time}}`.
- Per-profile trust model: web embeds, command buttons, note writing and custom widget code are four toggles, all OFF by default; imported profiles never inherit trust. Command buttons copy + open a terminal, never auto-execute.
- Public API `window.pinax` (apiVersion 1): widget registration and safe vault helpers.
- Profile-local `widgets.js` (behind the code gate), export/import bundles, import from https URL (behind the web gate), one-click profile duplication, `obsidian://pinax?profile=<id>` deep links, first-run profile picker.
- LLM authoring path: `profile.schema.json`, AUTHORING.md, and the bundled `build-your-pinax` command.
- Bundled profiles: `sre`, `helm` (full multi-tab seed parity), `reading` (Bookshelf).
- 18 CSS-variable themes, command palette, density toggle, mobile support (`isDesktopOnly: false`).
- Tooling: unit tests, headless end-to-end harness against a mock vault, domain-neutrality check for the core, ESLint, 10k-note perf bench, SHA-pinned CI and release workflows with build provenance attestation.
- "Copy diagnostics" command for bug reports.
