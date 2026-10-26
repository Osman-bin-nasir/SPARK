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
const events = require('./automation-events');
const { createAutomationRunner } = require('./automation-runner');

const HELP = 'Send one receipt image/PDF or an expense note with amount, vendor and date. Commands: /login, /join CODE, /insights weekly, /insights monthly. Open a workspace invitation to join it.';
let reportTimer;
let reportRunning;
let reportsRequested = false;
let runner;
let listener;
let listenerTimer;
let listenerConnecting;
let listenerCleanup;
let stopping = true;
const reportCache = new Map();

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

async function scheduleReports(now = new Date(), organizationId) {
  for (const [period, anchor] of Object.entries(reportSlots(now))) {
    const scheduled = await organizations.listScheduledOrganizations({ period, organizationId });
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
  if (job.kind === 'sheets') return sheets.getOrganizationTransactionsSheet({ organizationId: job.payload.organizationId, afterCurrentSync: true });
  if (job.kind === 'insights') {
    const p = job.payload;
    // Preferences, memberships and linked destinations can change after enqueueing.
    const current = await organizations.listScheduledOrganizations({ period: p.period, organizationId: p.organizationId });
    const org = current.find(o => o.organization_id === p.organizationId);
    if (!org?.receivers.some(r => r.user_id === p.userId && String(r[`${p.platform}_id`]) === p.recipient)) return;
    const cacheKey = `${p.organizationId}:${p.period}:${p.anchor}`;
    const cached = reportCache.get(cacheKey);
    let text = job.progress.report || (cached?.expires > Date.now() ? cached.text : null);
    if (!text) {
      text = formatInsights(await reportFor(p.organizationId, p.period, new Date(p.anchor)), org.organization_name);
      if (reportCache.size >= 50) reportCache.delete(reportCache.keys().next().value);
      reportCache.set(cacheKey, { text, expires: Date.now() + 600000 });
    }
    await jobs.checkpoint(job.id, { report: text });
    return bots.send({ ...p, text, scheduled: true });
  }
  throw Object.assign(new Error('Unknown automation job'), { permanent: true });
}

async function jobFailed(job, error, client) {
  const permanent = Boolean(error.permanent || (error.statusCode >= 400 && error.statusCode < 500 && ![408, 429].includes(error.statusCode)));
  const exhausted = await jobs.fail(job, { permanent, retryAfter: error.retryAfter }, client);
  console.error(`Automation job ${job.id} ${exhausted ? 'failed' : 'will retry'}.`);
  if (exhausted && job.kind === 'inbound') {
    await jobs.enqueue({ key: `failure-reply:${job.id}:${job.attempts}`, kind: 'reply', payload: {
      platform: job.payload.platform, recipient: job.payload.recipient,
      text: error.publicMessage || 'We could not process this submission. Please check your SPARK integrations and send the receipt again.'
    } });
  }
}

function nextReportAt(now = new Date()) {
  const slots = reportSlots(now);
  // Find the next calendar boundary in the configured timezone, including DST.
  // This is in-memory work; it never polls PostgreSQL to check the clock.
  return new Date(Math.min(...['weekly', 'monthly'].map(period => {
    let low = Math.floor(now.getTime() / 1000);
    let high = low + 32 * 86400;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (reportSlots(new Date(middle * 1000))[period] === slots[period]) low = middle;
      else high = middle;
    }
    return high * 1000;
  })));
}

function runReports() {
  if (stopping) return;
  reportsRequested = true;
  if (reportRunning) return;
  clearTimeout(reportTimer);
  reportsRequested = false;
  reportRunning = (async () => {
    let delay;
    try {
      await scheduleReports();
      delay = nextReportAt().getTime() - Date.now();
    } catch (_) {
      console.error('Automation scheduling failed; will retry.');
      delay = 60000;
    }
    if (!stopping) {
      reportTimer = setTimeout(runReports, reportsRequested ? 0 : Math.max(1000, delay));
      reportTimer.unref?.();
    }
  })().finally(() => { reportRunning = null; });
}

function reportsChanged() {
  if (stopping) return;
  if (reportRunning) { reportsRequested = true; return; }
  clearTimeout(reportTimer);
  reportTimer = setTimeout(runReports, 1000);
  reportTimer.unref?.();
}

function listenForWork() {
  listenerTimer = null;
  listenerConnecting = (async () => {
    let client;
    try {
      client = await pool.connect();
      if (stopping) { client.release(); return; }
      const onError = () => {
        if (listener !== client) return;
        listener = null;
        listenerCleanup?.();
        client.release(true);
        if (!stopping) listenerTimer = setTimeout(listenForWork, 60000);
      };
      listener = client;
      client.on('error', onError);
      const onNotification = message => {
        if (message.channel === 'spark_automation') runner?.wake(message.payload);
      };
      client.on('notification', onNotification);
      listenerCleanup = () => {
        client.removeListener('error', onError);
        client.removeListener('notification', onNotification);
      };
      await client.query('LISTEN spark_automation');
      runner.wake(); // Cover commits before LISTEN became active.
    } catch (_) {
      if (client && listener === client) { listener = null; listenerCleanup?.(); client.release(true); }
      if (!stopping && !listenerTimer) listenerTimer = setTimeout(listenForWork, 60000);
    }
  })();
}

function startAutomation({ listen = false } = {}) {
  if (!env.automationEnabled || !stopping) return;
  stopping = false;
  runner = createAutomationRunner({ pool, jobs, processJob, onFailure: jobFailed, recoveryMs: env.automationRecoveryMs });
  events.on('work', runner.wake);
  events.on('reports-changed', reportsChanged);
  runner.start();
  if (listen) listenForWork();
  if (bots.configured('telegram') || bots.configured('whatsapp')) runReports();
}

async function stopAutomation() {
  stopping = true;
  clearTimeout(reportTimer);
  clearTimeout(listenerTimer);
  await listenerConnecting;
  if (listener) {
    const client = listener;
    listener = null;
    listenerCleanup?.();
    try { await client.query('UNLISTEN spark_automation'); client.release(); }
    catch (_) { client.release(true); }
  }
  if (runner) {
    events.off('work', runner.wake);
    events.off('reports-changed', reportsChanged);
    await runner.stop();
  }
  await reportRunning;
  reportCache.clear();
}

module.exports = { startAutomation, stopAutomation, processJob, processInbound, scheduleReports, reportSlots, nextReportAt, formatInsights };
