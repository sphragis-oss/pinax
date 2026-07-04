// Node builtins resolved lazily so the bundle also loads on mobile
export function nodeRequire<T>(id: string): T | null {
  try {
    const req = (window as { require?: (id: string) => T }).require;
    return req ? req(id) : null;
  } catch {
    return null;
  }
}

// minimal typings for the node APIs we touch, so no @types/node is required
export interface NodeDirent { name: string; isFile(): boolean; isDirectory(): boolean; }
export interface NodeStats { mtimeMs: number; }
export interface NodeFs {
  existsSync(p: string): boolean;
  readdirSync(p: string, opts: { withFileTypes: true }): NodeDirent[];
  statSync(p: string): NodeStats;
  readFileSync(p: string, enc: "utf8"): string;
}
export interface NodePath { join(...parts: string[]): string; }
export interface NodeOs { homedir(): string; }
export interface NodeChild {
  stdout?: { on(ev: "data", cb: (chunk: { toString(): string }) => void): void } | null;
  on(ev: string, cb: (arg?: unknown) => void): void;
}
export interface NodeChildProcess {
  spawn(cmd: string, args: string[], opts: Record<string, unknown>): NodeChild;
}

// process.env without @types/node; empty object on mobile
export function envAll(): Record<string, string | undefined> {
  const proc = (window as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env ?? {};
}

export function envVar(name: string): string | undefined {
  return envAll()[name];
}
