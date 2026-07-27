export function optionIndexForShortcut(key: string, optionCount: number) {
  if (!/^[1-9]$/.test(key)) return null;
  const index = Number(key) - 1;
  return index < optionCount ? index : null;
}

export function ignoresPracticeShortcuts(target: EventTarget | null) {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null;
  return Boolean(
    element?.isContentEditable
    || element?.tagName === "INPUT"
    || element?.tagName === "TEXTAREA"
    || element?.tagName === "SELECT",
  );
}
