const { env } = require('../config/env');
const { pool } = require('../db/pool');
const jobs = require('../db/automation.repository');
const organizations = require('../db/organizations.repository');
const bots = require('../integrations/bot.client');
const extraction = require('./receipt-extraction.service');
const ingestion = require('./ingestion.service');
const insights = require('./insights.service');
const auth = require('./auth.service');
const telegram = require('./telegram.service');
const whatsapp = require('./whatsapp.service');
const sheets = require('./google-sheets.service');
const googleDrive = require('./google-drive.service');

const HELP = 'Send one receipt image/PDF or an expense note with amount, vendor and date. Commands: /login, /join CODE, /insights weekly, /insights monthly. Open a workspace invitation to join it.';
let timer;
let running;
let stopping = true;
let lastScheduledAt = 0;

function platformService(platform) {
  return platform === 'telegram' ? telegram : whatsapp;
}

async function memberships(platform, sender) {
  return platform === 'telegram' ? telegram.getTelegramMemberships({ telegramId: sender })
    : whatsapp.getWhatsappMemberships({ whatsappId: sender });
}

function formatInsights(report, organizationName) {
  const lines = [`SPARK ${report.period} report — ${organizationName}`,
    `${report.start_date} to ${report.end_date}`,
    `Total outflow: ${Number(report.metrics.total_outflow).toFixed(2)}`];
  if (report.metrics.change_pct !== null) lines.push(`Change from previous period: ${report.metrics.change_pct}%`);
  const categories = report.top_categories || (report.top_category ? [report.top_category] : []);
  for (const category of categories.slice(0, 3)) lines.push(`${category.category}: ${Number(category.amount).toFixed(2)}`);
  for (const alert of (report.budget_alerts || report.budget_audit || []).slice(0, 4)) {
    lines.push(`Budget ${alert.status}: ${alert.category}`);
  }
  for (const spike of (report.vendor_spikes || []).slice(0, 3)) lines.push(`Vendor spike: ${spike.vendor} (${Number(spike.amount).toFixed(2)})`);
  if (report.runway) {
    lines.push(`Cash on hand: ${Number(report.runway.cash_on_hand).toFixed(2)}`);
    if (report.runway.runway_months !== null) lines.push(`Runway: ${report.runway.runway_months} months`);
  }
  return lines.join('\n').slice(0, 1400);
}

async function reportFor(organizationId, period, now) {
  return period === 'monthly' ? insights.getMonthlyInsights({ organizationId, now })
    : insights.getWeeklyInsights({ organizationId, now });
}

function reportSlots(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: env.automationTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  // Work with calendar dates in the selected timezone. Insights services accept
  // UTC calendar anchors, so no server-local timezone arithmetic is involved.
  const local = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour)));
  const weekly = new Date(local);
  weekly.setUTCDate(weekly.getUTCDate() - (weekly.getUTCDay() + 6) % 7);
  weekly.setUTCHours(env.automationReportHour, 0, 0, 0);
  if (weekly > local) weekly.setUTCDate(weekly.getUTCDate() - 7);
  const monthly = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, env.automationReportHour));
  if (monthly > local) monthly.setUTCMonth(monthly.getUTCMonth() - 1);
  return { weekly: weekly.toISOString(), monthly: monthly.toISOString() };
}

async function scheduleReports(now = new Date()) {
  for (const [period, anchor] of Object.entries(reportSlots(now))) {
    const scheduled = await organizations.listScheduledOrganizations({ period });
    for (const organization of scheduled) {
      for (const receiver of organization.receivers) {
        for (const platform of ['telegram', 'whatsapp']) {
          const recipient = receiver[`${platform}_id`];
          if (!recipient || !bots.configured(platform) || (platform === 'whatsapp' && !env.twilioInsightsContentSid)) continue;
          await jobs.enqueue({ key: `insights:${organization.organization_id}:${period}:${anchor}:${receiver.user_id}:${platform}`,
            kind: 'insights', payload: { organizationId: organization.organization_id, userId: receiver.user_id,
              platform, recipient: String(recipient), period, anchor } });
        }
      }
    }
  }
}

async function queueReply(job, text) {
  await jobs.checkpoint(job.id, { reply: text });
  await jobs.enqueue({ key: `reply:${job.id}`, kind: 'reply', payload: {
    platform: job.payload.platform, recipient: job.payload.recipient, text
  } });
}

async function processInbound(job) {
  const { platform, sender, text, file, receivedAt } = job.payload;
  if (job.progress.reply) return queueReply(job, job.progress.reply);
  const trimmed = text.trim();
  const join = trimmed.match(/^(?:(?:\/start(?:@\w+)?\s+)?join_|\/?join\s+)([a-zA-Z0-9]+)$/i);
  if (join) {
    const result = await platformService(platform).joinOrganizationByCode(platform === 'telegram'
      ? { telegramId: sender, joinCode: join[1] } : { whatsappId: sender, joinCode: join[1] });
    const response = result.login_link ? `Complete registration or link your SPARK account: ${result.login_link}`
      : result.status === 'invalid_code' ? 'That workspace invitation is invalid. Please request a new invitation.'
        : `Workspace status: ${result.status}. ${HELP}`;
    return queueReply(job, response);
  }
  if (/^\/?(?:start|login)(?:@\w+)?$/i.test(trimmed)) {
    const result = platform === 'telegram' ? await auth.createTelegramLogin({ telegram_id: sender })
      : await auth.createWhatsappLogin({ whatsapp_id: sender });
    return queueReply(job, `Sign in or link your SPARK account: ${result.loginLink}\n${HELP}`);
  }
  if (/^\/?help(?:@\w+)?$/i.test(trimmed) || (!file && !trimmed)) return queueReply(job, HELP);
  const member = await memberships(platform, sender);
  if (!member.linked || member.organizations.length !== 1) {
    return queueReply(job, 'Link your SPARK account with /login and join a workspace before submitting expenses.');
  }
  const organization = member.organizations[0];
  // Refuse to reuse extracted data if the sender changed workspace between retries.
  if (job.progress.organizationId && job.progress.organizationId !== organization.id) {
    return queueReply(job, 'Your workspace changed while processing. Please submit the receipt again.');
  }
  const reportCommand = trimmed.match(/^\/?insights(?:\s+(weekly|monthly))?$/i);
  if (reportCommand) {
    const report = await reportFor(organization.id, reportCommand[1]?.toLowerCase() || 'weekly', new Date(receivedAt));
    return queueReply(job, formatInsights(report, organization.name));
  }
  if (job.payload.unsupportedMedia) return queueReply(job, 'Please send one receipt at a time.');
  if (file?.size > env.ocrMaxFileBytes) return queueReply(job, 'Receipt exceeds the free OCR file limit. Please send a file smaller than 1 MB.');
  let result = job.progress.ingestion;
  if (!result) {
    // Attachments must be archived before a transaction is committed. Check the
    // workspace connection before spending download/OCR/AI calls on a receipt.
    if (file) await googleDrive.getOrganizationDriveClient(organization.id);
    const downloaded = file ? await bots.download({ platform, file }) : null;
    const fields = job.progress.extraction || await extraction.extract({ text, file: downloaded,
      referenceDate: new Date(receivedAt).toLocaleDateString('en-CA', { timeZone: env.automationTimeZone }) });
    await jobs.checkpoint(job.id, { extraction: fields, organizationId: organization.id });
    const payload = { ...fields, platform, submitted_by_user_id: member.user_id };
    result = downloaded ? await ingestion.ingestDocument({ organizationId: organization.id, payload, file: downloaded, automationJobId: job.id })
      : await ingestion.ingestText({ organizationId: organization.id, payload: { ...payload, text }, automationJobId: job.id });
    await jobs.checkpoint(job.id, { ingestion: result });
  }
  await queueReply(job, result.is_duplicate ? 'This receipt is already in your workspace.'
    : `Transaction recorded: ${result.transaction_id}. Check SPARK for its verification status.`);
}

async function processJob(job) {
  if (job.kind === 'inbound') return processInbound(job);
  if (job.kind === 'reply') return bots.send(job.payload);
  if (job.kind === 'sheets') return sheets.getOrganizationTransactionsSheet({ organizationId: job.payload.organizationId });
  if (job.kind === 'insights') {
    const p = job.payload;
    // Preferences, memberships and linked destinations can change after enqueueing.
    const current = await organizations.listScheduledOrganizations({ period: p.period });
    const org = current.find(o => o.organization_id === p.organizationId);
    if (!org?.receivers.some(r => r.user_id === p.userId && String(r[`${p.platform}_id`]) === p.recipient)) return;
    const text = job.progress.report || formatInsights(await reportFor(p.organizationId, p.period, new Date(p.anchor)), org.organization_name);
    await jobs.checkpoint(job.id, { report: text });
    return bots.send({ ...p, text, scheduled: true });
  }
  throw Object.assign(new Error('Unknown automation job'), { permanent: true });
}

async function tick() {
  const client = await pool.connect();
  let locked = false;
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock(73921, 1) AS locked');
    locked = rows[0].locked;
    if (!locked) return;
    if (Date.now() - lastScheduledAt >= 60000) {
      try { await scheduleReports(); lastScheduledAt = Date.now(); }
      catch (_) { console.error('Automation scheduling failed; will retry.'); }
    }
    for (let i = 0; i < 5 && !stopping; i++) {
      const job = await jobs.claim(client);
      if (!job) break;
      try { await processJob(job); await jobs.complete(job.id, client); }
      catch (error) {
        const permanent = Boolean(error.permanent || (error.statusCode >= 400 && error.statusCode < 500));
        const exhausted = await jobs.fail(job, { permanent, retryAfter: error.retryAfter }, client);
        console.error(`Automation job ${job.id} ${exhausted ? 'failed' : 'will retry'}.`);
        if (exhausted && job.kind === 'inbound') {
          // A failure notice must not become the successful reply checkpoint:
          // operators can fix credentials and retry this same inbound job later.
          await jobs.enqueue({ key: `failure-reply:${job.id}:${job.attempts}`, kind: 'reply', payload: {
            platform: job.payload.platform, recipient: job.payload.recipient,
            text: error.publicMessage || 'We could not process this submission. Please check your SPARK integrations and send the receipt again.'
          } });
        }
      }
    }
  } finally {
    try { if (locked) await client.query('SELECT pg_advisory_unlock(73921, 1)'); }
    finally { client.release(); }
  }
}

function startAutomation() {
  if (!env.automationEnabled || !stopping || (!bots.configured('telegram') && !bots.configured('whatsapp'))) return;
  stopping = false;
  async function loop() {
    running = tick().catch(() => console.error('Automation runner failed; will retry.'));
    await running;
    if (!stopping) timer = setTimeout(loop, env.automationPollMs);
  }
  loop();
}

async function stopAutomation() {
  stopping = true;
  clearTimeout(timer);
  await running;
}

module.exports = { startAutomation, stopAutomation, processJob, processInbound, scheduleReports, reportSlots, formatInsights };
