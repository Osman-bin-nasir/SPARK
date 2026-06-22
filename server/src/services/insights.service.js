const insightsRepository = require('../db/insights.repository');
const dashboardRepository = require('../db/dashboard.repository');
const { HttpError } = require('../utils/http-error');

const BUDGET_WARNING_RATIO = 0.8;

// Date & Formatting Helpers
function roundAmount(value) {
  return Number(Number(value || 0).toFixed(2));
}

function roundRatio(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(Number(value).toFixed(2));
}

function toUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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

function calculatePercentageChange(current, previous) {
  if (previous === null || previous === undefined || previous === 0) {
    return null;
  }
  return roundRatio(((current - previous) / previous) * 100);
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

function getAvailableBurnSeries({ burnSeries, earliestTransactionDate, currentMonthStart }) {
  if (!earliestTransactionDate) {
    return [];
  }

  const earliestMonthStart = toUtcMonthStart(new Date(`${earliestTransactionDate}T00:00:00.000Z`));

  if (earliestMonthStart >= currentMonthStart) {
    return [];
  }

  const earliestMonthKey = toMonthKey(earliestMonthStart);

  return burnSeries.filter((item) => item.month >= earliestMonthKey);
}

function averageMonthlySeries(monthlySeries) {
  if (!monthlySeries.length) {
    return null;
  }

  return roundAmount(
    monthlySeries.reduce((sum, item) => sum + Number(item.amount || 0), 0) / monthlySeries.length
  );
}

function buildBurnMetrics({ burnMonthCount, cashOnHand, historicalMonthlyBurn, now }) {
  let monthlyBurn = null;
  let monthlyBurnSource = 'pending';

  if (burnMonthCount > 0 && historicalMonthlyBurn !== null) {
    monthlyBurn = historicalMonthlyBurn;
    monthlyBurnSource = 'historical';
  }

  let runwayMonths = null;
  let estimatedDepletionMonth = null;

  if (monthlyBurn !== null && monthlyBurn > 0) {
    runwayMonths = roundRatio(Math.max(Number(cashOnHand || 0), 0) / monthlyBurn);
    estimatedDepletionMonth = toMonthKey(addUtcMonths(now, Math.floor(runwayMonths)));
  }

  return {
    monthly_burn: monthlyBurn,
    monthly_burn_source: monthlyBurnSource,
    historical_monthly_burn: historicalMonthlyBurn,
    historical_month_count: burnMonthCount,
    runway_months: runwayMonths,
    estimated_depletion_month: estimatedDepletionMonth
  };
}

// Service Methods
async function getWeeklyInsights({ organizationId, now = new Date() }) {
  const today = toUtcDay(now);

  // previous week starts on Monday, ends on Sunday
  const currentWeekDay = today.getUTCDay();
  const daysToCurrentMonday = currentWeekDay === 0 ? 6 : currentWeekDay - 1;
  const currentMonday = new Date(today.getTime() - daysToCurrentMonday * 24 * 3600 * 1000);

  const prevWeekStart = new Date(currentMonday.getTime() - 7 * 24 * 3600 * 1000);
  const prevWeekEnd = new Date(prevWeekStart.getTime() + 6 * 24 * 3600 * 1000);

  const twoWeeksAgoStart = new Date(prevWeekStart.getTime() - 7 * 24 * 3600 * 1000);
  const twoWeeksAgoEnd = new Date(twoWeeksAgoStart.getTime() + 6 * 24 * 3600 * 1000);

  const prevWeekStartStr = toDateString(prevWeekStart);
  const prevWeekEndStr = toDateString(prevWeekEnd);
  const twoWeeksAgoStartStr = toDateString(twoWeeksAgoStart);
  const twoWeeksAgoEndStr = toDateString(twoWeeksAgoEnd);

  const [
    prevWeekCategories,
    twoWeeksAgoCategories,
    prevWeekVendors,
    twoWeeksAgoVendors,
    budgets,
    currentMonthSpendRows
  ] = await Promise.all([
    insightsRepository.getCategorySpendByRange({ organizationId, startDate: prevWeekStartStr, endDate: prevWeekEndStr }),
    insightsRepository.getCategorySpendByRange({ organizationId, startDate: twoWeeksAgoStartStr, endDate: twoWeeksAgoEndStr }),
    insightsRepository.getVendorSpendByRange({ organizationId, startDate: prevWeekStartStr, endDate: prevWeekEndStr }),
    insightsRepository.getVendorSpendByRange({ organizationId, startDate: twoWeeksAgoStartStr, endDate: twoWeeksAgoEndStr }),
    dashboardRepository.listCategoryBudgets({ organizationId }),
    dashboardRepository.listCurrentMonthCategorySpend({
      organizationId,
      currentMonthStart: toDateString(toUtcMonthStart(today)),
      nextMonthStart: toDateString(addUtcMonths(toUtcMonthStart(today), 1))
    })
  ]);

  const prevWeekOutflow = roundAmount(prevWeekCategories.reduce((sum, item) => sum + item.amount, 0));
  const twoWeeksAgoOutflow = roundAmount(twoWeeksAgoCategories.reduce((sum, item) => sum + item.amount, 0));
  const outflowChangePct = calculatePercentageChange(prevWeekOutflow, twoWeeksAgoOutflow);

  // Top spending category
  const topCategoryItem = prevWeekCategories[0] || null;
  const topCategory = topCategoryItem
    ? {
        category: topCategoryItem.category,
        amount: roundAmount(topCategoryItem.amount),
        pct_of_total: prevWeekOutflow > 0 ? roundRatio((topCategoryItem.amount / prevWeekOutflow) * 100) : 0
      }
    : null;

  // Vendor Spikes
  const twoWeeksAgoVendorMap = new Map(twoWeeksAgoVendors.map((v) => [v.vendor, v.amount]));
  const vendorSpikes = [];

  for (const v of prevWeekVendors) {
    const prevAmount = twoWeeksAgoVendorMap.get(v.vendor) || 0;
    const currentAmount = v.amount;

    if (prevAmount > 0) {
      const changePct = calculatePercentageChange(currentAmount, prevAmount);
      // Spike threshold: increased by 15% WoW and current spend >= $100
      if (changePct !== null && changePct >= 15 && currentAmount >= 100) {
        vendorSpikes.push({
          vendor: v.vendor,
          amount: roundAmount(currentAmount),
          previous_amount: roundAmount(prevAmount),
          change_pct: changePct
        });
      }
    } else if (currentAmount >= 100) {
      // Significant new vendor spend
      vendorSpikes.push({
        vendor: v.vendor,
        amount: roundAmount(currentAmount),
        previous_amount: 0,
        change_pct: null
      });
    }
  }

  // Budget Alerts
  const currentMonthSpendMap = new Map(currentMonthSpendRows.map((item) => [item.category.toLowerCase().trim(), item.amount]));
  const budgetAlerts = [];

  for (const budget of budgets) {
    const key = budget.category.toLowerCase().trim();
    const actualSpend = roundAmount(currentMonthSpendMap.get(key) || 0);
    const limit = budget.monthly_limit;

    if (limit > 0) {
      const usageRatio = actualSpend / limit;
      if (usageRatio > 1.0) {
        budgetAlerts.push({
          category: budget.category,
          monthly_limit: limit,
          actual_spend: actualSpend,
          ratio: roundRatio(usageRatio),
          status: 'exceeded'
        });
      } else if (usageRatio >= BUDGET_WARNING_RATIO) {
        budgetAlerts.push({
          category: budget.category,
          monthly_limit: limit,
          actual_spend: actualSpend,
          ratio: roundRatio(usageRatio),
          status: 'warning'
        });
      }
    }
  }

  return {
    period: 'weekly',
    start_date: prevWeekStartStr,
    end_date: prevWeekEndStr,
    metrics: {
      total_outflow: prevWeekOutflow,
      previous_outflow: twoWeeksAgoOutflow,
      change_pct: outflowChangePct
    },
    top_category: topCategory,
    vendor_spikes: vendorSpikes,
    budget_alerts: budgetAlerts
  };
}

async function getMonthlyInsights({ organizationId, now = new Date() }) {
  const today = toUtcDay(now);

  const prevMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const prevMonthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));

  const twoMonthsAgoStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
  const twoMonthsAgoEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 0));

  const prevMonthStartStr = toDateString(prevMonthStart);
  const prevMonthEndStr = toDateString(prevMonthEnd);
  const twoMonthsAgoStartStr = toDateString(twoMonthsAgoStart);
  const twoMonthsAgoEndStr = toDateString(twoMonthsAgoEnd);

  const [
    prevMonthCategories,
    twoMonthsAgoCategories,
    prevMonthVendors,
    twoMonthsAgoVendors,
    budgets,
    financeSettings,
    earliestTransactionDate,
    monthlyOutflowTotals
  ] = await Promise.all([
    insightsRepository.getCategorySpendByRange({ organizationId, startDate: prevMonthStartStr, endDate: prevMonthEndStr }),
    insightsRepository.getCategorySpendByRange({ organizationId, startDate: twoMonthsAgoStartStr, endDate: twoMonthsAgoEndStr }),
    insightsRepository.getVendorSpendByRange({ organizationId, startDate: prevMonthStartStr, endDate: prevMonthEndStr }),
    insightsRepository.getVendorSpendByRange({ organizationId, startDate: twoMonthsAgoStartStr, endDate: twoMonthsAgoEndStr }),
    dashboardRepository.listCategoryBudgets({ organizationId }),
    dashboardRepository.getFinanceSettings(organizationId),
    dashboardRepository.getEarliestTransactionDate({ organizationId }),
    dashboardRepository.listMonthlyOutflowTotals({
      organizationId,
      startDate: toDateString(addUtcMonths(toUtcMonthStart(today), -3)),
      endDate: toDateString(toUtcMonthStart(today))
    })
  ]);

  const prevMonthOutflow = roundAmount(prevMonthCategories.reduce((sum, item) => sum + item.amount, 0));
  const twoMonthsAgoOutflow = roundAmount(twoMonthsAgoCategories.reduce((sum, item) => sum + item.amount, 0));
  const outflowChangePct = calculatePercentageChange(prevMonthOutflow, twoMonthsAgoOutflow);

  // Top categories (up to 3)
  const topCategories = prevMonthCategories.slice(0, 3).map((item) => ({
    category: item.category,
    amount: roundAmount(item.amount),
    pct_of_total: prevMonthOutflow > 0 ? roundRatio((item.amount / prevMonthOutflow) * 100) : 0
  }));

  // Vendor Spikes MoM
  const twoMonthsAgoVendorMap = new Map(twoMonthsAgoVendors.map((v) => [v.vendor, v.amount]));
  const vendorSpikes = [];

  for (const v of prevMonthVendors) {
    const prevAmount = twoMonthsAgoVendorMap.get(v.vendor) || 0;
    const currentAmount = v.amount;

    if (prevAmount > 0) {
      const changePct = calculatePercentageChange(currentAmount, prevAmount);
      // Spike threshold: increased by 12% MoM and current spend >= $200
      if (changePct !== null && changePct >= 12 && currentAmount >= 200) {
        vendorSpikes.push({
          vendor: v.vendor,
          amount: roundAmount(currentAmount),
          previous_amount: roundAmount(prevAmount),
          change_pct: changePct
        });
      }
    } else if (currentAmount >= 200) {
      // Significant new vendor spend MoM
      vendorSpikes.push({
        vendor: v.vendor,
        amount: roundAmount(currentAmount),
        previous_amount: 0,
        change_pct: null
      });
    }
  }

  // Budget performance audit (for the previous calendar month)
  const prevMonthSpendMap = new Map(prevMonthCategories.map((item) => [item.category.toLowerCase().trim(), item.amount]));
  const budgetAudit = [];

  for (const budget of budgets) {
    const key = budget.category.toLowerCase().trim();
    const actualSpend = roundAmount(prevMonthSpendMap.get(key) || 0);
    const limit = budget.monthly_limit;

    if (limit > 0) {
      const usageRatio = actualSpend / limit;
      if (usageRatio >= BUDGET_WARNING_RATIO) {
        budgetAudit.push({
          category: budget.category,
          monthly_limit: limit,
          actual_spend: actualSpend,
          ratio: roundRatio(usageRatio),
          status: usageRatio > 1.0 ? 'exceeded' : 'warning'
        });
      }
    }
  }

  // Runway & Burn rate calculations
  let runwayMetrics = null;
  let cashOnHand = null;

  if (financeSettings) {
    const normalizedOpeningCashEffectiveDate = financeSettings.opening_cash_effective_date;
    const normalizedEarliestTransactionDate = earliestTransactionDate;
    const cashFlowStartDate = normalizedOpeningCashEffectiveDate || normalizedEarliestTransactionDate || null;

    const cashFlowTotals = cashFlowStartDate
      ? await dashboardRepository.getCashFlowTotalsSince({
          organizationId,
          startDate: cashFlowStartDate,
          endDate: toDateString(today)
        })
      : { income_total: 0, outflow_total: 0 };

    cashOnHand = roundAmount(financeSettings.opening_cash_balance || 0);
    cashOnHand = roundAmount(cashOnHand + cashFlowTotals.income_total - cashFlowTotals.outflow_total);

    // Burn rate calculation (over previous 3 months)
    const currentMonthStart = toUtcMonthStart(today);
    const burnWindowStart = addUtcMonths(currentMonthStart, -3);
    const burnTotalsByMonth = new Map(monthlyOutflowTotals.map((item) => [item.month, item.total]));
    const burnSeries = buildMonthlySeries(burnWindowStart, 3, burnTotalsByMonth);

    const availableBurnSeries = getAvailableBurnSeries({
      burnSeries,
      earliestTransactionDate: normalizedEarliestTransactionDate,
      currentMonthStart
    });

    const burnMonthCount = availableBurnSeries.length;
    const historicalMonthlyBurn = averageMonthlySeries(availableBurnSeries);

    runwayMetrics = buildBurnMetrics({
      burnMonthCount,
      cashOnHand,
      historicalMonthlyBurn,
      now: today
    });
  }

  return {
    period: 'monthly',
    start_date: prevMonthStartStr,
    end_date: prevMonthEndStr,
    metrics: {
      total_outflow: prevMonthOutflow,
      previous_outflow: twoMonthsAgoOutflow,
      change_pct: outflowChangePct
    },
    top_categories: topCategories,
    vendor_spikes: vendorSpikes,
    budget_audit: budgetAudit,
    runway: runwayMetrics ? {
      cash_on_hand: cashOnHand,
      monthly_burn: runwayMetrics.monthly_burn,
      runway_months: runwayMetrics.runway_months,
      estimated_depletion_month: runwayMetrics.estimated_depletion_month
    } : null
  };
}

module.exports = {
  getWeeklyInsights,
  getMonthlyInsights
};
