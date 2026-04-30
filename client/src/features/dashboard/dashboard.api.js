import { endpoints } from '../../services/endpoints';
import { get, post, put } from '../../services/http';

function buildOrganizationOptions(token, organizationId) {
  return {
    token,
    headers: {
      'X-Organization-Id': organizationId
    }
  };
}

export function getDashboardSnapshot({ token, organizationId, months = 6, categoryWindow = 'all_time' }) {
  const params = new URLSearchParams({
    months: String(months),
    category_window: categoryWindow
  });
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

export function getOrganizationTeam({ token, organizationId }) {
  return get(endpoints.organizationsTeam, buildOrganizationOptions(token, organizationId));
}

export function regenerateOrganizationJoinCode({ token, organizationId }) {
  return post(endpoints.organizationsRegenerateJoinCode, {}, buildOrganizationOptions(token, organizationId));
}
