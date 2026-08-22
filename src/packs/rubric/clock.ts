import type { WidgetSpec } from "../../core/types";

// ISO 8601 week number
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const clockWidget: WidgetSpec = {
  render(el, ctx): (() => void) {
    const box = el.createDiv({ cls: "px-clock" });
    const meta = box.createDiv({ cls: "px-clock__meta" });
    const time = box.createDiv({ cls: "px-clock__time" });
    const zone = box.createDiv({ cls: "px-clock__zone" });
    const label = typeof ctx.pane.label === "string" ? ctx.pane.label : Intl.DateTimeFormat().resolvedOptions().timeZone;

    const tick = (): void => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      meta.setText(`Wk${isoWeek(now)} | ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()} (${DAYS[now.getDay()]})`);
      time.setText(`${hh}:${mm}:${ss}`);
      zone.setText(label);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  },
};
