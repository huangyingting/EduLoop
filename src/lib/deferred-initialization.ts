export function deferInitialization(
  initialized: { current: boolean },
  initialize: (isActive: () => boolean) => void,
) {
  let active = true;
  const timer = setTimeout(() => {
    if (!active || initialized.current) return;
    initialized.current = true;
    initialize(() => active);
  }, 0);

  return () => {
    active = false;
    clearTimeout(timer);
  };
}
