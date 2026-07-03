# Authoring Pinax profiles

This guide is written for an LLM (or a human) generating `profile.json` files for the Pinax Obsidian plugin. Follow it exactly and the emitted profile will validate against `profile.schema.json` and load with no human editing.

## The model

- A **profile** is one dashboard: a JSON object with a `name`, a `layout`, and a list of **panes**.
- A **pane** is one box on the dashboard, rendered by a **widget type**.
- Profiles live at `.obsidian/plugins/pinax/profiles/<id>/profile.json` inside the user's vault. Saving the file hot-reloads the dashboard; no rebuild or restart.
- Pinax assumes nothing about the vault. Every data source is a folder or note path the user tells you about. Never invent paths; ask.

## Profile skeleton

```json
{
  "schemaVersion": 1,
  "name": "My Dashboard",
  "layout": "grid",
  "panes": [ { "type": "...", "...": "..." } ]
}
```

Always emit `"schemaVersion": 1` (omitting it means 1; future Pinax versions use it to migrate old profiles).

`layout: "grid"` renders `panes` on one page (two columns; `"width": "full"` spans both).
`layout: "tabs"` requires `tabs` instead of `panes`:

```json
{
  "name": "My Dashboard",
  "layout": "tabs",
  "tabs": [
    { "id": "home", "label": "HOME", "panes": [ ... ] },
    { "id": "work", "label": "WORK", "panes": [ ... ] }
  ]
}
```

### Fields every pane accepts

| Field | Type | Meaning |
|---|---|---|
| `type` | string, required | One of the 11 widget types below |
| `title` | string | Pane heading. Omit to show the type |
| `width` | `"half"` (default) or `"full"` | Grid column span |
| `frame` | boolean, default `true` | `false` renders the widget without the pane box/heading |
| `refreshSec` | integer >= 5 | Re-render this pane every N seconds. Rarely needed: note edits already live-refresh the dashboard; use this for panes reading external/derived data |

### Path rules (hard requirement)

All folder/note paths are vault-relative: no leading `/`, no `..` segments, no backslashes. Pinax rejects violations at validation time and again at read time.

Paths (and `where`/`actions` string values) may use tokens, expanded at render time: `{{today}}` (current local `YYYY-MM-DD`), rolling offsets `{{today-7d}}` / `{{today+1d}}`, and `{{vaultName}}`. Example: `"note": "raw/daily/{{today}}.md"`.

## The 11 widget types

### 1. `folder-latest` - newest note in a folder

```json
{ "type": "folder-latest", "title": "LATEST REPORT", "folder": "reports",
  "render": "markdown", "showMeta": true }
```

`render`: `"markdown"` (default) or `"text"`. `showMeta` shows a filename + age line.

### 2. `folder-list` - folder contents with counts and ages

```json
{ "type": "folder-list", "title": "PROJECTS", "folder": "projects", "limit": 20 }
```

### 3. `markdown-embed` - embed one note

```json
{ "type": "markdown-embed", "title": "TODAY", "note": "daily/{{today}}.md" }
```

`{{today}}` and `{{vaultName}}` tokens work here (and in every other path field).

### 4. `table` - notes-as-records

Reads every note in `source.folder` and shows frontmatter fields as sortable, filterable rows; clicking a row opens the note. Two synthetic columns always exist: `name` (filename) and `modified`.

```json
{ "type": "table", "title": "CONTACTS", "width": "full",
  "source": { "folder": "crm/contacts" },
  "columns": ["name", "company", "stage", "email"],
  "sort": { "by": "name", "dir": "asc" },
  "filter": true, "limit": 200, "recursive": false, "pageSize": 100 }
```

`recursive: true` also reads subfolders. Rows beyond `pageSize` (default 100) sit behind a "show more" button, so large folders stay fast.

`source` works the same in `table`, `board`, `stat` and `heatmap`, and takes either a `folder` or a `tags` list (never both). With `tags`, every note carrying ALL the listed tags is read, wherever it lives; `#` is optional and nested tags match their parent:

```json
"source": { "tags": ["#project", "#active"] }
```

`source.where` filters records before display. Clauses are ANDed; each needs `field` plus one of `is`, `not`, `above`, `below` (numeric), `after`, `before` (string compare, ideal for ISO dates with rolling tokens):

```json
"source": { "folder": "tasks", "where": [ { "field": "status", "not": "done" }, { "field": "due", "before": "{{today+7d}}" } ] }
```

`actions` (table and board, gated: **write**) puts small buttons on each row/card that rewrite frontmatter fields in place, so you can close a task or move a lead without opening the note. Every mutation (actions and board drag & drop) shows a notice with an Undo button that restores the previous values:

```json
"actions": [ { "label": "done", "set": { "status": "done", "closed": "{{today}}" } } ]
```

### 5. `form` - create or append a note from fields (gated: **write**)

Two target modes:

- **Create** (`target.folder`): each submit creates a new note; every field becomes a frontmatter key and `target.template` becomes the body ({{field}} tokens replaced). Filename comes from `target.filenameFrom` (default: the `name` field, else a timestamp).
- **Append** (`target.note`): each submit appends one templated line/block to a note, optionally under `target.section` (a markdown heading like `"## Log"`). If the note does not exist yet it is created (parent folder included), so `"note": "journal/{{today}}.md"` is a full quick-capture box. The default template is `- {{time}} ` followed by all field values. `{{today}}` and `{{time}}` tokens work in both modes.

```json
{ "type": "form", "title": "LOG ENTRY",
  "target": { "note": "log.md", "section": "## Entries",
              "template": "- {{time}} {{what}} ({{mood}})" },
  "fields": [ { "name": "what", "required": true }, { "name": "mood" } ],
  "submitLabel": "Log it" }
```

```json
{ "type": "form", "title": "NEW CONTACT",
  "target": { "folder": "crm/contacts", "filenameFrom": "name",
              "template": "## Notes\n\nContact: {{name}}\n" },
  "fields": [
    { "name": "name", "label": "Name", "required": true },
    { "name": "stage", "type": "select", "options": ["lead", "won"], "default": "lead" },
    { "name": "lastContact", "type": "date" }
  ],
  "submitLabel": "Add contact" }
```

Field `type`: `text` (default), `textarea`, `date`, `number`, `select` (needs `options`).

### 6. `command-buttons` - copy a command + open a terminal (gated: **command**)

Buttons copy the command to the clipboard and open/reveal a terminal. Commands are **never auto-executed**. `icon` is a Lucide icon name; `terminal: true` only styles the button as a runnable action.

```json
{ "type": "command-buttons", "frame": false, "width": "full",
  "buttons": [
    { "label": "Daily Note", "command": "claude /daily-note", "icon": "calendar", "terminal": true },
    { "label": "Search", "command": "claude /vault-search", "icon": "search" }
  ] }
```

### 7. `iframe` - embed a web page (gated: **web**)

```json
{ "type": "iframe", "title": "STATUS PAGE", "width": "full",
  "url": "https://status.example.com", "height": 420 }
```

`url` must be `https://`.

### 8. `heatmap` - GitHub-style activity calendar

Counts notes per day and shows a weeks x weekdays grid plus a total/streak line. A note's day comes from `dateField` frontmatter if set, else a `YYYY-MM-DD` in the filename (daily notes), else file mtime.

```json
{ "type": "heatmap", "title": "CONSISTENCY", "source": { "folder": "journal" },
  "weeks": 26, "dateField": "date", "recursive": false }
```

`weeks`: 4 to 53, default 26. Clicking a day opens its newest note; with the **write** toggle on and no `dateField`, clicking an empty day creates `<folder>/<YYYY-MM-DD>.md`.

### 9. `board` - records grouped into columns (mini kanban)

Groups notes by a frontmatter field; each value becomes a column of clickable cards.

```json
{ "type": "board", "title": "BOARD", "width": "full",
  "source": { "folder": "tasks" }, "groupBy": "status",
  "columns": ["todo", "doing", "done"], "cardFields": ["due"], "limit": 20 }
```

Without `columns`, discovered values are shown sorted, with a `(none)` column for notes missing the field. With `columns`, only those values are shown, in order, including empty ones.

With the **write** toggle on, cards become draggable: dropping a card on another column rewrites its `groupBy` frontmatter field in the note (dropping on `(none)` removes the field).

### 10. `stat` - one number, optionally with a sparkline

Aggregates notes into a single figure. `agg`: `count` (default), or `sum`/`avg`/`min`/`max` of a numeric frontmatter `field` (required for those). `sparkline: true` adds a per-day trend over `days` (default 30), bucketed like `heatmap`.

```json
{ "type": "stat", "title": "ENTRIES", "source": { "folder": "journal" },
  "agg": "count", "label": "journal entries", "sparkline": true, "days": 30 }
```

`warn: { "above": n }` or `{ "below": n }` colors the value as a warning when crossed, e.g. degraded clusters `{ "agg": "sum", "field": "k8s_degraded", "warn": { "above": 0 } }`.

### 11. `custom` - render a widget registered via the API

```json
{ "type": "custom", "widget": "reading.shelf", "title": "SHELF", "width": "full",
  "config": { "folder": "reading/books", "statusField": "status" } }
```

`widget` is a namespaced id (must contain a dot). If nothing is registered under that id, Pinax shows a friendly placeholder (never a crash) and renders the widget as soon as it registers. `config` is passed through to the widget.

Widgets come from two places:
1. Any plugin or script calling `window.pinax.registerWidget(...)`.
2. A `widgets.js` file next to the profile's `profile.json` (see below), gated by the **code** trust toggle.

## Profile-local widgets (widgets.js)

A profile folder may contain `widgets.js`. Pinax executes it with the API bound to a `pinax` variable, but only after the user enables "Custom widget code" for that profile (it is real code execution, treated like installing a plugin). Export bundles carry `widgets.js` along automatically. See `examples/widgets-file-example.js` for the format; a widget that starts timers or listeners must return a cleanup function from `render`, which Pinax calls before every re-render.

## Trust gates

Four capabilities are **disabled by default, per profile**: `web` (iframe), `command` (command-buttons), `write` (form and API note writing), and `code` (widgets.js). A profile may freely include gated panes: while the capability is off, the pane renders a placeholder telling the user to enable it in Settings → Pinax. Trust granted to one profile never carries over to another (imported profiles always start with zero trust). Do not tell users to pre-enable anything; just mention which toggles the profile uses.

## The API (window.pinax, apiVersion 1)

For custom widgets, from any plugin or script:

```js
window.pinax.apiVersion            // 1
window.pinax.registerWidget(id, { render(el, ctx) { ... } })
window.pinax.unregisterWidget(id)
window.pinax.vault.latestInFolder(folder)        // TFile | null
window.pinax.vault.listFolder(folder)            // [{name, path, isFolder, mtime, fileCount}]
window.pinax.vault.readNote(path)                // Promise<string>
window.pinax.vault.records(folder)               // Promise<[{path, name, mtime, fields}]>  (frontmatter)
window.pinax.vault.createNote(folder, template, data)  // gated by the write toggle
window.pinax.runCommand(cmd)                     // gated by the command toggle; copy + open terminal only
```

`render(el, ctx)` receives the pane element and a context: `ctx.app` (Obsidian App), `ctx.pane` (pane config incl. merged `config`), `ctx.trust`, `ctx.refresh()`, `ctx.openNote(path)`, `ctx.component` (for `MarkdownRenderer.render`). If the widget sets intervals or listeners, return a cleanup function; Pinax calls it before every re-render and on close. See `examples/demo-widget.js`.

Style with the theme CSS variables (`--accent`, `--card-bg`, `--muted`, ...) or reuse `px-*`/`cc-*` classes so widgets follow all 18 themes.

## Worked example A - SRE command center (shipped as `profiles/sre/profile.json`)

Skill shortcuts row + radar panes over scan folders + a projects pane:

```json
{
  "schemaVersion": 1,
  "name": "SRE Command Center",
  "layout": "grid",
  "panes": [
    { "type": "command-buttons", "frame": false, "width": "full",
      "buttons": [{ "label": "Morning Scan", "command": "claude /morning-trend-scan", "icon": "telescope", "terminal": true }] },
    { "type": "custom", "widget": "sre.scan", "title": "⬢ CNCF / PLATFORM RADAR", "width": "half",
      "config": { "folder": "raw/scans", "rowFilter": true } },
    { "type": "custom", "widget": "sre.projects", "title": "▣ PROJECTS", "width": "full",
      "config": { "folder": "projects" } }
  ]
}
```

The `sre.*` widgets ship with Pinax but are just custom widgets; a generic dashboard would use `folder-latest`/`table` instead.

## Worked example B - reading tracker (shipped as `profiles/reading/profile.json`)

A flat folder of book notes; each note's frontmatter holds `name`, `author`, `status`, `rating`, `finished`:

```json
{
  "schemaVersion": 1,
  "name": "Bookshelf",
  "layout": "grid",
  "panes": [
    { "type": "table", "title": "◆ LIBRARY", "width": "half",
      "source": { "folder": "reading/books" },
      "columns": ["name", "author", "status", "rating"],
      "sort": { "by": "name", "dir": "asc" } },
    { "type": "form", "title": "✎ ADD BOOK", "width": "half",
      "target": { "folder": "reading/books", "filenameFrom": "name",
                  "template": "## Notes\n\n{{name}} by {{author}}\n" },
      "fields": [
        { "name": "name", "label": "Title", "required": true },
        { "name": "author", "label": "Author" },
        { "name": "status", "label": "Status", "type": "select",
          "options": ["to-read", "reading", "finished"], "default": "to-read" },
        { "name": "rating", "label": "Rating (1-5)", "type": "number" },
        { "name": "finished", "label": "Finished on", "type": "date" }
      ],
      "submitLabel": "Add book" },
    { "type": "custom", "widget": "reading.shelf", "title": "▸ SHELF", "width": "full",
      "config": { "folder": "reading/books", "statusField": "status" } },
    { "type": "stat", "title": "▸ FINISHED LAST 12 MONTHS", "width": "half",
      "source": { "folder": "reading/books", "where": [{ "field": "finished", "after": "{{today-365d}}" }] },
      "agg": "count", "label": "books finished" },
    { "type": "stat", "title": "▸ AVG RATING", "width": "half",
      "source": { "folder": "reading/books", "where": [{ "field": "status", "is": "finished" }] },
      "agg": "avg", "field": "rating", "label": "avg rating" }
  ]
}
```

## Rules for generators

1. Emit **only** valid JSON (no comments, no trailing commas) matching `profile.schema.json`.
2. Use only the 11 widget types; for anything else use `custom` and scaffold the widget JS separately.
3. Every folder/note path must come from the user's answers. Confirm paths, never guess.
4. Validate before delivering: `node scripts/validate-profile.mjs <file>` from the plugin folder.
5. Save to `.obsidian/plugins/pinax/profiles/<id>/profile.json` (id: lowercase letters/digits/dashes), then the user selects it in Settings → Pinax.
6. If the dashboard needs write/command/web panes, tell the user which trust toggles it uses and why.
