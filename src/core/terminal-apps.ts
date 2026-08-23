// Curated terminal launchers per platform; pure data so it unit-tests without obsidian
export type TerminalPlatform = "mac" | "win" | "linux";

export interface TerminalSpawn { cmd: string; args: string[] }

export interface TerminalChoice {
  id: string;
  label: string;
  spawn: TerminalSpawn;
  macApp?: string;
}

const mac = (id: string, label: string, app: string): TerminalChoice => ({ id, label, spawn: { cmd: "open", args: ["-a", app] }, macApp: app });
const win = (id: string, label: string, exe: string): TerminalChoice => ({ id, label, spawn: { cmd: "cmd", args: ["/c", "start", "", exe] } });
const lin = (id: string, label: string, bin: string): TerminalChoice => ({ id, label, spawn: { cmd: bin, args: [] } });

const CHOICES: Record<TerminalPlatform, TerminalChoice[]> = {
  mac: [
    mac("terminal", "Terminal", "Terminal"),
    mac("iterm", "iTerm2", "iTerm"),
    mac("ghostty", "Ghostty", "Ghostty"),
    mac("kitty", "kitty", "kitty"),
    mac("alacritty", "Alacritty", "Alacritty"),
    mac("wezterm", "WezTerm", "WezTerm"),
    mac("warp", "Warp", "Warp"),
  ],
  win: [
    win("wt", "Windows Terminal", "wt"),
    win("cmd", "Command Prompt", "cmd"),
    win("powershell", "PowerShell", "powershell"),
  ],
  linux: [
    lin("ghostty", "Ghostty", "ghostty"),
    lin("kitty", "kitty", "kitty"),
    lin("alacritty", "Alacritty", "alacritty"),
    lin("gnome-terminal", "GNOME Terminal", "gnome-terminal"),
    lin("konsole", "Konsole", "konsole"),
    lin("xte", "System default (x-terminal-emulator)", "x-terminal-emulator"),
  ],
};

export function terminalChoices(platform: TerminalPlatform): TerminalChoice[] {
  return CHOICES[platform];
}

// spawns to try in order; unknown or "auto" pref degrades to the platform default chain
export function spawnCandidates(platform: TerminalPlatform, pref: string, detect?: (app: string) => boolean): TerminalSpawn[] {
  const hit = CHOICES[platform].find((c) => c.id === pref);
  if (hit) return [hit.spawn];
  if (platform === "mac") {
    // auto prefers any detected third-party terminal; Terminal.app is the last resort
    const found = detect ? CHOICES.mac.filter((c) => c.id !== "terminal" && c.macApp !== undefined && detect(c.macApp)) : [];
    return [...found.map((c) => c.spawn), { cmd: "open", args: ["-a", "Terminal"] }];
  }
  if (platform === "win") return [{ cmd: "cmd", args: ["/c", "start", "", "cmd"] }];
  return ["x-terminal-emulator", "gnome-terminal", "konsole", "kitty", "xterm"].map((cmd) => ({ cmd, args: [] }));
}
