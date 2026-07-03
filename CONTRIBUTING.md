# Contributing to pinax

Thanks for looking into pinax. Two ground rules make this codebase what it is; everything else is ordinary.

## The two invariants

1. **`src/core/` and `src/main.ts` stay domain-agnostic.** No vault paths, no SRE/CRM/journal words, nothing that assumes a particular vault. `npm run check:generic` enforces this with a banned-word grep and CI fails without it. Domain-specific widgets live in `src/packs/` or in profile-local `widgets.js`.
2. **Everything a profile can do is validated and gated.** New pane options go into `profile.schema.json` first; anything that touches the network, the clipboard, a terminal, note writing, or code execution sits behind one of the four per-profile trust gates and defaults to OFF. Never weaken path validation (`safeVaultPath`) or make a command auto-execute.

## Dev setup

```bash
npm install
npm run dev              # watch mode -> main.js
```

Point a test vault's `.obsidian/plugins/pinax/` at the repo (symlink or copy `main.js`, `manifest.json`, `styles.css`) and toggle the plugin.

## Before you open a PR

```bash
npm run build && npx tsc --noEmit
npm run lint
npm test
npm run check:generic
npm run verify:criteria   # headless end-to-end against a mock vault
npm run bench             # if you touched record loading or rendering
```

All of the above run in CI; green locally means green there.

- New widget or pane option: update `profile.schema.json`, add validator cases in `tests/config-validator.test.ts`, add at least one rendering check in `scripts/verify-criteria.mjs`, and document it in `AUTHORING.md`.
- Match the existing style: comments are one short line, no em or en dashes anywhere (use commas, colons, or hyphens).
- Keep diffs surgical; do not reformat or refactor code you are not changing.

## Sharing profiles

Finished profiles belong in [sphragis-oss/pinax-profiles](https://github.com/sphragis-oss/pinax-profiles), not in this repo. Only the three bundled reference profiles (`sre`, `helm`, `crm`) ship with the plugin.

## Security issues

See [SECURITY.md](SECURITY.md); please do not open public issues for vulnerabilities.
