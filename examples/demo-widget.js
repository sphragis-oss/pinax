// Sample external widget for the window.pinax API (apiVersion 1).
// Run it from any plugin or the devtools console while Pinax is loaded,
// then add a pane: { "type": "custom", "widget": "demo.hello", "title": "DEMO" }
(function registerDemoHello() {
  if (!window.pinax || window.pinax.apiVersion !== 1) {
    console.error("pinax not loaded or incompatible apiVersion");
    return;
  }
  window.pinax.registerWidget("demo.hello", {
    render(el, ctx) {
      const box = el.createDiv({ cls: "px-placeholder" });
      box.createDiv({ text: "hello from demo.hello", cls: "px-placeholder-title" });
      box.createDiv({
        text: `rendered by an external widget · profile pane "${ctx.pane.title ?? "untitled"}" · ${new Date().toISOString()}`,
        cls: "px-placeholder-msg",
      });
      const btn = box.createEl("button", { text: "count notes in this vault", cls: "px-btn" });
      const out = box.createDiv({ cls: "px-placeholder-msg" });
      btn.onclick = () => {
        out.setText(`${ctx.app.vault.getMarkdownFiles().length} markdown notes`);
      };
    },
  });
  console.log("registered demo.hello");
})();
