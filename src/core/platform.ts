// Node builtins resolved lazily so the bundle also loads on mobile
export function nodeRequire<T>(id: string): T | null {
  try {
    const req = (window as { require?: (id: string) => T }).require;
    return req ? req(id) : null;
  } catch {
    return null;
  }
}
