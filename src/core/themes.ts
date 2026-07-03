export interface ThemeDef { id: string; label: string; accent: string; bg: string; }

export const THEME_GROUPS: { group: string; themes: ThemeDef[] }[] = [
  { group: "Yours", themes: [
    { id: "vesper",      label: "Vesper",       accent: "#ffc799", bg: "#101010" },
    { id: "tokyo-night", label: "Tokyo Night",  accent: "#7aa2f7", bg: "#1a1b26" },
    { id: "rose-pine",   label: "Rosé Pine",    accent: "#ebbcba", bg: "#191724" },
  ] },
  { group: "Dark", themes: [
    { id: "catppuccin",  label: "Catppuccin",   accent: "#89b4fa", bg: "#1e1e2e" },
    { id: "dracula",     label: "Dracula",      accent: "#bd93f9", bg: "#282a36" },
    { id: "nord",        label: "Nord",         accent: "#88c0d0", bg: "#2e3440" },
    { id: "gruvbox",     label: "Gruvbox",      accent: "#fe8019", bg: "#282828" },
    { id: "one-dark",    label: "One Dark",     accent: "#61afef", bg: "#282c34" },
    { id: "solarized",   label: "Solarized",    accent: "#268bd2", bg: "#002b36" },
    { id: "kanagawa",    label: "Kanagawa",     accent: "#7e9cd8", bg: "#1f1f28" },
    { id: "cyberpunk",   label: "Cyberpunk",    accent: "#00bfff", bg: "#332a57" },
  ] },
  { group: "Light", themes: [
    { id: "catppuccin-latte", label: "Catppuccin Latte", accent: "#1e66f5", bg: "#eff1f5" },
    { id: "gruvbox-light",    label: "Gruvbox Light",    accent: "#af3a03", bg: "#fbf1c7" },
    { id: "tokyo-day",        label: "Tokyo Day",        accent: "#2e7de9", bg: "#e1e2e7" },
    { id: "one-light",        label: "One Light",        accent: "#4078f2", bg: "#fafafa" },
    { id: "solarized-light",  label: "Solarized Light",  accent: "#268bd2", bg: "#fdf6e3" },
    { id: "kanagawa-lotus",   label: "Kanagawa Lotus",   accent: "#4d699b", bg: "#f2ecbc" },
    { id: "rose-pine-dawn",   label: "Rosé Pine Dawn",   accent: "#907aa9", bg: "#faf4ed" },
  ] },
];

export const DEFAULT_THEME = "vesper";
export const THEME_STORAGE_KEY = "cc-theme";

export function allThemes(): ThemeDef[] { return THEME_GROUPS.flatMap((g) => g.themes); }

export function themeById(id: string): ThemeDef {
  return allThemes().find((t) => t.id === id) ?? allThemes()[0];
}

export function currentTheme(): ThemeDef {
  return themeById(localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME);
}

export function openThemePicker(root: HTMLElement, onPick: () => void): void {
  const cur = localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
  const overlay = root.createDiv({ cls: "cc-theme-overlay cc-open" });
  const modal = overlay.createDiv({ cls: "cc-theme-modal" });
  const bar = modal.createDiv({ cls: "cc-theme-modal__bar" });
  bar.createSpan({ text: "❯", cls: "cc-hero__prompt" });
  bar.createSpan({ text: "select theme" });
  const list = modal.createDiv({ cls: "cc-theme-list" });

  const close = (): void => { overlay.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") close(); };
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.addEventListener("keydown", onKey);

  for (const g of THEME_GROUPS) {
    list.createDiv({ text: g.group, cls: "cc-theme-group" });
    for (const t of g.themes) {
      const opt = list.createEl("button", { cls: "cc-theme-opt" + (t.id === cur ? " cc-active" : "") });
      const sw = opt.createSpan({ cls: "cc-theme-opt__sw" });
      sw.createSpan().style.background = t.bg;
      sw.createSpan().style.background = t.accent;
      opt.createSpan({ text: t.label, cls: "cc-theme-opt__name" });
      if (t.id === cur) opt.createSpan({ text: "current", cls: "cc-theme-opt__cur" });
      opt.onclick = () => {
        localStorage.setItem(THEME_STORAGE_KEY, t.id);
        close();
        onPick();
      };
    }
  }
}
