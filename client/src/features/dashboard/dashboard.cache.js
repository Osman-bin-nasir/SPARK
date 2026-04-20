const DASHBOARD_INVALIDATION_PREFIX = 'spark.dashboard.invalidate.';

export function getDashboardInvalidationStamp(organizationId) {
  if (!organizationId || typeof window === 'undefined') {
    return 0;
  }

  const rawValue = window.localStorage.getItem(`${DASHBOARD_INVALIDATION_PREFIX}${organizationId}`);
  const parsedValue = Number(rawValue);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

export function markDashboardSnapshotStale(organizationId) {
  if (!organizationId || typeof window === 'undefined') {
    return;
  }

  const stamp = Date.now();
  const key = `${DASHBOARD_INVALIDATION_PREFIX}${organizationId}`;

  window.localStorage.setItem(key, String(stamp));
  window.dispatchEvent(new CustomEvent('spark:dashboard-stale', {
    detail: {
      organizationId,
      stamp
    }
  }));
}
