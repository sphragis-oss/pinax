import type { TrustGate, TrustSettings } from "./types";

export function isTrusted(gate: TrustGate | undefined, trust: TrustSettings): boolean {
  if (!gate) return true;
  return trust[gate] === true;
}

export function gateLabel(gate: TrustGate): string {
  if (gate === "web") return "Web embeds";
  if (gate === "command") return "Command buttons";
  return "Note writing";
}

// Vault-relative path guard: rejects escapes, returns normalized path
export function safeVaultPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("pinax: path must be a non-empty string");
  }
  const p = raw.trim();
  if (p.includes("\\")) throw new Error(`pinax: backslashes not allowed in path "${p}"`);
  if (p.startsWith("/")) throw new Error(`pinax: absolute paths not allowed ("${p}")`);
  if (/^[A-Za-z]:/.test(p)) throw new Error(`pinax: drive-letter paths not allowed ("${p}")`);
  const parts = p.split("/").filter((s) => s !== "" && s !== ".");
  if (parts.some((s) => s === "..")) {
    throw new Error(`pinax: path "${p}" escapes the vault ('..' segments are not allowed)`);
  }
  if (parts.length === 0) throw new Error(`pinax: path "${p}" resolves to nothing`);
  return parts.join("/");
}
