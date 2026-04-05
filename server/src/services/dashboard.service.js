const { pool } = require('../db/pool');
const dashboardRepository = require('../db/dashboard.repository');
const { HttpError } = require('../utils/http-error');

const ALLOWED_MONTH_WINDOWS = new Set([3, 6, 12]);
const SPIKE_DELTA_THRESHOLD = 500;
const SPIKE_MULTIPLIER = 1.5;
const BUDGET_WARNING_RATIO = 0.8;

function roundAmount(value) {
  return Number(Number(value || 0).toFixed(2));
}

function roundRatio(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(Number(value).toFixed(1));
}

function normalizeCategory(value) {
  return String(value || '').trim().toLowerCase();
}

function formatCategoryLabel(value) {
  return String(value || '').trim() || 'Uncategorized';
}

function parseDashboardMonths(value) {
  if (value === undefined || value === null || value === '') {
    return 6;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || !ALLOWED_MONTH_WINDOWS.has(parsed)) {
    throw new HttpError(400, 'months must be one of 3, 6, or 12');
  }

  return parsed;
}

function validateDate(value, fieldName) {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${fieldName} must be a valid date`);
  }
}

function validateFinanceConfigPayload(payload) {
  const body = payload || {};
  const openingCashBalance = Number(body.opening_cash_balance);

  if (!Number.isFinite(openingCashBalance) || openingCashBalance < 0) {
    throw new HttpError(400, 'opening_cash_balance must be a non-negative number');
  }

  validateDate(body.opening_cash_effective_date, 'opening_cash_effective_date');

  return {
    opening_cash_balance: roundAmount(openingCashBalance),
    opening_cash_effective_date: body.opening_cash_effective_date
  };
}

function normalizeBudgetItems(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : null;

  if (!items) {
    throw new HttpError(400, 'items must be an array');
  }

  const seen = new Set();

  return items.map((item, index) => {
    const category = String(item?.category || '').trim();
    const monthlyLimit = Number(item?.monthly_limit);

    if (!category) {
      throw new HttpError(400, `items[${index}].category is required`);
    }

    if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0) {
      throw new HttpError(400, `items[${index}].monthly_limit must be a positive number`);
    }

    const normalizedCategory = normalizeCategory(category);

    if (seen.has(normalizedCategory)) {
      throw new HttpError(400, `Duplicate budget category: ${category}`);
    }

    seen.add(normalizedCategory);

    return {
      category,
      normalized_category: normalizedCategory,
      monthly_limit: roundAmount(monthlyLimit)
    };
  });
}

function toUtcMonthStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date, count) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function toMonthKey(date) {
  return toDateString(date).slice(0, 7);
}

function formatMonthLabel(monthKey) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${monthKey}-01T00:00:00.000Z`));
}

function createBudgetLabelMap(budgets) {
  return new Map(
    budgets.map((budget) => [budget.normalized_category, budget.category])
  );
}

function aggregateCategorySpend(rows, budgetLabelMap = new Map()) {
  const totals = new Map();

  rows.forEach((row) => {
    const normalizedCategory = normalizeCategory(row.category);

    if (!normalizedCategory) {
      return;
    }

    const existing = totals.get(normalizedCategory) || {
      category: budgetLabelMap.get(normalizedCategory) || formatCategoryLabel(row.category),
      amount: 0
    };

    existing.amount += Number(row.amount || 0);
    totals.set(normalizedCategory, existing);
  });

  return totals;
}

function buildMonthlySeries(startMonth, months, totalsByMonth) {
  return Array.from({ length: months }, (_, index) => {
    const monthDate = addUtcMonths(startMonth, index);
    const month = toMonthKey(monthDate);

    return {
      month,
      label: formatMonthLabel(month),
      amount: roundAmount(totalsByMonth.get(month) || 0)
    };
  });
}

function serializeFinanceConfig(settings) {
  return {
    configured: Boolean(settings),
    opening_cash_balance: settings?.opening_cash_balance ?? null,
    opening_cash_effective_date: settings?.opening_cash_effective_date ?? null,
    updated_at: settings?.updated_at ?? null
  };
}

function serializeBudgets(budgets) {
  return {
    items: budgets.map((budget) => ({
      category: budget.category,
      monthly_limit: budget.monthly_limit,
      updated_at: budget.updated_at
    }))
  };
}

function buildBudgetAlerts(budgets, currentMonthSpend) {
  return budgets
    .map((budget) => {
      const spend = roundAmount(currentMonthSpend.get(budget.normalized_category)?.amount || 0);
      const usageRatio = budget.monthly_limit > 0 ? spend / budget.monthly_limit : 0;

      if (usageRatio > 1) {
        return {
          category: budget.category,
          current_spend: spend,
          monthly_limit: budget.monthly_limit,
          remaining: roundAmount(budget.monthly_limit - spend),
          percent_used: roundRatio(usageRatio * 100),
          status: 'exceeded'
        };
      }

      if (usageRatio >= BUDGET_WARNING_RATIO) {
        return {
          category: budget.category,
          current_spend: spend,
          monthly_limit: budget.monthly_limit,
          remaining: roundAmount(budget.monthly_limit - spend),
          percent_used: roundRatio(usageRatio * 100),
          status: 'warning'
        };
      }

      return null;
    })
    .filter(Boolean)
    .sort((left, right) => right.percent_used - left.percent_used);
}

function buildSpikeAlerts({
  currentMonthSpend,
  historicalRows,
  budgetLabelMap,
  currentMonthKey,
  historyMonths,
  historyReady
}) {
  if (!historyReady) {
    return [];
  }

  const historyByCategory = new Map();

  historicalRows.forEach((row) => {
    const normalizedCategory = normalizeCategory(row.category);

    if (!normalizedCategory) {
      return;
    }

    const record = historyByCategory.get(normalizedCategory) || {
      category: budgetLabelMap.get(normalizedCategory) || formatCategoryLabel(row.category),
      totalsByMonth: new Map()
    };

    record.totalsByMonth.set(row.month, Number(row.amount || 0));
    historyByCategory.set(normalizedCategory, record);
  });

  return Array.from(currentMonthSpend.entries())
    .map(([normalizedCategory, current]) => {
      const history = historyByCategory.get(normalizedCategory);
      const average = roundAmount(
        historyMonths.reduce((sum, month) => sum + Number(history?.totalsByMonth.get(month) || 0), 0) / historyMonths.length
      );
      const currentSpend = roundAmount(current.amount);
      const delta = roundAmount(currentSpend - average);

      if (currentMonthKey && currentSpend > average * SPIKE_MULTIPLIER && delta >= SPIKE_DELTA_THRESHOLD) {
        return {
          category: history?.category || current.category,
          current_spend: currentSpend,
          average_spend: average,
          delta,
          increase_percent: average > 0 ? roundRatio((delta / average) * 100) : null,
          status: 'spike'
        };
      }

      return null;
    })
    .filter(Boolean)
    .sort((left, right) => right.delta - left.delta);
}

async function getDashboardSnapshot({ organization, query }) {
  const organizationId = organization.id;
  const months = parseDashboardMonths(query?.months);
  const now = new Date();
  const currentMonthStart = toUtcMonthStart(now);
  const nextMonthStart = addUtcMonths(currentMonthStart, 1);
  const selectedRangeStart = addUtcMonths(currentMonthStart, -(months - 1));
  const burnWindowStart = addUtcMonths(currentMonthStart, -3);
  const currentMonthKey = toMonthKey(currentMonthStart);
  const burnMonths = Array.from({ length: 3 }, (_, index) => toMonthKey(addUtcMonths(burnWindowStart, index)));

  const [
    financeSettings,
    budgets,
    selectedRangeMonthlyTotals,
    currentMonthSpendRows,
    currentMonthRevenue,
    topVendors,
    historicalCategorySpend,
    burnWindowTotals,
    earliestTransactionDate
  ] = await Promise.all([
    dashboardRepository.getFinanceSettings(organizationId),
    dashboardRepository.listCategoryBudgets({ organizationId }),
    dashboardRepository.listMonthlyOutflowTotals({
      organizationId,
      startDate: toDateString(selectedRangeStart),
      endDate: toDateString(nextMonthStart)
    }),
    dashboardRepository.listCurrentMonthCategorySpend({
      organizationId,
      currentMonthStart: toDateString(currentMonthStart),
      nextMonthStart: toDateString(nextMonthStart)
    }),
    dashboardRepository.getCurrentMonthRevenue({
      organizationId,
      currentMonthStart: toDateString(currentMonthStart),
      nextMonthStart: toDateString(nextMonthStart)
    }),
    dashboardRepository.listTopVendorsBySpend({
      organizationId,
      startDate: toDateString(selectedRangeStart),
      endDate: toDateString(nextMonthStart),
      limit: 5
    }),
    dashboardRepository.listHistoricalCategorySpend({
      organizationId,
      historyStart: toDateString(burnWindowStart),
      historyEnd: toDateString(currentMonthStart)
    }),
    dashboardRepository.listMonthlyOutflowTotals({
      organizationId,
      startDate: toDateString(burnWindowStart),
      endDate: toDateString(currentMonthStart)
    }),
    dashboardRepository.getEarliestTransactionDate({ organizationId })
  ]);

  const budgetLabelMap = createBudgetLabelMap(budgets);
  const currentMonthSpend = aggregateCategorySpend(currentMonthSpendRows, budgetLabelMap);
  const currentMonthCategories = Array.from(currentMonthSpend.values())
    .map((item) => ({
      category: item.category,
      amount: roundAmount(item.amount)
    }))
    .sort((left, right) => right.amount - left.amount);

  const selectedTotalsByMonth = new Map(
    selectedRangeMonthlyTotals.map((item) => [item.month, item.total])
  );
  const burnTotalsByMonth = new Map(
    burnWindowTotals.map((item) => [item.month, item.total])
  );

  const burnSeries = buildMonthlySeries(burnWindowStart, 3, burnTotalsByMonth);
  const monthlyBurn = roundAmount(
    burnSeries.reduce((sum, item) => sum + item.amount, 0) / burnSeries.length
  );
  const trends = buildMonthlySeries(selectedRangeStart, months, selectedTotalsByMonth);

  const budgetAlerts = buildBudgetAlerts(budgets, currentMonthSpend);
  const historyReady = Boolean(
    earliestTransactionDate
      && earliestTransactionDate <= toDateString(burnWindowStart)
  );
  const spikeAlerts = buildSpikeAlerts({
    currentMonthSpend,
    historicalRows: historicalCategorySpend,
    budgetLabelMap,
    currentMonthKey,
    historyMonths: burnMonths,
    historyReady
  });

  let cashOnHand = null;
  let runwayMonths = null;

  if (financeSettings) {
    const cashFlowTotals = await dashboardRepository.getCashFlowTotalsSince({
      organizationId,
      startDate: financeSettings.opening_cash_effective_date,
      endDate: toDateString(now)
    });

    cashOnHand = roundAmount(
      financeSettings.opening_cash_balance + cashFlowTotals.income_total - cashFlowTotals.outflow_total
    );

    if (monthlyBurn > 0) {
      runwayMonths = roundRatio(cashOnHand / monthlyBurn);
    }
  }

  const hasTransactions = Boolean(earliestTransactionDate);

  return {
    organization,
    dashboard_state: hasTransactions ? 'ready' : 'no_history',
    metrics: {
      cash_on_hand: cashOnHand,
      runway_months: runwayMonths,
      monthly_burn: monthlyBurn,
      monthly_revenue: roundAmount(currentMonthRevenue),
      budget_alert_count: budgetAlerts.length
    },
    trends,
    category_breakdown: currentMonthCategories,
    top_vendors: topVendors.map((item) => ({
      vendor: item.vendor,
      amount: roundAmount(item.amount)
    })),
    budget_alerts: budgetAlerts,
    spike_alerts: spikeAlerts,
    config: {
      cash_configured: Boolean(financeSettings),
      budgets_configured: budgets.length > 0,
      has_transactions: hasTransactions,
      history_ready_for_spikes: historyReady
    }
  };
}

async function getFinanceConfig({ organizationId }) {
  const settings = await dashboardRepository.getFinanceSettings(organizationId);
  return serializeFinanceConfig(settings);
}

async function updateFinanceConfig({ organizationId, payload }) {
  const normalizedPayload = validateFinanceConfigPayload(payload);
  const settings = await dashboardRepository.upsertFinanceSettings({
    organizationId,
    openingCashBalance: normalizedPayload.opening_cash_balance,
    openingCashEffectiveDate: normalizedPayload.opening_cash_effective_date
  });

  return serializeFinanceConfig(settings);
}

async function listCategoryBudgets({ organizationId }) {
  const budgets = await dashboardRepository.listCategoryBudgets({ organizationId });
  return serializeBudgets(budgets);
}

async function replaceCategoryBudgets({ organizationId, payload }) {
  const items = normalizeBudgetItems(payload);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const budgets = await dashboardRepository.replaceCategoryBudgets({
      organizationId,
      items
    }, client);

    await client.query('COMMIT');
    return serializeBudgets(budgets);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getDashboardSnapshot,
  getFinanceConfig,
  listCategoryBudgets,
  replaceCategoryBudgets,
  updateFinanceConfig
};
