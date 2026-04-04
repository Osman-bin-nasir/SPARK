const performanceRepository = require('../db/performance.repository');
const { HttpError } = require('../utils/http-error');

const RANGE_CONFIG = {
  monthly: {
    key: 'monthly',
    label: 'Monthly',
    months: 1
  },
  '3m': {
    key: '3m',
    label: 'Last 3 Months',
    months: 3
  },
  '6m': {
    key: '6m',
    label: 'Last 6 Months',
    months: 6
  },
  '1y': {
    key: '1y',
    label: '1 Year',
    months: 12
  },
  all: {
    key: 'all',
    label: 'All Time',
    months: null
  }
};

const RANGE_ALIASES = new Map([
  ['month', 'monthly'],
  ['monthly', 'monthly'],
  ['3m', '3m'],
  ['3months', '3m'],
  ['last 3 months', '3m'],
  ['last-3-months', '3m'],
  ['last_3_months', '3m'],
  ['6m', '6m'],
  ['6months', '6m'],
  ['last 6 months', '6m'],
  ['last-6-months', '6m'],
  ['last_6_months', '6m'],
  ['1y', '1y'],
  ['1year', '1y'],
  ['12m', '1y'],
  ['year', '1y'],
  ['all', 'all'],
  ['all time', 'all'],
  ['all-time', 'all'],
  ['all_time', 'all']
]);

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

function parseRange(value) {
  if (value === undefined || value === null || value === '') {
    return RANGE_CONFIG.monthly;
  }

  const normalized = String(value).trim().toLowerCase();
  const rangeKey = RANGE_ALIASES.get(normalized);

  if (!rangeKey || !RANGE_CONFIG[rangeKey]) {
    throw new HttpError(400, 'range must be one of monthly, 3m, 6m, 1y, or all');
  }

  return RANGE_CONFIG[rangeKey];
}

function normalizeSummary(summary) {
  const totalIncome = roundAmount(summary.total_income);
  const totalExpense = roundAmount(summary.total_expense);
  const totalSalary = roundAmount(summary.total_salary);
  const totalOutflow = roundAmount(totalExpense + totalSalary);
  const totalReturn = roundAmount(totalIncome - totalOutflow);

  return {
    total_return: totalReturn,
    total_income: totalIncome,
    total_expense: totalExpense,
    total_salary: totalSalary,
    total_outflow: totalOutflow,
    performance_pct: totalIncome > 0 ? roundRatio((totalReturn / totalIncome) * 100) : null,
    transaction_count: Number(summary.transaction_count || 0)
  };
}

function resolveTimeRange(range, bounds, now = new Date()) {
  const today = toUtcDay(now);
  const asOfDate = toDateString(today);

  if (range.key === 'all') {
    return {
      key: range.key,
      label: range.label,
      start_date: bounds.min_date || null,
      end_date: asOfDate,
      as_of_date: asOfDate
    };
  }

  const currentMonthStart = toUtcMonthStart(today);
  const startMonth = addUtcMonths(currentMonthStart, -(range.months - 1));

  return {
    key: range.key,
    label: range.label,
    start_date: toDateString(startMonth),
    end_date: asOfDate,
    as_of_date: asOfDate
  };
}

function buildMonthlyBreakdown(startDate, endDate, rows) {
  if (!startDate || !endDate) {
    return [];
  }

  const totalsByMonth = new Map(rows.map((row) => [row.period, row]));
  const startMonth = toUtcMonthStart(new Date(`${startDate}T00:00:00.000Z`));
  const endMonth = toUtcMonthStart(new Date(`${endDate}T00:00:00.000Z`));
  const items = [];

  for (let cursor = startMonth; cursor.getTime() <= endMonth.getTime(); cursor = addUtcMonths(cursor, 1)) {
    const period = toMonthKey(cursor);
    const existing = totalsByMonth.get(period) || {
      total_income: 0,
      total_expense: 0,
      total_salary: 0,
      transaction_count: 0
    };
    const normalized = normalizeSummary(existing);

    items.push({
      period,
      label: formatMonthLabel(period),
      total_return: normalized.total_return,
      total_income: normalized.total_income,
      total_expense: normalized.total_expense,
      total_salary: normalized.total_salary,
      total_outflow: normalized.total_outflow,
      performance_pct: normalized.performance_pct,
      transaction_count: normalized.transaction_count
    });
  }

  return items;
}

function buildCategoryBreakdown(rows) {
  return rows.map((row) => {
    const normalized = normalizeSummary(row);

    return {
      category: String(row.category || '').trim() || 'Uncategorized',
      total_return: normalized.total_return,
      total_income: normalized.total_income,
      total_expense: normalized.total_expense,
      total_salary: normalized.total_salary,
      total_outflow: normalized.total_outflow,
      performance_pct: normalized.performance_pct,
      transaction_count: normalized.transaction_count
    };
  });
}

function buildSheetRows({ timeRange, summary, monthlyBreakdown }) {
  return [
    {
      row_type: 'summary',
      range_key: timeRange.key,
      range_label: timeRange.label,
      start_date: timeRange.start_date,
      end_date: timeRange.end_date,
      as_of_date: timeRange.as_of_date,
      period: 'TOTAL',
      period_label: 'Total',
      total_return: summary.total_return,
      total_income: summary.total_income,
      total_expense: summary.total_expense,
      total_salary: summary.total_salary,
      total_outflow: summary.total_outflow,
      performance_pct: summary.performance_pct,
      transaction_count: summary.transaction_count
    },
    ...monthlyBreakdown.map((item) => ({
      row_type: 'month',
      range_key: timeRange.key,
      range_label: timeRange.label,
      start_date: timeRange.start_date,
      end_date: timeRange.end_date,
      as_of_date: timeRange.as_of_date,
      period: item.period,
      period_label: item.label,
      total_return: item.total_return,
      total_income: item.total_income,
      total_expense: item.total_expense,
      total_salary: item.total_salary,
      total_outflow: item.total_outflow,
      performance_pct: item.performance_pct,
      transaction_count: item.transaction_count
    }))
  ];
}

async function getPerformance({ organizationId, query }) {
  const range = parseRange(query?.range);
  const bounds = await performanceRepository.getTransactionDateBounds({ organizationId });
  const timeRange = resolveTimeRange(range, bounds);

  if (!timeRange.start_date) {
    const emptySummary = normalizeSummary({
      total_income: 0,
      total_expense: 0,
      total_salary: 0,
      transaction_count: 0
    });

    return {
      time_range: timeRange,
      summary: emptySummary,
      monthly_breakdown: [],
      category_breakdown: [],
      sheet_rows: buildSheetRows({
        timeRange,
        summary: emptySummary,
        monthlyBreakdown: []
      })
    };
  }

  const [summaryRow, monthlyRows, categoryRows] = await Promise.all([
    performanceRepository.getPerformanceSummary({
      organizationId,
      startDate: timeRange.start_date,
      endDate: timeRange.end_date
    }),
    performanceRepository.listMonthlyPerformanceBreakdown({
      organizationId,
      startDate: timeRange.start_date,
      endDate: timeRange.end_date
    }),
    performanceRepository.listCategoryPerformanceBreakdown({
      organizationId,
      startDate: timeRange.start_date,
      endDate: timeRange.end_date
    })
  ]);

  const summary = normalizeSummary(summaryRow);
  const monthlyBreakdown = buildMonthlyBreakdown(timeRange.start_date, timeRange.end_date, monthlyRows);
  const categoryBreakdown = buildCategoryBreakdown(categoryRows);

  return {
    time_range: timeRange,
    summary,
    monthly_breakdown: monthlyBreakdown,
    category_breakdown: categoryBreakdown,
    sheet_rows: buildSheetRows({
      timeRange,
      summary,
      monthlyBreakdown
    })
  };
}

module.exports = {
  getPerformance
};
