// Companion plugin template: registers custom widgets with Pinax via window.pinax.
// Copy this folder to <vault>/.obsidian/plugins/my-pinax-widgets/ and enable it.
const { Plugin } = require("obsidian");

module.exports = class MyPinaxWidgets extends Plugin {
  onload() {
    // wait until pinax has published its API
    const tryRegister = () => {
      if (!window.pinax) { setTimeout(tryRegister, 500); return; }
      window.pinax.registerWidget("mine.hello", {
        render(el, ctx) {
          el.createDiv({ text: `Hello from ${ctx.pane.title ?? "my widget"}` });
          // widgets with timers/listeners: return a cleanup function instead
        },
      });
    };
    tryRegister();
  }

  onunload() {
    window.pinax?.unregisterWidget("mine.hello");
  }
};
