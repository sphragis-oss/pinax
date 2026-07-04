# Companion widget plugin template

The supported way to add custom widgets to Pinax: a tiny Obsidian plugin that calls `window.pinax.registerWidget(...)`. No build step, no dependencies.

1. Copy this folder to `<vault>/.obsidian/plugins/my-pinax-widgets/`.
2. Enable "My Pinax Widgets" in Settings, then Community plugins.
3. Point a `custom` pane at your widget id: `{ "type": "custom", "widget": "mine.hello", "title": "HELLO" }`.

Edit `main.js` to rename the widget id (`mine.hello`, ids must contain a dot) and change what `render` draws. Widgets that start timers or listeners must return a cleanup function from `render`. Full authoring guide: [AUTHORING.md](../../AUTHORING.md).

LLM tip: paste `main.js` plus your desired behavior into any LLM ("make this widget show X from folder Y using window.pinax.records(...)") and drop the result back in place.
