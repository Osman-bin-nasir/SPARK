const test = require('node:test');
const assert = require('node:assert/strict');

const nlpQueryService = require('../src/services/nlp-query.service');

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