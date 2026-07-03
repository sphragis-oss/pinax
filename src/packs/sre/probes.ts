import { requestUrl } from "obsidian";
import { nodeRequire } from "../../core/platform";

export interface OllamaProbe { up: boolean; version: string; model: string; modelPulled: boolean; }
export interface FirecrawlProbe { up: boolean; port: string; }

export async function checkOllama(): Promise<OllamaProbe> {
  const base = "http://localhost:11434";
  const model = process.env.VAULT_RECALL_MODEL || "bge-m3";
  try {
    const ver = await requestUrl({ url: `${base}/api/version`, method: "GET" });
    const version = (ver.json?.version as string) || "";
    let modelPulled = false;
    try {
      const tags = await requestUrl({ url: `${base}/api/tags`, method: "GET" });
      const names: string[] = (tags.json?.models ?? []).map((m: { name: string }) => m.name);
      modelPulled = names.some((n) => n === model || n.startsWith(model + ":"));
    } catch { /* tags optional */ }
    return { up: true, version, model, modelPulled };
  } catch {
    return { up: false, version: "", model, modelPulled: false };
  }
}

export async function checkFirecrawl(): Promise<FirecrawlProbe> {
  const base = process.env.FIRECRAWL_URL || "http://localhost:3002";
  const port = base.match(/:(\d+)/)?.[1] || "3002";
  try {
    const r = await requestUrl({ url: `${base}/v0/health/liveness`, method: "GET" });
    return { up: r.status === 200, port };
  } catch {
    try {
      const r2 = await requestUrl({ url: `${base}/`, method: "GET" });
      return { up: r2.status === 200, port };
    } catch {
      return { up: false, port };
    }
  }
}

export function dockerPs(): Promise<{ up: boolean; count: number; names: string[] }> {
  return new Promise((resolve) => {
    const cp = nodeRequire<typeof import("child_process")>("child_process");
    const path = nodeRequire<typeof import("path")>("path");
    const os = nodeRequire<typeof import("os")>("os");
    if (!cp || !path || !os) { resolve({ up: false, count: 0, names: [] }); return; }
    const shell = process.env.SHELL || "/bin/zsh";
    const extra = ["/opt/homebrew/bin", "/usr/local/bin", path.join(os.homedir(), ".local/bin")];
    const env = { ...process.env, PATH: `${extra.join(":")}:${process.env.PATH || ""}` };
    let child: ReturnType<typeof cp.spawn>;
    try { child = cp.spawn(shell, ["-lc", "docker ps --format '{{.Names}}'"], { env, stdio: ["ignore", "pipe", "pipe"] }); }
    catch { resolve({ up: false, count: 0, names: [] }); return; }
    let out = "";
    child.stdout?.on("data", (d) => { out += d.toString(); });
    child.on("error", () => resolve({ up: false, count: 0, names: [] }));
    child.on("close", (code) => {
      if (code !== 0) { resolve({ up: false, count: 0, names: [] }); return; }
      const names = out.split("\n").map((s) => s.trim()).filter(Boolean);
      resolve({ up: true, count: names.length, names });
    });
  });
}
