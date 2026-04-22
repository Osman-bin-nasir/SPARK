import { Link } from 'react-router-dom';

const stats = [
  {
    value: '92%',
    label: 'Auto-categorized',
    accent: 'text-[#84adff]',
    body: 'Receipts are classified, tagged, and matched to vendors before they reach the dashboard.'
  },
  {
    value: '99%',
    label: 'Duplicate checks',
    accent: 'text-[#d674ff]',
    body: 'SPARK compares uploads, Drive files, and Telegram forwards before creating spend records.'
  },
  {
    value: '8 hrs',
    label: 'Saved each week',
    accent: 'text-[#00fd93]',
    body: 'Founders stop maintaining finance sheets and review clean burn, runway, and budget signals instead.'
  }
];

const TELEGRAM_BOT_URL = 'https://t.me/osman80bot';

function SparkIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M13.2 2 5 13.4h6.1L9.7 22 19 9.7h-6.4L13.2 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg className="h-6 w-6 text-[#84adff]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3h10a2 2 0 0 1 2 2v16l-3-1.5L13 21l-3-1.5L7 21l-3-1.5V5a2 2 0 0 1 2-2h1Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg className="h-6 w-6 text-[#d674ff]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 5v4a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v4M6 5h5M6 5H3M18 19h3M18 19h-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12V5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg className="h-6 w-6 text-[#00fd93]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 13h6V4H4v9ZM14 20h6V4h-6v16ZM4 20h6v-4H4v4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function LandingPage({ isAuthenticated = false }) {
  const appPath = isAuthenticated ? '/dashboard' : '/login';

  return (
    <main className="min-h-screen bg-[#0e0e0e] font-sans text-white selection:bg-[#84adff] selection:text-[#00214e]">
      <section id="overview" className="relative flex min-h-[760px] items-center overflow-hidden px-5 py-20 sm:px-6 lg:py-24">
        <div className="pointer-events-none absolute right-[-36%] top-[12%] h-[460px] w-[460px] opacity-[0.06] sm:right-[-12%] lg:right-[2%] lg:top-[8%]" aria-hidden="true">
          <div className="absolute inset-0 rounded-full bg-[#84adff]/10 blur-[80px]" />
          <img
            className="relative h-full w-full object-contain drop-shadow-[0_0_15px_rgba(132,173,255,0.15)]"
            src="/logo.png"
            alt=""
          />
        </div>

        <div className="mx-auto w-full max-w-7xl">
          <div className="relative z-10">
            <div className="mb-8">
              <Link className="inline-flex items-center gap-2 text-[#84adff]" to="/">
                <img className="h-8 w-8 object-contain" src="/logo.png" alt="logo spark" />
                <span className="text-2xl font-black tracking-tight">SPARK</span>
              </Link>
            </div>
            <span className="mb-8 inline-flex rounded-full border border-white/10 bg-[#262626] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#00fd93]">
              Spreadsheet replacement for founders
            </span>
            <h1
              className="mb-10 max-w-4xl text-5xl font-black leading-[1.25] text-white sm:text-6xl sm:leading-[1.2] md:text-7xl md:leading-[1.18]"
              style={{ letterSpacing: '0.02em' }}
            >
              Stop building spreadsheets. SPARK does it for you.
            </h1>
            <p className="mb-10 max-w-2xl text-base leading-[1.9] text-white/65 sm:text-lg sm:leading-[1.85]">
              Forward receipts from Telegram, Drive, or uploads. SPARK extracts structured data with OCR and LLMs,
              blocks duplicates, routes approvals, and gives founders a real-time view of burn, runway, budgets and financial decisions.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <a
                className="rounded-full bg-[#84adff] px-8 py-4 text-base font-bold text-[#00214e] shadow-[0_0_30px_rgba(132,173,255,0.3)] transition hover:scale-105 active:scale-95"
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noreferrer"
              >
                Launch Bot on Telegram
              </a>
              <Link className="rounded-full border border-white/10 px-8 py-4 font-medium text-white/80 transition hover:bg-white/5" to="/privacy-policy">
                Review privacy
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/5 bg-[#131313] px-5 py-24 sm:px-6">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 md:grid-cols-3 md:gap-24">
          {stats.map((stat) => (
            <div className="space-y-2" key={stat.label}>
              <div className="text-5xl font-black tracking-tight text-white">{stat.value}</div>
              <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${stat.accent}`}>{stat.label}</p>
              <p className="text-sm leading-relaxed text-white/60">{stat.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="px-5 py-32 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-20">
            <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[#84adff]">Capabilities</h2>
            <h3 className="max-w-2xl text-4xl font-black tracking-tight text-white">One operating system for startup finance</h3>
          </div>

          <div className="space-y-0">
            {/* Feature 1 */}
            <div className="group grid grid-cols-1 gap-8 border-t border-white/[0.06] py-14 md:grid-cols-[auto_1fr_1fr] md:items-start md:gap-16">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#84adff]/[0.08]">
                <ReceiptIcon />
              </div>
              <div>
                <h4 className="mb-3 text-xl font-bold text-white">Forward receipts. SPARK extracts the finance data.</h4>
                <p className="max-w-md leading-relaxed text-white/50">Telegram messages, Drive files, and uploads become structured vendor, amount, tax, category, and date records without spreadsheet entry.</p>
              </div>
              <div className="flex items-center gap-3 md:justify-end">
                <span className="rounded-full bg-[#84adff]/[0.08] px-4 py-1.5 text-xs font-semibold text-[#84adff]">OCR</span>
                <span className="rounded-full bg-[#84adff]/[0.08] px-4 py-1.5 text-xs font-semibold text-[#84adff]">LLM</span>
                <span className="rounded-full bg-[#00fd93]/[0.08] px-4 py-1.5 text-xs font-semibold text-[#00fd93]">Auto-tag</span>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="group grid grid-cols-1 gap-8 border-t border-white/[0.06] py-14 md:grid-cols-[auto_1fr_1fr] md:items-start md:gap-16">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#d674ff]/[0.08]">
                <RouteIcon />
              </div>
              <div>
                <h4 className="mb-3 text-xl font-bold text-white">Prevent duplicates and route approvals automatically</h4>
                <p className="max-w-md leading-relaxed text-white/50">SPARK checks repeated receipts, flags unclear spend, and sends approval exceptions to the right founder or budget owner.</p>
              </div>


            </div>

            {/* Feature 3 */}
            <div className="group grid grid-cols-1 gap-8 border-t border-white/[0.06] py-14 md:grid-cols-[auto_1fr_1fr] md:items-start md:gap-16">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#00fd93]/[0.08]">
                <DashboardIcon />
              </div>
              <div>
                <h4 className="mb-3 text-xl font-bold text-white">Search every decision and watch burn in real time</h4>
                <p className="mb-5 max-w-md leading-relaxed text-white/50">Every receipt, approval, vendor, and note is stored for RAG search while the dashboard tracks burn, runway, budgets, and cash decisions.</p>
                <Link className="inline-flex items-center gap-2 text-sm font-bold tracking-tight text-[#84adff] transition-all group-hover:gap-3" to={appPath}>
                  Explore Workspace <span aria-hidden="true">→</span>
                </Link>
              </div>
              <div className="flex items-center gap-3 md:justify-end">


              </div>
            </div>

            <div className="border-t border-white/[0.06]" />
          </div>
        </div>
      </section>

      <section id="audit" className="px-5 py-32 sm:px-6">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[40px] border border-white/5 bg-[#84adff]/[0.03] p-12 text-center backdrop-blur-2xl md:p-20">
          <div className="absolute left-1/2 top-0 h-1/2 w-full -translate-x-1/2 rounded-full bg-[#84adff]/10 blur-[120px]" />
          <div className="relative">
            <h2 className="mx-auto mb-6 max-w-xl text-3xl font-black tracking-tight text-white md:text-5xl">Stop running startup finance from a spreadsheet.</h2>
            <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-white/70">Launch the Telegram bot, forward a receipt, and let SPARK build the financial record your dashboard can trust.</p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <a
                className="rounded-full bg-[#84adff] px-8 py-4 font-bold text-[#00214e] shadow-[0_0_30px_rgba(132,173,255,0.25)] transition hover:scale-105 active:scale-95"
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noreferrer"
              >
                Launch Bot on Telegram
              </a>
              <Link className="rounded-full border border-white/10 px-8 py-4 font-medium text-white/80 transition hover:bg-white/5" to="/contact">
                Talk to founder
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 bg-[#000] px-5 py-10 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 text-[10px] uppercase tracking-[0.2em] text-white/50 md:flex-row md:items-center md:justify-between">
          <Link className="font-black text-white" to="/">SPARK</Link>
          <p>© 2026 SPARK Financial.</p>
          <div className="flex gap-6">
            <Link className="transition hover:text-white" to="/contact">Contact</Link>
            <Link className="transition hover:text-white" to="/privacy-policy">Privacy</Link>
            <Link className="transition hover:text-white" to="/terms-of-service">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

export default LandingPage;
