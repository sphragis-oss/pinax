// Example profiles/<id>/widgets.js: profile-local custom widgets.
// Pinax executes this file with the window.pinax API bound to `pinax`,
// ONLY after the user enables "Custom widget code" for the profile in Settings.
// Reference it from a pane: { "type": "custom", "widget": "myprofile.counter" }
pinax.registerWidget("myprofile.counter", {
  render(el, ctx) {
    const folder = String(ctx.pane.folder ?? "notes");
    const box = el.createDiv({ cls: "px-placeholder" });
    box.createDiv({ text: "note counter", cls: "px-placeholder-title" });
    const out = box.createDiv({ cls: "px-placeholder-msg" });
    out.setText(`${pinax.vault.listFolder(folder).length} entries in ${folder}/`);
    // widgets that set timers must return a cleanup function
    const timer = window.setInterval(() => {
      out.setText(`${pinax.vault.listFolder(folder).length} entries in ${folder}/ (live)`);
    }, 5000);
    return () => window.clearInterval(timer);
  },
});
