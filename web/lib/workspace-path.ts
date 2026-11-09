// Public routing only; authorization happens on the API.
export function workspacePath(path: string): string {
  return `${process.env.NEXT_PUBLIC_MEMENTO_BASE_PATH ?? ""}${path}`;
}
export function routePath(path: string): string {
  const base = process.env.NEXT_PUBLIC_MEMENTO_BASE_PATH ?? "";
  return base && (path === base || path.startsWith(`${base}/`))
    ? path.slice(base.length) || "/"
    : path;
}
export function workspaceStorageKey(key: string): string {
  const base = process.env.NEXT_PUBLIC_MEMENTO_BASE_PATH ?? "";
  return base ? `${base}:${key}` : key;
}
