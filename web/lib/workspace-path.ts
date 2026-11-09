// Public routing configuration only; never an authorization decision.
export function workspacePath(path: string): string {
  return `${process.env.NEXT_PUBLIC_MEMENTO_BASE_PATH ?? ""}${path}`;
}

export function publicationStorageKey(): string {
  const base = process.env.NEXT_PUBLIC_MEMENTO_BASE_PATH ?? "";
  return base ? `memento-publication:${base}` : "memento-demo-publication";
}
