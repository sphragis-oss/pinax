export function placeholderEl(parent: HTMLElement, title: string, msg: string): HTMLElement {
  const box = parent.createDiv({ cls: "px-placeholder" });
  box.createDiv({ text: title, cls: "px-placeholder-title" });
  box.createDiv({ text: msg, cls: "px-placeholder-msg" });
  return box;
}

export function errorEl(parent: HTMLElement, msg: string): HTMLElement {
  const box = parent.createDiv({ cls: "px-widget-error" });
  box.createDiv({ text: "⚠ pane failed to render", cls: "px-placeholder-title" });
  box.createDiv({ text: msg, cls: "px-placeholder-msg" });
  return box;
}

export function emptyEl(parent: HTMLElement, msg: string): HTMLElement {
  return parent.createEl("div", { text: msg, cls: "cc-empty" });
}
