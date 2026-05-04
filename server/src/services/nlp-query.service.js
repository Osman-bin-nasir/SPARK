const { env } = require('../config/env');
const semanticSearchService = require('./semantic-search.service');
const ragService = require('./rag.service');
const transactionsRepository = require('../db/transactions.repository');
const { callPythonGeneration } = require('../integrations/python-ai/python-ai.client');

const SUMMARY_KEYWORDS = /(expense|expenses|spent|spend|spending|cost|costs|payment|payments|paid|outflow|outflows|burn|total|sum|how much|aggregate)/i;
const BREAKDOWN_KEYWORDS = /(breakdown|by\s+vendor|by\s+category|by\s+month|by\s+day|group by|top vendors|top categories|distribution|split)/i;
const TREND_KEYWORDS = /(trend|over time|month over month|m[- ]?o[- ]?m|quarter over quarter|q[- ]?o[- ]?q|year over year|y[- ]?o[- ]?y|change over|movement|growth|decline|increase|decrease)/i;
const COMPARISON_KEYWORDS = /(compare|comparison|versus|vs\.?|difference between|delta|relative to|against)/i;
const SEARCH_KEYWORDS = /(find|show|list|search|look up|get all|retrieve|transactions|receipts|invoices|matches|similar|lookup)/i;

function normalizeQuery(query) {
  return String(query || '').replace(/\s+/g, ' ').trim();
}

function toDateString(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function startOfQuarter(date) {
  const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterMonth, 1));
}

function endOfQuarter(date) {
  const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterMonth + 3, 0));
}

function startOfYear(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function endOfYear(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31));
}

function addDays(date, dayCount) {
  return new Date(date.getTime() + (dayCount * 24 * 60 * 60 * 1000));
}

function differenceInDays(startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  return Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1);
}

function detectDateRange(query, now = new Date()) {
  const normalized = normalizeQuery(query).toLowerCase();

  if (/\blast month\b/.test(normalized)) {
    const previousMonthAnchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return {
      label: 'last month',
      start_date: toDateString(startOfMonth(previousMonthAnchor)),
      end_date: toDateString(endOfMonth(previousMonthAnchor))
    };
  }

  if (/\bthis month\b/.test(normalized)) {
    return {
      label: 'this month',
      start_date: toDateString(startOfMonth(now)),
      end_date: toDateString(endOfMonth(now))
    };
  }

  if (/\blast 30 days\b/.test(normalized)) {
    const start = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    return {
      label: 'last 30 days',
      start_date: toDateString(start),
      end_date: toDateString(now)
    };
  }

  if (/\blast 7 days\b|\blast week\b/.test(normalized)) {
    const start = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    return {
      label: 'last 7 days',
      start_date: toDateString(start),
      end_date: toDateString(now)
    };
  }

  if (/\btoday\b/.test(normalized)) {
    return {
      label: 'today',
      start_date: toDateString(now),
      end_date: toDateString(now)
    };
  }

  if (/\byesterday\b/.test(normalized)) {
    const yesterday = addDays(now, -1);
    return {
      label: 'yesterday',
      start_date: toDateString(yesterday),
      end_date: toDateString(yesterday)
    };
  }

  if (/\blast quarter\b/.test(normalized)) {
    const currentQuarterStart = startOfQuarter(now);
    const previousQuarterAnchor = new Date(Date.UTC(currentQuarterStart.getUTCFullYear(), currentQuarterStart.getUTCMonth() - 3, 1));
    return {
      label: 'last quarter',
      start_date: toDateString(startOfQuarter(previousQuarterAnchor)),
      end_date: toDateString(endOfQuarter(previousQuarterAnchor))
    };
  }

  if (/\bthis quarter\b/.test(normalized)) {
    return {
      label: 'this quarter',
      start_date: toDateString(startOfQuarter(now)),
      end_date: toDateString(endOfQuarter(now))
    };
  }

  if (/\blast year\b/.test(normalized)) {
    const previousYear = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
    return {
      label: 'last year',
      start_date: toDateString(startOfYear(previousYear)),
      end_date: toDateString(endOfYear(previousYear))
    };
  }

  if (/\bthis year\b/.test(normalized)) {
    return {
      label: 'this year',
      start_date: toDateString(startOfYear(now)),
      end_date: toDateString(now)
    };
  }

  return {
    label: null,
    start_date: null,
    end_date: null
  };
}

function detectTransactionType(query) {
  const normalized = normalizeQuery(query).toLowerCase();

  if (/(expense|expenses|spent|spend|spending|cost|costs|payment|payments|paid|outflow|burn)/.test(normalized)) {
    return 'expense';
  }

  if (/(income|revenue|sales|earned|receipt|receipts|inflow)/.test(normalized)) {
    return 'income';
  }

  if (/(salary|payroll|wages)/.test(normalized)) {
    return 'salary';
  }

  return null;
}

function detectMetricLabel(query) {
  const normalized = normalizeQuery(query).toLowerCase();

  if (/(revenue|income|earnings|sales|inflow)/.test(normalized)) {
    return {
      metric_label: 'revenue',
      transaction_type: 'income'
    };
  }

  if (/(expense|expenses|spend|spending|cost|costs|outflow|burn|paid)/.test(normalized)) {
    return {
      metric_label: 'expenses',
      transaction_type: 'expense'
    };
  }

  if (/(salary|payroll|wages|compensation)/.test(normalized)) {
    return {
      metric_label: 'salary',
      transaction_type: 'salary'
    };
  }

  return {
    metric_label: null,
    transaction_type: null
  };
}

function detectComparisonRange(query, now = new Date()) {
  const normalized = normalizeQuery(query).toLowerCase();

  if (/\bthis month\b/.test(normalized) && /\blast month\b/.test(normalized) && COMPARISON_KEYWORDS.test(normalized)) {
    const currentMonth = detectDateRange('this month', now);
    const previousMonth = detectDateRange('last month', now);
    return {
      label: 'this month vs last month',
      current: currentMonth,
      previous: previousMonth
    };
  }

  if (/\bthis quarter\b/.test(normalized) && /\blast quarter\b/.test(normalized) && COMPARISON_KEYWORDS.test(normalized)) {
    const currentQuarter = detectDateRange('this quarter', now);
    const previousQuarter = detectDateRange('last quarter', now);
    return {
      label: 'this quarter vs last quarter',
      current: currentQuarter,
      previous: previousQuarter
    };
  }

  if (/\bthis year\b/.test(normalized) && /\blast year\b/.test(normalized) && COMPARISON_KEYWORDS.test(normalized)) {
    const currentYear = detectDateRange('this year', now);
    const previousYear = detectDateRange('last year', now);
    return {
      label: 'this year vs last year',
      current: currentYear,
      previous: previousYear
    };
  }

  if (/\blast quarter\b/.test(normalized) && COMPARISON_KEYWORDS.test(normalized)) {
    const currentQuarter = detectDateRange('last quarter', now);
    const currentStart = new Date(currentQuarter.start_date);
    const previousStart = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - 3, 1));
    return {
      label: 'last quarter vs previous quarter',
      current: currentQuarter,
      previous: {
        label: 'previous quarter',
        start_date: toDateString(startOfQuarter(previousStart)),
        end_date: toDateString(endOfQuarter(previousStart))
      }
    };
  }

  if (/\blast year\b/.test(normalized) && COMPARISON_KEYWORDS.test(normalized)) {
    const currentYear = detectDateRange('last year', now);
    const currentStart = new Date(currentYear.start_date);
    const previousStart = new Date(Date.UTC(currentStart.getUTCFullYear() - 1, 0, 1));
    return {
      label: 'last year vs previous year',
      current: currentYear,
      previous: {
        label: 'previous year',
        start_date: toDateString(startOfYear(previousStart)),
        end_date: toDateString(endOfYear(previousStart))
      }
    };
  }

  if (/\bthis month\b/.test(normalized) && COMPARISON_KEYWORDS.test(normalized)) {
    const currentMonth = detectDateRange('this month', now);
    const currentStart = new Date(currentMonth.start_date);
    const previousAnchor = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - 1, 1));
    return {
      label: 'this month vs last month',
      current: currentMonth,
      previous: {
        label: 'last month',
        start_date: toDateString(startOfMonth(previousAnchor)),
        end_date: toDateString(endOfMonth(previousAnchor))
      }
    };
  }

  if (/\bthis quarter\b/.test(normalized) && COMPARISON_KEYWORDS.test(normalized)) {
    const currentQuarter = detectDateRange('this quarter', now);
    const currentStart = new Date(currentQuarter.start_date);
    const previousStart = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - 3, 1));
    return {
      label: 'this quarter vs last quarter',
      current: currentQuarter,
      previous: {
        label: 'last quarter',
        start_date: toDateString(startOfQuarter(previousStart)),
        end_date: toDateString(endOfQuarter(previousStart))
      }
    };
  }

  if (/\bthis year\b/.test(normalized) && COMPARISON_KEYWORDS.test(normalized)) {
    const currentYear = detectDateRange('this year', now);
    const currentStart = new Date(currentYear.start_date);
    const previousStart = new Date(Date.UTC(currentStart.getUTCFullYear() - 1, 0, 1));
    return {
      label: 'this year vs last year',
      current: currentYear,
      previous: {
        label: 'last year',
        start_date: toDateString(startOfYear(previousStart)),
        end_date: toDateString(endOfYear(previousStart))
      }
    };
  }

  if (COMPARISON_KEYWORDS.test(normalized) && /\b(last|this)\s+(month|quarter|year|week|7 days|30 days)\b/.test(normalized)) {
    const base = detectDateRange(normalized, now);

    if (base.start_date && base.end_date) {
      const days = differenceInDays(base.start_date, base.end_date);
      const currentStart = new Date(base.start_date);
      const previousEnd = addDays(currentStart, -1);
      const previousStart = addDays(previousEnd, -(days - 1));

      return {
        label: `${base.label} vs previous period`,
        current: base,
        previous: {
          label: 'previous period',
          start_date: toDateString(previousStart),
          end_date: toDateString(previousEnd)
        }
      };
    }
  }

  return null;
}

function detectIntent(query) {
  const normalized = normalizeQuery(query).toLowerCase();
  const entity = extractEntityCandidate(normalized);
  const dateRange = detectDateRange(normalized);
  const metricHint = detectMetricLabel(normalized);

  if (COMPARISON_KEYWORDS.test(normalized)) {
    return 'comparison';
  }

  if (TREND_KEYWORDS.test(normalized)) {
    return 'trend';
  }

  if (BREAKDOWN_KEYWORDS.test(normalized)) {
    return 'breakdown';
  }

  if (metricHint.transaction_type && !SEARCH_KEYWORDS.test(normalized)) {
    if (/which\s+category|top\s+category|most\s+category/.test(normalized)) {
      return 'breakdown';
    }

    return 'summary';
  }

  if (SUMMARY_KEYWORDS.test(normalized)) {
    return 'summary';
  }

  if (SEARCH_KEYWORDS.test(normalized)) {
    return entity && dateRange.label ? 'lookup' : 'search';
  }

  return 'rag';
}

function extractEntityCandidate(query) {
  const normalized = normalizeQuery(query);
  const quoted = normalized.match(/["'“”](.+?)["'“”]/);

  if (quoted?.[1]) {
    return quoted[1].trim();
  }

  const entityPatterns = [
    /(?:expenses?|spend(?:ing)?|costs?|payments?|paid|transactions?|receipts?|invoices?)\s+(?:of|for|from|at|with|about|regarding)\s+(.+?)(?:\s+(?:last|this|past|in|during|over)\b|[?.!,;]|$)/i,
    /(?:of|for|from|at|with|about|regarding)\s+(.+?)(?:\s+(?:last|this|past|in|during|over)\b|[?.!,;]|$)/i,
    /(?:company|vendor|merchant|supplier)\s+(?:named|called)?\s+(.+?)(?:\s+(?:last|this|past|in|during|over)\b|[?.!,;]|$)/i
  ];

  for (const pattern of entityPatterns) {
    const match = normalized.match(pattern);

    if (match?.[1]) {
      return match[1].replace(/\b(last|this|past|during|over|in)\b.*$/i, '').trim();
    }
  }

  return null;
}

function detectGroupBy(query) {
  const normalized = normalizeQuery(query).toLowerCase();

  if (/\bby\s+vendor\b|\bvendors?\b|which\s+vendor|top\s+vendor/.test(normalized)) {
    return 'vendor';
  }

  if (/\bby\s+category\b|\bcategories\b|which\s+category|top\s+category|most\s+category/.test(normalized)) {
    return 'category';
  }

  if (/\bby\s+day\b|\bdaily\b/.test(normalized)) {
    return 'day';
  }

  if (/\bby\s+month\b|\bmonthly\b/.test(normalized)) {
    return 'month';
  }

  return null;
}

function detectMetrics(query) {
  const normalized = normalizeQuery(query).toLowerCase();
  const metrics = new Set(['total_amount', 'transaction_count']);

  if (/(average|avg)/.test(normalized)) {
    metrics.add('average_amount');
  }

  if (/(highest|top|largest|biggest|breakdown|split|distribution)/.test(normalized)) {
    metrics.add('breakdown');
  }

  if (/(burn\s*rate|run\s*rate)/.test(normalized)) {
    metrics.add('burn_rate');
  }

  if (/(which\s+category|top\s+category|most\s+category)/.test(normalized)) {
    metrics.add('top_category_spend');
    metrics.add('breakdown');
  }

  return [...metrics];
}

function buildDeterministicPlan(query) {
  const normalizedQuery = normalizeQuery(query);
  const dateRange = detectDateRange(normalizedQuery);
  const comparisonRange = detectComparisonRange(normalizedQuery);
  const transactionType = detectTransactionType(normalizedQuery);
  const metricLabel = detectMetricLabel(normalizedQuery);
  const entity = extractEntityCandidate(normalizedQuery);
  const groupBy = detectGroupBy(normalizedQuery);
  const intent = detectIntent(normalizedQuery);
  const metrics = detectMetrics(normalizedQuery);
  const isBurnRateQuery = metrics.includes('burn_rate');
  const searchQuery = entity || normalizedQuery;
  const resolvedTransactionType = isBurnRateQuery ? 'expense' : (metricLabel.transaction_type || transactionType);
  const resolvedMetricLabel = isBurnRateQuery ? 'burn_rate' : metricLabel.metric_label;
  const resolvedGroupBy = groupBy || (metrics.includes('top_category_spend') ? 'category' : null);

  return {
    intent,
    vendor: entity,
    category: null,
    transaction_type: resolvedTransactionType,
    metric_label: resolvedMetricLabel,
    start_date: dateRange.start_date,
    end_date: dateRange.end_date,
    time_label: dateRange.label,
    comparison: comparisonRange,
    group_by: resolvedGroupBy,
    metrics,
    search_query: searchQuery,
    confidence: entity || dateRange.label || resolvedMetricLabel || resolvedTransactionType ? 0.7 : 0.4,
    source: 'rules',
    normalized_query: normalizedQuery
  };
}

function shouldPreferDeterministicSummary(plan) {
  const metrics = Array.isArray(plan?.metrics) ? plan.metrics : [];
  const hasSpecialMetric = metrics.some((metric) => ['burn_rate', 'top_category_spend', 'average_amount'].includes(metric));

  return Boolean(
    plan?.transaction_type ||
    plan?.metric_label ||
    plan?.start_date ||
    plan?.end_date ||
    plan?.vendor ||
    plan?.category ||
    hasSpecialMetric
  );
}

function parseJsonCandidate(text) {
  if (typeof text !== 'string') {
    return null;
  }

  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');

    if (start < 0 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function normalizePlan(plan, fallbackPlan, query) {
  const merged = {
    ...fallbackPlan,
    ...(plan && typeof plan === 'object' ? plan : {})
  };

  const intent = String(merged.intent || fallbackPlan.intent || 'rag').toLowerCase();
  const normalizedIntent = ['summary', 'trend', 'comparison', 'breakdown', 'lookup', 'search', 'rag'].includes(intent)
    ? intent
    : fallbackPlan.intent;
  const startDate = merged.start_date || merged.startDate || fallbackPlan.start_date || null;
  const endDate = merged.end_date || merged.endDate || fallbackPlan.end_date || null;
  const transactionType = merged.transaction_type || merged.transactionType || fallbackPlan.transaction_type || null;
  const metricLabel = merged.metric_label || fallbackPlan.metric_label || null;
  const vendor = typeof merged.vendor === 'string' && merged.vendor.trim() ? merged.vendor.trim() : fallbackPlan.vendor;
  const category = typeof merged.category === 'string' && merged.category.trim() ? merged.category.trim() : fallbackPlan.category;
  const groupBy = typeof merged.group_by === 'string' ? merged.group_by.trim().toLowerCase() : fallbackPlan.group_by;
  const comparison = merged.comparison && typeof merged.comparison === 'object'
    ? merged.comparison
    : fallbackPlan.comparison;
  const searchQuery = typeof merged.search_query === 'string' && merged.search_query.trim()
    ? merged.search_query.trim()
    : fallbackPlan.search_query;

  return {
    intent: normalizedIntent,
    vendor,
    category,
    transaction_type: transactionType,
    metric_label: metricLabel,
    start_date: startDate,
    end_date: endDate,
    time_label: typeof merged.time_label === 'string' && merged.time_label.trim() ? merged.time_label.trim() : fallbackPlan.time_label,
    comparison,
    group_by: ['vendor', 'category', 'day', 'month'].includes(groupBy) ? groupBy : fallbackPlan.group_by,
    metrics: Array.isArray(merged.metrics) && merged.metrics.length > 0 ? merged.metrics : fallbackPlan.metrics,
    search_query: searchQuery,
    confidence: Number.isFinite(Number(merged.confidence)) ? Number(merged.confidence) : fallbackPlan.confidence,
    source: merged.source === 'llm' ? 'llm' : fallbackPlan.source,
    normalized_query: fallbackPlan.normalized_query || normalizeQuery(query)
  };
}

async function tryPythonPlan(query) {
  if (!env.pythonAiUrl) {
    return null;
  }

  const prompt = [
    'You are a finance query planner for a PostgreSQL-backed expense system.',
    'Convert the user question into strict JSON only.',
    'Allowed intent values: summary, trend, comparison, breakdown, lookup, search, rag.',
    'Allowed group_by values: vendor, category, day, month, null.',
    'Allowed transaction_type values: expense, income, salary, null.',
    'Return only JSON with these keys: intent, vendor, category, transaction_type, start_date, end_date, time_label, group_by, metrics, search_query, confidence.',
    'Use ISO dates in YYYY-MM-DD format when possible.',
    'If the user asks about expenses, choose intent summary and transaction_type expense.',
    'If the user asks for a list of records, choose intent lookup.',
    'If the user asks for semantic finding without an exact entity, choose intent search.',
    'If the user asks about trends or period-over-period changes, choose intent trend or comparison.',
    'If the user asks a broad explanation, choose intent rag.',
    '',
    `Question: ${query}`,
    'JSON:'
  ].join('\n');

  try {
    const response = await callPythonGeneration({
      prompt,
      query,
      context: '',
      sources: []
    });

    return parseJsonCandidate(response?.answer) || parseJsonCandidate(response?.raw_model_answer) || null;
  } catch {
    return null;
  }
}

function composeSummaryAnswer(plan, summary) {
  const vendorLabel = plan.vendor ? `for ${plan.vendor}` : 'for the requested scope';
  const timeLabel = plan.time_label ? ` ${plan.time_label}` : '';
  const totalAmount = Number(summary.totals.total_amount || 0).toFixed(2);
  const transactionCount = summary.totals.transaction_count || 0;
  const averageAmount = Number(summary.totals.average_amount || 0).toFixed(2);
  const metrics = Array.isArray(plan.metrics) ? plan.metrics : [];

  const parts = [
    `Found ${transactionCount} ${plan.transaction_type || 'transaction'} record(s) ${vendorLabel}${timeLabel}.`,
    `Total amount is $${totalAmount}.`,
    `Average transaction amount is $${averageAmount}.`
  ];

  if (metrics.includes('burn_rate') && plan.start_date && plan.end_date) {
    const dayCount = differenceInDays(plan.start_date, plan.end_date);
    const monthlyRunRate = dayCount > 0 ? (Number(totalAmount) / dayCount) * 30 : 0;
    parts.push(`Estimated burn rate is $${monthlyRunRate.toFixed(2)} per 30-day month.`);
  }

  if (metrics.includes('top_category_spend') && summary.breakdown?.length > 0) {
    const topCategory = summary.breakdown[0];
    parts.push(`Top spend category is ${topCategory.group_value} at $${Number(topCategory.total_amount || 0).toFixed(2)}.`);
  }

  if (summary.breakdown?.length > 0) {
    const topBreakdown = summary.breakdown.slice(0, 3).map((item) => `${item.group_value}: $${Number(item.total_amount || 0).toFixed(2)}`);
    parts.push(`Top ${plan.group_by || 'category'} breakdown: ${topBreakdown.join(', ')}.`);
  }

  return parts.join(' ');
}

function composeTrendAnswer(plan, currentSummary, previousSummary) {
  const currentTotal = Number(currentSummary.totals.total_amount || 0);
  const previousTotal = Number(previousSummary?.totals?.total_amount || 0);
  const delta = currentTotal - previousTotal;
  const percentageChange = previousTotal === 0 ? null : Number(((delta / previousTotal) * 100).toFixed(2));
  const trendLabel = plan.comparison?.label || plan.time_label || 'trend period';

  const pieces = [
    `${plan.metric_label || 'Amount'} for ${trendLabel} is $${currentTotal.toFixed(2)}.`,
    previousSummary
      ? `Previous period was $${previousTotal.toFixed(2)}, a change of $${delta.toFixed(2)}${percentageChange === null ? '' : ` (${percentageChange >= 0 ? '+' : ''}${percentageChange}%)`}.`
      : null
  ].filter(Boolean);

  if (currentSummary.breakdown?.length > 0) {
    const topItems = currentSummary.breakdown.slice(0, 3).map((item) => `${item.group_value}: $${Number(item.total_amount || 0).toFixed(2)}`);
    pieces.push(`Top ${plan.group_by || 'category'} buckets are ${topItems.join(', ')}.`);
  }

  return {
    answer: pieces.join(' '),
    current_total: Number(currentTotal.toFixed(2)),
    previous_total: Number(previousTotal.toFixed(2)),
    delta: Number(delta.toFixed(2)),
    percentage_change: percentageChange,
    trend_label: trendLabel
  };
}

function composeComparisonAnswer(plan, currentSummary, previousSummary) {
  const currentTotal = Number(currentSummary.totals.total_amount || 0);
  const previousTotal = Number(previousSummary?.totals?.total_amount || 0);
  const delta = currentTotal - previousTotal;
  const percentageChange = previousTotal === 0 ? null : Number(((delta / previousTotal) * 100).toFixed(2));
  const label = plan.comparison?.label || 'comparison';

  return {
    answer: [
      `For ${label}, the current period total is $${currentTotal.toFixed(2)}.`,
      `The comparison period total is $${previousTotal.toFixed(2)}.`,
      `Change is $${delta.toFixed(2)}${percentageChange === null ? '' : ` (${percentageChange >= 0 ? '+' : ''}${percentageChange}%)`}.`
    ].join(' '),
    current_total: Number(currentTotal.toFixed(2)),
    previous_total: Number(previousTotal.toFixed(2)),
    delta: Number(delta.toFixed(2)),
    percentage_change: percentageChange,
    comparison_label: label
  };
}

function buildSummaryCitations(summary) {
  return (summary.sample_transactions || []).map((item) => ({
    transaction_id: item.id,
    document_id: item.document?.id || null,
    vendor: item.vendor,
    amount: Number(item.amount || 0),
    category: item.category,
    transaction_date: item.transaction_date,
    similarity_score: null
  }));
}

function computeDerivedMetrics(summary, plan) {
  const totals = summary?.totals || {};
  const totalAmount = Number(totals.total_amount || 0);
  const start = plan?.start_date ? new Date(plan.start_date) : null;
  const end = plan?.end_date ? new Date(plan.end_date) : null;
  const days = start && end ? differenceInDays(start, end) : null;

  const derived = {};

  if (plan?.metrics && plan.metrics.includes('burn_rate') && days) {
    const monthlyRunRate = days > 0 ? (totalAmount / days) * 30 : 0;
    derived.burn_rate_monthly = Number(monthlyRunRate.toFixed(2));
    derived.burn_rate_period = Number((totalAmount / days).toFixed(2));
  }

  // Detect quarter income: if the plan asks for income and the period covers roughly a quarter
  if (plan?.transaction_type === 'income' && plan?.time_label && /quarter/.test(plan.time_label)) {
    derived.quarter_income = Number(totalAmount.toFixed(2));
  }

  return derived;
}

async function executeSummaryPlan(organizationId, plan, includePendingReview) {
  const resolvedGroupBy = plan.group_by || (Array.isArray(plan.metrics) && plan.metrics.includes('top_category_spend') ? 'category' : null);

  const summary = await transactionsRepository.summarizeTransactions({
    organizationId,
    vendor: plan.vendor,
    category: plan.category,
    transactionType: plan.transaction_type,
    startDate: plan.start_date,
    endDate: plan.end_date,
    includePendingReview,
    groupBy: resolvedGroupBy,
    limit: env.ragMaxEvidenceItems
  });

  const answer = composeSummaryAnswer({ ...plan, group_by: resolvedGroupBy }, summary);

  const derived_metrics = computeDerivedMetrics(summary, { ...plan, group_by: resolvedGroupBy });

  return {
    mode: 'summary',
    answer,
    confidence: plan.confidence,
    citations: buildSummaryCitations(summary),
    summary,
    derived_metrics,
    plan
  };
}

async function executeTrendPlan(organizationId, plan, includePendingReview) {
  const currentRange = plan.comparison?.current || {
    start_date: plan.start_date,
    end_date: plan.end_date,
    label: plan.time_label
  };
  const previousRange = plan.comparison?.previous || null;

  const [currentSummary, previousSummary] = await Promise.all([
    transactionsRepository.summarizeTransactions({
      organizationId,
      vendor: plan.vendor,
      category: plan.category,
      transactionType: plan.transaction_type,
      startDate: currentRange.start_date,
      endDate: currentRange.end_date,
      includePendingReview,
      groupBy: plan.group_by || 'month',
      limit: env.ragMaxEvidenceItems
    }),
    previousRange
      ? transactionsRepository.summarizeTransactions({
          organizationId,
          vendor: plan.vendor,
          category: plan.category,
          transactionType: plan.transaction_type,
          startDate: previousRange.start_date,
          endDate: previousRange.end_date,
          includePendingReview,
          groupBy: plan.group_by || 'month',
          limit: env.ragMaxEvidenceItems
        })
      : Promise.resolve(null)
  ]);

  const trend = composeTrendAnswer(plan, currentSummary, previousSummary);

  return {
    mode: 'trend',
    answer: trend.answer,
    confidence: plan.confidence,
    citations: buildSummaryCitations(currentSummary),
    current: currentSummary,
    previous: previousSummary,
    delta: trend.delta,
    percentage_change: trend.percentage_change,
    trend_label: trend.trend_label,
    plan
  };
}

async function executeComparisonPlan(organizationId, plan, includePendingReview) {
  const currentRange = plan.comparison?.current || {
    start_date: plan.start_date,
    end_date: plan.end_date,
    label: plan.time_label
  };
  const previousRange = plan.comparison?.previous || null;

  const [currentSummary, previousSummary] = await Promise.all([
    transactionsRepository.summarizeTransactions({
      organizationId,
      vendor: plan.vendor,
      category: plan.category,
      transactionType: plan.transaction_type,
      startDate: currentRange.start_date,
      endDate: currentRange.end_date,
      includePendingReview,
      groupBy: plan.group_by || 'category',
      limit: env.ragMaxEvidenceItems
    }),
    previousRange
      ? transactionsRepository.summarizeTransactions({
          organizationId,
          vendor: plan.vendor,
          category: plan.category,
          transactionType: plan.transaction_type,
          startDate: previousRange.start_date,
          endDate: previousRange.end_date,
          includePendingReview,
          groupBy: plan.group_by || 'category',
          limit: env.ragMaxEvidenceItems
        })
      : Promise.resolve(null)
  ]);

  const comparison = composeComparisonAnswer(plan, currentSummary, previousSummary);

  return {
    mode: 'comparison',
    answer: comparison.answer,
    confidence: plan.confidence,
    citations: buildSummaryCitations(currentSummary),
    current: currentSummary,
    previous: previousSummary,
    delta: comparison.delta,
    percentage_change: comparison.percentage_change,
    comparison_label: comparison.comparison_label,
    plan
  };
}

async function executeSearchOrRagPlan(organizationId, plan, { topK, minSimilarity, minLexicalScore, includePendingReview, retrievalMode, answerMode }) {
  if (shouldPreferDeterministicSummary(plan)) {
    const summaryCandidate = await executeSummaryPlan(organizationId, {
      ...plan,
      intent: 'summary'
    }, includePendingReview);

    const summaryCount = Number(summaryCandidate?.summary?.totals?.transaction_count || 0);

    if (summaryCount > 0) {
      return {
        ...summaryCandidate,
        mode: 'summary_primary',
        retrieval_fallback_used: false
      };
    }
  }

  const searchResult = await semanticSearchService.semanticSearch({
    organizationId,
    query: plan.search_query || plan.normalized_query,
    topK,
    minSimilarity,
    minLexicalScore,
    includePendingReview,
    retrievalMode,
    vendor: plan.vendor,
    category: plan.category,
    transactionType: plan.transaction_type,
    startDate: plan.start_date,
    endDate: plan.end_date
  });

  const answerPayload = await ragService.composeAnswer({
    query: searchResult.query,
    items: searchResult.items,
    answerMode
  });

  return {
    mode: answerPayload.generation_mode === 'deterministic' ? 'rag_deterministic' : 'rag',
    search: searchResult,
    retrieval_fallback_used: true,
    ...answerPayload,
    plan
  };
}

async function executeLookupPlan(organizationId, plan, { topK, minSimilarity, minLexicalScore, includePendingReview, retrievalMode }) {
  const searchResult = await semanticSearchService.semanticSearch({
    organizationId,
    query: plan.search_query || plan.normalized_query,
    topK,
    minSimilarity,
    minLexicalScore,
    includePendingReview,
    retrievalMode,
    vendor: plan.vendor,
    category: plan.category,
    transactionType: plan.transaction_type,
    startDate: plan.start_date,
    endDate: plan.end_date
  });

  const deterministic = ragService.composeDeterministicAnswer({
    query: searchResult.query,
    items: searchResult.items
  });

  return {
    mode: 'lookup',
    search: searchResult,
    ...deterministic,
    plan
  };
}

async function planNaturalLanguageQuery({ organizationId, query, topK, minSimilarity, minLexicalScore, includePendingReview, retrievalMode, answerMode }) {
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    throw new Error('query is required');
  }

  if (normalizedQuery.length > env.ragMaxQueryChars) {
    throw new Error(`query must be at most ${env.ragMaxQueryChars} characters`);
  }

  const fallbackPlan = buildDeterministicPlan(normalizedQuery);
  const llmPlan = await tryPythonPlan(normalizedQuery);
  const plan = normalizePlan(llmPlan, fallbackPlan, normalizedQuery);

  if (plan.intent === 'summary') {
    return executeSummaryPlan(organizationId, plan, includePendingReview);
  }

  if (plan.intent === 'trend') {
    return executeTrendPlan(organizationId, plan, includePendingReview);
  }

  if (plan.intent === 'comparison') {
    return executeComparisonPlan(organizationId, plan, includePendingReview);
  }

  if (plan.intent === 'breakdown') {
    return executeSummaryPlan(organizationId, {
      ...plan,
      group_by: plan.group_by || 'category'
    }, includePendingReview);
  }

  if (plan.intent === 'lookup') {
    return executeLookupPlan(organizationId, plan, {
      topK,
      minSimilarity,
      minLexicalScore,
      includePendingReview,
      retrievalMode
    });
  }

  return executeSearchOrRagPlan(organizationId, plan, {
    topK,
    minSimilarity,
    minLexicalScore,
    includePendingReview,
    retrievalMode,
    answerMode
  });
}

module.exports = {
  buildDeterministicPlan,
  composeComparisonAnswer,
  composeTrendAnswer,
  composeSummaryAnswer,
  detectDateRange,
  detectGroupBy,
  detectIntent,
  detectMetrics,
  detectComparisonRange,
  detectMetricLabel,
  detectTransactionType,
  executeSearchOrRagPlan,
  executeLookupPlan,
  executeComparisonPlan,
  executeTrendPlan,
  executeSummaryPlan,
  extractEntityCandidate,
  normalizePlan,
  parseJsonCandidate,
  planNaturalLanguageQuery,
  shouldPreferDeterministicSummary,
  tryPythonPlan
};
