import { endpoints } from '../../services/endpoints';
import { get, put } from '../../services/http';

function buildOrganizationOptions(token, organizationId) {
  return {
    token,
    headers: {
      'X-Organization-Id': organizationId
    }
  };
}

export function getDashboardSnapshot({ token, organizationId, months = 6 }) {
  const params = new URLSearchParams({ months: String(months) });
  return get(`${endpoints.dashboard}?${params.toString()}`, buildOrganizationOptions(token, organizationId));
}

export function getDashboardConfig({ token, organizationId }) {
  return get(endpoints.dashboardConfig, buildOrganizationOptions(token, organizationId));
}

export function updateDashboardConfig({ token, organizationId, payload }) {
  return put(endpoints.dashboardConfig, payload, buildOrganizationOptions(token, organizationId));
}

export function getDashboardBudgets({ token, organizationId }) {
  return get(endpoints.dashboardBudgets, buildOrganizationOptions(token, organizationId));
}

export function updateDashboardBudgets({ token, organizationId, payload }) {
  return put(endpoints.dashboardBudgets, payload, buildOrganizationOptions(token, organizationId));
}
