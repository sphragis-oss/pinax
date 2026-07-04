import { requestUrl } from "obsidian";
import { envAll, envVar, nodeRequire, NodeChild, NodeChildProcess, NodeOs, NodePath } from "../../core/platform";

export interface OllamaProbe { up: boolean; version: string; model: string; modelPulled: boolean; }
export interface FirecrawlProbe { up: boolean; port: string; }

export async function checkOllama(): Promise<OllamaProbe> {
  const base = "http://localhost:11434";
  const model = envVar("VAULT_RECALL_MODEL") || "bge-m3";
  try {
    const ver = await requestUrl({ url: `${base}/api/version`, method: "GET" });
    const version = (ver.json as { version?: string } | null)?.version ?? "";
    let modelPulled = false;
    try {
      const tags = await requestUrl({ url: `${base}/api/tags`, method: "GET" });
      const names = ((tags.json as { models?: { name: string }[] } | null)?.models ?? []).map((m) => m.name);
      modelPulled = names.some((n) => n === model || n.startsWith(model + ":"));
    } catch { /* tags optional */ }
    return { up: true, version, model, modelPulled };
  } catch {
    return { up: false, version: "", model, modelPulled: false };
  }
}

export async function checkFirecrawl(): Promise<FirecrawlProbe> {
  const base = envVar("FIRECRAWL_URL") || "http://localhost:3002";
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
    const cp = nodeRequire<NodeChildProcess>("child_process");
    const path = nodeRequire<NodePath>("path");
    const os = nodeRequire<NodeOs>("os");
    if (!cp || !path || !os) { resolve({ up: false, count: 0, names: [] }); return; }
    const shell = envVar("SHELL") || "/bin/zsh";
    const extra = ["/opt/homebrew/bin", "/usr/local/bin", path.join(os.homedir(), ".local/bin")];
    const env = { ...envAll(), PATH: `${extra.join(":")}:${envVar("PATH") || ""}` };
    let child: NodeChild;
    try { child = cp.spawn(shell, ["-lc", "docker ps --format '{{.Names}}'"], { env, stdio: ["ignore", "pipe", "pipe"] }); }
    catch { resolve({ up: false, count: 0, names: [] }); return; }
    let out = "";
    child.stdout?.on("data", (d: { toString(): string }) => { out += d.toString(); });
    child.on("error", () => resolve({ up: false, count: 0, names: [] }));
    child.on("close", (code) => {
      if (code !== 0) { resolve({ up: false, count: 0, names: [] }); return; }
      const names = out.split("\n").map((s) => s.trim()).filter(Boolean);
      resolve({ up: true, count: names.length, names });
    });
  });
}
