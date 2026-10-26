import { Link } from 'react-router-dom';

const TELEGRAM_BOT_URL = 'https://t.me/osman80bot';
const SUPPORT_EMAIL = 'sparkfinancehq@gmail.com';

const navLinks = [
  { label: 'Product', href: '#product' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Security', href: '#security' }
];

const outcomes = [
  {
    value: '92%',
    label: 'Auto-categorized',
    body: 'Vendor, tax, and category are resolved before a receipt reaches your ledger.'
  },
  {
    value: '99%',
    label: 'Duplicate detection',
    body: 'Every upload, Drive file, and chat forward is checked against existing spend.'
  },
  {
    value: '8 hrs',
    label: 'Saved every week',
    body: 'Less reconciliation, fewer spreadsheets, same month-end close.'
  }
];

const receipts = [
  { vendor: 'AWS', detail: 'Cloud hosting', category: 'Infrastructure', amount: '$1,284.00', status: 'Matched', tone: 'green', initial: 'A' },
  { vendor: 'Figma', detail: 'Design seats', category: 'Software', amount: '$540.00', status: 'Approved', tone: 'blue', initial: 'F' },
  { vendor: 'Vercel', detail: 'Hosting', category: 'Infrastructure', amount: '$240.00', status: 'Matched', tone: 'green', initial: 'V' },
  { vendor: 'Notion', detail: 'Team workspace', category: 'Software', amount: '$96.00', status: 'Needs review', tone: 'amber', initial: 'N' }
];

const bars = ['h-2', 'h-4', 'h-3', 'h-5', 'h-4', 'h-6', 'h-5', 'h-7', 'h-6', 'h-8', 'h-7', 'h-9', 'h-8', 'h-11'];

const categories = [
  { name: 'Software', pct: 41, width: 'w-[41%]' },
  { name: 'Infrastructure', pct: 27, width: 'w-[27%]' },
  { name: 'Contractors', pct: 18, width: 'w-[18%]' },
  { name: 'Travel', pct: 9, width: 'w-[9%]' }
];

const problems = [
  'Receipts spread across inbox, chat, and Drive',
  'Manual entry and copy-paste reconciliation',
  'Duplicates discovered at month-end',
  'Approvals buried in DMs',
  'Burn and runway rebuilt by hand'
];

const fixes = [
  'One inbox fed by Telegram, WhatsApp, Drive, or upload',
  'OCR and LLM extraction with auto-categorization',
  'Duplicate checks run before a record is created',
  'Exceptions routed to the right owner with context',
  'Burn, runway, and budgets update as spend lands'
];

const steps = [
  {
    index: '01',
    title: 'Forward the receipt',
    body: 'Send it from Telegram or WhatsApp, drop it in Drive, or upload it directly. No new app, no inbox zero.',
    meta: '4 intake channels'
  },
  {
    index: '02',
    title: 'SPARK files it',
    body: 'OCR and LLMs read the vendor, amount, tax, category, and date. Duplicate checks run before anything is written.',
    meta: 'Median extraction 4.2s'
  },
  {
    index: '03',
    title: 'You close it',
    body: 'Only exceptions reach you. Burn, runway, and budget stay current, and Sheets exports are ready for your accountant.',
    meta: 'Exceptions only'
  }
];

const safeguards = [
  {
    title: 'Google OAuth, limited scope',
    body: 'SPARK creates and manages only its own files, folders, and transaction sheets in your Drive. Revoke access from your Google Account at any time.',
    icon: 'lock'
  },
  {
    title: 'Checks before inserts',
    body: 'Duplicate receipts and unclear vendors are held for review instead of being written straight into the ledger.',
    icon: 'shield'
  },
  {
    title: 'Approvals that leave a trail',
    body: 'Every exception records who approved it, when, and with which receipt attached.',
    icon: 'clock'
  },
  {
    title: 'Workspace-level access',
    body: 'Organizations, team members, and per-person insight permissions keep the right people in the right books.',
    icon: 'team'
  }
];

function Icon({ name, className = 'h-4 w-4' }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  };

  switch (name) {
    case 'receipt':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M7 3h10a2 2 0 0 1 2 2v16l-3-1.5L13 21l-3-1.5L7 21l-3-1.5V5a2 2 0 0 1 2-2h1Z" />
          <path {...common} d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      );
    case 'shield':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M12 3 5 6v6c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z" />
          <path {...common} d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'clock':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <circle {...common} cx="12" cy="12" r="8.5" />
          <path {...common} d="M12 7.5V12l3 2" />
        </svg>
      );
    case 'team':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <circle {...common} cx="9" cy="9" r="3.2" />
          <path {...common} d="M3.5 19a5.5 5.5 0 0 1 11 0" />
          <path {...common} d="M16 6.5a3 3 0 0 1 0 5.8M17.5 19a5 5 0 0 0-1.6-3.6" />
        </svg>
      );
    case 'lock':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <rect {...common} x="5" y="10" width="14" height="10" rx="2.4" />
          <path {...common} d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
        </svg>
      );
    case 'telegram':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M21 4 3 11l5 2 2 6 3.2-3.6L18 19l3-15Z" />
          <path {...common} d="m8 13 9-6-6.5 7.5" />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M20 11.5a8 8 0 0 1-11.9 7L4 20l1.6-4a8 8 0 1 1 14.4-4.5Z" />
          <path {...common} d="M9 9.5c0 3 2.5 5.5 5.5 5.5" />
        </svg>
      );
    case 'drive':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M9 3.5h6l5 8.5h-6l-5-8.5Z" />
          <path {...common} d="M3.5 16.5 7 10.5l3.5 6H3.5Z" />
          <path {...common} d="M13 20.5h7l-3.5-6" />
        </svg>
      );
    case 'sheet':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <rect {...common} x="3.5" y="4" width="17" height="16" rx="2.2" />
          <path {...common} d="M3.5 9.5h17M9.5 9.5V20M15 9.5V20" />
        </svg>
      );
    case 'check':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'arrow':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M4 12h15M13.5 6.5 19.5 12l-6 5.5" />
        </svg>
      );
    case 'search':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <circle {...common} cx="11" cy="11" r="6.5" />
          <path {...common} d="m16 16 4.5 4.5" />
        </svg>
      );
    case 'chart':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M4 19V5M4 19h16" />
          <path {...common} d="M8 16v-3M12 16V9M16 16v-5M20 16v-2" />
        </svg>
      );
    default:
      return null;
  }
}

function Brand({ compact = false }) {
  return (
    <Link className="inline-flex items-center gap-2.5" to="/" aria-label="SPARK home">
      <img className={compact ? 'h-7 w-7' : 'h-8 w-8'} src="/logo.png" alt="" />
      <span className="text-[15px] font-bold tracking-[0.18em] text-[#0B1220]">SPARK</span>
    </Link>
  );
}

function StatusPill({ tone, children }) {
  const tones = {
    green: 'bg-[#ECFDF5] text-[#047857] ring-[#A7F3D0]',
    blue: 'bg-[#EFF4FF] text-[#1D4ED8] ring-[#C7D9FF]',
    amber: 'bg-[#FFFBEB] text-[#B45309] ring-[#FDE68A]'
  };

  return (
    <span className={'inline-flex items-center rounded-full px-2 py-0.5 text-[9.5px] font-semibold ring-1 ring-inset ' + tones[tone]}>
      {children}
    </span>
  );
}

function HeroDashboard() {
  return (
    <div className="relative">
      <div className="absolute -inset-x-4 -top-4 bottom-8 rounded-[28px] bg-[#E8EFFF]/70 blur-2xl" aria-hidden="true" />

      <div className="relative overflow-hidden rounded-2xl border border-[#E3E6EA] bg-white shadow-[0_30px_70px_-35px_rgba(11,18,32,0.45)]">
        <div className="flex items-center justify-between gap-4 border-b border-[#EEF0F3] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <img className="h-5 w-5" src="/logo.png" alt="" />
            <span className="truncate text-[12.5px] font-semibold text-[#0B1220]">Akara Labs</span>
            <span className="hidden rounded border border-[#E7E9EC] px-1.5 py-px text-[9.5px] font-medium text-[#6B7280] sm:inline">
              Workspace
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-[10.5px] text-[#6B7280] sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
              Synced 2m ago
            </span>
            <span className="hidden text-[10.5px] text-[#9CA3AF] md:inline">Jun 2026</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0B1220] text-[10px] font-semibold text-white">
              O
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-[#EEF0F3] border-b border-[#EEF0F3]">
          <div className="px-4 py-3">
            <p className="text-[9.5px] font-medium uppercase tracking-[0.12em] text-[#9CA3AF]">Cash on hand</p>
            <p className="mt-1 text-[16px] font-semibold tabular-nums tracking-[-0.02em] text-[#0B1220]">$412,900</p>
            <p className="text-[9.5px] font-medium text-[#047857]">+2.4% MoM</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[9.5px] font-medium uppercase tracking-[0.12em] text-[#9CA3AF]">Monthly burn</p>
            <p className="mt-1 text-[16px] font-semibold tabular-nums tracking-[-0.02em] text-[#0B1220]">$18,420</p>
            <p className="text-[9.5px] font-medium text-[#047857]">−6.1% MoM</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[9.5px] font-medium uppercase tracking-[0.12em] text-[#9CA3AF]">Runway</p>
            <p className="mt-1 text-[16px] font-semibold tabular-nums tracking-[-0.02em] text-[#0B1220]">22.4 mo</p>
            <p className="text-[9.5px] font-medium text-[#6B7280]">Cash out Apr 2028</p>
          </div>
        </div>

        <div className="flex items-end justify-between gap-4 px-4 pt-4">
          <div>
            <p className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-[#9CA3AF]">June spend</p>
            <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums tracking-[-0.035em] text-[#0B1220]">
              $18,420
            </p>
          </div>
          <div className="flex h-12 items-end gap-1" aria-hidden="true">
            {bars.map((height, index) => (
              <span
                key={index}
                className={
                  'w-[5px] rounded-t-[2px] sm:w-[6px] ' +
                  height +
                  (index === bars.length - 1 ? ' bg-[#2563EB]' : ' bg-[#E4E8EF]')
                }
              />
            ))}
          </div>
        </div>

        <div className="mt-4 border-t border-[#EEF0F3]">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-[10.5px] font-semibold text-[#0B1220]">Recent receipts</span>
            <span className="text-[10px] text-[#6B7280]">128 in June</span>
          </div>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-y border-[#F1F3F5] bg-[#FAFBFC] text-[9px] uppercase tracking-[0.1em] text-[#9CA3AF]">
                <th className="px-4 py-1.5 font-medium">Vendor</th>
                <th className="hidden px-3 py-1.5 font-medium xl:table-cell">Category</th>
                <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                <th className="px-4 py-1.5 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F3F5]">
              {receipts.map((receipt) => (
                <tr key={receipt.vendor}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#F3F4F6] text-[9px] font-semibold text-[#4B5563]">
                        {receipt.initial}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-medium leading-tight text-[#0B1220]">{receipt.vendor}</p>
                        <p className="truncate text-[9px] leading-tight text-[#9CA3AF]">{receipt.detail}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-3 py-2 text-[10px] text-[#6B7280] xl:table-cell">{receipt.category}</td>
                  <td className="px-3 py-2 text-right text-[10.5px] font-medium tabular-nums text-[#0B1220]">{receipt.amount}</td>
                  <td className="px-4 py-2 text-right">
                    <StatusPill tone={receipt.tone}>{receipt.status}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-[#EEF0F3] px-4 py-2 text-[10px] text-[#6B7280]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />4 receipts need review
          </span>
          <span className="font-medium text-[#1D4ED8]">Open ledger →</span>
        </div>
      </div>

      <div className="absolute -bottom-8 -left-3 hidden w-[264px] rounded-xl border border-[#E3E6EA] bg-white p-3.5 shadow-[0_20px_45px_-20px_rgba(11,18,32,0.4)] lg:block xl:-left-10">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#0B1220]">
            <span className="text-[#229ED9]"><Icon name="telegram" className="h-3.5 w-3.5" /></span>
            Telegram · 09:41
          </span>
          <span className="text-[9px] font-medium text-[#9CA3AF]">OCR 4.2s</span>
        </div>
        <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-[#EEF0F3] bg-[#FAFBFC] p-2">
          <span className="flex h-7 w-7 items-center justify-center rounded border border-[#E7E9EC] bg-white text-[#DC2626]">
            <Icon name="receipt" className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-medium text-[#0B1220]">receipt-aws-jun.pdf</p>
            <p className="text-[8.5px] text-[#9CA3AF]">PDF · 218 KB</p>
          </div>
          <span className="ml-auto text-[10.5px] font-semibold tabular-nums text-[#0B1220]">$1,284</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="rounded bg-[#EFF4FF] px-1.5 py-0.5 text-[8.5px] font-semibold text-[#1D4ED8]">Infrastructure</span>
          <span className="rounded bg-[#ECFDF5] px-1.5 py-0.5 text-[8.5px] font-semibold text-[#047857]">No duplicate</span>
          <span className="rounded bg-[#F3F4F6] px-1.5 py-0.5 text-[8.5px] font-semibold text-[#4B5563]">Tax $64.20</span>
        </div>
      </div>
    </div>
  );
}

function ExtractionPanel() {
  const fields = [
    ['Vendor', 'AWS'],
    ['Amount', '$1,284.00'],
    ['Tax', '$64.20'],
    ['Category', 'Infrastructure'],
    ['Date', 'Jun 14, 2026'],
    ['Paid with', 'Corp card · 4412']
  ];

  return (
    <div className="rounded-2xl border border-[#E7E9EC] bg-[#F7F8FA] p-4 sm:p-5">
      <div className="rounded-xl border border-[#E3E6EA] bg-white p-4 shadow-[0_1px_2px_rgba(11,18,32,0.04)]">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#229ED9]/10 text-[#229ED9]">
            <Icon name="telegram" className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-[11.5px] font-semibold text-[#0B1220]">SPARK Bot</p>
            <p className="text-[9.5px] text-[#9CA3AF]">Telegram · today, 09:41</p>
          </div>
          <span className="ml-auto rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[9px] font-semibold text-[#047857]">Received</span>
        </div>
        <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-[#EEF0F3] bg-[#FAFBFC] p-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded border border-[#E7E9EC] bg-white text-[#DC2626]">
            <Icon name="receipt" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[10.5px] font-medium text-[#0B1220]">receipt-aws-jun.pdf</p>
            <p className="text-[9px] text-[#9CA3AF]">PDF · 218 KB · forwarded from phone</p>
          </div>
        </div>
      </div>

      <div className="my-3 flex items-center gap-2">
        <span className="h-px flex-1 bg-[#E3E6EA]" />
        <span className="rounded-full border border-[#E3E6EA] bg-white px-2 py-0.5 text-[9px] font-medium text-[#6B7280]">
          Extracted in 4.2s
        </span>
        <span className="h-px flex-1 bg-[#E3E6EA]" />
      </div>

      <div className="rounded-xl border border-[#E3E6EA] bg-white p-4 shadow-[0_1px_2px_rgba(11,18,32,0.04)]">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-[#0B1220]">Structured record</p>
          <StatusPill tone="green">Auto-filed</StatusPill>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[9px] font-medium uppercase tracking-[0.1em] text-[#9CA3AF]">{label}</dt>
              <dd className="mt-0.5 text-[11px] font-medium text-[#0B1220]">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function ApprovalPanel() {
  return (
    <div className="rounded-2xl border border-[#E7E9EC] bg-white p-4 shadow-[0_1px_2px_rgba(11,18,32,0.04)] sm:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-[11.5px] font-semibold text-[#0B1220]">Approvals</p>
          <span className="rounded-full bg-[#FFFBEB] px-1.5 py-0.5 text-[9px] font-semibold text-[#B45309]">2 waiting</span>
        </div>
        <span className="text-[9.5px] text-[#9CA3AF]">This month</span>
      </div>

      <div className="mt-3 space-y-2">
        <div className="rounded-xl border border-[#FDE68A] bg-[#FFFDF5] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FEF3C7] text-[10px] font-semibold text-[#92400E]">M</span>
              <div className="min-w-0">
                <p className="truncate text-[10.5px] font-semibold text-[#0B1220]">Contractor invoice · Design</p>
                <p className="text-[9.5px] text-[#6B7280]">Maya Chen · submitted 2h ago</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold tabular-nums text-[#0B1220]">$2,410.00</span>
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="rounded bg-[#FEF3C7] px-1.5 py-0.5 text-[8.5px] font-semibold text-[#92400E]">Over $2,000 limit</span>
            <span className="flex items-center gap-1.5">
              <span className="rounded-md border border-[#E3E6EA] bg-white px-2.5 py-1 text-[9.5px] font-semibold text-[#4B5563]">Review</span>
              <span className="rounded-md bg-[#0B1220] px-2.5 py-1 text-[9.5px] font-semibold text-white">Approve</span>
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-[#EEF0F3] bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F3F4F6] text-[10px] font-semibold text-[#4B5563]">L</span>
              <div className="min-w-0">
                <p className="truncate text-[10.5px] font-semibold text-[#0B1220]">Flight · SFO → JFK</p>
                <p className="text-[9.5px] text-[#6B7280]">Liam Ortiz · within budget</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold tabular-nums text-[#0B1220]">$642.00</span>
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="rounded bg-[#ECFDF5] px-1.5 py-0.5 text-[8.5px] font-semibold text-[#047857]">Within budget</span>
            <span className="text-[9px] font-medium text-[#9CA3AF]">Auto-approved</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[#F1F3F5] pt-2.5 text-[9.5px] text-[#6B7280]">
        <span>Average approval time</span>
        <span className="font-semibold text-[#0B1220]">3h 12m</span>
      </div>
    </div>
  );
}

function RunwayPanel() {
  return (
    <div className="rounded-2xl border border-[#E7E9EC] bg-white p-4 shadow-[0_1px_2px_rgba(11,18,32,0.04)] sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11.5px] font-semibold text-[#0B1220]">Runway</p>
        <span className="inline-flex items-center gap-1.5 text-[9px] text-[#6B7280]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
          Updated 2m ago
        </span>
      </div>

      <div className="mt-2 flex items-end justify-between gap-4">
        <div>
          <p className="text-[30px] font-semibold leading-none tabular-nums tracking-[-0.04em] text-[#0B1220]">22.4</p>
          <p className="mt-1 text-[10px] text-[#6B7280]">months of cash · out Apr 2028</p>
        </div>
        <svg className="h-12 w-28" viewBox="0 0 112 48" fill="none" aria-hidden="true">
          <path
            d="M2 42 16 34 30 36 44 26 58 29 72 18 86 21 100 9 110 11"
            stroke="#2563EB"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M2 42 16 34 30 36 44 26 58 29 72 18 86 21 100 9 110 11V48H2V42Z"
            fill="#EFF4FF"
            fillOpacity="0.85"
          />
        </svg>
      </div>

      <div className="mt-4 space-y-2.5">
        {categories.map((category) => (
          <div key={category.name}>
            <div className="flex items-center justify-between text-[9.5px]">
              <span className="text-[#4B5563]">{category.name}</span>
              <span className="font-medium tabular-nums text-[#0B1220]">{category.pct}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#F1F3F5]">
              <div className={'h-full rounded-full bg-[#93B4FF] ' + category.width} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-[#F1F3F5] pt-3">
        <div className="flex items-center justify-between text-[9.5px]">
          <span className="text-[#6B7280]">Budget used · Q2</span>
          <span className="font-semibold text-[#0B1220]">72%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#F1F3F5]">
          <div className="h-full w-[72%] rounded-full bg-[#0B1220]" />
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, description, align = 'left' }) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#1D4ED8]">{eyebrow}</p>
      <h2 className="mt-3 text-[1.85rem] font-semibold leading-[1.15] tracking-[-0.03em] text-[#0B1220] sm:text-[2.3rem]">
        {title}
      </h2>
      {description && <p className="mt-4 text-[15px] leading-7 text-[#5B6472]">{description}</p>}
    </div>
  );
}

export default function LandingPage({ isAuthenticated = false }) {
  const appPath = isAuthenticated ? '/dashboard' : '/login';
  const topActionLabel = isAuthenticated ? 'Open workspace' : 'Sign in';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0B1220] antialiased">
      <div className="sticky top-0 z-50 border-b border-[#E7E9EC]/90 bg-[#F8FAFC]/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-6 px-6 py-3.5">
          <Brand />

          <nav className="hidden items-center gap-7 md:flex" aria-label="Sections">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-[13px] font-medium text-[#4B5563] transition-colors hover:text-[#0B1220]"
              >
                {link.label}
              </a>
            ))}
            <Link className="text-[13px] font-medium text-[#4B5563] transition-colors hover:text-[#0B1220]" to="/contact">
              Contact
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              className="hidden text-[13px] font-medium text-[#4B5563] transition-colors hover:text-[#0B1220] sm:block"
              to={appPath}
            >
              {topActionLabel}
            </Link>
            <a
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0B1220] px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1B2433]"
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="telegram" className="h-3.5 w-3.5" />
              Launch bot
            </a>
          </div>
        </div>
      </div>

      <main>
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(70%_60%_at_50%_0%,#E9EFFF_0%,rgba(248,250,252,0)_70%)]"
            aria-hidden="true"
          />

          <div className="relative mx-auto grid w-full max-w-[1180px] gap-14 px-6 pb-24 pt-14 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-10 lg:pt-20">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#E2E6EA] bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#4B5563] shadow-[0_1px_2px_rgba(11,18,32,0.04)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                Finance operations for founder-led teams
              </span>

              <h1 className="mt-6 text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.045em] text-[#0B1220] sm:text-[3.2rem]">
                Close your books without a spreadsheet.
              </h1>

              <p className="mt-5 max-w-xl text-[15.5px] leading-[1.75] text-[#5B6472]">
                Forward receipts from Telegram, WhatsApp, or Google Drive. SPARK extracts the vendor, tax, and
                category, blocks duplicate spend, routes approvals, and keeps burn, runway, and budgets current in
                one workspace your accountant can actually read.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <a
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0B1220] px-5 py-3 text-[13.5px] font-semibold text-white shadow-[0_1px_2px_rgba(11,18,32,0.2)] transition-colors hover:bg-[#1B2433]"
                  href={TELEGRAM_BOT_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="telegram" className="h-4 w-4" />
                  Launch on Telegram
                </a>
                <a
                  className="inline-flex items-center gap-2 rounded-lg border border-[#DDE1E6] bg-white px-5 py-3 text-[13.5px] font-semibold text-[#0B1220] transition-colors hover:border-[#C7CDD4] hover:bg-[#F7F8FA]"
                  href="#product"
                >
                  See the workspace
                  <Icon name="arrow" className="h-4 w-4" />
                </a>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-[#6B7280]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-[#047857]"><Icon name="check" className="h-3.5 w-3.5" /></span>
                  Works in Telegram, WhatsApp, and the browser
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-[#047857]"><Icon name="check" className="h-3.5 w-3.5" /></span>
                  Google OAuth with scoped access
                </span>
              </div>
            </div>

            <HeroDashboard />
          </div>
        </section>

        <section className="border-y border-[#E7E9EC] bg-white">
          <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11.5px] font-medium text-[#6B7280]">Built around the tools you already use</p>
            <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
              {[
                ['telegram', 'Telegram', 'text-[#229ED9]'],
                ['whatsapp', 'WhatsApp', 'text-[#128C7E]'],
                ['drive', 'Google Drive', 'text-[#1A73E8]'],
                ['sheet', 'Google Sheets', 'text-[#0F9D58]']
              ].map(([icon, label, color]) => (
                <span key={label} className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[#4B5563]">
                  <span className={color}><Icon name={icon} className="h-4 w-4" /></span>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1180px] px-6 py-16 sm:py-20">
          <div className="grid gap-8 sm:grid-cols-3 sm:gap-10">
            {outcomes.map((outcome) => (
              <div key={outcome.label} className="border-t border-[#DDE1E6] pt-5">
                <p className="text-[2.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0B1220]">{outcome.value}</p>
                <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#1D4ED8]">{outcome.label}</p>
                <p className="mt-2.5 text-[13px] leading-6 text-[#5B6472]">{outcome.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-[#E7E9EC] bg-white">
          <div className="mx-auto grid w-full max-w-[1180px] gap-8 px-6 py-16 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
            <div>
              <SectionHeading
                eyebrow="The problem"
                title="Month-end is a data problem, not a discipline problem."
                description="By the time a receipt reaches a spreadsheet, the context is gone. Which card, which budget, whether it was already filed — someone has to reconstruct it weeks later."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[#E7E9EC] bg-[#FAFBFC] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">Without SPARK</p>
                <ul className="mt-4 space-y-3">
                  {problems.map((problem) => (
                    <li key={problem} className="flex gap-2.5 text-[12px] leading-5 text-[#6B7280]">
                      <span className="mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-[#E3E6EA] text-[9px] text-[#9CA3AF]">
                        ×
                      </span>
                      {problem}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-[#C7D9FF] bg-[#F5F8FF] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1D4ED8]">With SPARK</p>
                <ul className="mt-4 space-y-3">
                  {fixes.map((fix) => (
                    <li key={fix} className="flex gap-2.5 text-[12px] leading-5 text-[#334155]">
                      <span className="mt-0.5 shrink-0 text-[#047857]">
                        <Icon name="check" className="h-3.5 w-3.5" />
                      </span>
                      {fix}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1180px] px-6 py-16 sm:py-24" id="product">
          <SectionHeading
            eyebrow="Product"
            title="One record, from receipt to runway."
            description="Capture, control, and clarity share the same data. Nothing is re-keyed, and nothing has to be reconciled twice."
          />

          <div className="mt-14 space-y-16 sm:mt-16 sm:space-y-24">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-14">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">01 · Capture</p>
                <h3 className="mt-3 text-[1.55rem] font-semibold leading-tight tracking-[-0.025em] text-[#0B1220] sm:text-[1.75rem]">
                  Every channel, one inbox
                </h3>
                <p className="mt-4 text-[14.5px] leading-7 text-[#5B6472]">
                  Send receipts where the work already happens. SPARK reads the document, resolves the vendor, and
                  files the record with the fields your accountant asks for.
                </p>
                <ul className="mt-5 space-y-2.5">
                  {[
                    'Telegram, WhatsApp, Google Drive, or direct upload',
                    'Vendor, amount, tax, category, and date extracted',
                    'Unrecognized documents held for review, not guessed'
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[13px] leading-6 text-[#4B5563]">
                      <span className="mt-1 shrink-0 text-[#1D4ED8]"><Icon name="check" className="h-3.5 w-3.5" /></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <ExtractionPanel />
            </div>

            <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-14">
              <div className="lg:order-2">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">02 · Control</p>
                <h3 className="mt-3 text-[1.55rem] font-semibold leading-tight tracking-[-0.025em] text-[#0B1220] sm:text-[1.75rem]">
                  Approvals that leave a trail
                </h3>
                <p className="mt-4 text-[14.5px] leading-7 text-[#5B6472]">
                  Spend that needs a human goes to the owner of that budget, with the receipt, the limit, and the
                  requester attached. Everything else is filed automatically.
                </p>
                <ul className="mt-5 space-y-2.5">
                  {[
                    'Rules by amount, vendor, category, or budget',
                    'Exceptions routed with full context',
                    'Approval history kept with the record'
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[13px] leading-6 text-[#4B5563]">
                      <span className="mt-1 shrink-0 text-[#1D4ED8]"><Icon name="check" className="h-3.5 w-3.5" /></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lg:order-1">
                <ApprovalPanel />
              </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-14">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">03 · Clarity</p>
                <h3 className="mt-3 text-[1.55rem] font-semibold leading-tight tracking-[-0.025em] text-[#0B1220] sm:text-[1.75rem]">
                  Burn, runway, and budgets in one read
                </h3>
                <p className="mt-4 text-[14.5px] leading-7 text-[#5B6472]">
                  See what is spent, what is committed, and how many months are left — without rebuilding a model
                  every time a receipt lands.
                </p>
                <ul className="mt-5 space-y-2.5">
                  {[
                    'Live burn and runway from actual spend',
                    'Budgets by category and owner',
                    'Search every receipt, vendor, and decision'
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[13px] leading-6 text-[#4B5563]">
                      <span className="mt-1 shrink-0 text-[#1D4ED8]"><Icon name="check" className="h-3.5 w-3.5" /></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <RunwayPanel />
            </div>
          </div>
        </section>

        <section className="border-y border-[#E7E9EC] bg-white" id="workflow">
          <div className="mx-auto w-full max-w-[1180px] px-6 py-16 sm:py-24">
            <SectionHeading
              eyebrow="Workflow"
              title="Three moves, every month."
              description="The same loop whether you close monthly or weekly. SPARK does the filing; you review the decisions."
            />

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {steps.map((step) => (
                <div key={step.index} className="rounded-xl border border-[#E7E9EC] bg-[#FAFBFC] p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#DDE1E6] bg-white text-[10.5px] font-semibold text-[#1D4ED8]">
                      {step.index}
                    </span>
                    <span className="text-[9.5px] font-medium uppercase tracking-[0.12em] text-[#9CA3AF]">{step.meta}</span>
                  </div>
                  <h3 className="mt-5 text-[15px] font-semibold text-[#0B1220]">{step.title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-[#5B6472]">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1180px] px-6 py-16 sm:py-24" id="security">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <div>
              <SectionHeading
                eyebrow="Security"
                title="Scoped access, not sweeping access."
                description="SPARK asks for the narrowest access it needs: your workspace, its own Drive folders, and the sheets it maintains."
              />
              <div className="mt-6 rounded-lg border border-[#E7E9EC] bg-white p-4">
                <p className="text-[11.5px] leading-5 text-[#6B7280]">
                  You can revoke Google access at any time from your account permissions. SPARK does not hold your
                  funds and does not move money on your behalf.
                </p>
              </div>
            </div>

            <div className="divide-y divide-[#E7E9EC] border-y border-[#E7E9EC]">
              {safeguards.map((item) => (
                <div key={item.title} className="flex gap-4 py-5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E7E9EC] bg-white text-[#1D4ED8]">
                    <Icon name={item.icon} className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-[13.5px] font-semibold text-[#0B1220]">{item.title}</h3>
                    <p className="mt-1.5 text-[12.5px] leading-6 text-[#5B6472]">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1180px] px-6 pb-20 sm:pb-28">
          <div className="relative overflow-hidden rounded-2xl bg-[#0B1220] px-6 py-14 sm:px-12 sm:py-16">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_15%_0%,#1E2E4A_0%,rgba(11,18,32,0)_62%)]"
              aria-hidden="true"
            />
            <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#93B4FF]">Get started</p>
                <h2 className="mt-3 max-w-xl text-[1.9rem] font-semibold leading-[1.12] tracking-[-0.03em] text-white sm:text-[2.4rem]">
                  Close the month before the month ends.
                </h2>
                <p className="mt-4 max-w-lg text-[14px] leading-7 text-[#A9B4C6]">
                  Launch the bot, forward one receipt, and see the record it builds. Most teams run their first close
                  in under a week.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
                <a
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-[13.5px] font-semibold text-[#0B1220] transition-colors hover:bg-[#EDF1F7]"
                  href={TELEGRAM_BOT_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="telegram" className="h-4 w-4" />
                  Launch on Telegram
                </a>
                <Link
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-5 py-3 text-[13.5px] font-semibold text-white transition-colors hover:border-white/35 hover:bg-white/5"
                  to="/contact"
                >
                  Talk to the founder
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E7E9EC] bg-white">
        <div className="mx-auto w-full max-w-[1180px] px-6 py-12">
          <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <Brand compact />
              <p className="mt-4 max-w-xs text-[12.5px] leading-6 text-[#6B7280]">
                Finance operations for founders who would rather build the product than maintain the spreadsheet.
              </p>
              <a className="mt-3 inline-block text-[12.5px] font-medium text-[#4B5563] hover:text-[#0B1220]" href={'mailto:' + SUPPORT_EMAIL}>
                {SUPPORT_EMAIL}
              </a>
            </div>

            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">Product</h3>
              <ul className="mt-4 space-y-2.5 text-[12.5px]">
                <li><a className="text-[#4B5563] hover:text-[#0B1220]" href="#product">Capabilities</a></li>
                <li><a className="text-[#4B5563] hover:text-[#0B1220]" href="#workflow">Workflow</a></li>
                <li><a className="text-[#4B5563] hover:text-[#0B1220]" href="#security">Security</a></li>
                <li><Link className="text-[#4B5563] hover:text-[#0B1220]" to={appPath}>{topActionLabel}</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">Company</h3>
              <ul className="mt-4 space-y-2.5 text-[12.5px]">
                <li><Link className="text-[#4B5563] hover:text-[#0B1220]" to="/contact">Contact</Link></li>
                <li><Link className="text-[#4B5563] hover:text-[#0B1220]" to="/privacy-policy">Privacy Policy</Link></li>
                <li><Link className="text-[#4B5563] hover:text-[#0B1220]" to="/terms-of-service">Terms of Service</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-2 border-t border-[#E7E9EC] pt-5 text-[11px] text-[#9CA3AF] sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 SPARK Financial. Not a bank. SPARK organizes finance data and does not hold funds.</p>
            <p className="sm:text-right">Made for teams of 2–50.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
