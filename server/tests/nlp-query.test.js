const test = require('node:test');
const assert = require('node:assert/strict');

const nlpQueryService = require('../src/services/nlp-query.service');
const transactionsRepository = require('../src/db/transactions.repository');
const semanticSearchService = require('../src/services/semantic-search.service');

test('deterministic NLP plan recognizes company expense summary queries', () => {
  const plan = nlpQueryService.buildDeterministicPlan('what were the expenses of Acme Inc last month');

  assert.equal(plan.intent, 'summary');
  assert.equal(plan.transaction_type, 'expense');
  assert.equal(plan.vendor, 'Acme Inc');
  assert.equal(plan.time_label, 'last month');
  assert.match(plan.start_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(plan.end_date, /^\d{4}-\d{2}-\d{2}$/);
});

test('deterministic NLP plan recognizes trend and comparison questions', () => {
  const trendPlan = nlpQueryService.buildDeterministicPlan('show me the expense trend for Acme this quarter');
  const comparisonPlan = nlpQueryService.buildDeterministicPlan('compare Acme expenses this quarter vs last quarter');

  assert.equal(trendPlan.intent, 'trend');
  assert.equal(trendPlan.transaction_type, 'expense');
  assert.equal(comparisonPlan.intent, 'comparison');
  assert.equal(comparisonPlan.transaction_type, 'expense');
  assert.ok(comparisonPlan.comparison);
  assert.equal(comparisonPlan.comparison.previous.label, 'last quarter');
});

test('deterministic NLP plan maps revenue language to income transactions', () => {
  const plan = nlpQueryService.buildDeterministicPlan('what was last quarter revenue for Acme');

  assert.equal(plan.transaction_type, 'income');
  assert.equal(plan.metric_label, 'revenue');
});

test('deterministic NLP plan maps quarter income questions to summary intent', () => {
  const plan = nlpQueryService.buildDeterministicPlan('this quarter income');

  assert.equal(plan.intent, 'summary');
  assert.equal(plan.transaction_type, 'income');
  assert.equal(plan.time_label, 'this quarter');
});

test('deterministic NLP plan maps top category spend questions to category breakdown', () => {
  const plan = nlpQueryService.buildDeterministicPlan('which category did we spend the most this month');

  assert.equal(plan.intent, 'breakdown');
  assert.equal(plan.transaction_type, 'expense');
  assert.equal(plan.group_by, 'category');
  assert.ok(plan.metrics.includes('top_category_spend'));
});

test('deterministic NLP plan maps burn rate to expense metric', () => {
  const plan = nlpQueryService.buildDeterministicPlan('what is this month burn rate');

  assert.equal(plan.intent, 'summary');
  assert.equal(plan.transaction_type, 'expense');
  assert.equal(plan.metric_label, 'burn_rate');
  assert.ok(plan.metrics.includes('burn_rate'));
});

test('executeSummaryPlan computes burn rate and quarter income derived metrics', async () => {
  const originalSummarize = transactionsRepository.summarizeTransactions;

  transactionsRepository.summarizeTransactions = async () => ({
    totals: {
      transaction_count: 30,
      total_amount: 30000,
      average_amount: 1000
    },
    breakdown: [],
    sample_transactions: []
  });

  try {
    const result = await nlpQueryService.executeSummaryPlan('org-1', {
      normalized_query: 'this quarter income',
      search_query: 'this quarter income',
      vendor: null,
      category: null,
      transaction_type: 'income',
      metric_label: 'revenue',
      start_date: '2026-01-01',
      end_date: '2026-03-31',
      time_label: 'this quarter',
      metrics: ['total_amount', 'transaction_count'],
      confidence: 0.7
    }, false);

    // quarter income should equal total_amount
    assert.equal(result.derived_metrics.quarter_income, 30000.00);

    // No burn_rate metric present for income query
    assert.equal(typeof result.derived_metrics.burn_rate_monthly === 'undefined' || result.derived_metrics.burn_rate_monthly === null, true);

    // Now test burn rate for an expense period (30 days)
    const burnResult = await nlpQueryService.executeSummaryPlan('org-1', {
      normalized_query: 'this month burn rate',
      search_query: 'this month burn rate',
      vendor: null,
      category: null,
      transaction_type: 'expense',
      metric_label: 'burn_rate',
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      time_label: 'this month',
      metrics: ['burn_rate'],
      confidence: 0.7
    }, false);

    // total_amount 30000 over 30 days -> monthly run rate should be 30000.00
    assert.equal(burnResult.derived_metrics.burn_rate_monthly, 30000.00);
    assert.equal(burnResult.derived_metrics.burn_rate_period, 1000.00);
  } finally {
    transactionsRepository.summarizeTransactions = originalSummarize;
  }
});

test('deterministic NLP plan recognizes lookup-style record requests', () => {
  const plan = nlpQueryService.buildDeterministicPlan('show me the transactions for Acme last month');

  assert.equal(plan.intent, 'lookup');
  assert.equal(plan.vendor, 'Acme');
  assert.equal(plan.transaction_type, null);
});

test('deterministic NLP plan recognizes search-style requests', () => {
  const plan = nlpQueryService.buildDeterministicPlan('show me transactions for Acme');

  assert.equal(plan.intent, 'search');
  assert.equal(plan.vendor, 'Acme');
  assert.equal(plan.search_query, 'Acme');
});

test('summary answer composer includes totals and breakdown', () => {
  const answer = nlpQueryService.composeSummaryAnswer(
    {
      vendor: 'Acme Inc',
      transaction_type: 'expense',
      time_label: 'last month',
      group_by: 'category'
    },
    {
      totals: {
        transaction_count: 4,
        total_amount: 1250,
        average_amount: 312.5
      },
      breakdown: [
        { group_value: 'Software', total_amount: 900 },
        { group_value: 'Meals', total_amount: 350 }
      ]
    }
  );

  assert.match(answer, /Acme Inc/);
  assert.match(answer, /last month/);
  assert.match(answer, /\$1250\.00/);
  assert.match(answer, /Software/);
});

test('executeSearchOrRagPlan prefers deterministic summary before retrieval', async () => {
  const originalSummarize = transactionsRepository.summarizeTransactions;
  const originalSemanticSearch = semanticSearchService.semanticSearch;

  transactionsRepository.summarizeTransactions = async () => ({
    totals: {
      transaction_count: 2,
      total_amount: 640,
      average_amount: 320
    },
    breakdown: [{ group_value: 'Ops', total_amount: 640 }],
    sample_transactions: []
  });
  semanticSearchService.semanticSearch = async () => {
    throw new Error('semantic search should not be called when deterministic summary is sufficient');
  };

  try {
    const result = await nlpQueryService.executeSearchOrRagPlan('org-1', {
      normalized_query: 'this quarter income',
      search_query: 'this quarter income',
      vendor: null,
      category: null,
      transaction_type: 'income',
      metric_label: 'revenue',
      start_date: '2026-01-01',
      end_date: '2026-03-31',
      time_label: 'this quarter',
      metrics: ['total_amount', 'transaction_count'],
      confidence: 0.7
    }, {
      topK: 5,
      minSimilarity: 0.6,
      minLexicalScore: 0,
      includePendingReview: false,
      retrievalMode: 'hybrid',
      answerMode: 'deterministic'
    });

    assert.equal(result.mode, 'summary_primary');
    assert.equal(result.retrieval_fallback_used, false);
    assert.equal(result.summary.totals.transaction_count, 2);
  } finally {
    transactionsRepository.summarizeTransactions = originalSummarize;
    semanticSearchService.semanticSearch = originalSemanticSearch;
  }
});