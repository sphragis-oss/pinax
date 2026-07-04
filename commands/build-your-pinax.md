# build-your-pinax

Interview the user in natural language and produce a Pinax profile (`profile.json`) that passes schema validation and loads in their vault with no manual editing.

## Preparation

1. Locate the Pinax plugin folder: `<vault>/.obsidian/plugins/pinax/`. If the user did not say where their vault is, ask.
2. Read `AUTHORING.md` and `profile.schema.json` from that folder. They are the authoritative reference for widget types, config shapes, and path rules. Do not rely on memory.

## Interview

Ask conversationally, a few questions at a time. Adapt to their answers; skip what they already told you. You need:

1. **Purpose**: "Describe the dashboard you want, in your own words." Let them ramble; extract the panes they implied.
2. **Data**: For each implied pane, which vault folder or note holds the data? Confirm exact paths ("is it `reading/books` or `Books/`?"). If the folder does not exist yet, confirm they want it created on first use.
3. **Records**: For table-like panes, which frontmatter fields matter, and what should the default sort be?
4. **Creation**: Do they want to create entries from the dashboard (a form)? Which fields, which are required, any dropdowns?
5. **Actions**: Any commands they run often (shell/CLI) that deserve buttons? Remind them buttons only copy + open a terminal, never auto-run.
6. **Web**: Any https:// page worth embedding?
7. **Shape**: One page (grid) or multiple tabs? Pane order and which panes deserve full width.
8. **Name**: A dashboard name and a short profile id (lowercase, dashes).

## Emit

1. Write the profile to `<vault>/.obsidian/plugins/pinax/profiles/<id>/profile.json`, following AUTHORING.md exactly (valid JSON only; always include `"schemaVersion": 1`; vault-relative paths; only the 11 widget types; `custom` panes only for widgets that exist or that you scaffold).
2. If the user needs behavior no built-in covers, scaffold a companion plugin at `<vault>/.obsidian/plugins/<id>-widgets/` (manifest.json + main.js), modeled on `examples/companion-widget-plugin/` and the AUTHORING.md template (widgets registered under `<id>.<widget>` via `window.pinax.registerWidget`; return a cleanup function if the widget sets timers). Reference it from a `custom` pane and tell the user to enable the companion plugin in Settings, then Community plugins; until then the pane shows a placeholder, which is expected and fine.
3. Validate: run `node scripts/validate-profile.mjs profiles/<id>/profile.json` from the plugin folder. If it fails, fix the profile and re-validate before showing it to the user. Do not deliver an invalid profile.
4. Tell the user:
   - Open Settings → Pinax and select the `<id>` profile.
   - Which trust toggles (web / command / write) the profile uses, and that gated panes show a placeholder until enabled.
   - That edits to `profile.json` hot-reload; no restart needed.

## Rules

- Never guess folder names; confirm every path with the user.
- Prefer built-in widgets over custom ones; prefer fewer panes over more.
- Emit JSON only in the profile file: no comments, no trailing commas.
- If the user's ask is impossible with Pinax v1 (relations between notes, external databases, auto-executing commands), say so plainly and offer the closest supported alternative.
