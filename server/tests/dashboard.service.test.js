const test = require('node:test');
const assert = require('node:assert/strict');

const dashboardRepository = require('../src/db/dashboard.repository');
const dashboardService = require('../src/services/dashboard.service');

function createRepositoryStub(overrides = {}) {
  return {
    getFinanceSettings: async () => null,
    listCategoryBudgets: async () => [],
    listMonthlyOutflowTotals: async () => [],
    listCurrentMonthCategorySpend: async () => [],
    getCurrentMonthRevenue: async () => 0,
    listTopVendorsBySpend: async () => [],
    listHistoricalCategorySpend: async () => [],
    getEarliestTransactionDate: async () => null,
    getCashFlowTotalsSince: async () => {
      throw new Error('getCashFlowTotalsSince should not be called for this test');
    },
    ...overrides
  };
}

async function withRepositoryStub(stub, fn) {
  const originalEntries = Object.fromEntries(
    Object.keys(stub).map((key) => [key, dashboardRepository[key]])
  );

  Object.assign(dashboardRepository, stub);

  try {
    await fn();
  } finally {
    Object.assign(dashboardRepository, originalEntries);
  }
}

async function withMockedDate(isoString, fn) {
  const RealDate = Date;

  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(isoString);
        return;
      }

      super(...args);
    }

    static now() {
      return new RealDate(isoString).getTime();
    }
  }

  global.Date = MockDate;

  try {
    await fn();
  } finally {
    global.Date = RealDate;
  }
}

test('dashboard snapshot defaults cash on hand to transaction totals when finance setup is missing', async () => {
  let cashFlowRequest = null;

  await withRepositoryStub(createRepositoryStub({
    getEarliestTransactionDate: async () => '2026-04-01',
    getCashFlowTotalsSince: async (params) => {
      cashFlowRequest = params;
      return {
        income_total: 1200,
        outflow_total: 450
      };
    }
  }), async () => {
    const snapshot = await dashboardService.getDashboardSnapshot({
      organization: { id: 'org-1' },
      query: { months: 6 }
    });

    assert.equal(snapshot.dashboard_state, 'ready');
    assert.equal(snapshot.metrics.cash_on_hand, 750);
    assert.equal(cashFlowRequest.organizationId, 'org-1');
    assert.equal(cashFlowRequest.startDate, '2026-04-01');
  });
});

test('dashboard snapshot returns zero cash on hand when there is no setup and no transaction history', async () => {
  await withRepositoryStub(createRepositoryStub(), async () => {
    const snapshot = await dashboardService.getDashboardSnapshot({
      organization: { id: 'org-2' },
      query: { months: 6 }
    });

    assert.equal(snapshot.dashboard_state, 'no_history');
    assert.equal(snapshot.metrics.cash_on_hand, 0);
  });
});

test('dashboard snapshot projects monthly burn from current month when completed burn history is not available', async () => {
  await withMockedDate('2026-04-20T12:00:00.000Z', async () => {
    await withRepositoryStub(createRepositoryStub({
      getEarliestTransactionDate: async () => '2026-04-01',
      getCashFlowTotalsSince: async () => ({
        income_total: 9000,
        outflow_total: 0
      }),
      listCurrentMonthCategorySpend: async () => ([
        { category: 'Payroll', amount: 1000 }
      ])
    }), async () => {
      const snapshot = await dashboardService.getDashboardSnapshot({
        organization: { id: 'org-3' },
        query: { months: 6 }
      });

      assert.equal(snapshot.dashboard_state, 'ready');
      assert.equal(snapshot.metrics.cash_on_hand, 9000);
      assert.equal(snapshot.metrics.monthly_burn, 1500);
      assert.equal(snapshot.metrics.monthly_burn_source, 'projected_current_month');
      assert.equal(snapshot.metrics.projected_monthly_burn, 1500);
      assert.equal(snapshot.metrics.runway_months, 6);
      assert.equal(snapshot.metrics.estimated_depletion_month, '2026-10');
      assert.equal(snapshot.config.history_ready_for_burn, false);
    });
  });
});
