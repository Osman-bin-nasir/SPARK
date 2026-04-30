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
    listCategorySpendByRange: async () => [],
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

test('dashboard snapshot defaults expense breakdown to all-time data', async () => {
  let categorySpendRequest = null;

  await withMockedDate('2026-06-20T12:00:00.000Z', async () => {
    await withRepositoryStub(createRepositoryStub({
      getEarliestTransactionDate: async () => '2026-04-01',
      getCashFlowTotalsSince: async () => ({
        income_total: 12000,
        outflow_total: 2000
      }),
      listCategorySpendByRange: async (params) => {
        categorySpendRequest = params;
        return [
          { category: 'Software', amount: 3000 },
          { category: 'Payroll', amount: 9000 }
        ];
      }
    }), async () => {
      const snapshot = await dashboardService.getDashboardSnapshot({
        organization: { id: 'org-all-time' },
        query: { months: 6 }
      });

      assert.equal(categorySpendRequest.organizationId, 'org-all-time');
      assert.equal(categorySpendRequest.startDate, null);
      assert.equal(categorySpendRequest.endDate, '2026-07-01');
      assert.deepEqual(snapshot.category_breakdown, [
        { category: 'Payroll', amount: 9000 },
        { category: 'Software', amount: 3000 }
      ]);
    });
  });
});

test('dashboard snapshot uses the available completed burn months when fewer than three exist', async () => {
  await withMockedDate('2026-04-20T12:00:00.000Z', async () => {
    await withRepositoryStub(createRepositoryStub({
      getEarliestTransactionDate: async () => '2026-03-15',
      getCashFlowTotalsSince: async () => ({
        income_total: 6000,
        outflow_total: 0
      }),
      listMonthlyOutflowTotals: async ({ endDate }) => (
        endDate === '2026-04-01'
          ? [{ month: '2026-03', total: 1200 }]
          : []
      ),
      listCurrentMonthCategorySpend: async () => ([
        { category: 'Payroll', amount: 1000 }
      ])
    }), async () => {
      const snapshot = await dashboardService.getDashboardSnapshot({
        organization: { id: 'org-3' },
        query: { months: 6 }
      });

      assert.equal(snapshot.dashboard_state, 'ready');
      assert.equal(snapshot.metrics.cash_on_hand, 6000);
      assert.equal(snapshot.metrics.monthly_burn, 1200);
      assert.equal(snapshot.metrics.monthly_burn_source, 'historical');
      assert.equal(snapshot.metrics.historical_month_count, 1);
      assert.equal(snapshot.metrics.projected_monthly_burn, null);
      assert.equal(snapshot.metrics.runway_months, 5);
      assert.equal(snapshot.metrics.estimated_depletion_month, '2026-09');
      assert.equal(snapshot.config.history_ready_for_burn, true);
      assert.equal(snapshot.config.history_ready_for_spikes, false);
    });
  });
});

test('dashboard snapshot applies the selected this-month breakdown range', async () => {
  let categorySpendRequest = null;

  await withMockedDate('2026-06-20T12:00:00.000Z', async () => {
    await withRepositoryStub(createRepositoryStub({
      getEarliestTransactionDate: async () => '2026-03-15',
      getCashFlowTotalsSince: async () => ({
        income_total: 6000,
        outflow_total: 0
      }),
      listCurrentMonthCategorySpend: async () => ([
        { category: 'Payroll', amount: 1000 }
      ]),
      listCategorySpendByRange: async (params) => {
        categorySpendRequest = params;
        return [
          { category: 'Payroll', amount: 1000 }
        ];
      }
    }), async () => {
      const snapshot = await dashboardService.getDashboardSnapshot({
        organization: { id: 'org-this-month' },
        query: { months: 6, category_window: 'this_month' }
      });

      assert.equal(categorySpendRequest.organizationId, 'org-this-month');
      assert.equal(categorySpendRequest.startDate, '2026-06-01');
      assert.equal(categorySpendRequest.endDate, '2026-07-01');
      assert.equal(snapshot.metrics.current_month_expense_total, 1000);
      assert.deepEqual(snapshot.category_breakdown, [
        { category: 'Payroll', amount: 1000 }
      ]);
    });
  });
});

test('dashboard snapshot ignores the incomplete current month when no completed burn months exist yet', async () => {
  await withMockedDate('2026-04-20T12:00:00.000Z', async () => {
    await withRepositoryStub(createRepositoryStub({
      getEarliestTransactionDate: async () => '2026-04-05',
      getCashFlowTotalsSince: async () => ({
        income_total: 5000,
        outflow_total: 0
      }),
      listCurrentMonthCategorySpend: async () => ([
        { category: 'Payroll', amount: 1000 }
      ])
    }), async () => {
      const snapshot = await dashboardService.getDashboardSnapshot({
        organization: { id: 'org-4' },
        query: { months: 6 }
      });

      assert.equal(snapshot.dashboard_state, 'ready');
      assert.equal(snapshot.metrics.cash_on_hand, 5000);
      assert.equal(snapshot.metrics.monthly_burn, null);
      assert.equal(snapshot.metrics.monthly_burn_source, 'pending');
      assert.equal(snapshot.metrics.historical_month_count, 0);
      assert.equal(snapshot.metrics.projected_monthly_burn, null);
      assert.equal(snapshot.metrics.runway_months, null);
      assert.equal(snapshot.metrics.estimated_depletion_month, null);
      assert.equal(snapshot.config.history_ready_for_burn, false);
    });
  });
});

test('dashboard snapshot includes zero-spend months in the available burn average', async () => {
  await withMockedDate('2026-06-20T12:00:00.000Z', async () => {
    await withRepositoryStub(createRepositoryStub({
      getEarliestTransactionDate: async () => '2026-04-10',
      getCashFlowTotalsSince: async () => ({
        income_total: 9000,
        outflow_total: 0
      }),
      listMonthlyOutflowTotals: async ({ endDate }) => (
        endDate === '2026-06-01'
          ? [{ month: '2026-04', total: 900 }]
          : []
      ),
      listCurrentMonthCategorySpend: async () => ([
        { category: 'Payroll', amount: 4000 }
      ])
    }), async () => {
      const snapshot = await dashboardService.getDashboardSnapshot({
        organization: { id: 'org-5' },
        query: { months: 6 }
      });

      assert.equal(snapshot.metrics.monthly_burn, 450);
      assert.equal(snapshot.metrics.historical_month_count, 2);
      assert.equal(snapshot.metrics.runway_months, 20);
      assert.equal(snapshot.config.history_ready_for_burn, true);
      assert.equal(snapshot.config.history_ready_for_spikes, false);
    });
  });
});

test('dashboard snapshot leaves runway open-ended when historical burn averages to zero', async () => {
  await withMockedDate('2026-05-20T12:00:00.000Z', async () => {
    await withRepositoryStub(createRepositoryStub({
      getEarliestTransactionDate: async () => '2026-03-01',
      getCashFlowTotalsSince: async () => ({
        income_total: 3000,
        outflow_total: 0
      })
    }), async () => {
      const snapshot = await dashboardService.getDashboardSnapshot({
        organization: { id: 'org-6' },
        query: { months: 6 }
      });

      assert.equal(snapshot.metrics.cash_on_hand, 3000);
      assert.equal(snapshot.metrics.monthly_burn, 0);
      assert.equal(snapshot.metrics.monthly_burn_source, 'historical');
      assert.equal(snapshot.metrics.historical_month_count, 2);
      assert.equal(snapshot.metrics.runway_months, null);
      assert.equal(snapshot.metrics.estimated_depletion_month, null);
      assert.equal(snapshot.config.history_ready_for_burn, true);
    });
  });
});

test('dashboard snapshot clamps runway to zero when cash on hand is depleted', async () => {
  await withMockedDate('2026-06-20T12:00:00.000Z', async () => {
    await withRepositoryStub(createRepositoryStub({
      getEarliestTransactionDate: async () => '2026-03-01',
      getCashFlowTotalsSince: async () => ({
        income_total: 0,
        outflow_total: 500
      }),
      listMonthlyOutflowTotals: async ({ endDate }) => (
        endDate === '2026-06-01'
          ? [
              { month: '2026-03', total: 1000 },
              { month: '2026-04', total: 1000 },
              { month: '2026-05', total: 1000 }
            ]
          : []
      )
    }), async () => {
      const snapshot = await dashboardService.getDashboardSnapshot({
        organization: { id: 'org-7' },
        query: { months: 6 }
      });

      assert.equal(snapshot.metrics.cash_on_hand, -500);
      assert.equal(snapshot.metrics.monthly_burn, 1000);
      assert.equal(snapshot.metrics.runway_months, 0);
      assert.equal(snapshot.metrics.estimated_depletion_month, '2026-06');
    });
  });
});
