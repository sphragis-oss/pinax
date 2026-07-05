# Changelog

All notable changes to pinax are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.4] - 2026-07-05

### Added

- `command-buttons`: optional per-button `color` (`accent`, `success`, `warning`, `danger`); theme-safe tint driven by CSS variables, neutral default unchanged.

### Changed

- Shipped `sre` and `helm` profiles no longer include command buttons for skills that are not publicly available (`/github-trending-radar`, `/standup-brief`, `/dr-daily`, `/dr-weekly`, `/claude-code-releases`, `/clotributor-radar`); the reader panes fed by those scan folders are unchanged.
- README: note that probe env overrides are not inherited by a GUI-launched Obsidian.

## [0.1.3] - 2026-07-04

Review-scorecard cleanup; no user-facing changes.

### Changed

- Node builtins (`fs`, `path`, `os`, `child_process`, `process.env`) are accessed through minimal local typings and `envVar`/`envAll` helpers, so the code typechecks without `@types/node`; clears the unsafe-any warnings on the community review scorecard.
- Settings tab re-renders via an internal `redraw()` instead of calling the deprecated `display()`.

## [0.1.2] - 2026-07-04

Removes in-vault code execution to comply with the Obsidian community review; custom widgets now come from companion plugins.

### Removed

- The `widgets.js` runtime loader and the "Custom widget code" trust gate. Released versions never execute code from the vault. The loader is preserved on the `feature/widgets-js` branch.

### Changed

- Custom widgets are registered by companion plugins via `window.pinax.registerWidget(...)`; a copy-paste template (manifest.json + main.js) ships in `examples/companion-widget-plugin/` and AUTHORING.md, written so an LLM can generate a working widget plugin from it.
- Profile bundles still carry `widgets.js` as inert data for sharing; settings texts, SECURITY.md and README updated accordingly (three trust gates now).

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
