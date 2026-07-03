import { Notice } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../types";
import { createNote, appendToNote } from "../vault";
import { expandVars, todayStr } from "../template";

interface FieldConfig {
  name: string;
  label?: string;
  type?: "text" | "textarea" | "date" | "number" | "select";
  options?: string[];
  required?: boolean;
  default?: string;
}

interface FormTarget {
  folder?: string;
  note?: string;
  section?: string;
  template?: string;
  filenameFrom?: string;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function expand(template: string, data: Record<string, string>): string {
  return template
    .replace(/\{\{today\}\}/g, todayStr())
    .replace(/\{\{time\}\}/g, nowHHMM())
    .replace(/\{\{(\w[\w-]*)\}\}/g, (_, key: string) => data[key] ?? "");
}

async function submit(ctx: WidgetContext, target: FormTarget, data: Record<string, string>): Promise<string> {
  if (target.note) {
    const note = expandVars(target.note, ctx.app);
    const template = target.template ?? "- {{time}} " + Object.keys(data).map((k) => `{{${k}}}`).join(" · ");
    await appendToNote(ctx.app, note, target.section, expand(template, data));
    return `Appended to ${note}`;
  }
  const file = await createNote(ctx.app, expandVars(String(target.folder), ctx.app), target.template, data, target.filenameFrom);
  return `Created ${file.path}`;
}

export const form: WidgetSpec = {
  gate: "write",
  defaults: { target: { folder: "notes" }, fields: [{ name: "name", required: true }] },
  render(el: HTMLElement, ctx: WidgetContext): void {
    const target = (ctx.pane.target ?? {}) as FormTarget;
    const fields = (Array.isArray(ctx.pane.fields) ? ctx.pane.fields : []) as FieldConfig[];
    if ((!target.folder && !target.note) || fields.length === 0) {
      el.createEl("div", { text: "form pane needs target.folder (create) or target.note (append), plus fields[]", cls: "cc-empty" });
      return;
    }

    const formEl = el.createEl("form", { cls: "px-form" });
    const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();

    for (const f of fields) {
      const row = formEl.createDiv({ cls: "px-form-row" });
      const label = row.createEl("label", { text: f.label ?? f.name, cls: "px-form-label" });
      const id = `px-field-${f.name}`;
      label.setAttr("for", id);
      let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (f.type === "textarea") {
        input = row.createEl("textarea", { cls: "px-form-input" });
      } else if (f.type === "select") {
        const sel = row.createEl("select", { cls: "px-form-input" });
        for (const opt of f.options ?? []) sel.createEl("option", { text: opt, value: opt });
        input = sel;
      } else {
        const inp = row.createEl("input", { cls: "px-form-input" });
        inp.type = f.type === "date" ? "date" : f.type === "number" ? "number" : "text";
        input = inp;
      }
      input.id = id;
      if (f.default !== undefined) input.value = f.default;
      inputs.set(f.name, input);
    }

    const actions = formEl.createDiv({ cls: "px-form-actions" });
    const submitBtn = actions.createEl("button", {
      text: String(ctx.pane.submitLabel ?? (target.note ? "Append" : "Create note")),
      cls: "px-btn px-btn-primary",
    });
    submitBtn.type = "submit";
    const errBox = formEl.createDiv({ cls: "px-form-error" });
    errBox.hide();

    formEl.onsubmit = (e) => {
      e.preventDefault();
      errBox.hide();
      const data: Record<string, string> = {};
      for (const f of fields) {
        const v = inputs.get(f.name)?.value ?? "";
        if (f.required && v.trim().length === 0) {
          errBox.setText(`"${f.label ?? f.name}" is required`);
          errBox.show();
          return;
        }
        data[f.name] = v;
      }
      if (!ctx.trust.write) {
        errBox.setText("Note writing is disabled in Settings → Pinax.");
        errBox.show();
        return;
      }
      void submit(ctx, target, data)
        .then((msg) => {
          new Notice(msg);
          for (const input of inputs.values()) {
            if (!(input instanceof HTMLSelectElement)) input.value = "";
          }
          ctx.refresh();
        })
        .catch((err) => {
          errBox.setText(String(err));
          errBox.show();
        });
    };
  },
};
