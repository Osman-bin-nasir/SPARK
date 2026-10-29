const intent = require('./bot-intent.service');
const finance = require('../db/bot-finance.repository');
const jobs = require('../db/automation.repository');
const ingestion = require('./ingestion.service');
const { env } = require('../config/env');

const money = value => Number(value).toFixed(2);

async function processText({ job, organizationId, userId, platform, text, receivedAt }) {
  const identity = { organizationId, userId, platform };
  // A durable interpretation keeps webhook retries from changing a financial operation.
  const plan = job.progress.intent || await intent.interpret({ text,
    referenceDate: new Intl.DateTimeFormat('en-CA', { timeZone: env.automationTimeZone }).format(new Date(receivedAt)),
    context: await finance.loadContext(identity) });
  intent.validate(plan);
  await jobs.checkpoint(job.id, { intent: plan, organizationId, userId });
  if (plan.needs_clarification) {
    await finance.saveContext(identity, { pending: plan });
    return plan.clarification || 'Could you include the amount, what it was for, or the period you want to check?';
  }
  if (['update_expense','delete_expense','undo_last_expense'].includes(plan.intent)) {
    await finance.saveContext(identity, { last_intent: plan.intent });
    return 'I have not changed any records. Please open Transactions in SPARK to review and confirm edits or deletion.';
  }
  if (plan.intent === 'unknown_intent') {
    await finance.saveContext(identity, { last_intent: plan.intent });
    return 'I can record expenses or check your spending. What would you like to do?';
  }
  if (plan.intent === 'general_finance_question') {
    await finance.saveContext(identity, { last_intent: plan.intent });
    return 'A useful starting point is to track spending by category and compare it with your budget. Ask me for your spending totals or biggest expenses to review your recorded data.';
  }
  if (plan.intent === 'add_expense') {
    const result = await ingestion.ingestText({ organizationId, automationJobId: job.id,
      payload: { amount: plan.amount, vendor: plan.description, category: plan.category, transaction_date: plan.date,
        transaction_type: 'expense', confidence_score: plan.confidence, submitted_by_user_id: userId, platform, text } });
    await jobs.checkpoint(job.id, { ingestion: result });
    await finance.saveContext(identity, { last_intent: 'add_expense' });
    return result.is_duplicate ? 'This expense is already recorded.' : `Recorded ${money(plan.amount)} for ${plan.description} on ${plan.date}. Check SPARK for its verification status.`;
  }
  const current = await finance.spending(identity, plan);
  await finance.saveContext(identity, { last_query: plan });
  const range = `${plan.start_date} to ${plan.end_date}`;
  const total = plan.language === 'hinglish' ? `Is period mein ${current.count} entries ka total ${money(current.total)} hai` : `Your recorded spending is ${money(current.total)} across ${current.count} entries`;
  const lines = [`${total} (${range}).`];
  if (!current.count) lines[0] = `No matching expenses found for ${range}.`;
  if (plan.intent === 'compare_spending') {
    const previous = await finance.spending(identity, { ...plan, start_date: plan.comparison_start_date, end_date: plan.comparison_end_date });
    const difference = Number(current.total) - Number(previous.total);
    lines.push(`Comparison (${plan.comparison_start_date} to ${plan.comparison_end_date}): ${money(previous.total)} across ${previous.count} entries.`,
      `Difference: ${money(difference)}${Number(previous.total) > 0 ? ` (${(difference / Number(previous.total) * 100).toFixed(1)}%)` : '; percentage change unavailable because the comparison total is zero'}.`);
  } else if (['query_expenses','search_expense','get_spending_by_date'].includes(plan.intent)) {
    for (const row of current.expenses || []) lines.push(`${String(row.transaction_date).slice(0,10)} — ${row.vendor}: ${money(row.amount)} (${row.category})`);
    if (current.count > 5) lines.push('Showing the 5 biggest matching expenses.');
  } else if (['get_spending_by_category','get_spending_insights'].includes(plan.intent)) {
    for (const row of current.categories || []) lines.push(`${row.category}: ${money(row.total)}`);
    if (plan.intent === 'get_spending_insights') lines.push('Whether this is too much depends on your budget and goals.');
  }
  lines.push('Amounts use your recorded units; pending-review entries are included.');
  return lines.join('\n').slice(0,1400);
}

module.exports = { processText };
