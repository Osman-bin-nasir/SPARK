const { pool } = require('./pool');

async function loadContext({ organizationId, userId, platform }) {
  const { rows } = await pool.query(`SELECT context FROM bot_conversations
    WHERE organization_id=$1 AND user_id=$2 AND platform=$3 AND expires_at>NOW()`, [organizationId,userId,platform]);
  return rows[0]?.context || null;
}

async function saveContext({ organizationId, userId, platform }, context) {
  await pool.query(`INSERT INTO bot_conversations (organization_id,user_id,platform,context,expires_at)
    VALUES ($1,$2,$3,$4,NOW()+INTERVAL '30 minutes')
    ON CONFLICT (organization_id,user_id,platform) DO UPDATE SET context=EXCLUDED.context,expires_at=EXCLUDED.expires_at`,
  [organizationId,userId,platform,JSON.stringify(context)]);
}

// Ownership comes from the existing creation audit trail, not model-selected IDs.
// EXISTS avoids double counting transactions with multiple audit events.
async function spending({ organizationId, userId }, { start_date, end_date, category, search }) {
  const families = { food: ['food','meals','dining','restaurants','lunch','food & dining'],
    transport: ['transport','transportation','fuel','petrol'] };
  const categories = category ? families[category.toLowerCase()] || [category.toLowerCase()] : null;
  const params = [organizationId,userId,start_date,end_date,categories,search];
  const { rows } = await pool.query(`WITH selected AS (
    SELECT t.id,t.amount,t.category,COALESCE(v.canonical_name,t.raw_vendor,'Unknown') AS vendor,t.transaction_date
    FROM transactions t LEFT JOIN vendors v ON v.id=t.vendor_id
    WHERE t.organization_id=$1 AND t.transaction_type IN ('expense','salary')
      AND t.duplicate_of_transaction_id IS NULL AND t.transaction_date BETWEEN $3::date AND $4::date
      AND ($5::text[] IS NULL OR LOWER(t.category)=ANY($5))
      AND ($6::text IS NULL OR POSITION(LOWER($6) IN LOWER(COALESCE(v.canonical_name,t.raw_vendor,'')))>0)
      AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.transaction_id=t.id AND a.user_id=$2 AND a.action='transaction.created')
  ) SELECT COALESCE(SUM(amount),0)::text AS total,COUNT(*)::int AS count,
    (SELECT COALESCE(json_agg(c),'[]'::json) FROM (SELECT category,SUM(amount)::text AS total FROM selected GROUP BY category ORDER BY SUM(amount) DESC LIMIT 5) c) AS categories,
    (SELECT COALESCE(json_agg(e),'[]'::json) FROM (SELECT vendor,category,amount::text,transaction_date FROM selected ORDER BY amount DESC,id LIMIT 5) e) AS expenses
    FROM selected`, params);
  return rows[0];
}

module.exports = { loadContext, saveContext, spending };
