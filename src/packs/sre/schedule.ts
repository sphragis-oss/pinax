import type { WidgetContext, WidgetSpec } from "../../core/types";

interface ScheduledRoutine {
  time: string;
  name: string;
  desc: string;
}

const DEFAULT_ROUTINES: ScheduledRoutine[] = [
  { time: "07:00",     name: "morning-trend-scan",     desc: "CNCF releases, KEPs, CVEs (48h)" },
  { time: "07:05",     name: "github-trending-radar",  desc: "Top 10 AI + CNCF repos (7d)" },
  { time: "07:10",     name: "clotributor-radar",      desc: "CNCF first-issues, Go (no PRs)" },
  { time: "07:15",     name: "claude-code-releases",   desc: "Last 3 stable releases, ranked" },
  { time: "07:20",     name: "reliability-state",      desc: "Workable SLOs + per-app SLA from Datadog (work only)" },
  { time: "07:25",     name: "platform-state",         desc: "Workable terraform, helm, k8s snapshot (work only)" },
  { time: "07:30",     name: "morning-brief",          desc: "Synthesizes overnight scans + open items" },
  { time: "Sun 08:00", name: "vault-optimizer",        desc: "Vault hygiene audit (weekly)" },
  { time: "1st 07:00", name: "vault-monthly-index",    desc: "Previous month session index" },
  { time: "1st 08:00", name: "mcp-audit",              desc: "Reminder; full audit runs locally" },
];

export const scheduleWidget: WidgetSpec = {
  render(el: HTMLElement, ctx: WidgetContext): void {
    const routines = Array.isArray(ctx.pane.routines)
      ? (ctx.pane.routines as ScheduledRoutine[])
      : DEFAULT_ROUTINES;
    const list = el.createEl("ul", { cls: "cc-sched-list" });
    for (const r of routines) {
      const li = list.createEl("li", { cls: "cc-sched-item" });
      li.createSpan({ text: r.time, cls: "cc-sched-time" });
      li.createSpan({ text: r.name, cls: "cc-sched-name" });
      li.createSpan({ text: r.desc, cls: "cc-sched-desc" });
    }
    const hint = el.createDiv({ cls: "cc-muted cc-sched-hint" });
    hint.setText("Edit this pane's routines in profile.json to add more.");
  },
};
