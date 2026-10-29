// Defer cached-data hydration/request setup until after the commit. Cleanup also
// cancels setup when StrictMode or navigation disposes the effect first.
export function deferEffect(setup) {
  let active = true;
  let cleanup;
  queueMicrotask(() => { if (active) cleanup = setup(); });
  return () => { active = false; if (typeof cleanup === 'function') cleanup(); };
}
