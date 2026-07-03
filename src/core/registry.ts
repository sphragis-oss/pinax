import type { WidgetSpec } from "./types";

const CUSTOM_ID_RE = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/;

export class WidgetRegistry {
  private widgets = new Map<string, WidgetSpec>();
  private builtins = new Set<string>();
  private listeners = new Set<() => void>();

  registerBuiltin(id: string, spec: WidgetSpec): void {
    this.widgets.set(id, spec);
    this.builtins.add(id);
  }

  register(id: string, spec: WidgetSpec): void {
    if (typeof id !== "string" || !CUSTOM_ID_RE.test(id)) {
      throw new Error(`pinax: invalid widget id "${String(id)}" (expected namespaced lowercase id like "my.widget")`);
    }
    if (this.builtins.has(id)) {
      throw new Error(`pinax: cannot overwrite built-in widget "${id}"`);
    }
    if (!spec || typeof spec.render !== "function") {
      throw new Error(`pinax: widget "${id}" spec must have a render(el, ctx) function`);
    }
    this.widgets.set(id, spec);
    this.notify();
  }

  unregister(id: string): void {
    if (this.builtins.has(id)) {
      throw new Error(`pinax: cannot unregister built-in widget "${id}"`);
    }
    if (this.widgets.delete(id)) this.notify();
  }

  get(id: string): WidgetSpec | undefined {
    return this.widgets.get(id);
  }

  has(id: string): boolean {
    return this.widgets.has(id);
  }

  isBuiltin(id: string): boolean {
    return this.builtins.has(id);
  }

  list(): string[] {
    return Array.from(this.widgets.keys()).sort();
  }

  listBuiltins(): string[] {
    return Array.from(this.builtins).sort();
  }

  onChanged(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    for (const cb of this.listeners) {
      try { cb(); } catch (err) { console.error("pinax: registry listener failed", err); }
    }
  }
}
