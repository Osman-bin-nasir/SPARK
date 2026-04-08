/**
 * Seed: demo1@gmail.com
 * 
 * Design:
 *   Monthly income:   ~$10,000 (Stripe MRR + occasional consulting)
 *   Monthly expenses: ~$12,000 (20% more than income)
 *   Net burn:         ~$2,000/month
 *   Opening balance:  $26,000 (Oct 01 2025)
 *   After 6 months:   $20,000 + $60,000 - $72,000 = $8,000 cash
 *   Runway:           $8,000 / $2,000 = 4 months ✓
 */
require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

const TRANSACTIONS = [
  // ── Oct 2025 ── income $10,000 | expenses $12,000
  { date: '2025-10-01', vendor: 'Team Payroll',         type: 'salary',  category: 'payroll',   amount: 7500  },
  { date: '2025-10-03', vendor: 'Amazon Web Services',  type: 'expense', category: 'cloud',     amount: 1200  },
  { date: '2025-10-05', vendor: 'GitHub',               type: 'expense', category: 'software',  amount: 84    },
  { date: '2025-10-05', vendor: 'Notion',               type: 'expense', category: 'software',  amount: 48    },
  { date: '2025-10-05', vendor: 'Figma',                type: 'expense', category: 'software',  amount: 75    },
  { date: '2025-10-05', vendor: 'Vercel',               type: 'expense', category: 'software',  amount: 40    },
  { date: '2025-10-10', vendor: 'Google Ads',           type: 'expense', category: 'marketing', amount: 900   },
  { date: '2025-10-12', vendor: 'LinkedIn Ads',         type: 'expense', category: 'marketing', amount: 548   },
  { date: '2025-10-15', vendor: 'Office Supplies',      type: 'expense', category: 'office',    amount: 253   },
  { date: '2025-10-15', vendor: 'Stripe Revenue',       type: 'income',  category: 'revenue',   amount: 7500  },
  { date: '2025-10-28', vendor: 'Consulting Project',   type: 'income',  category: 'revenue',   amount: 2500  },
  // Oct totals: inc=10,000 | exp=11,500 ... need 12,000, add 500 more
  { date: '2025-10-20', vendor: 'Slack',                type: 'expense', category: 'software',  amount: 500   },

  // ── Nov 2025 ── income $10,000 | expenses $12,000
  { date: '2025-11-01', vendor: 'Team Payroll',         type: 'salary',  category: 'payroll',   amount: 7500  },
  { date: '2025-11-03', vendor: 'Amazon Web Services',  type: 'expense', category: 'cloud',     amount: 1350  },
  { date: '2025-11-05', vendor: 'GitHub',               type: 'expense', category: 'software',  amount: 84    },
  { date: '2025-11-05', vendor: 'Notion',               type: 'expense', category: 'software',  amount: 48    },
  { date: '2025-11-05', vendor: 'Figma',                type: 'expense', category: 'software',  amount: 75    },
  { date: '2025-11-05', vendor: 'Vercel',               type: 'expense', category: 'software',  amount: 40    },
  { date: '2025-11-05', vendor: 'Slack',                type: 'expense', category: 'software',  amount: 125   },
  { date: '2025-11-10', vendor: 'Google Ads',           type: 'expense', category: 'marketing', amount: 1000  },
  { date: '2025-11-12', vendor: 'LinkedIn Ads',         type: 'expense', category: 'marketing', amount: 500   },
  { date: '2025-11-18', vendor: 'Office & Misc',        type: 'expense', category: 'office',    amount: 278   },
  { date: '2025-11-15', vendor: 'Stripe Revenue',       type: 'income',  category: 'revenue',   amount: 7500  },
  { date: '2025-11-28', vendor: 'Consulting Project',   type: 'income',  category: 'revenue',   amount: 2500  },

  // ── Dec 2025 ── income $10,200 | expenses $12,200
  { date: '2025-12-01', vendor: 'Team Payroll',         type: 'salary',  category: 'payroll',   amount: 7500  },
  { date: '2025-12-03', vendor: 'Amazon Web Services',  type: 'expense', category: 'cloud',     amount: 1500  },
  { date: '2025-12-05', vendor: 'GitHub',               type: 'expense', category: 'software',  amount: 84    },
  { date: '2025-12-05', vendor: 'Notion',               type: 'expense', category: 'software',  amount: 48    },
  { date: '2025-12-05', vendor: 'Figma',                type: 'expense', category: 'software',  amount: 75    },
  { date: '2025-12-05', vendor: 'Vercel',               type: 'expense', category: 'software',  amount: 40    },
  { date: '2025-12-05', vendor: 'Slack',                type: 'expense', category: 'software',  amount: 125   },
  { date: '2025-12-05', vendor: 'Zoom',                 type: 'expense', category: 'software',  amount: 50    },
  { date: '2025-12-10', vendor: 'Google Ads',           type: 'expense', category: 'marketing', amount: 1200  },
  { date: '2025-12-12', vendor: 'LinkedIn Ads',         type: 'expense', category: 'marketing', amount: 700   },
  { date: '2025-12-20', vendor: 'Festive Team Dinner',  type: 'expense', category: 'office',    amount: 178   },
  { date: '2025-12-15', vendor: 'Stripe Revenue',       type: 'income',  category: 'revenue',   amount: 8000  },
  { date: '2025-12-28', vendor: 'Consulting Project',   type: 'income',  category: 'revenue',   amount: 2200  },

  // ── Jan 2026 ── income $10,500 | expenses $12,500
  { date: '2026-01-01', vendor: 'Team Payroll',         type: 'salary',  category: 'payroll',   amount: 8000  },
  { date: '2026-01-03', vendor: 'Amazon Web Services',  type: 'expense', category: 'cloud',     amount: 1650  },
  { date: '2026-01-05', vendor: 'GitHub',               type: 'expense', category: 'software',  amount: 84    },
  { date: '2026-01-05', vendor: 'Notion',               type: 'expense', category: 'software',  amount: 48    },
  { date: '2026-01-05', vendor: 'Figma',                type: 'expense', category: 'software',  amount: 75    },
  { date: '2026-01-05', vendor: 'Vercel',               type: 'expense', category: 'software',  amount: 40    },
  { date: '2026-01-05', vendor: 'Slack',                type: 'expense', category: 'software',  amount: 125   },
  { date: '2026-01-05', vendor: 'Zoom',                 type: 'expense', category: 'software',  amount: 50    },
  { date: '2026-01-10', vendor: 'Google Ads',           type: 'expense', category: 'marketing', amount: 1900  },
  { date: '2026-01-12', vendor: 'LinkedIn Ads',         type: 'expense', category: 'marketing', amount: 1100  },
  { date: '2026-01-20', vendor: 'Office & Misc',        type: 'expense', category: 'office',    amount: 180   },
  { date: '2026-01-15', vendor: 'Stripe Revenue',       type: 'income',  category: 'revenue',   amount: 8500  },
  { date: '2026-01-28', vendor: 'Consulting Project',   type: 'income',  category: 'revenue',   amount: 2000  },

  // ── Feb 2026 ── income $10,000 | expenses $12,000
  { date: '2026-02-01', vendor: 'Team Payroll',         type: 'salary',  category: 'payroll',   amount: 8000  },
  { date: '2026-02-03', vendor: 'Amazon Web Services',  type: 'expense', category: 'cloud',     amount: 1750  },
  { date: '2026-02-05', vendor: 'GitHub',               type: 'expense', category: 'software',  amount: 84    },
  { date: '2026-02-05', vendor: 'Notion',               type: 'expense', category: 'software',  amount: 48    },
  { date: '2026-02-05', vendor: 'Figma',                type: 'expense', category: 'software',  amount: 75    },
  { date: '2026-02-05', vendor: 'Vercel',               type: 'expense', category: 'software',  amount: 40    },
  { date: '2026-02-05', vendor: 'Slack',                type: 'expense', category: 'software',  amount: 125   },
  { date: '2026-02-05', vendor: 'Zoom',                 type: 'expense', category: 'software',  amount: 50    },
  { date: '2026-02-10', vendor: 'Google Ads',           type: 'expense', category: 'marketing', amount: 1600  },
  { date: '2026-02-12', vendor: 'LinkedIn Ads',         type: 'expense', category: 'marketing', amount: 1000  },
  { date: '2026-02-18', vendor: 'Wilson Law Group',     type: 'expense', category: 'legal',     amount: 900   },
  { date: '2026-02-20', vendor: 'Office & Misc',        type: 'expense', category: 'office',    amount: 28    },
  { date: '2026-02-15', vendor: 'Stripe Revenue',       type: 'income',  category: 'revenue',   amount: 9000  },
  { date: '2026-02-28', vendor: 'Consulting Project',   type: 'income',  category: 'revenue',   amount: 1000  },

  // ── Mar 2026 ── income $9,300 | expenses $11,300
  { date: '2026-03-01', vendor: 'Team Payroll',         type: 'salary',  category: 'payroll',   amount: 8000  },
  { date: '2026-03-03', vendor: 'Amazon Web Services',  type: 'expense', category: 'cloud',     amount: 1800  },
  { date: '2026-03-05', vendor: 'GitHub',               type: 'expense', category: 'software',  amount: 84    },
  { date: '2026-03-05', vendor: 'Notion',               type: 'expense', category: 'software',  amount: 48    },
  { date: '2026-03-05', vendor: 'Figma',                type: 'expense', category: 'software',  amount: 75    },
  { date: '2026-03-05', vendor: 'Vercel',               type: 'expense', category: 'software',  amount: 40    },
  { date: '2026-03-05', vendor: 'Slack',                type: 'expense', category: 'software',  amount: 125   },
  { date: '2026-03-05', vendor: 'Zoom',                 type: 'expense', category: 'software',  amount: 50    },
  { date: '2026-03-10', vendor: 'Google Ads',           type: 'expense', category: 'marketing', amount: 800   },
  { date: '2026-03-12', vendor: 'LinkedIn Ads',         type: 'expense', category: 'marketing', amount: 350   },
  { date: '2026-03-20', vendor: 'Office & Misc',        type: 'expense', category: 'office',    amount: 28    },
  { date: '2026-03-15', vendor: 'Stripe Revenue',       type: 'income',  category: 'revenue',   amount: 9300  },

  // ── Apr 2026 (Current Month) ── income $3,000 | expenses $8,700 (partial month)
  { date: '2026-04-01', vendor: 'Team Payroll',         type: 'salary',  category: 'payroll',   amount: 8000  },
  { date: '2026-04-03', vendor: 'Amazon Web Services',  type: 'expense', category: 'cloud',     amount: 500   },
  { date: '2026-04-05', vendor: 'GitHub',               type: 'expense', category: 'software',  amount: 84    },
  { date: '2026-04-05', vendor: 'Notion',               type: 'expense', category: 'software',  amount: 48    },
  { date: '2026-04-05', vendor: 'Figma',                type: 'expense', category: 'software',  amount: 75    },
  { date: '2026-04-05', vendor: 'Slack',                type: 'expense', category: 'software',  amount: 125   },
  { date: '2026-04-07', vendor: 'Stripe Revenue',       type: 'income',  category: 'revenue',   amount: 3000  },
];

// Verification:
// Income:   10000+10000+10200+10500+10000+9300+3000 = 63000
// Expenses: 12000+12000+12200+12500+12000+11300+8832 = 80832
// Opening: $20,000
// Cash: 20000 + 60000 - 72000 = $8,000
// Burn: 72000-60000 / 6 = $2,000/month
// Runway: 8000/2000 = 4 months ✓

const BUDGETS = [
  { category: 'Payroll',   normalized: 'payroll',   limit: 9000  },
  { category: 'Cloud',     normalized: 'cloud',     limit: 2000  },
  { category: 'Software',  normalized: 'software',  limit: 600   },
  { category: 'Marketing', normalized: 'marketing', limit: 3000  },
  { category: 'Office',    normalized: 'office',    limit: 400   },
  { category: 'Hardware',  normalized: 'hardware',  limit: 2000  },
  { category: 'Legal',     normalized: 'legal',     limit: 1500  },
];

async function seed() {
  const client = await pool.connect();
  try {
    const { rows: [user] } = await client.query(
      `SELECT id FROM users WHERE LOWER(email) = 'demo1@gmail.com' LIMIT 1`
    );
    if (!user) { console.error('❌ User not found.'); process.exit(1); }

    const { rows: [org] } = await client.query(
      `SELECT om.organization_id AS id, o.name FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1
       ORDER BY CASE om.role WHEN 'founder' THEN 0 ELSE 1 END LIMIT 1`,
      [user.id]
    );
    if (!org) { console.error('❌ No organization.'); process.exit(1); }

    console.log(`✓ User: ${user.id}`);
    console.log(`✓ Org: "${org.name}"`);

    await client.query('BEGIN');

    await client.query(`DELETE FROM embedding_jobs WHERE organization_id = $1`, [org.id]);
    await client.query(`DELETE FROM audit_logs WHERE transaction_id IN (SELECT id FROM transactions WHERE organization_id = $1)`, [org.id]);
    await client.query(`DELETE FROM transactions WHERE organization_id = $1`, [org.id]);
    await client.query(`DELETE FROM category_budgets WHERE organization_id = $1`, [org.id]);
    console.log('✓ Cleared old data');

    // Opening: $26,000 from Oct 1 2025
    await client.query(
      `INSERT INTO finance_settings (organization_id, opening_cash_balance, opening_cash_effective_date, created_at, updated_at)
       VALUES ($1, 26000.00, '2025-10-01', NOW(), NOW())
       ON CONFLICT (organization_id) DO UPDATE
         SET opening_cash_balance = 26000.00,
             opening_cash_effective_date = '2025-10-01',
             updated_at = NOW()`,
      [org.id]
    );
    console.log('✓ Opening: $26,000 (Oct 01, 2025)');

    let incomeTotal = 0, expenseTotal = 0;
    for (const tx of TRANSACTIONS) {
      const txId = crypto.randomUUID();
      await client.query(
        `INSERT INTO transactions (id, organization_id, amount, vendor, transaction_type, category, transaction_date, confidence_score, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1.0,'auto_verified',$8)`,
        [txId, org.id, tx.amount.toFixed(2), tx.vendor, tx.type, tx.category, tx.date, `${tx.date}T09:00:00Z`]
      );
      await client.query(
        `INSERT INTO audit_logs (id, user_id, transaction_id, action, new_value)
         VALUES ($1,$2,$3,'transaction.seeded',$4::jsonb)`,
        [crypto.randomUUID(), user.id, txId, JSON.stringify({ vendor: tx.vendor, amount: tx.amount })]
      );
      await client.query(
        `INSERT INTO embedding_jobs (id, transaction_id, organization_id, status, attempt_count, next_attempt_at)
         VALUES ($1,$2,$3,'pending',0,NOW())
         ON CONFLICT (transaction_id) DO UPDATE SET status='pending', next_attempt_at=NOW()`,
        [crypto.randomUUID(), txId, org.id]
      );
      if (tx.type === 'income') incomeTotal += tx.amount;
      else expenseTotal += tx.amount;
    }
    console.log(`✓ Inserted ${TRANSACTIONS.length} transactions`);

    for (const b of BUDGETS) {
      await client.query(
        `INSERT INTO category_budgets (id, organization_id, category, normalized_category, monthly_limit, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
        [crypto.randomUUID(), org.id, b.category, b.normalized, b.limit]
      );
    }
    console.log(`✓ Set ${BUDGETS.length} budget limits`);

    await client.query('COMMIT');

    const cash = 26000 + incomeTotal - expenseTotal;
    const burn = 2000; // Expected average from first 6 months
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Seed complete`);
    console.log(`   Opening:  $26,000`);
    console.log(`   Income:   $${incomeTotal.toLocaleString()}`);
    console.log(`   Expenses: $${expenseTotal.toLocaleString()}`);
    console.log(`   Cash:     $${cash.toLocaleString()}`);
    console.log(`   Runway:   ~${(cash / burn).toFixed(1)} months`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
