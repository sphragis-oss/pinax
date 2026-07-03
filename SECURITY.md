# Security

## Reporting a vulnerability

Please report vulnerabilities privately via GitHub's [private vulnerability reporting](https://github.com/sphragis-oss/pinax/security/advisories/new) on this repository. Do not open a public issue. You should get a first response within a week; fixes ship as a patch release with a changelog entry.

Only the latest release is supported with security fixes.

## Trust model

pinax renders dashboards from config files (`profile.json`) that users write themselves, generate with an LLM, or import from strangers. The design assumption is that **a profile is untrusted input**. Four capabilities are therefore individually gated, per profile, and OFF by default:

| Gate | Unlocks | Risk it contains |
|---|---|---|
| `web` | `iframe` panes (https only) and "Import from URL" | Loading remote content inside your vault window; fetching profile bundles |
| `command` | `command-buttons` panes | Puts shell commands on your clipboard and opens a terminal. Commands are **never auto-executed**; the user always types/pastes and confirms in their own terminal |
| `write` | Forms, board drag & drop, actions, heatmap day-note creation, API note creation | Creating notes and rewriting frontmatter inside the vault. Every mutation shows an Undo notice |
| `code` | Profile-local `widgets.js` | **Arbitrary JavaScript with full plugin access.** Equivalent to installing a plugin; the toggle is labelled as such and defaults to OFF |

Properties that hold regardless of gates:

- **Zero-trust imports.** An imported or duplicated profile always starts with all four gates OFF, even if the profile it came from had them ON. Trust is keyed by profile id and never copied.
- **Vault-relative paths only.** Every path in a profile is validated twice (JSON Schema pattern at load, `safeVaultPath` at read/write time): no absolute paths, no drive letters, no backslashes, no `..` segments. A profile cannot reach outside the vault through pinax's vault helpers.
- **No hidden network traffic.** The core makes no network requests on its own. The only network activity is user-configured: `iframe` panes and "Import from URL", both https-only and behind the `web` gate.
- **No telemetry.** The "Copy diagnostics" command only writes to the clipboard, contains configuration metadata (versions, pane types, trust booleans, validation errors), and runs only when the user invokes it.
- **Failed validation fails closed.** Invalid profiles render an error panel, not a partial dashboard; unknown widget ids render a placeholder, never code.

### About `widgets.js` (the `code` gate)

`widgets.js` is executed with `new Function` and the pinax API bound; it can do anything a plugin can. This is an intentional extensibility feature, mitigated by: OFF by default, per profile, labelled DANGER in settings, inert on import until explicitly enabled, and carried visibly as plain text inside export bundles so it can be read before enabling. Treat enabling it exactly like installing a community plugin: read the code or trust the author.

### Supply chain

Releases are built by GitHub Actions from SHA-pinned actions, with build provenance attested via `actions/attest-build-provenance`. Verify an asset with:

```bash
gh attestation verify main.js --repo sphragis-oss/pinax
```
